const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');
const { loadService } = require('./customer-cancellation-refund.test.cjs');
const url = process.env.FOODSAVE_TEST_DATABASE_URL;
if (!url) throw Error('Explicit disposable test URL required; no fallback');
const target = new URL(url);
assert.equal(target.hostname,'127.0.0.1');assert.equal(target.port,'55432');
assert.equal(target.pathname,'/foodsave_test_phase_a');assert.equal(target.username,'foodsave_phase_a_runner');
const { PrismaClient } = require('@prisma/client');
test('independent PostgreSQL clients recover customer cancellation safely',async t=>{
 const db=new PrismaClient({datasources:{db:{url}}}), other=new PrismaClient({datasources:{db:{url}}});
 const prefix='cancel_'+randomUUID();let user,merchant,offer;const orders=[];
 try {
  user=await db.user.create({data:{email:prefix+'@example.invalid',password:'test-only',firstName:'Test',lastName:'Only',role:'MERCHANT'}});
  merchant=await db.merchant.create({data:{ownerId:user.id,name:prefix,address:'test',city:'test',province:'test',postalCode:'test'}});
  offer=await db.offer.create({data:{merchantId:merchant.id,title:prefix,originalPrice:5,discountedPrice:5,quantity:1,pickupStart:new Date(Date.now()+86400000),pickupEnd:new Date(Date.now()+172800000)}});
  const a=loadService().cancellationRefundService(db),b=loadService().cancellationRefundService(other);
  async function order(){const o=await db.order.create({data:{userId:user.id,offerId:offer.id,totalPrice:5,status:'CONFIRMED',stripeSessionId:prefix+'_'+orders.length}});orders.push(o);return o;}
  function provider(o){let refund;let calls=0;return {get calls(){return calls;},checkout:{sessions:{retrieve:async()=>({id:o.stripeSessionId,payment_status:'paid',metadata:{userId:user.id,offerId:offer.id},payment_intent:'pi_'+o.id,amount_total:500,currency:'cad'})}},paymentIntents:{retrieve:async()=>({id:'pi_'+o.id,status:'succeeded',amount_received:500,currency:'cad'})},refunds:{list:async function*(){if(refund)yield refund;},create:async()=>{calls++;refund={id:'re_'+o.id,payment_intent:'pi_'+o.id,amount:500,currency:'cad',status:'succeeded'};throw Error('response lost');}}};}
  await t.test('concurrent claim commits one cancellation record',async()=>{const o=await order();const r=await Promise.allSettled([a.claim(o.id,user.id),b.claim(o.id,user.id)]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(await other.customerCancellationRefund.count({where:{orderId:o.id}}),1);assert.equal((await other.order.findUnique({where:{id:o.id}})).status,'CANCELLED');});
  await t.test('lost response is reconciled on another client with inventory restored once',async()=>{const o=await order(),p=provider(o);const token=await a.claim(o.id,user.id);await assert.rejects(a.attempt(o.id,token,p));assert.equal((await other.customerCancellationRefund.findUnique({where:{orderId:o.id}})).recoveryOwnerToken,token);await b.reconcile(o.id,p);await a.reconcile(o.id,p);assert.equal(p.calls,1);const row=await db.customerCancellationRefund.findUnique({where:{orderId:o.id}});assert.equal(row.refundStatus,'SUCCEEDED');assert.equal(row.inventoryRestored,true);assert.equal((await db.offer.findUnique({where:{id:offer.id}})).quantity,2);});
  await t.test('stale token cannot dispatch',async()=>{const o=await order(),p=provider(o);const token=await a.claim(o.id,user.id);await assert.rejects(b.attempt(o.id,'wrong',p));assert.equal(p.calls,0);assert.equal((await db.customerCancellationRefund.findUnique({where:{orderId:o.id}})).recoveryOwnerToken,token);});
  await t.test('zero inventory remains unavailable after verified refund',async()=>{await db.offer.update({where:{id:offer.id},data:{quantity:0}});const o=await order(),p=provider(o);const token=await a.claim(o.id,user.id);await assert.rejects(a.attempt(o.id,token,p));await b.reconcile(o.id,p);assert.equal((await db.offer.findUnique({where:{id:offer.id}})).quantity,0);});
  await t.test('crashed claim without provider evidence never authorizes replacement',async()=>{const o=await order(),p=provider(o);await a.claim(o.id,user.id);await b.reconcile(o.id,p);assert.equal(p.calls,0);assert.equal((await db.customerCancellationRefund.findUnique({where:{orderId:o.id}})).refundStatus,'NEEDS_REVIEW');});
 }finally{
  for(const o of orders){await db.customerCancellationRefund.deleteMany({where:{orderId:o.id}});await db.order.delete({where:{id:o.id}});}
  if(offer)await db.offer.delete({where:{id:offer.id}});if(merchant)await db.merchant.delete({where:{id:merchant.id}});if(user)await db.user.delete({where:{id:user.id}});
  await Promise.all([db.$disconnect(),other.$disconnect()]);
 }
});
