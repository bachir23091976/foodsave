const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
function load(name, deps = {}) {
  const module = { exports: {} };
  const code = transformSync(fs.readFileSync(path.join(__dirname, '../src/lib/' + name + '.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
  vm.runInNewContext(code, { module, exports: module.exports, require(n) { if (!(n in deps)) throw Error(n); return deps[n]; } });
  return module.exports;
}
const pricing = load('checkout-pricing');
const snapshots = load('checkout-pricing-snapshot', { './checkout-pricing': pricing });
module.exports = { pricing, snapshots, load };
if (require.main === module) {
  for (const [s, fee, total, commission, net] of [[200,49,249,30,170],[500,49,549,75,425],[1000,50,1050,150,850],[2000,100,2100,300,1700],[3000,149,3149,450,2550],[5000,149,5149,750,4250]])
    test(`pricing ${s}: fee ${fee}, total ${total}, commission ${commission}, net ${net}`, () => {
      const p=pricing.checkoutPricing(s); assert.deepEqual([p.serviceFeeMinor,p.customerTotalMinor,p.merchantCommissionMinor,p.merchantNetMinor],[fee,total,commission,net]);
    });
  test('rounding and minimum/cap boundaries',()=>{
    for(const [s,f] of [[979,49],[980,49],[989,49],[990,50],[1009,50],[1010,51],[2969,148],[2970,149],[2980,149],[10000,149]])assert.equal(pricing.checkoutPricing(s).serviceFeeMinor,f);
    assert.equal(pricing.checkoutPricing(10).merchantCommissionMinor,2);
  });
  test('rejects invalid amounts and exact decimal boundary',()=>{
    for(const v of [NaN,Infinity,-1,0,1.5,Number.MAX_SAFE_INTEGER,99999999])assert.throws(()=>pricing.checkoutPricing(v));
    for(const v of [NaN,Infinity,-1,0,1.001,1e20])assert.throws(()=>pricing.offerPriceMinor(v));
    assert.equal(pricing.offerPriceMinor(2.01),201);assert.equal(pricing.offerPriceMinor(0.29),29);
  });
  function fixture(version=1) {
    const p=pricing.checkoutPricing(200,version), snapshot={id:'snap',...p,userId:'u',offerId:'o',stripeDestinationAccountId:'acct',stripeSessionId:null};
    const session={id:'cs',mode:'payment',payment_status:'paid',currency:'cad',amount_total:p.customerTotalMinor,
      metadata:{userId:'u',offerId:'o',...(version?{pricingSnapshotId:'snap',pricingVersion:'1'}:{})},
      payment_intent:{id:'pi',status:'succeeded',currency:'cad',amount:p.customerTotalMinor,amount_received:p.customerTotalMinor,
        application_fee_amount:p.merchantCommissionMinor+p.serviceFeeMinor,transfer_data:{destination:'acct'}},
      line_items:{has_more:false,data:[200,...(version?[49]:[])].map(amount=>({quantity:1,currency:'cad',amount_discount:0,amount_tax:0,amount_subtotal:amount,amount_total:amount}))}};
    const db={checkoutPricingSnapshot:{findUnique:async()=>snapshot}};
    const provider={checkout:{sessions:{retrieve:async()=>session}}};
    return {snapshot,session,run:()=>snapshots.prepareCheckoutPricing(db,provider,'cs','u','o')};
  }
  test('version 1 uses immutable snapshot and full provider evidence',async()=>{const h=fixture();const p=await h.run();assert.equal(p.data.customerTotalMinor,249);assert.equal(p.snapshot.merchandiseSubtotalMinor,200);});
  test('provider line-item ordering does not change pricing validation',async()=>{const h=fixture();h.session.line_items.data.reverse();assert.equal((await h.run()).data.customerTotalMinor,249);});
  test('legacy session uses evidence without inventing a fee',async()=>{const p=await fixture(0).run();assert.equal(p.data.serviceFeeMinor,0);assert.equal(p.data.pricingVersion,0);assert.equal(p.data.customerTotalMinor,200);});
  for(const mutation of [h=>delete h.session.metadata.pricingSnapshotId,h=>h.session.metadata.pricingVersion='2',h=>h.session.amount_total=200,h=>h.session.payment_intent.application_fee_amount=30,h=>h.session.payment_intent.transfer_data.destination='wrong',h=>h.session.metadata.userId='other',h=>h.snapshot.stripeSessionId='other',h=>h.session.line_items.data[1].amount_total=48,h=>h.session.line_items.has_more=true])
    test('rejects malformed version-1/payment evidence '+mutation.toString(),async()=>{const h=fixture();mutation(h);await assert.rejects(h.run);});
  test('binding is conditional and cannot steal another session',async()=>{
    const h=fixture(),prepared=await h.run();let query;
    await assert.rejects(()=>snapshots.bindCheckoutPricing({checkoutPricingSnapshot:{updateMany:async q=>{query=q;return {count:0};}}},prepared));
    assert.equal(query.where.id,'snap');assert.equal(query.where.OR[1].stripeSessionId,'cs');
  });
  function controllerHarness({ quantity=2, version=1, failBind=false }={}) {
    const h=fixture(version), state={orders:[],snapshot: version ? h.snapshot : null,quantity,price:2,creates:[],refunds:[],resolutions:new Map()};
    let tail=Promise.resolve();
    const db={
      checkoutPricingSnapshot:{
        findUnique:async()=>state.snapshot,
        create:async({data})=>(state.snapshot={id:'snap',...data}),
        updateMany:async({where,data})=>{if(failBind)throw Error('binding failed');if(state.snapshot.stripeSessionId && state.snapshot.stripeSessionId!==data.stripeSessionId)return {count:0};Object.assign(state.snapshot,data);return {count:1};},
      },
      offer:{findUnique:async()=>({id:'o',title:'Food',discountedPrice:state.price,quantity:state.quantity,pickupEnd:new Date(Date.now()+60000),merchant:{stripeAccountId:'acct',ownerId:'merchant'}}),updateMany:async()=>({count:state.quantity>0?(state.quantity--,1):0})},
      order:{findUnique:async()=>state.orders[0]||null,create:async({data})=>{const row={id:'order',pickupCode:'code',...data,pricingSnapshot:state.snapshot};state.orders.push(row);return row;}},
      $queryRaw:async(strings,...values)=>strings.join('').includes('pg_advisory')?[]:[],
    };
    db.$transaction=async fn=>{let done;const prev=tail;tail=new Promise(r=>done=r);await prev;try{return await fn(db);}finally{done();}};
    const provider={...h.session,checkout:{sessions:{retrieve:async()=>h.session,create:async(data,options)=>{state.creates.push({data,options});return {id:'cs',url:'https://checkout.stripe.com/test'};}}},accounts:{retrieve:async()=>({capabilities:{transfers:'active'},charges_enabled:true,payouts_enabled:true,requirements:{currently_due:[]}})}};
    const controller=require('./order-confirmation.test.cjs').loadController(db,provider,{'../lib/checkout-pricing-snapshot':snapshots});
    const response=()=>({code:200,status(n){this.code=n;return this;},json(body){this.body=body;return this;}});
    return {h,state,db,provider,controller,response};
  }
  test('authoritative quote has no provider or database writes',async()=>{
    const h=controllerHarness(),res=h.response();await h.controller.getCheckoutQuote({userId:'u',query:{offerId:'o',customerTotalMinor:1}},res);
    assert.equal(res.body.pricing.customerTotalMinor,249);assert.equal(h.state.creates.length,0);assert.equal(h.state.snapshot.stripeSessionId,null);
  });
  test('stale quote requires review before any Checkout creation',async()=>{
    const h=controllerHarness(),res=h.response();h.state.price=3;
    await h.controller.createOrder({userId:'u',body:{offerId:'o',reviewedSubtotalMinor:200,pricingVersion:1}},res);
    assert.equal(res.code,409);assert.equal(res.body.pricing.customerTotalMinor,349);assert.equal(h.state.creates.length,0);
  });
  test('Checkout stores snapshot first and ignores forged client accounting',async()=>{
    const h=controllerHarness(),res=h.response();
    await h.controller.createOrder({userId:'u',body:{offerId:'o',reviewedSubtotalMinor:200,pricingVersion:1,serviceFeeMinor:0,customerTotalMinor:1,locale:'en'}},res);
    assert.equal(res.code,200);const {data,options}=h.state.creates[0];
    assert.deepEqual(Array.from(data.line_items,l=>l.price_data.unit_amount),[200,49]);
    assert.equal(data.payment_intent_data.application_fee_amount,79);assert.equal(data.payment_intent_data.transfer_data.destination,'acct');
    assert.equal(options.idempotencyKey,'foodsave_checkout_snap');assert.equal(h.state.snapshot.stripeSessionId,'cs');
  });
  test('binding failure after provider success preserves snapshot for confirmation',async()=>{
    const h=controllerHarness({failBind:true}),res=h.response();
    await h.controller.createOrder({userId:'u',body:{offerId:'o',reviewedSubtotalMinor:200,pricingVersion:1}},res);
    assert.equal(res.code,500);assert.equal(h.state.creates.length,1);assert.equal(h.state.snapshot.customerTotalMinor,249);
    assert.equal(h.state.snapshot.stripeSessionId,undefined);
  });
  test('price changes after Checkout cannot change confirmation accounting; concurrent replay is one order',async()=>{
    const h=controllerHarness();h.state.price=99;
    await Promise.all([h.controller.testConfirmPaidSession(h.h.session,'u'),h.controller.testConfirmPaidSession(h.h.session)]);
    assert.equal(h.state.orders.length,1);assert.equal(h.state.orders[0].totalPrice,2);
    assert.equal(h.state.orders[0].pricingSnapshot.customerTotalMinor,249);assert.equal(h.state.quantity,1);
    await h.controller.testConfirmPaidSession(h.h.session,'u');assert.equal(h.state.orders.length,1);
  });
  test('open legacy Checkout confirms actual paid price, with no service fee',async()=>{
    const h=controllerHarness({version:0});h.state.price=99;
    await h.controller.testConfirmPaidSession(h.h.session,'u');
    assert.equal(h.state.orders[0].totalPrice,2);assert.equal(h.state.snapshot.pricingVersion,0);assert.equal(h.state.snapshot.serviceFeeMinor,0);
  });
  test('existing historical order wins without provider pricing reads or backfill',async()=>{
    const h=controllerHarness();h.state.orders.push({id:'historical',status:'CANCELLED',totalPrice:7,pickupCode:'legacy-code'});
    h.provider.checkout.sessions.retrieve=async()=>{throw Error('must not read');};
    await h.controller.testConfirmPaidSession(h.h.session,'u');assert.equal(h.state.orders[0].totalPrice,7);assert.equal(h.state.orders[0].pricingSnapshot,undefined);
  });
}
