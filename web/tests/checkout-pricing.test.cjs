const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {transformSync}=require('../../backend/node_modules/esbuild');
const {localeTools}=require('./i18n-fixture.cjs');
function mount(locale, fail=false, stale=false) {
  const slots=[],deps=[],effects=[];let index=0,tree;const calls=[],location={href:'',search:''};
  const quote={merchandiseSubtotalMinor:200,serviceFeeMinor:49,customerTotalMinor:249,pricingVersion:1};
  const hooks={useState(initial){const i=index++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v];},useRef(v){const i=index++;return slots[i]||=( {current:v});},useEffect(fn,d){const i=index++;if(!deps[i]||d.some((v,j)=>v!==deps[i][j])){deps[i]=d;effects.push(fn);}}};
  const module={exports:{}};
  vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname,'../app/offers/page.tsx'),'utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'}).code,{
    module,exports:module.exports,Date,URLSearchParams,localStorage:{getItem:()=> 'fixture'},window:{location,atob:()=>'{"role":"CLIENT"}',addEventListener(){},removeEventListener(){}},
    fetch:async(url,options={})=>{calls.push({url,...options});let data={};let status=200;
      if(url.endsWith('/offers'))data={offers:[{id:'o',title:'Soup',category:'AUTRE',originalPrice:5,discountedPrice:2,dynamicPricingEnabled:true,quantity:1,pickupStart:new Date().toISOString(),pickupEnd:new Date().toISOString(),merchant:{id:'m',name:'Merchant',city:'Ottawa'}}]};
      if(url.includes('/orders/quote'))data={pricing:quote};
      if(url.endsWith('/orders')){if(fail)throw Error('lost response');const body=JSON.parse(options.body);assert.equal(body.reviewedSubtotalMinor,quote.merchandiseSubtotalMinor);if(stale){stale=false;Object.assign(quote,{merchandiseSubtotalMinor:300,customerTotalMinor:349});status=409;data={code:'PRICE_REVIEW_REQUIRED',pricing:{...quote}};}else data={checkoutUrl:'https://checkout.stripe.com/mock'};}
      return {ok:status===200,status,json:async()=>data};
    },require:n=>{if(n==='react')return hooks;if(n==='react/jsx-runtime')return require(n);if(n.endsWith('LocaleProvider'))return {useLocale:()=>localeTools(locale)};if(n.endsWith('/lib/api'))return {API_URL:'https://mock.invalid'};if(n.endsWith('.css'))return {default:{},__esModule:true};if(n==='next/link')return ({children,...p})=>React.createElement('a',p,children);return ()=>null;},
  });
  const render=()=>{index=0;tree=module.exports.default();effects.splice(0).forEach(fn=>fn());return renderToStaticMarkup(tree);};
  const settle=async()=>{for(let i=0;i<5;i++){await new Promise(r=>setImmediate(r));render();}return render();};
  const button=()=>{let found;function walk(n){if(Array.isArray(n))return n.forEach(walk);if(!n?.props)return;if(n.type==='button'&&renderToStaticMarkup(n).includes(localeTools(locale).t('pricing.review')))found=n;if(n.type==='button'&&renderToStaticMarkup(n).includes(localeTools(locale).t('pricing.proceed')))found=n;walk(n.props.children);}walk(tree);assert.ok(found);return found;};
  render();return {calls,location,settle,async click(){render();const b=button();assert.ok(!b.props.disabled);await b.props.onClick();return settle();},disabled(){render();return button().props.disabled;}};
}
for(const locale of ['fr','en']) {
  test(`${locale}: authoritative price review before POST; full fee disclosure`,async()=>{
    const page=mount(locale);const initial=await page.settle();assert.ok(initial.includes(localeTools(locale).t("dynamic.customer")));assert.ok(!initial.includes(localeTools(locale).t("dynamic.minimum")));const html=await page.click();
    assert.equal(page.calls.filter(c=>c.method==='POST').length,0);
    assert.ok(html.includes(localeTools(locale).t('pricing.fee')));assert.ok(html.includes(localeTools(locale).t('pricing.refund')));
    assert.ok(html.includes(localeTools(locale).money(2.49)));await page.click();
    assert.equal(page.calls.filter(c=>c.method==='POST').length,1);assert.equal(page.location.href,'https://checkout.stripe.com/mock');
  });
  test(`${locale}: uncertain Checkout creation cannot be automatically repeated`,async()=>{
    const page=mount(locale,true);await page.settle();await page.click();const html=await page.click();
    assert.ok(html.includes(localeTools(locale).t('pricing.uncertain')));assert.equal(page.disabled(),true);
    assert.equal(page.calls.filter(c=>c.method==='POST').length,1);assert.equal(page.location.href,'');
  });
}

for(const locale of ['fr','en'])test(locale+': stale quote requires a separate explicit review before Checkout',async()=>{const page=mount(locale,false,true);await page.settle();await page.click();const html=await page.click();assert.ok(html.includes(localeTools(locale).t('pricing.changed')));assert.ok(html.includes(localeTools(locale).money(3.49)));assert.equal(page.location.href,'');await page.click();assert.equal(page.location.href,'https://checkout.stripe.com/mock');assert.equal(page.calls.filter(c=>c.method==='POST').length,2);});
