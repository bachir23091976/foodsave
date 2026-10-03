const {test}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const api=require('./no-show-fixture.cjs');
const url=process.env.FOODSAVE_TEST_DATABASE_URL;
if(!url)throw Error('Explicit local database required');
const target=new URL(url);
assert.equal(target.hostname,'127.0.0.1');assert.equal(target.port,'55432');assert.equal(target.pathname,'/foodsave_test_no_show_20261003');
const {PrismaClient}=require('@prisma/client');
test('NO_SHOW real PostgreSQL transitions',async t=>{
  const db=new PrismaClient({datasources:{db:{url}}}),other=new PrismaClient({datasources:{db:{url}}});
  const prefix=randomUUID();let user,merchant,offer;
  try {
    user=await db.user.create({data:{email:prefix+'@example.invalid',firstName:'Fixture',lastName:'Only',role:'MERCHANT'}});
    merchant=await db.merchant.create({data:{ownerId:user.id,name:'Fixture',address:'Fixture',city:'Ottawa',province:'ON',postalCode:'K1A0B1'}});
    offer=await db.offer.create({data:{merchantId:merchant.id,title:'Fixture',originalPrice:5,discountedPrice:2,quantity:3,pickupStart:new Date(Date.now()-3600000),pickupEnd:new Date(Date.now()-60000)}});
    const make=(deadline)=>db.order.create({data:{userId:user.id,offerId:offer.id,totalPrice:2,status:'CONFIRMED',stripeSessionId:'cs_'+randomUUID(),noShowEligibleAt:deadline}});
    await t.test('historical default NULL preserved; expired historical pickup blocked',async()=>{const row=await make(undefined);assert.equal(row.noShowEligibleAt,null);assert.equal(await api.transitionOrder(db,row.id,user.id,'PICKUP'),false);await api.reconcileNoShows(db,{userId:user.id});assert.equal((await db.order.findUnique({where:{id:row.id}})).status,'CONFIRMED');});
    await t.test('competing reconciliation workers mutate overdue rows once',async()=>{const row=await make(new Date(Date.now()-1000));const counts=await Promise.all([api.reconcileNoShows(db,{userId:user.id}),api.reconcileNoShows(other,{userId:user.id})]);assert.equal(counts.reduce((a,b)=>a+b,0),1);assert.equal((await db.order.findUnique({where:{id:row.id}})).status,'NO_SHOW');assert.equal(await api.reconcileNoShows(db,{userId:user.id}),0);});
    await t.test('batch selection is independent of database session timezone',async()=>{
      const row=await make(new Date(Date.now()-1000));
      const zoned={ $transaction:fn=>db.$transaction(async tx=>{await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'Pacific/Auckland'");return fn(tx);}) };
      assert.equal(await api.reconcileNoShows(zoned,{userId:user.id}),1);
      assert.equal((await db.order.findUnique({where:{id:row.id}})).status,'NO_SHOW');
    });
    await t.test('pickup wins during grace',async()=>{const row=await make(new Date(Date.now()+60000));await Promise.all([api.transitionOrder(db,row.id,user.id,'PICKUP'),api.reconcileNoShows(other,{userId:user.id})]);assert.equal((await db.order.findUnique({where:{id:row.id}})).status,'COMPLETED');});
    await t.test('cancellation wins during grace',async()=>{const row=await make(new Date(Date.now()+60000));await Promise.all([api.transitionOrder(db,row.id,user.id,'CANCEL','test'),api.reconcileNoShows(other,{userId:user.id})]);assert.equal((await db.order.findUnique({where:{id:row.id}})).status,'CANCELLED');});
    await t.test('expiration defeats concurrent pickup and cancellation',async()=>{for(const action of ['PICKUP','CANCEL']){const row=await make(new Date(Date.now()-1000));const result=await Promise.all([api.transitionOrder(db,row.id,user.id,action,'test'),api.reconcileNoShows(other,{userId:user.id})]);assert.equal(result[0],false);assert.equal((await db.order.findUnique({where:{id:row.id}})).status,'NO_SHOW');}});
    await t.test('lock wait crossing deadline uses time after lock acquisition',async()=>{
      const row=await make(new Date(Date.now()+500));let unlock,locked;
      const held=new Promise(r=>locked=r),release=new Promise(r=>unlock=r);
      const holder=db.$transaction(async tx=>{await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id"=${row.id} FOR UPDATE`;locked();await release;});
      await held;
      const pickup=api.transitionOrder(other,row.id,user.id,'PICKUP');
      try { await new Promise(r=>setTimeout(r,800)); } finally {unlock();}
      await holder;assert.equal(await pickup,false);assert.equal((await db.order.findUnique({where:{id:row.id}})).status,'NO_SHOW');
    });
    await t.test('authenticated HTTP batches are bounded, concurrent, repeatable and protect historical NULL',async()=>{
      const {makeApp,serve,secret}=require('./no-show-cron.test.cjs');
      const historical=await make(null);
      for(let i=0;i<101;i++)await make(new Date(Date.now()-1000));
      const request=async url=>{const res=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+secret}});assert.equal(res.status,200);return(await res.json()).changed;};
      await serve(makeApp(db,api.reconcileNoShows),async url=>{
        assert.equal(await request(url),100);
        await serve(makeApp(other,api.reconcileNoShows),async second=>{
          const counts=await Promise.all([request(url),request(second)]);
          assert.equal(counts.reduce((a,b)=>a+b,0),1);
        });
        assert.equal(await request(url),0);
      });
      assert.equal((await db.order.findUnique({where:{id:historical.id}})).status,'CONFIRMED');
    });
    await t.test('NO_SHOW never changes stock or rewards and completed reporting excludes it',async()=>{
      assert.equal((await db.offer.findUnique({where:{id:offer.id}})).quantity,3);
      assert.equal(await db.loyaltyReward.count({where:{userId:user.id}}),0);
      const controller=require('./order-confirmation.test.cjs').loadController(db,{});
      const scoped={code:200,status(n){this.code=n;return this;},json(body){this.body=body;}};
      await controller.getMyOrders({userId:user.id},scoped);assert.equal(scoped.code,200);assert.ok(scoped.body.orders.some(o=>o.status==='NO_SHOW'));
      const rows=await db.order.findMany({where:{offer:{merchantId:merchant.id},status:'COMPLETED'}});assert.equal(rows.length,1);
    });
  }finally{
    if(user){await db.order.deleteMany({where:{userId:user.id}});if(offer)await db.offer.delete({where:{id:offer.id}});if(merchant)await db.merchant.delete({where:{id:merchant.id}});await db.user.delete({where:{id:user.id}});}
    await Promise.all([db.$disconnect(),other.$disconnect()]);
  }
});
