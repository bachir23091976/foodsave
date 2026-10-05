const {test}=require('node:test');
const assert=require('node:assert/strict');
const {harness}=require('./customer-cancellation-refund.test.cjs');
const claim=h=>h.service.claimMerchant('o','m','Unavailable goods');

for(const status of ['succeeded','pending','requires_action','failed','canceled','other'])test(`merchant durable ${status}`,async()=>{
  const h=harness(status),token=await claim(h);
  assert.equal(h.state.order.status,'CANCELLED');assert.equal(h.state.row.actor,'MERCHANT');
  assert.equal(h.state.order.cancellationReason,'Unavailable goods');assert.ok(h.state.row.firstAttemptAt);
  const row=await h.service.attempt('o',token,h.provider);
  assert.equal(row.refundStatus,status==='other'?'UNKNOWN':status.toUpperCase());
  assert.equal(row.refundId,'re');assert.equal(row.paymentIntentId,'pi');
  assert.equal(h.state.quantity,status==='succeeded'?2:1);
  assert.equal(await claim(h),null);await assert.rejects(h.service.claim('o','u'));
  assert.equal(h.state.calls,1); // Mock asserts full fee-inclusive amount and both Connect flags/key.
});
test('merchant claim + refund record roll back atomically on insert failure',async()=>{
  const h=harness();h.state.failCreate=true;await assert.rejects(claim(h));
  assert.equal(h.state.order.status,'CONFIRMED');assert.equal(h.state.row,null);
});
for(const kind of ['zero','deactivated','expired','deactivated-during-refund'])test(`merchant success never republishes ${kind}`,async()=>{
  const h=harness();if(['zero','deactivated'].includes(kind))h.state.quantity=0;
  if(kind==='expired')h.offer.pickupEnd=new Date(0);
  const token=await claim(h);
  if(kind==='deactivated-during-refund')h.state.quantity=0;
  await h.service.attempt('o',token,h.provider);await h.service.reconcile('o',h.provider);
  assert.equal(h.state.quantity,kind==='expired'?1:0);assert.equal(h.state.row.inventoryRestored,false);
  assert.equal(h.state.row.refundStatus,'SUCCEEDED');assert.equal(h.state.calls,1);
});
for(const failure of ['session','payment','refund'])test(`merchant ${failure} failure retains obligation`,async()=>{
  const h=harness(),token=await claim(h);
  const fail=async()=>{throw Error('mock provider failure');};
  if(failure==='session')h.provider.checkout.sessions.retrieve=fail;
  if(failure==='payment')h.provider.paymentIntents.retrieve=fail;
  if(failure==='refund')h.provider.refunds.create=fail;
  await assert.rejects(h.service.attempt('o',token,h.provider));
  assert.equal(h.state.order.status,'CANCELLED');assert.equal(h.state.row.refundStatus,'UNKNOWN');
  assert.equal(h.state.row.recoveryOwnerToken,token);assert.equal(h.state.quantity,1);
  assert.equal(await claim(h),null);
});
test('merchant lost response: evidence recovery once; no replacement; success is terminal',async()=>{
  const h=harness();h.state.timeout=true;const token=await claim(h);
  await assert.rejects(h.service.attempt('o',token,h.provider));
  assert.equal(h.state.row.creationDispatched,true);assert.equal(h.state.row.refundStatus,'UNKNOWN');
  await h.service.reconcile('o',h.provider);h.state.providerRefund.status='failed';
  await h.service.reconcile('o',h.provider);
  assert.equal(h.state.row.refundStatus,'SUCCEEDED');assert.equal(h.state.quantity,2);assert.equal(h.state.calls,1);
});
test('merchant crash before dispatch leaves durable review obligation, no invented refund',async()=>{
  const h=harness();await claim(h);await h.service.reconcile('o',h.provider);
  assert.equal(h.state.row.refundStatus,'NEEDS_REVIEW');assert.equal(h.state.calls,0);assert.equal(h.state.order.status,'CANCELLED');
});
test('merchant crash after dispatch with no visible evidence never redispatches',async()=>{
  const h=harness();h.state.timeout=true;const token=await claim(h);
  await assert.rejects(h.service.attempt('o',token,h.provider));delete h.state.providerRefund;
  await assert.rejects(h.service.attempt('o',token,h.provider));await h.service.reconcile('o',h.provider);
  assert.equal(h.state.calls,1);assert.equal(h.state.row.refundStatus,'NEEDS_REVIEW');
});
test('existing full provider refund is reused and pending can reconcile to success',async()=>{
  const h=harness();h.state.providerRefund={id:'re',payment_intent:'pi',amount:549,currency:'cad',status:'pending'};
  await h.service.attempt('o',await claim(h),h.provider);assert.equal(h.state.calls,0);assert.equal(h.state.quantity,1);
  h.state.providerRefund.status='succeeded';await h.service.reconcile('o',h.provider);await h.service.reconcile('o',h.provider);
  assert.equal(h.state.calls,0);assert.equal(h.state.quantity,2);assert.equal(h.state.row.refundId,'re');
});
test('merchant inventory persistence failure is recoverable without reactivation or second refund',async()=>{
  const h=harness(),token=await claim(h),original=h.db.offer.updateMany;
  h.db.offer.updateMany=async()=>{throw Error('mock DB failure');};
  await assert.rejects(h.service.attempt('o',token,h.provider));assert.equal(h.state.order.status,'CANCELLED');
  assert.equal(h.state.quantity,1);h.db.offer.updateMany=original;await h.service.reconcile('o',h.provider);
  assert.equal(h.state.calls,1);assert.equal(h.state.quantity,2);assert.equal(h.state.row.inventoryRestored,true);
});
test('merchant concurrent cancellation has one winner and stale owner cannot dispatch',async()=>{
  const h=harness();const tokens=await Promise.all([claim(h),claim(h)]);
  assert.equal(tokens.filter(Boolean).length,1);await assert.rejects(h.service.attempt('o','stale',h.provider));
  await h.service.attempt('o',tokens.find(Boolean),h.provider);assert.equal(h.state.calls,1);
});
test('merchant ownership and NO_SHOW deadline remain authoritative',async()=>{
  const h=harness();await assert.rejects(h.service.claimMerchant('o','other','reason'));assert.equal(h.state.row,null);
  h.state.order.noShowEligibleAt=new Date(0);assert.equal(await claim(h),null);
  assert.equal(h.state.order.status,'NO_SHOW');assert.equal(h.state.row,null);assert.equal(h.state.calls,0);
});
test('historical NULL deadline allows existing merchant cancellation semantics',async()=>{
  const h=harness();h.state.order.noShowEligibleAt=null;h.offer.pickupEnd=new Date(0);
  assert.ok(await claim(h));assert.equal(h.state.order.status,'CANCELLED');
});
test('merchant reconciliation rejects evidence mismatch and does not steal abandoned ownership',async()=>{
  const h=harness();await claim(h);h.provider.checkout.sessions.retrieve=async()=>({id:'wrong'});
  await assert.rejects(h.service.reconcile('o',h.provider));const owner=h.state.row.reconciliationOwnerToken;
  assert.ok(owner);await assert.rejects(h.service.reconcile('o',h.provider));assert.equal(h.state.row.reconciliationOwnerToken,owner);
  assert.equal(h.state.calls,0);assert.equal(h.state.quantity,1);
});
