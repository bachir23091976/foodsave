const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {transformSync}=require('esbuild');
const {pricing}=require('./checkout-pricing.test.cjs');
async function salesFor(orders) {
  const module={exports:{}};
  const db={merchant:{findUnique:async()=>({id:'m'})},order:{findMany:async q=>{
    assert.equal(q.where.status,'COMPLETED');assert.equal(q.where.offer.merchantId,'m');
    return orders;
  }}};
  vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname,'../src/controllers/merchant.controller.ts'),'utf8'),{loader:'ts',format:'cjs'}).code,
    {module,exports:module.exports,process:{env:{}},console,require:n=>n==='../lib/prisma'?{prisma:db}:n==='../lib/checkout-pricing'?pricing:{}});
  let body;await module.exports.getMySales({userId:'owner'},{json:b=>body=b,status(){throw Error('unexpected failure');}});
  return body;
}
test('mixed legacy and snapshot sales exclude customer service fees and do not use mutable order prices',async()=>{
  const body=await salesFor([{id:'new',totalPrice:99,offer:{title:'new'},pricingSnapshot:pricing.checkoutPricing(200)},
    {id:'old',totalPrice:5,offer:{title:'old'},pricingSnapshot:null}]);
  assert.equal(body.sales[0].totalPrice,2);assert.equal(body.sales[0].commission,.3);assert.equal(body.sales[0].net,1.7);
  assert.equal(body.summary.totalRevenue,7);assert.equal(body.summary.totalCommission,1.05);assert.equal(body.summary.totalNet,5.95);
});
test('historical 2.001 Float order returns successfully with original legacy reporting semantics',async()=>{
  const historical={id:'old',totalPrice:2.001,offer:{title:'old'},pricingSnapshot:null};
  const body=await salesFor([historical]);
  assert.equal(body.sales[0].totalPrice,2.001);
  assert.equal(body.sales[0].commission,.3);
  assert.equal(body.sales[0].net,1.7);
  assert.equal(body.summary.totalRevenue,2);
  assert.equal(body.summary.totalCommission,.3);
  assert.equal(body.summary.totalNet,1.7);
  assert.equal(historical.totalPrice,2.001);
  assert.equal(historical.pricingSnapshot,null);
});
test('historical fractional cents and snapshot accounting remain separate in mixed summaries',async()=>{
  const body=await salesFor([{id:'old',totalPrice:2.001,offer:{title:'old'},pricingSnapshot:null},
    {id:'new',totalPrice:99,offer:{title:'new'},pricingSnapshot:pricing.checkoutPricing(200)}]);
  assert.equal(body.sales[1].totalPrice,2);
  assert.equal(body.sales[1].commission,.3);
  assert.equal(body.sales[1].net,1.7);
  assert.equal(body.summary.totalRevenue,4);
  assert.equal(body.summary.totalCommission,.6);
  assert.equal(body.summary.totalNet,3.4);
});
