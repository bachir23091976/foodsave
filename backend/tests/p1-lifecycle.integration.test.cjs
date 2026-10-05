const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {PrismaClient}=require('@prisma/client');
const {loadService}=require('./customer-cancellation-refund.test.cjs');
const {loadController,deferred,response}=require('./order-confirmation.test.cjs');
const {pricing,snapshots}=require('./checkout-pricing.test.cjs');
const expiration=require('./no-show-fixture.cjs');
const url=process.env.FOODSAVE_TEST_DATABASE_URL;
if(!url)throw Error('Explicit isolated local test database required');
const target=new URL(url);
assert.equal(target.hostname,'127.0.0.1');assert.equal(target.port,'55432');
assert.equal(target.pathname,'/foodsave_test_no_show_20261003');
assert.match(target.searchParams.get('schema')||'',/^p1_[a-z0-9_]+$/);

test('P1 real PostgreSQL lifecycle with mocked provider only',{timeout:60000},async t=>{
  const db=new PrismaClient({datasources:{db:{url}}}),other=new PrismaClient({datasources:{db:{url}}});
  const services=[db,other].map(client=>loadService().cancellationRefundService(client));
  const uid=randomUUID();
  try{
    const user=await db.user.create({data:{email:uid+'@example.invalid',firstName:'Fixture',lastName:'Only',role:'MERCHANT'}});
    const merchant=await db.merchant.create({data:{ownerId:user.id,name:'Fixture',address:'Fixture',city:'Ottawa',province:'ON',postalCode:'K1A0B1',stripeAccountId:'acct_fixture'}});
    async function fixture({quantity=2,expired=false,dynamic=false,legacy=false}={}){
      const offer=await db.offer.create({data:{merchantId:merchant.id,title:'Fixture',originalPrice:100,discountedPrice:99,quantity,
        pickupStart:new Date(Date.now()+86400000),pickupEnd:new Date(Date.now()+(expired?-1000:172800000))}});
      if(dynamic)await db.offerDynamicPricing.create({data:{offerId:offer.id,enabled:true,startingPriceMinor:9900,minimumPriceMinor:500,formulaVersion:1}});
      const p=pricing.checkoutPricing(200,legacy?0:1);
      const snap=legacy?null:await db.checkoutPricingSnapshot.create({data:{...p,userId:user.id,offerId:offer.id,stripeDestinationAccountId:'acct_fixture'}});
      const sid='cs_fixture_'+randomUUID(),pid='pi_fixture_'+randomUUID();
      const payment={id:pid,status:'succeeded',amount:p.customerTotalMinor,amount_received:p.customerTotalMinor,currency:'cad',
        application_fee_amount:p.merchantCommissionMinor+p.serviceFeeMinor,transfer_data:{destination:'acct_fixture'}};
      const session={id:sid,created:Math.floor(Date.now()/1000)-7200,mode:'payment',payment_status:'paid',currency:'cad',amount_total:p.customerTotalMinor,
        metadata:{userId:user.id,offerId:offer.id,...(snap?{pricingSnapshotId:snap.id,pricingVersion:'1'}:{})},payment_intent:payment,
        line_items:{has_more:false,data:[200,...(legacy?[]:[49])].map(amount=>({quantity:1,currency:'cad',amount_discount:0,amount_tax:0,amount_subtotal:amount,amount_total:amount}))}};
      const state={calls:0,refund:null,loseResponse:false};
      const provider={checkout:{sessions:{retrieve:async()=>session}},paymentIntents:{retrieve:async()=>payment},
        webhooks:{constructEvent:()=>({type:'checkout.session.completed',data:{object:session}})},
        refunds:{list:async function*(){if(state.refund)yield state.refund;},retrieve:async()=>state.refund,create:async(args,options)=>{
          state.calls++;assert.equal(args.payment_intent,pid);assert.equal(args.amount,undefined);
          assert.equal(args.reverse_transfer,true);assert.equal(args.refund_application_fee,true);
          assert.equal(options.idempotencyKey,state.orderId?'merchant_cancel_'+state.orderId:'refund_sold_out_'+sid);
          // Independent client proves financial intent is COMMITTED before provider work.
          if(state.orderId){assert.equal((await other.order.findUnique({where:{id:state.orderId}})).status,'CANCELLED');
            assert.equal((await other.customerCancellationRefund.findUnique({where:{orderId:state.orderId}})).creationDispatched,true);
          }else assert.ok(await other.soldOutResolution.findUnique({where:{stripeSessionId:sid}}),'Persisted resolution itself is REFUND_REQUIRED');
          state.refund={id:'re_fixture_'+randomUUID(),payment_intent:pid,amount:p.customerTotalMinor,currency:'cad',status:'succeeded'};
          if(state.loseResponse)throw Error('mock lost response');return state.refund;
        }}};
      const controllers=[db,other].map(client=>loadController(client,provider,{'../lib/checkout-pricing-snapshot':snapshots,
        './loyalty.controller':{checkAndCreateReward:async()=>{throw Error('Unexpected reward');}}}));
      async function order(){
        if(snap)await db.checkoutPricingSnapshot.update({where:{id:snap.id},data:{stripeSessionId:sid}});
        const row=await db.order.create({data:{userId:user.id,offerId:offer.id,totalPrice:2,status:'CONFIRMED',stripeSessionId:sid,pricingSnapshotId:snap?.id}});
        state.orderId=row.id;return row;
      }
      return {offer,snap,session,provider,state,controllers,order};
    }
    const quantity=h=>db.offer.findUnique({where:{id:h.offer.id}}).then(o=>o.quantity);
    await t.test('merchant atomic cancellation, full service-fee refund, replay and at-most-once inventory',async()=>{
      const h=await fixture(),o=await h.order(),token=await services[0].claimMerchant(o.id,user.id,'Reason');
      await services[0].attempt(o.id,token,h.provider);await services[1].reconcile(o.id,h.provider);await services[0].reconcile(o.id,h.provider);
      const row=await db.customerCancellationRefund.findUnique({where:{orderId:o.id}});
      assert.equal(row.actor,'MERCHANT');assert.equal(row.refundStatus,'SUCCEEDED');assert.equal(row.inventoryRestored,true);
      assert.equal(h.state.refund.amount,249);assert.equal(h.state.calls,1);assert.equal(await quantity(h),3);
      assert.equal(await services[1].claimMerchant(o.id,user.id,'Replay'),null);
      assert.equal(await expiration.transitionOrder(db,o.id,user.id,'PICKUP'),false);
    });
    await t.test('failed durable insert rolls back real cancellation transaction',async()=>{
      const h=await fixture(),o=await h.order();
      const failing={$transaction:fn=>db.$transaction(tx=>fn(new Proxy(tx,{get(target,key){
        if(key==='customerCancellationRefund')return {create:async()=>{throw Error('mock insertion failure');}};return target[key];
      }})))};
      await assert.rejects(loadService().cancellationRefundService(failing).claimMerchant(o.id,user.id,'Reason'));
      assert.equal((await db.order.findUnique({where:{id:o.id}})).status,'CONFIRMED');
      assert.equal(await db.customerCancellationRefund.count({where:{orderId:o.id}}),0);
    });
    for(const options of [{quantity:0},{expired:true}])await t.test('merchant refund cannot reactivate '+JSON.stringify(options),async()=>{
      const h=await fixture(options),o=await h.order(),before=await quantity(h);
      await services[0].attempt(o.id,await services[0].claimMerchant(o.id,user.id,'Reason'),h.provider);
      assert.equal(await quantity(h),before);assert.equal((await db.customerCancellationRefund.findUnique({where:{orderId:o.id}})).inventoryRestored,false);
    });
    await t.test('merchant lost response recovered by independent client; concurrent reconciliation safe',async()=>{
      const h=await fixture(),o=await h.order();h.state.loseResponse=true;
      await assert.rejects(services[0].attempt(o.id,await services[0].claimMerchant(o.id,user.id,'Reason'),h.provider));
      const outcomes=await Promise.allSettled(services.map(s=>s.reconcile(o.id,h.provider)));
      assert.ok(outcomes.some(x=>x.status==='fulfilled'));await services[0].reconcile(o.id,h.provider);
      assert.equal(h.state.calls,1);assert.equal(await quantity(h),3);
      assert.equal((await db.customerCancellationRefund.findUnique({where:{orderId:o.id}})).refundStatus,'SUCCEEDED');
    });
    await t.test('refund waits for offer lock and respects committed deactivation/expiry',async()=>{
      const h=await fixture(),o=await h.order(),token=await services[0].claimMerchant(o.id,user.id,'Reason');
      const locked=deferred(),release=deferred(),accepted=deferred();
      const held=other.$transaction(async tx=>{
        await tx.$queryRaw`SELECT "id" FROM "Offer" WHERE "id"=${h.offer.id} FOR UPDATE`;
        locked.resolve();await release.promise;
        await tx.offer.update({where:{id:h.offer.id},data:{pickupEnd:new Date(0),quantity:0}});
      });
      await locked.promise;const create=h.provider.refunds.create;
      h.provider.refunds.create=async(...args)=>{const r=await create(...args);accepted.resolve();return r;};
      const attempt=services[0].attempt(o.id,token,h.provider);
      try{await Promise.race([accepted.promise,attempt.then(()=>{throw Error('Refund did not reach provider');})]);}finally{release.resolve();}
      await held;await attempt;assert.equal(await quantity(h),0);
      const row=await db.customerCancellationRefund.findUnique({where:{orderId:o.id}});
      assert.equal(row.refundStatus,'SUCCEEDED');assert.equal(row.inventoryRestored,false);
    });
    await t.test('crash before provider dispatch retains reviewable obligation, no replacement',async()=>{
      const h=await fixture(),o=await h.order();await services[0].claimMerchant(o.id,user.id,'Reason');
      await services[1].reconcile(o.id,h.provider);assert.equal(h.state.calls,0);
      assert.equal((await db.customerCancellationRefund.findUnique({where:{orderId:o.id}})).refundStatus,'NEEDS_REVIEW');
    });
    await t.test('concurrent merchant/customer claims produce one durable obligation',async()=>{
      const h=await fixture(),o=await h.order();
      await Promise.allSettled([services[0].claimMerchant(o.id,user.id,'Reason'),services[1].claim(o.id,user.id)]);
      assert.equal(await db.customerCancellationRefund.count({where:{orderId:o.id}}),1);
      assert.equal((await db.order.findUnique({where:{id:o.id}})).status,'CANCELLED');
    });
    await t.test('concurrent merchant claims authorize exactly one provider attempt',async()=>{
      const h=await fixture(),o=await h.order();
      const tokens=await Promise.all(services.map(s=>s.claimMerchant(o.id,user.id,'Reason')));
      assert.equal(tokens.filter(Boolean).length,1);
      await services[0].attempt(o.id,tokens.find(Boolean),h.provider);
      assert.equal(h.state.calls,1);assert.equal(await db.customerCancellationRefund.count({where:{orderId:o.id}}),1);
    });
    await t.test('merchant cancellation versus pickup uses one terminal state',async()=>{
      const h=await fixture(),o=await h.order();await db.offer.update({where:{id:h.offer.id},data:{pickupStart:new Date(0)}});
      await Promise.all([services[0].claimMerchant(o.id,user.id,'Reason'),expiration.transitionOrder(other,o.id,user.id,'PICKUP')]);
      const row=await db.order.findUnique({where:{id:o.id}}),count=await db.customerCancellationRefund.count({where:{orderId:o.id}});
      assert.ok(['CANCELLED','COMPLETED'].includes(row.status));assert.equal(count,row.status==='CANCELLED'?1:0);
    });
    await t.test('overdue NO_SHOW defeats merchant cancellation without refund obligation',async()=>{
      const h=await fixture(),o=await h.order();await db.order.update({where:{id:o.id},data:{noShowEligibleAt:new Date(0)}});
      await Promise.all([services[0].claimMerchant(o.id,user.id,'Reason'),expiration.reconcileNoShows(other,{userId:user.id})]);
      assert.equal((await db.order.findUnique({where:{id:o.id}})).status,'NO_SHOW');
      assert.equal(await db.customerCancellationRefund.count({where:{orderId:o.id}}),0);assert.equal(h.state.calls,0);
    });
    for(const options of [{expired:true},{expired:true,dynamic:true},{expired:true,legacy:true},{expired:true,quantity:0}])
      await t.test('late paid confirmation durable disposition '+JSON.stringify(options),async()=>{
        const h=await fixture(options),before=await quantity(h),a=response(),b=response();
        await Promise.all([h.controllers[0].stripeWebhook({headers:{'stripe-signature':'mock'},body:h.session},a),
          h.controllers[1].confirmOrder({userId:user.id,body:{sessionId:h.session.id}},b)]);
        assert.ok([200,500].includes(a.statusCode));assert.equal(b.statusCode,409);
        // A concurrent owner can temporarily ask Stripe to retry; terminal replay is 200.
        const retry=response();await h.controllers[0].stripeWebhook({headers:{'stripe-signature':'mock'},body:h.session},retry);assert.equal(retry.statusCode,200);
        const row=await db.soldOutResolution.findUnique({where:{stripeSessionId:h.session.id}});
        assert.equal(row.reason,'PICKUP_EXPIRED');assert.equal(row.refundStatus,'SUCCEEDED');
        assert.equal(await db.order.count({where:{stripeSessionId:h.session.id}}),0);assert.equal(await quantity(h),before);
        const saved=await db.checkoutPricingSnapshot.findUnique({where:{stripeSessionId:h.session.id}});
        assert.equal(saved.merchandiseSubtotalMinor,200);assert.equal(saved.serviceFeeMinor,options.legacy?0:49);
        assert.equal(h.state.refund.amount,options.legacy?200:249);
        await assert.rejects(db.checkoutPricingSnapshot.update({where:{id:saved.id},data:{merchandiseSubtotalMinor:9900}}));
        await db.offer.update({where:{id:h.offer.id},data:{quantity:10,pickupEnd:new Date(Date.now()+3600000)}});
        await h.controllers[0].testConfirmPaidSession(h.session,user.id);
        assert.equal(await db.order.count({where:{stripeSessionId:h.session.id}}),0);assert.equal(await quantity(h),10);assert.equal(h.state.calls,1);
      });
    await t.test('timely confirmation keeps normal reservation and grace deadline',async()=>{
      const h=await fixture({quantity:1});await h.controllers[0].testConfirmPaidSession(h.session,user.id);
      const o=await db.order.findUnique({where:{stripeSessionId:h.session.id}});
      assert.equal(o.status,'CONFIRMED');assert.equal(o.noShowEligibleAt.getTime(),h.offer.pickupEnd.getTime()+900000);
      assert.equal(await quantity(h),0);assert.equal(h.state.calls,0);
    });
    await t.test('offer lock wait crosses expiry: database time AFTER lock prevents order',async()=>{
      const h=await fixture(),locked=deferred(),release=deferred(),attempted=deferred();
      const held=db.$transaction(async tx=>{
        await tx.$queryRaw`SELECT "id" FROM "Offer" WHERE "id"=${h.offer.id} FOR UPDATE`;
        locked.resolve();await release.promise;
        await tx.offer.update({where:{id:h.offer.id},data:{pickupEnd:new Date(0)}});
      });
      await locked.promise;
      const instrumented={...other,checkoutPricingSnapshot:other.checkoutPricingSnapshot,
        $transaction:(fn,options)=>other.$transaction(tx=>fn(new Proxy(tx,{get(target,key){
          if(key==='$queryRaw')return (strings,...values)=>{
            if(strings.join('').includes('FROM "Offer"')&&strings.join('').includes('FOR UPDATE'))attempted.resolve();
            return target.$queryRaw(strings,...values);
          };return target[key];
        }})),options)};
      const controller=loadController(instrumented,h.provider,{'../lib/checkout-pricing-snapshot':snapshots});
      const confirm=controller.testConfirmPaidSession(h.session,user.id);
      try{await Promise.race([attempted.promise,confirm.then(()=>{throw Error('Did not wait for offer lock');})]);}finally{release.resolve();}
      await held;await confirm;
      assert.equal(await db.order.count({where:{stripeSessionId:h.session.id}}),0);
      assert.equal((await db.soldOutResolution.findUnique({where:{stripeSessionId:h.session.id}})).reason,'PICKUP_EXPIRED');
    });
    await t.test('late refund lost response never authorizes another refund on replay',async()=>{
      const h=await fixture({expired:true});h.state.loseResponse=true;
      await assert.rejects(h.controllers[0].testConfirmPaidSession(h.session));
      await h.controllers[1].testConfirmPaidSession(h.session);
      const row=await db.soldOutResolution.findUnique({where:{stripeSessionId:h.session.id}});
      assert.equal(row.refundStatus,'UNKNOWN');assert.ok(row.recoveryOwnerToken);assert.equal(h.state.calls,1);
      assert.equal(await db.order.count({where:{stripeSessionId:h.session.id}}),0);
    });
    await t.test('no late-payment/cancellation rewards or referral grants',async()=>{
      assert.equal(await db.loyaltyReward.count({where:{userId:user.id}}),0);
    });
    // Immutable snapshots and uniquely named fixtures remain ONLY in this disposable schema.
  }finally{await Promise.all([db.$disconnect(),other.$disconnect()]);}
});
