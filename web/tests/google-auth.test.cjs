const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {transformSync}=require('../../backend/node_modules/esbuild');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {localeTools}=require('./i18n-fixture.cjs');
function mount(file,locale,response){
 const states=[],effects=[],calls=[],writes=[],redirects=[],storage=new Map([['foodsave_google_verifier','fixture-verifier']]);let cursor=0,tree;
 const m={exports:{}};
 vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname,'../app',file),'utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'}).code,{
 module:m,exports:m.exports,URL,URLSearchParams,Uint8Array,TextEncoder,crypto:crypto.webcrypto,btoa:s=>Buffer.from(s,'binary').toString('base64'),
 sessionStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k),removeItem:k=>storage.delete(k)},localStorage:{setItem:(...v)=>writes.push(v)},
 window:{location:{hash:'#handoff=fixture-handoff',assign:v=>redirects.push(v),replace:v=>redirects.push(v)},history:{replaceState(){}}},
 fetch:async(url,options)=>{calls.push({url,...options});return {ok:response.ok,json:async()=>response.data};},
 require(n){if(n==='react')return {useState(v){const i=cursor++;if(!(i in states))states[i]=v;return [states[i],v=>states[i]=v];},useRef:()=>({current:false}),useEffect:f=>effects.push(f)};
 if(n==='react/jsx-runtime')return require(n);if(n.endsWith('LocaleProvider'))return {useLocale:()=>({...localeTools(locale),setLocale(){}})};
 if(n.endsWith('/lib/api'))return {API_URL:'https://api.fixture.invalid'};
 if(n.endsWith('AuthShell'))return {__esModule:true,default:({children})=>React.createElement('main',null,children)};
 if(n==='next/link')return {__esModule:true,default:({children,...p})=>React.createElement('a',p,children)};
 if(n.endsWith('.module.css'))return {__esModule:true,default:{}};throw Error(n);}
 });
 function render(){cursor=0;tree=m.exports.default();return renderToStaticMarkup(tree);}
 function nodes(n=tree){if(!n)return [];if(Array.isArray(n))return n.flatMap(x=>nodes(x));if(typeof n!=='object')return [];return [n,...nodes(n.props?.children)];}
 render();return {render,calls,writes,redirects,storage,async click(){await nodes().find(n=>n.type==='button').props.onClick();return render();},async effect(){effects[0]();await new Promise(r=>setImmediate(r));return render();}};
}
for(const locale of ['fr','en']){
 test(`${locale} Google button stores verifier only in sessionStorage and preserves locale`,async()=>{const p=mount('components/GoogleSignInButton.tsx',locale,{ok:true,data:{url:'https://api.fixture.invalid/auth/google/authorize?state=fixture'}});assert.ok(p.render().includes(localeTools(locale).t('auth.googleContinue')));await p.click();assert.equal(p.writes.length,0);assert.equal(p.storage.get('foodsave_google_verifier').length,43);const body=JSON.parse(p.calls[0].body);assert.equal(body.locale,locale);assert.equal(body.challenge.length,43);assert.deepEqual(Object.keys(body).sort(),['challenge','locale']);assert.equal(p.redirects.length,1);});
 test(`${locale} completion persists only final JWT and returns to offers`,async()=>{const p=mount('auth/google/complete/page.tsx',locale,{ok:true,data:{token:'foodsave-jwt',locale}});await p.effect();assert.deepEqual(p.writes,[['token','foodsave-jwt']]);assert.deepEqual(p.redirects,['/offers']);assert.equal(p.storage.size,0);});
 for(const key of ['auth.googleCancelled','auth.googleCollision','auth.googleUnavailable','auth.googleInvalid','auth.googleEmail','auth.googleRole'])test(`${locale} localized ${key}`,async()=>{const p=mount('auth/google/complete/page.tsx',locale,{ok:false,data:{message:key,locale}});assert.ok((await p.effect()).includes(localeTools(locale).t(key)));assert.equal(p.writes.length,0);assert.equal(p.redirects.length,0);});
}
test('unsafe authorization redirect rejected',async()=>{const p=mount('components/GoogleSignInButton.tsx','en',{ok:true,data:{url:'https://evil.invalid/auth/google/authorize'}});await p.click();assert.equal(p.redirects.length,0);assert.equal(p.storage.size,0);});
test('Apple stays disabled and merchant registration does not enable Google',()=>{const shell=fs.readFileSync(path.join(__dirname,'../app/components/AuthShell.tsx'),'utf8');assert.match(shell,/<button[^>]*disabled>\{t\("ui.continue_with_apple_coming_soon"\)/);const merchant=fs.readFileSync(path.join(__dirname,'../app/register-merchant/page.tsx'),'utf8');assert.doesNotMatch(merchant,/<FutureSocialSignIn customer/);});
