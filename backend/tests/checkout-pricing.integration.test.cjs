const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {pricing,snapshots}=require('./checkout-pricing.test.cjs');
// Explicit isolated database only. No dotenv and no DATABASE_URL fallback.
const url=process.env.FOODSAVE_TEST_DATABASE_URL;
if(!url)throw Error('Explicit isolated test database configuration required');
const target=new URL(url);
assert.equal(target.hostname,'127.0.0.1');assert.equal(target.port,'55432');
assert.ok(['/foodsave_test_phase_a','/foodsave_test_service_fee_20260926'].includes(target.pathname));assert.equal(target.username,'foodsave_phase_a_runner');
const {PrismaClient}=require('@prisma/client');
test('PostgreSQL snapshot constraints, atomic rollback and independent client binding',async t=>{
  const db=new PrismaClient({datasources:{db:{url}}}),other=new PrismaClient({datasources:{db:{url}}});
  const prefix='pricing_'+randomUUID();
  const data={...pricing.checkoutPricing(200),userId:prefix,offerId:prefix,stripeDestinationAccountId:'acct_fixture'};
  try{
    const row=await db.checkoutPricingSnapshot.create({data});
    // Immutable audit rows intentionally remain in this disposable database.
    await t.test('independent workers cannot bind one snapshot to two sessions',async()=>{
      const result=await Promise.allSettled([db,other].map((client,i)=>client.$transaction(tx=>snapshots.bindCheckoutPricing(tx,{snapshot:row,sessionId:prefix+i,data}))));
      assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
    });
    await t.test('amounts and ownership cannot change; deletion rejected',async()=>{
      for(const change of [{serviceFeeMinor:50},{customerTotalMinor:200},{userId:'other'},{currency:'usd'}])
        await assert.rejects(()=>db.checkoutPricingSnapshot.update({where:{id:row.id},data:change}));
      await assert.rejects(()=>db.checkoutPricingSnapshot.delete({where:{id:row.id}}));
    });
    await t.test('invalid formulas rejected on insert',async()=>{
      for(const change of [{serviceFeeMinor:0},{customerTotalMinor:200},{merchantCommissionMinor:37},{merchantNetMinor:200},{pricingVersion:3}])
        await assert.rejects(()=>db.checkoutPricingSnapshot.create({data:{...data,...change}}));
    });
    await t.test('transaction failure leaves no partial snapshot',async()=>{
      const id=randomUUID();await assert.rejects(()=>db.$transaction(async tx=>{await tx.checkoutPricingSnapshot.create({data:{id,...data}});throw Error('abort');}));
      assert.equal(await other.checkoutPricingSnapshot.findUnique({where:{id}}),null);
    });
    await t.test('legacy snapshot records zero service fee',async()=>{
      const legacy=await db.checkoutPricingSnapshot.create({data:{...data,...pricing.checkoutPricing(200,0)}});assert.equal(legacy.serviceFeeMinor,0);
    });
    await t.test('independent browser/webhook confirmations use snapshot after offer price change',async()=>{
      const user=await db.user.create({data:{email:prefix+'@example.invalid',firstName:'Fixture',lastName:'Only',role:'MERCHANT'}});
      const merchant=await db.merchant.create({data:{ownerId:user.id,name:'Fixture',address:'Fixture',city:'Ottawa',province:'ON',postalCode:'K1A0B1',stripeAccountId:'acct_fixture'}});
      const offer=await db.offer.create({data:{merchantId:merchant.id,title:'Fixture',originalPrice:100,discountedPrice:99,quantity:1,pickupStart:new Date(Date.now()+86400000),pickupEnd:new Date(Date.now()+172800000)}});
      const snap=await db.checkoutPricingSnapshot.create({data:{...data,userId:user.id,offerId:offer.id}});
      const session={id:prefix+'_paid',mode:'payment',payment_status:'paid',currency:'cad',amount_total:249,
        metadata:{userId:user.id,offerId:offer.id,pricingSnapshotId:snap.id,pricingVersion:'1'},
        payment_intent:{id:'pi_fixture',status:'succeeded',currency:'cad',amount:249,amount_received:249,application_fee_amount:79,transfer_data:{destination:'acct_fixture'}},
        line_items:{has_more:false,data:[200,49].map(amount=>({quantity:1,currency:'cad',amount_discount:0,amount_tax:0,amount_subtotal:amount,amount_total:amount}))}};
      const provider={checkout:{sessions:{retrieve:async()=>session}}};
      const {loadController}=require('./order-confirmation.test.cjs');
      const controllers=[db,other].map(client=>loadController(client,provider,{'../lib/checkout-pricing-snapshot':snapshots}));
      await Promise.all(controllers.map(c=>c.testConfirmPaidSession(session,user.id)));
      const orders=await db.order.findMany({where:{stripeSessionId:session.id},include:{pricingSnapshot:true}});
      assert.equal(orders.length,1);assert.equal(orders[0].totalPrice,2);assert.equal(orders[0].pricingSnapshot.customerTotalMinor,249);
      assert.equal((await db.offer.findUnique({where:{id:offer.id}})).quantity,0);
      await db.offer.update({where:{id:offer.id},data:{quantity:10}});
      await controllers[0].testConfirmPaidSession(session,user.id);
      assert.equal((await db.offer.findUnique({where:{id:offer.id}})).quantity,10);
      // Preserve immutable accounting fixtures; this suite never resets or truncates the database.
    });
  }finally{await Promise.all([db.$disconnect(),other.$disconnect()]);}
});
