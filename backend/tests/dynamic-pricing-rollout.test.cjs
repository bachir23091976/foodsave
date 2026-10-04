const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load,pricing}=require('./dynamic-pricing-fixture.cjs');
const response=()=>({code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(body){this.body=body;return this;}});
function harness(value){
 const env=value===undefined?{}:{FOODSAVE_DYNAMIC_PRICING_ENABLED:value};
 const dynamic=load('lib/dynamic-pricing',{'./checkout-pricing':pricing},env);
 const presentation=load('lib/offer-presentation',{'./dynamic-pricing':dynamic});
 const offer={id:'o',merchantId:'m',title:'Meal',discountedPrice:8,quantity:1,pickupStart:new Date(Date.now()+3600000),pickupEnd:new Date(Date.now()+7200000),merchant:{id:'m',ownerId:'u',stripeAccountId:'acct_fixture'},dynamicPricing:{enabled:true,startingPriceMinor:800,minimumPriceMinor:500,formulaVersion:1}};
 const calls={writes:0,provider:0,snapshots:0};
 const db={merchant:{findUnique:async()=>({id:'m'})},offer:{findUnique:async()=>offer,findMany:async()=>[offer],create:async({data})=>{calls.writes++;return{id:'o'};}},checkoutPricingSnapshot:{create:async({data})=>{calls.snapshots++;return{id:'snap',...data};},updateMany:async()=>({count:1})},$queryRaw:async()=>[{nowMs:Date.now()}]};db.$transaction=fn=>fn(db);
 const offers=load('controllers/offer.controller',{'../lib/prisma':{prisma:db},'../lib/pickup-time':load('lib/pickup-time'),'../lib/checkout-pricing':pricing,'../lib/dynamic-pricing':dynamic,'../lib/offer-presentation':presentation,'./notification.controller':{createNotification:async()=>{}}});
 const provider={accounts:{retrieve:async()=>{calls.provider++;return{capabilities:{transfers:'active'},charges_enabled:true,payouts_enabled:true,requirements:{currently_due:[]}};}},checkout:{sessions:{create:async data=>{calls.provider++;assert.equal(data.payment_intent_data.application_fee_amount,169);return{id:'cs',url:'https://checkout.stripe.com/fixture'};}}}};
 const orders=require('./order-confirmation.test.cjs').loadController(db,provider,{'../lib/dynamic-pricing':dynamic});
 return{dynamic,presentation,offer,calls,db,offers,orders,provider,env};
}
for(const value of [undefined,'','false','FALSE','1','TRUE',' true ','true'])test('gate exact value '+String(value),async()=>{
 const h=harness(value),enabled=value==='true';assert.equal(h.dynamic.dynamicPricingEnabled(),enabled);
 const r=response();h.offers.getOfferCapabilities({},r);assert.deepEqual(JSON.parse(JSON.stringify(r.body)),{dynamicPricingAvailable:enabled});assert.equal(r.headers['Cache-Control'],'no-store');
});
test('OFF rejects all configuration writes, including disable; fixed creation remains usable',async()=>{
 const h=harness();const body={title:'Meal',originalPrice:10,discountedPrice:8,quantity:1,pickupStart:h.offer.pickupStart.toISOString(),pickupEnd:h.offer.pickupEnd.toISOString()};
 let r=response();await h.offers.createOffer({userId:'u',body:{...body,dynamicPricingEnabled:true,minimumPriceMinor:500}},r);assert.equal(r.code,503);assert.equal(h.calls.writes,0);
 for(const enabled of [true,false]){r=response();await h.offers.updateDynamicPricing({userId:'u',params:{id:'o'},body:{enabled,minimumPriceMinor:500}},r);assert.equal(r.code,503);}
 r=response();await h.offers.createOffer({userId:'u',body},r);assert.equal(r.code,201);assert.equal(h.calls.writes,1);
});
test('OFF blocks active dynamic quote/checkout before provider or snapshot, but never reprices public offers',async()=>{
 const h=harness();h.offer.pickupStart=new Date(Date.now()-10800000);h.offer.pickupEnd=new Date(Date.now()+1800000);
 let r=response();await h.orders.getCheckoutQuote({query:{offerId:'o'}},r);assert.equal(r.code,503);
 r=response();await h.orders.createOrder({userId:'u',body:{offerId:'o',reviewedSubtotalMinor:500,pricingVersion:1}},r);assert.equal(r.code,503);assert.equal(h.calls.provider,0);assert.equal(h.calls.snapshots,0);
 r=response();await h.offers.getAllOffers({},r);assert.equal(r.body.offers[0].discountedPrice,5);const json=JSON.stringify(r.body);for(const key of ['minimumPriceMinor','startingPriceMinor','formulaVersion','FOODSAVE_DYNAMIC'])assert.ok(!json.includes(key));
});
for(const config of [null,{enabled:false}])test('OFF fixed/disabled checkout retains accounting '+JSON.stringify(config),async()=>{
 const h=harness();h.offer.dynamicPricing=config;let r=response();await h.orders.getCheckoutQuote({query:{offerId:'o'}},r);assert.equal(r.body.pricing.merchandiseSubtotalMinor,800);
 r=response();await h.orders.createOrder({userId:'u',body:{offerId:'o',reviewedSubtotalMinor:800,pricingVersion:1}},r);assert.equal(r.code,200,JSON.stringify(h.calls));assert.equal(h.calls.snapshots,1);assert.equal(h.calls.provider,2);
});
test('ON works; OFF transition during readiness is rechecked under the Offer lock',async()=>{
 const h=harness('true');const original=h.provider.accounts.retrieve;h.provider.accounts.retrieve=async()=>{const a=await original();h.env.FOODSAVE_DYNAMIC_PRICING_ENABLED='false';return a;};
 const r=response();await h.orders.createOrder({userId:'u',body:{offerId:'o',reviewedSubtotalMinor:800,pricingVersion:1}},r);assert.equal(r.code,503);assert.equal(h.calls.snapshots,0);assert.equal(h.calls.provider,1);
});
