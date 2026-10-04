const {test}=require('node:test'),assert=require('node:assert/strict');
const {dynamic,pricing,presentation,load}=require('./dynamic-pricing-fixture.cjs');
const start=new Date('2026-10-02T17:00:00Z'),end=new Date('2026-10-02T21:00:00Z');
const offer=()=>({id:'o',discountedPrice:8,quantity:3,pickupStart:start,pickupEnd:end,merchantId:'m',merchant:{id:'m',ownerId:'owner',name:'Fixture',stripeAccountId:'private'},dynamicPricing:{enabled:true,startingPriceMinor:800,minimumPriceMinor:500,formulaVersion:1}});
for(const [hour,price] of [[16,800],[17,800],[18,700],[19,600],[20,500]])test('stage '+hour,()=>assert.equal(dynamic.currentPriceMinor(offer(),new Date(`2026-10-02T${hour}:00:00Z`)),price));
for(const time of ['2026-10-02T21:00Z','2026-10-02T22:00Z'])test('expired '+time,()=>assert.throws(()=>dynamic.currentPriceMinor(offer(),new Date(time))));
for(const [s,m]of [[1,1],[101,100],[800,800],[99999850,1],[2,1]])test('integer bounds '+s+'/'+m,()=>{const o=offer();Object.assign(o.dynamicPricing,{startingPriceMinor:s,minimumPriceMinor:m});let prior=s;for(let i=0;i<240;i++){const p=dynamic.currentPriceMinor(o,new Date(start.getTime()+i*60000));assert.ok(Number.isSafeInteger(p)&&p>=m&&p<=prior);prior=p;}assert.equal(prior,m);});
test('fixed and historical preserve original price',()=>{for(const c of [null,{...offer().dynamicPricing,enabled:false}])assert.equal(dynamic.currentPriceMinor({...offer(),dynamicPricing:c},start),800);});
test('invalid config rejected',()=>{for(const args of [[0,1], [100,0],[100,101],[100.1,50],[99999851,1],[100,50,2]])assert.throws(()=>dynamic.validateDynamicConfiguration(...args));});
for(const [a,b]of [['2026-03-08T01:00:00-05:00','2026-03-08T05:00:00-04:00'],['2026-11-01T00:00:00-04:00','2026-11-01T04:00:00-05:00']])test('DST real elapsed instants '+a,()=>{const o={...offer(),pickupStart:new Date(a),pickupEnd:new Date(b)};assert.equal(dynamic.currentPriceMinor(o,new Date(o.pickupStart.getTime()+(o.pickupEnd-o.pickupStart)/2)),600);});
test('public serializer removes private config and nested merchant secrets',()=>{const json=JSON.stringify(presentation.publicOffer(offer(),new Date('2026-10-02T19:00Z')));for(const forbidden of ['minimumPriceMinor','startingPriceMinor','formulaVersion','ownerId','stripeAccountId','private'])assert.ok(!json.includes(forbidden));assert.equal(JSON.parse(json).discountedPrice,6);});
function offerController(db){return load('controllers/offer.controller',{'../lib/prisma':{prisma:db},'../lib/pickup-time':load('lib/pickup-time'),'../lib/checkout-pricing':pricing,'../lib/dynamic-pricing':dynamic,'../lib/offer-presentation':presentation,'./notification.controller':{createNotification:async()=>{}}});}
const res=()=>({code:200,setHeader(){},status(n){this.code=n;return this;},json(body){this.body=body;return this;}});
test('creation initializes private configuration in the same nested offer write',async()=>{
 let writes=0;
 const db={merchant:{findUnique:async()=>({id:'m'})},offer:{create:async({data})=>{writes++;assert.equal(data.dynamicPricing.create.minimumPriceMinor,500);assert.equal(data.dynamicPricing.create.startingPriceMinor,800);return{id:'o'};}}};
 const body={title:'Test meal',originalPrice:10,discountedPrice:8,quantity:1,pickupStart:new Date(Date.now()+3600000).toISOString(),pickupEnd:new Date(Date.now()+7200000).toISOString(),dynamicPricingEnabled:true,minimumPriceMinor:500};
 let r=res();await offerController(db).createOffer({userId:'owner',body},r);assert.equal(r.code,201);assert.equal(writes,1);
 for(const minimumPriceMinor of [0,801,1.5,'500']){r=res();await offerController(db).createOffer({userId:'owner',body:{...body,minimumPriceMinor}},r);assert.equal(r.code,400);assert.equal(writes,1);}
});
test('canonical pricing is independent of server timezone',()=>{
 const previous=process.env.TZ;
 try{for(const zone of ['UTC','America/Toronto','Asia/Tokyo']){process.env.TZ=zone;assert.equal(dynamic.currentPriceMinor(offer(),new Date('2026-10-02T19:00:00Z')),600);}}
 finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});
test('threshold crossing after provider readiness forces a fresh review before any snapshot or Checkout',async()=>{
 const {loadController}=require('./order-confirmation.test.cjs');const now=Date.now(),o=offer();o.pickupStart=new Date(now+3600000);o.pickupEnd=new Date(now+18000000);
 let snapshots=0,sessions=0;
 const db={offer:{findUnique:async()=>o},checkoutPricingSnapshot:{create:async()=>{snapshots++;throw Error('must not run');}},$queryRaw:async q=>q.join('').includes('clock_timestamp')?[{nowMs:o.pickupStart.getTime()+3600000}]:[]};db.$transaction=fn=>fn(db);
 const stripe={accounts:{retrieve:async()=>({capabilities:{transfers:'active'},charges_enabled:true,payouts_enabled:true,requirements:{currently_due:[]}})},checkout:{sessions:{create:async()=>{sessions++;}}}};
 const r=res();await loadController(db,stripe).createOrder({userId:'u',body:{offerId:'o',reviewedSubtotalMinor:800,pricingVersion:1}},r);
 assert.equal(r.code,409);assert.equal(r.body.pricing.merchandiseSubtotalMinor,700);assert.equal(snapshots,0);assert.equal(sessions,0);
});
test('public and nearby controllers never return configuration; owner list does',async()=>{const o=offer();o.pickupStart=new Date(Date.now()+100000);o.pickupEnd=new Date(Date.now()+200000);Object.assign(o.merchant,{latitude:45,longitude:-75});const db={offer:{findMany:async()=>[o]},merchant:{findUnique:async q=>{assert.equal(q.where.ownerId,'owner');return{id:'m'};}}};const c=offerController(db);for(const method of ['getAllOffers','getNearbyOffers']){const r=res();await c[method]({query:{lat:'45',lng:'-75'}},r);assert.equal(r.code,200);assert.ok(!JSON.stringify(r.body).includes('minimumPriceMinor'));}const r=res();await c.getMyOffers({userId:'owner'},r);assert.equal(r.body.offers[0].dynamicPricing.minimumPriceMinor,500);});
for(const [owner,time,code]of [['other',start.getTime()-1,404],['owner',start.getTime(),409],['owner',start.getTime()-1,200]])test('owner edit policy '+owner+'/'+code,async()=>{let writes=0;const db={offer:{findUnique:async()=>offer()},offerDynamicPricing:{upsert:async()=>{writes++;}},$queryRaw:async q=>q.join('').includes('clock_timestamp')?[{nowMs:time}]:[]};db.$transaction=fn=>fn(db);const r=res();await offerController(db).updateDynamicPricing({userId:owner,params:{id:'o'},body:{enabled:true,minimumPriceMinor:400}},r);assert.equal(r.code,code);assert.equal(writes,code===200?1:0);});
test('checkout threshold locks snapshot and never publishes private config',async()=>{
 const {loadController}=require('./order-confirmation.test.cjs');let now=start.getTime(),creates=0,snapshot;const o=offer();o.pickupStart=new Date(Date.now()-3600000);o.pickupEnd=new Date(Date.now()+3600000);now=o.pickupStart.getTime();
 const db={offer:{findUnique:async()=>o},checkoutPricingSnapshot:{create:async({data})=>(snapshot={id:'snap',...data}),updateMany:async()=>({count:1})},$queryRaw:async q=>q.join('').includes('clock_timestamp')?[{nowMs:now}]:[]};db.$transaction=fn=>fn(db);
 const stripe={accounts:{retrieve:async()=>({capabilities:{transfers:'active'},charges_enabled:true,payouts_enabled:true,requirements:{currently_due:[]}})},checkout:{sessions:{create:async payload=>{creates++;assert.equal(payload.line_items[0].price_data.unit_amount,snapshot.merchandiseSubtotalMinor);assert.ok(!JSON.stringify(payload).includes('minimumPriceMinor'));return{id:'cs',url:'https://checkout.stripe.com/fixture'};}}}};
 const c=loadController(db,stripe);let r=res();await c.createOrder({userId:'u',body:{offerId:'o',reviewedSubtotalMinor:1,pricingVersion:1}},r);assert.equal(r.code,409);assert.equal(creates,0);
 // Initial quote is advisory; force its displayed price to match the accepted decision.
 o.dynamicPricing.minimumPriceMinor=800;now=o.pickupStart.getTime();r=res();await c.createOrder({userId:'u',body:{offerId:'o',reviewedSubtotalMinor:800,pricingVersion:1}},r);assert.equal(r.code,200);assert.equal(snapshot.merchandiseSubtotalMinor,800);assert.equal(snapshot.merchantCommissionMinor,120);assert.equal(snapshot.serviceFeeMinor,49);assert.equal(snapshot.customerTotalMinor,849);o.dynamicPricing.minimumPriceMinor=1;assert.equal(snapshot.merchandiseSubtotalMinor,800);
});
