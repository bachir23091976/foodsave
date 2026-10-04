const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {PrismaClient}=require('@prisma/client');const {dynamic,pricing,presentation,load}=require('./dynamic-pricing-fixture.cjs');
const url=process.env.FOODSAVE_TEST_DATABASE_URL;if(!url)throw Error('Explicit local DB required');const target=new URL(url);assert.equal(target.hostname,'127.0.0.1');assert.equal(target.port,'55432');assert.equal(target.pathname,'/foodsave_test_dynamic_20261004');
test('dynamic pricing real PostgreSQL',async t=>{
 const db=new PrismaClient({datasources:{db:{url}}}),other=new PrismaClient({datasources:{db:{url}}});let user,merchant,offer;const snapshots=[];
 try{
 user=await db.user.create({data:{email:randomUUID()+'@example.invalid',firstName:'Fixture',lastName:'Only',role:'MERCHANT'}});
 merchant=await db.merchant.create({data:{ownerId:user.id,name:'Fixture',address:'Fixture',city:'Ottawa',province:'ON',postalCode:'K1A0B1',stripeAccountId:'acct_fixture'}});
 offer=await db.offer.create({data:{merchantId:merchant.id,title:'Fixture',originalPrice:10,discountedPrice:8,quantity:3,pickupStart:new Date(Date.now()+3600000),pickupEnd:new Date(Date.now()+7200000)}});
 const config={offerId:offer.id,enabled:true,startingPriceMinor:800,minimumPriceMinor:500,formulaVersion:1};
 await t.test('historical offers have no configuration and migration history is applied',async()=>{assert.equal(await db.offerDynamicPricing.findUnique({where:{offerId:offer.id}}),null);const rows=await db.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;assert.equal(rows.length,22);});
 await t.test('configuration constraints reject invalid values',async()=>{for(const patch of [{minimumPriceMinor:0},{minimumPriceMinor:801},{startingPriceMinor:99999851},{formulaVersion:2}])await assert.rejects(()=>db.offerDynamicPricing.create({data:{...config,...patch}}));await db.offerDynamicPricing.create({data:config});});
 const offerController=client=>load('controllers/offer.controller',{'../lib/prisma':{prisma:client},'../lib/pickup-time':load('lib/pickup-time'),'../lib/checkout-pricing':pricing,'../lib/dynamic-pricing':dynamic,'../lib/offer-presentation':presentation,'./notification.controller':{createNotification:async()=>{}}});
 const response=()=>({code:200,status(n){this.code=n;return this;},json(body){this.body=body;return this;}});
 const provider={accounts:{retrieve:async()=>({capabilities:{transfers:'active'},charges_enabled:true,payouts_enabled:true,requirements:{currently_due:[]}})},checkout:{sessions:{create:async payload=>{snapshots.push(payload.metadata.pricingSnapshotId);assert.ok(!JSON.stringify(payload).includes('minimumPriceMinor'));return{id:'cs_'+randomUUID(),url:'https://checkout.stripe.com/fixture'};}}}};
 await t.test('owner-only edits and time freeze',async()=>{let r=response();await offerController(db).updateDynamicPricing({userId:'other',params:{id:offer.id},body:{enabled:true,minimumPriceMinor:300}},r);assert.equal(r.code,404);assert.equal((await db.offerDynamicPricing.findUnique({where:{offerId:offer.id}})).minimumPriceMinor,500);});
 await t.test('edit lock serializes real checkout decision and snapshot persists immutable price',async()=>{
   let unlock,locked;const held=new Promise(r=>locked=r),release=new Promise(r=>unlock=r);
   const holder=db.$transaction(async tx=>{await tx.$queryRaw`SELECT "id" FROM "Offer" WHERE "id"=${offer.id} FOR UPDATE`;await tx.offerDynamicPricing.update({where:{offerId:offer.id},data:{minimumPriceMinor:400}});locked();await release;});
   await held;
   const controller=require('./order-confirmation.test.cjs').loadController(other,provider);
   const r=response();const checkout=controller.createOrder({userId:user.id,body:{offerId:offer.id,reviewedSubtotalMinor:800,pricingVersion:1}},r);
   try{await new Promise(r=>setTimeout(r,100));}finally{unlock();}await holder;await checkout;assert.equal(r.code,200);
   const snap=await db.checkoutPricingSnapshot.findUnique({where:{id:snapshots[0]}});assert.equal(snap.merchandiseSubtotalMinor,800);assert.equal(snap.serviceFeeMinor,49);assert.equal(snap.merchantCommissionMinor,120);
   const edit=response();await offerController(db).updateDynamicPricing({userId:user.id,params:{id:offer.id},body:{enabled:true,minimumPriceMinor:100}},edit);assert.equal(edit.code,200);
   assert.equal((await db.checkoutPricingSnapshot.findUnique({where:{id:snap.id}})).merchandiseSubtotalMinor,800);
   await assert.rejects(()=>db.checkoutPricingSnapshot.update({where:{id:snap.id},data:{merchandiseSubtotalMinor:100}}));
   assert.equal((await db.offer.findUnique({where:{id:offer.id}})).quantity,3);
 });
 await t.test('inside pickup stage uses DB time; stale quote no session; changes frozen',async()=>{
   await db.offer.update({where:{id:offer.id},data:{pickupStart:new Date(Date.now()-10800000),pickupEnd:new Date(Date.now()+1800000)}});
   const r=response();await offerController(db).updateDynamicPricing({userId:user.id,params:{id:offer.id},body:{enabled:false}},r);assert.equal(r.code,409);
   const controller=require('./order-confirmation.test.cjs').loadController(db,provider);const stale=response();const count=snapshots.length;
   await controller.createOrder({userId:user.id,body:{offerId:offer.id,reviewedSubtotalMinor:800,pricingVersion:1}},stale);assert.equal(stale.code,409);assert.equal(snapshots.length,count);assert.equal(stale.body.pricing.merchandiseSubtotalMinor,100);
   const accepted=response();await controller.createOrder({userId:user.id,body:{offerId:offer.id,reviewedSubtotalMinor:100,pricingVersion:1}},accepted);assert.equal(accepted.code,200);
 });
 }finally{
 // Immutable snapshots deliberately remain in this disposable database.
 if(offer)await db.offer.delete({where:{id:offer.id}});if(merchant)await db.merchant.delete({where:{id:merchant.id}});if(user)await db.user.delete({where:{id:user.id}});
 await Promise.all([db.$disconnect(),other.$disconnect()]);
 }
});
