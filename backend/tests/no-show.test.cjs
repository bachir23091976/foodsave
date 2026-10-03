const {test}=require('node:test'),assert=require('node:assert/strict');
const api=require('./no-show-fixture.cjs');
const start=new Date('2030-10-02T17:00Z'),end=new Date('2030-10-02T18:00Z'),deadline=new Date('2030-10-02T18:15Z');
function fixture(now, historical=false) {
  const order={id:'o',userId:'u',status:'CONFIRMED',stripeSessionId:'cs',noShowEligibleAt:historical?null:deadline,
    offer:{pickupStart:start,pickupEnd:end,merchant:{ownerId:'m'}}};
  let tail=Promise.resolve();const calls=[];
  const db={order:{findUnique:async()=>order,updateMany:async q=>{calls.push(q);if(q.where.status!==order.status)return{count:0};Object.assign(order,q.data);return{count:1};}},
    $queryRaw:async q=>{const text=Array.isArray(q)?q.join(''):q.sql;if(text.includes('SELECT o.'))return[{id:'o'}];if(text.includes('clock_timestamp'))return[{nowMs:new Date(now).getTime()}];return[];},
    $transaction:async fn=>{const prev=tail;let done;tail=new Promise(r=>done=r);await prev;try{return await fn(db);}finally{done();}}};
  return{db,order,calls};
}
for(const [label,time,allowed,status] of [
  ['before start','16:59',false,'CONFIRMED'],['exact start','17:00',true,'COMPLETED'],['normal','17:30',true,'COMPLETED'],
  ['exact end','18:00',true,'COMPLETED'],['grace','18:10',true,'COMPLETED'],['exact deadline','18:15',true,'COMPLETED'],
  ['expired','18:16',false,'NO_SHOW']])test(label,async()=>{
  const h=fixture('2030-10-02T'+time+'Z');assert.equal(await api.transitionOrder(h.db,'o','m','PICKUP'),allowed);assert.equal(h.order.status,status);
});
test('historical expired pickup rejected without changing state',async()=>{const h=fixture('2030-10-02T18:01Z',true);assert.equal(await api.transitionOrder(h.db,'o','m','PICKUP'),false);await api.reconcileNoShows(h.db);assert.equal(h.order.status,'CONFIRMED');assert.equal(h.calls.length,0);});
test('duplicate expiration only changes order status; no financial/inventory/reward dependencies exist',async()=>{const h=fixture('2030-10-02T18:16Z');assert.equal(await api.reconcileNoShows(h.db),1);assert.equal(await api.reconcileNoShows(h.db),0);assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0].data)),{status:'NO_SHOW'});assert.equal(h.calls.length,1);});
test('merchant cancellation after expiry is blocked without refund authorization',async()=>{const h=fixture('2030-10-02T18:16Z');assert.equal(await api.transitionOrder(h.db,'o','m','CANCEL','reason'),false);assert.equal(h.order.status,'NO_SHOW');});
test('pickup/cancel wins within grace and cannot be overwritten',async()=>{for(const action of ['PICKUP','CANCEL']){const h=fixture('2030-10-02T18:15Z');await Promise.all([api.transitionOrder(h.db,'o','m',action,'reason'),api.reconcileNoShows(h.db)]);assert.equal(h.order.status,action==='PICKUP'?'COMPLETED':'CANCELLED');}});
test('ownership checked before expiration mutation',async()=>{const h=fixture('2030-10-02T18:16Z');assert.equal(await api.transitionOrder(h.db,'o','attacker','PICKUP'),false);assert.equal(h.calls.length,0);});
test('sub-millisecond time after the deadline is overdue, equality is not',()=>{
  const order={status:'CONFIRMED',noShowEligibleAt:deadline};
  assert.equal(api.isOverdue(order,deadline.getTime()),false);
  assert.equal(api.isOverdue(order,deadline.getTime()+0.5),true);
});
test('expired controller action makes no Stripe call or reward',async()=>{
  const h=fixture('2030-10-02T18:16Z');h.db.order.findFirst=async()=>h.order;h.db.merchant={findUnique:async()=>({id:'m'})};
  const {loadController}=require('./order-confirmation.test.cjs');
  const forbidden=new Proxy({},{get(){throw Error('Provider must not be used');}});
  const controller=loadController(h.db,forbidden,{'./notification.controller':{createNotification:()=>assert.fail()},'./loyalty.controller':{checkAndCreateReward:()=>assert.fail()}});
  const res={status(n){this.code=n;return this;},json(b){this.body=b;return this;}};
  await controller.cancelOrderByMerchant({userId:'m',body:{orderId:'o',reason:'Valid reason'}},res);
  assert.equal(res.code,409);assert.equal(h.order.status,'NO_SHOW');
  await controller.validatePickup({userId:'m',body:{pickupCode:'code'}},res);assert.equal(res.code,400);
});
