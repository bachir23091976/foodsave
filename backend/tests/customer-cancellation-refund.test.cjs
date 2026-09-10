const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
function loadService() {
  const module = { exports: {} };
  const code = transformSync(fs.readFileSync(require('node:path').join(__dirname, '../src/lib/customer-cancellation-refund.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
  vm.runInNewContext(code, { module, exports: module.exports, require: name => {
    if (name === 'node:crypto') return require(name);
    if (name === '@prisma/client') return {};
    throw Error('Unexpected dependency '+name);
  }});
  return module.exports;
}
function harness(status = 'succeeded') {
  const state = { order: { id: 'o', userId: 'u', offerId: 'f', stripeSessionId: 'cs', status: 'CONFIRMED' }, quantity: 1, row: null, calls: 0, failCreate: false };
  const offer = { pickupStart: new Date(Date.now()+86400000) };
  const db = {
    order: { findUnique: async () => ({...state.order, offer}), updateMany: async ({where,data}) => {
      if(state.order.status!==where.status) return {count:0}; Object.assign(state.order,data);return {count:1};
    }},
    customerCancellationRefund: {
      create: async ({data}) => { if(state.failCreate)throw Error('insert failure'); if(state.row)throw Error('duplicate');state.row={inventoryRestored:false,creationDispatched:false,refundId:null,paymentIntentId:null,reconciliationOwnerToken:null,...data}; return state.row; },
      findUnique: async () => state.row && {...state.row,order:{...state.order}},
      update: async ({data}) => {Object.assign(state.row,data); return {...state.row};},
    },
    offer: {updateMany: async () => {if(state.quantity<=0)return {count:0};state.quantity++;return {count:1};}},
    $queryRaw: async () => [],
  };
  let tail=Promise.resolve();
  db.$transaction=async fn=>{let done;const before=tail;tail=new Promise(r=>done=r);await before;
    const saved=structuredClone(state);try{return await fn(db);}catch(e){Object.assign(state,saved);throw e;}finally{done();}};
  const refund = () => ({id:'re',payment_intent:'pi',amount:500,currency:'cad',status});
  const provider={checkout:{sessions:{retrieve:async()=>({id:'cs',payment_status:'paid',metadata:{userId:'u',offerId:'f'},payment_intent:'pi',amount_total:500,currency:'cad'})}},
    paymentIntents:{retrieve:async()=>({id:'pi',status:'succeeded',amount_received:500,currency:'cad'})},
    refunds:{list:async function*(){if(state.providerRefund)yield state.providerRefund;},create:async(data,options)=>{
      state.calls++;assert.equal(data.reverse_transfer,true);assert.equal(data.refund_application_fee,true);
      assert.equal(options.idempotencyKey,'customer_cancel_o');state.providerRefund=refund();
      if(state.timeout)throw Error('response lost');return refund();
    }}};
  return {state,db,provider,service:loadService().cancellationRefundService(db)};
}
if(require.main===module){
for(const status of ['succeeded','pending','requires_action','failed','canceled','other'])test(status+' persists and blocks repeat claims',async()=>{
 const h=harness(status);const token=await h.service.claim('o','u');const r=await h.service.attempt('o',token,h.provider);
 assert.equal(h.state.order.status,'CANCELLED');assert.equal(r.refundId,'re');assert.equal(r.refundStatus,status==='other'?'UNKNOWN':status.toUpperCase());
 assert.equal(h.state.quantity,status==='succeeded'?2:1);await assert.rejects(h.service.claim('o','u'));assert.equal(h.state.calls,1);
});
test('atomic insert failure rolls back cancellation',async()=>{const h=harness();h.state.failCreate=true;await assert.rejects(h.service.claim('o','u'));assert.equal(h.state.order.status,'CONFIRMED');assert.equal(h.state.row,null);});
test('lost response reconciles once without replacement or reactivation',async()=>{
 const h=harness();h.state.timeout=true;const token=await h.service.claim('o','u');await assert.rejects(h.service.attempt('o',token,h.provider));
 assert.equal(h.state.row.refundStatus,'UNKNOWN');assert.equal(h.state.row.recoveryOwnerToken,token);
 await h.service.reconcile('o',h.provider);await h.service.reconcile('o',h.provider);
 assert.equal(h.state.row.refundStatus,'SUCCEEDED');assert.equal(h.state.calls,1);assert.equal(h.state.quantity,2);assert.equal(h.state.order.status,'CANCELLED');
});
test('crash before dispatch surfaces investigation, never creates a refund',async()=>{const h=harness();await h.service.claim('o','u');await h.service.reconcile('o',h.provider);assert.equal(h.state.calls,0);assert.equal(h.state.row.refundStatus,'NEEDS_REVIEW');});
test('deactivated inventory stays zero after success and reconciliation',async()=>{const h=harness();h.state.quantity=0;const t=await h.service.claim('o','u');await h.service.attempt('o',t,h.provider);await h.service.reconcile('o',h.provider);assert.equal(h.state.quantity,0);assert.equal(h.state.row.inventoryRestored,false);});
test('stale owner cannot create or mutate',async()=>{const h=harness();const t=await h.service.claim('o','u');await assert.rejects(h.service.attempt('o','stale',h.provider));assert.equal(h.state.row.recoveryOwnerToken,t);assert.equal(h.state.calls,0);});
test('mismatched evidence rejected',async()=>{const h=harness();await h.service.claim('o','u');h.provider.checkout.sessions.retrieve=async()=>({id:'wrong'});await assert.rejects(h.service.reconcile('o',h.provider));assert.equal(h.state.calls,0);assert.notEqual(h.state.row.refundStatus,'SUCCEEDED');});
test('concurrent claims have one winner',async()=>{const h=harness();const r=await Promise.allSettled([h.service.claim('o','u'),h.service.claim('o','u')]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);});
test('competing reconciliation workers cannot both own evidence reads',async()=>{const h=harness();await h.service.claim('o','u');let release,entered;const gate=new Promise(r=>release=r);const ready=new Promise(r=>entered=r);const retrieve=h.provider.checkout.sessions.retrieve;h.provider.checkout.sessions.retrieve=async()=>{entered();await gate;return retrieve();};const running=h.service.reconcile('o',h.provider);await ready;await assert.rejects(h.service.reconcile('o',h.provider));release();await running;});
test('dispatched request is never recreated when provider list is empty',async()=>{const h=harness();h.state.timeout=true;const token=await h.service.claim('o','u');await assert.rejects(h.service.attempt('o',token,h.provider));delete h.state.providerRefund;await assert.rejects(h.service.attempt('o',token,h.provider));assert.equal(h.state.calls,1);});
test('pending refund later reconciles verified success',async()=>{const h=harness('pending');const token=await h.service.claim('o','u');await h.service.attempt('o',token,h.provider);h.state.providerRefund.status='succeeded';await h.service.reconcile('o',h.provider);assert.equal(h.state.row.refundStatus,'SUCCEEDED');assert.equal(h.state.quantity,2);assert.equal(h.state.calls,1);});
test('local persistence failure after provider acceptance recovers from evidence',async()=>{const h=harness();const token=await h.service.claim('o','u');const update=h.db.customerCancellationRefund.update;let fail=true;h.db.customerCancellationRefund.update=async args=>{if(args.data.refundStatus==='SUCCEEDED'&&fail){fail=false;throw Error('commit failure');}return update(args);};await assert.rejects(h.service.attempt('o',token,h.provider));assert.equal(h.state.row.refundStatus,'UNKNOWN');assert.equal(h.state.quantity,1);await h.service.reconcile('o',h.provider);assert.equal(h.state.calls,1);assert.equal(h.state.quantity,2);});
}
module.exports={loadService,harness};
