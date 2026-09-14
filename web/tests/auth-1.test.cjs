const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {transformSync}=require('../../backend/node_modules/esbuild');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {localeTools}=require('./i18n-fixture.cjs');

function mount(locale, ok=true){
  const states=[],calls=[],redirects=[],stored=[];let cursor=0,tree;
  const mod={exports:{}};
  vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname,'../app/register/page.tsx'),'utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'}).code,{
    module:mod,exports:mod.exports,
    fetch:async(url,options)=>{calls.push({url,...options});return {ok,json:async()=>ok?{token:'fixture-token'}:{message:'auth.invalidNames'}};},
    localStorage:{setItem:(...args)=>stored.push(args)},
    require(name){
      if(name==='react')return {useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],v=>states[i]=v];}};
      if(name==='react/jsx-runtime')return require(name);
      if(name==='next/navigation')return {useRouter:()=>({push:p=>redirects.push(p)})};
      if(name.endsWith('LocaleProvider'))return {useLocale:()=>localeTools(locale)};
      if(name.endsWith('/lib/api'))return {API_URL:'https://fixture.invalid'};
      if(name.endsWith('AuthShell'))return {default:({children})=>React.createElement('main',null,children),FutureSocialSignIn:()=>null,__esModule:true};
      if(name.endsWith('.module.css'))return {default:{},__esModule:true};
      throw Error(name);
    },
  });
  const render=()=>{cursor=0;tree=mod.exports.default();return renderToStaticMarkup(tree);};
  function nodes(){const found=[];function visit(n){if(Array.isArray(n))return n.forEach(visit);if(!n||typeof n!=='object')return;found.push(n);visit(n.props?.children);}visit(tree);return found;}
  render();return {calls,stored,redirects,render,nodes,change(id,value){nodes().find(n=>n.props?.id===id).props.onChange({target:{value}});render();},async submit(){await nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});return render();}};
}
for(const locale of ['fr','en']){
  test(`${locale}: customer form has four fields and sends no referral data`,async()=>{
    const page=mount(locale);assert.deepEqual(page.nodes().filter(n=>n.type==='input').map(n=>n.props.id),['register-firstname','register-lastname','register-email','register-password']);
    for(const [field,value]of Object.entries({firstname:'Jean',lastname:'Tremblay',email:'Jean@example.ca',password:'password8'}))page.change('register-'+field,value);
    await page.submit();assert.equal(page.calls.length,1);assert.equal(page.calls[0].url,'https://fixture.invalid/auth/register');
    assert.deepEqual(JSON.parse(page.calls[0].body),{firstName:'Jean',lastName:'Tremblay',email:'Jean@example.ca',password:'password8',role:'CLIENT'});
    assert.deepEqual(page.stored,[['token','fixture-token']]);assert.deepEqual(page.redirects,['/offers']);
  });
  test(`${locale}: backend validation keys use existing localized compatibility and preserve entered values`,async()=>{
    const page=mount(locale,false);page.change('register-firstname','Jean');const html=await page.submit();assert.ok(html.includes(localeTools(locale).t('auth.invalidNames')));assert.equal(page.nodes().find(n=>n.props?.id==='register-firstname').props.value,'Jean');assert.equal(page.stored.length,0);assert.equal(page.redirects.length,0);
    for(const key of ['auth.invalidNames','auth.invalidEmail','auth.invalidPasswordLength','auth.merchantRequired'])assert.equal(localeTools(locale).message(key),localeTools(locale).t(key));
  });
}
