const {test}=require('node:test');
const assert=require('node:assert/strict');
const {harness,paidSession,response}=require('./order-confirmation.test.cjs');
const now=new Date('2026-10-05T16:00:00Z');
for(const delta of [-1,0,1])test(`locked confirmation deadline delta ${delta}ms`,async()=>{
  const h=harness({now,pickupEnd:new Date(now.getTime()+delta)});
  const result=await h.testConfirmPaidSession(paidSession('late'),'customer');
  if(delta>0){assert.equal(result.status,201);assert.equal(h.state.orders.length,1);
    assert.equal(h.state.orders[0].noShowEligibleAt.getTime(),now.getTime()+delta+900000);assert.equal(h.state.refunds.length,0);
  }else{assert.equal(h.state.orders.length,0);assert.equal(h.state.quantity,1);assert.equal(h.state.decrements,0);
    assert.equal(h.state.resolutions.get('late').reason,'PICKUP_EXPIRED');assert.equal(h.state.resolutions.get('late').refundStatus,'SUCCEEDED');
    assert.equal(h.state.refunds.length,1);assert.equal(h.state.refunds[0].options.idempotencyKey,'refund_sold_out_late');
    assert.equal(h.state.refunds[0].params.reverse_transfer,true);assert.equal(h.state.refunds[0].params.refund_application_fee,true);
  }
});
test('paid earlier, delayed webhook/browser race: durable refund, no order even after restock/window extension',async()=>{
  const h=harness({now,pickupEnd:new Date(now.getTime()-1)}),session={...paidSession('late'),created:Math.floor(now.getTime()/1000)-3600};
  const a=response(),b=response();await Promise.all([
    h.stripeWebhook({headers:{'stripe-signature':'mock'},body:session},a),
    h.confirmOrder({userId:'customer',body:{sessionId:'late'}},b),
  ]);
  assert.equal(a.statusCode,200);assert.equal(h.state.refunds.length,1);assert.equal(h.state.orders.length,0);
  h.state.quantity=20;h.state.pickupEnd=new Date(now.getTime()+3600000);
  await h.testConfirmPaidSession(session,'customer');assert.equal(h.state.orders.length,0);assert.equal(h.state.refunds.length,1);
  assert.equal(h.state.quantity,20);assert.equal(h.state.resolutions.get('late').reason,'PICKUP_EXPIRED');
});
test('late lost response retains durable ownership for investigation; replay never refunds again',async()=>{
  const h=harness({now,pickupEnd:now});h.state.stripeError=Error('mock lost response');
  await assert.rejects(h.testConfirmPaidSession(paidSession('late')));assert.equal(h.state.resolutions.get('late').refundStatus,'UNKNOWN');
  h.state.listed=[{id:'re_late',payment_intent:'pi_late',status:'succeeded',amount:1050}];
  await h.testConfirmPaidSession(paidSession('late'));await h.testConfirmPaidSession(paidSession('late'));
  assert.equal(h.state.resolutions.get('late').refundStatus,'UNKNOWN');assert.ok(h.state.resolutions.get('late').recoveryOwnerToken);assert.equal(h.state.refunds.length,1);
  assert.equal(h.state.orders.length,0);assert.equal(h.state.quantity,1);
});
test('late known pending refund reconciles success without second creation',async()=>{
  const h=harness({now,pickupEnd:now});h.state.refundOutcome='pending';
  await h.testConfirmPaidSession(paidSession('late'));assert.equal(h.state.resolutions.get('late').refundStatus,'PENDING');
  h.state.refundOutcome='succeeded';await h.testConfirmPaidSession(paidSession('late'));
  assert.equal(h.state.resolutions.get('late').refundStatus,'SUCCEEDED');assert.equal(h.state.refunds.length,1);
  assert.equal(h.state.orders.length,0);
});
test('late and already zero-stock preserves explicit expiry disposition',async()=>{
  const h=harness({now,pickupEnd:now,quantity:0});await h.testConfirmPaidSession(paidSession('late'));
  assert.equal(h.state.resolutions.get('late').reason,'PICKUP_EXPIRED');assert.equal(h.state.quantity,0);assert.equal(h.state.orders.length,0);
});
