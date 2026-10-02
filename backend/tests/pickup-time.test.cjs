const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {transformSync}=require('esbuild');
function load(file,deps={}) {
  const module={exports:{}};
  vm.runInNewContext(transformSync(fs.readFileSync(path.resolve(__dirname,file),'utf8'),{loader:'ts',format:'cjs'}).code,
    {module,exports:module.exports,Date,Intl,console,require:n=>deps[n]||{}});
  return module.exports;
}
const frontend=load('../../web/app/lib/pickup-time.ts');
const backend=load('../src/lib/pickup-time.ts');
module.exports={frontend};
for(const zone of ['UTC','Asia/Tokyo','America/Los_Angeles']) test('independent of device/server timezone '+zone,()=>{
  const previous=process.env.TZ;
  try {
    process.env.TZ=zone;
    for(const [wall,iso] of [['2026-10-02T13:35','2026-10-02T17:35:00.000Z'],['2026-01-02T13:35','2026-01-02T18:35:00.000Z']]) {
      assert.equal(frontend.ottawaPickupInstant(wall),iso);
      assert.equal(backend.parsePickupInstant(iso).toISOString(),iso);
      for(const locale of ['fr-CA','en-CA']) {
        const parts=new Intl.DateTimeFormat(locale,{timeZone:'America/Toronto',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso));
        assert.equal(parts.find(p=>p.type==='hour').value,'13');
        assert.equal(parts.find(p=>p.type==='minute').value,'35');
      }
    }
  } finally { if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous; }
});
test('invalid calendar values and DST gaps/folds rejected',()=>{
  for(const value of ['2026-02-30T13:35','2026-03-08T02:30','2026-11-01T01:30','invalid'])assert.throws(()=>frontend.ottawaPickupInstant(value));
});
test('frontend rejects past/reversed/equal windows',()=>{
  for(const [start,end] of [['13:35','13:35'],['14:35','13:35'],['10:35','11:35']])
    assert.throws(()=>frontend.pickupWindow('2026-10-02T'+start,'2026-10-02T'+end,Date.parse('2026-10-02T16:00Z')));
});
function harness() {
  const rows=[];
  const db={merchant:{findUnique:async()=>({id:'merchant'})},offer:{create:async({data})=>{rows.push(data);return data;},findMany:async({where})=>rows.filter(r=>r.quantity>where.quantity.gt&&r.pickupEnd>where.pickupEnd.gt)}};
  const controller=load('../src/controllers/offer.controller.ts',{'../lib/prisma':{prisma:db},'../lib/pickup-time':backend});
  const response=()=>({code:200,status(n){this.code=n;return this;},json(body){this.body=body;return this;}});
  return {rows,controller,response};
}
for(const kind of ['timezone-free','invalid','normalized-date','equal','reversed','expired','past-start'])test('API rejects '+kind+' without writing',async()=>{
  const h=harness(),res=h.response();
  let start=new Date(Date.now()+3600000).toISOString(),end=new Date(Date.now()+7200000).toISOString();
  if(kind==='timezone-free')start=start.slice(0,16);
  if(kind==='invalid')start='invalid';
  if(kind==='normalized-date')start='2099-02-30T12:00:00.000Z';
  if(kind==='equal')end=start;
  if(kind==='reversed')[start,end]=[end,start];
  if(kind==='expired'){start=new Date(Date.now()-7200000).toISOString();end=new Date(Date.now()-3600000).toISOString();}
  if(kind==='past-start')start=new Date(Date.now()-3600000).toISOString();
  await h.controller.createOffer({userId:'u',body:{title:'Bread',originalPrice:5,discountedPrice:2,quantity:1,pickupStart:start,pickupEnd:end}},res);
  assert.equal(res.code,400);assert.equal(h.rows.length,0);
});
test('valid UTC instants are persisted unchanged and remain publicly available',async()=>{
  const h=harness(),res=h.response();
  const start=new Date(Date.now()+3600000).toISOString(),end=new Date(Date.now()+7200000).toISOString();
  await h.controller.createOffer({userId:'u',body:{title:'Bread',originalPrice:5,discountedPrice:2,quantity:1,pickupStart:start,pickupEnd:end}},res);
  assert.equal(res.code,201);assert.equal(h.rows[0].pickupStart.toISOString(),start);
  const listing=h.response();await h.controller.getAllOffers({},listing);assert.equal(listing.body.offers.length,1);
  h.rows[0].pickupEnd=new Date(Date.now()-1000);
  await h.controller.getAllOffers({},listing);assert.equal(listing.body.offers.length,0);
});
