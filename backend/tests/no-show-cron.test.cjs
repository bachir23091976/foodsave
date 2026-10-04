const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {transformSync}=require('esbuild');
const express=require('express');
const secret='a'.repeat(64); // Synthetic test credential only.
function load(file,deps,env){
 const module={exports:{}};
 vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),{loader:'ts',format:'cjs'}).code,{
  module,exports:module.exports,Buffer,Promise,process:{env},console:{log(){assert.fail('Unexpected logging');},error(){assert.fail('Unexpected logging');}},
  require(name){if(Object.hasOwn(deps,name))return deps[name];if(['express','node:crypto'].includes(name))return require(name);throw Error('Forbidden dependency: '+name);}
 });return module.exports;
}
function makeApp(db,reconcile,configured=secret){
 const env={CRON_SECRET:configured};
 const auth=load('middleware/cron-auth.middleware.ts',{},env);
 const controller=load('controllers/no-show-cron.controller.ts',{'../lib/prisma':{prisma:db},'../lib/order-expiration':{reconcileNoShows:reconcile}},env);
 const router=load('routes/internal-cron.routes.ts',{'../middleware/cron-auth.middleware':auth,'../controllers/no-show-cron.controller':controller},env).default;
 const app=express();app.use(express.json());app.use('/internal/cron',router);return app;
}
async function serve(app,run){const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));try{return await run('http://127.0.0.1:'+server.address().port+'/internal/cron/reconcile-no-show');}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}}
module.exports={makeApp,serve,secret};
if(require.main===module){
 for(const [name,headers] of [['missing',{}],['wrong',{Authorization:'Bearer '+'b'.repeat(64)}],['short',{Authorization:'Bearer a'}],['scheme',{Authorization:'Basic '+secret}],['duplicate',{Authorization:'Bearer '+secret+', Bearer '+secret}]])test(name+' credential rejected before reconciliation',()=>serve(makeApp({},()=>assert.fail('DB called')),async url=>{const r=await fetch(url,{method:'POST',headers});assert.equal(r.status,401);assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual(await r.json(),{error:'UNAUTHORIZED'});}));
 for(const configured of [undefined,'','short','G'.repeat(64)])test('invalid server configuration '+String(configured?.length),()=>serve(makeApp({},()=>assert.fail(),configured===undefined?null:configured),async url=>{const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+secret}});assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'UNAVAILABLE'});}));
 test('query body cookies cannot authenticate',()=>serve(makeApp({},()=>assert.fail()),async url=>{const r=await fetch(url+'?secret='+secret,{method:'POST',headers:{'Content-Type':'application/json',Cookie:'CRON_SECRET='+secret},body:JSON.stringify({secret})});assert.equal(r.status,401);}));
 for(const changed of [0,7])test('authenticated bounded batch '+changed,async()=>{let calls=0;const db={};await serve(makeApp(db,async(d,scope,limit)=>{calls++;assert.equal(d,db);assert.equal(JSON.stringify(scope),'{}');assert.equal(limit,100);return changed;}),async url=>{const r=await fetch(url+'?limit=999&orderId=x',{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify({limit:999,scope:{userId:'x'},status:'COMPLETED'})});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual(await r.json(),{changed});});assert.equal(calls,1);});
 test('database failure sanitized',()=>serve(makeApp({},async()=>{throw Error('private database details');}),async url=>{const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+secret}});assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'RECONCILIATION_FAILED'});}));
 for(const method of ['GET','HEAD','PUT','PATCH','DELETE','OPTIONS'])test(method+' never reconciles',()=>serve(makeApp({},()=>assert.fail()),async url=>{await fetch(url,{method,headers:{Authorization:'Bearer '+secret}});}));
 test('separate duplicate Authorization headers fail closed',()=>serve(makeApp({},()=>assert.fail()),url=>new Promise((resolve,reject)=>{const req=require('node:http').request(url,{method:'POST',headers:['Host',new URL(url).host,'Authorization','Bearer '+secret,'Authorization','Bearer '+secret]},res=>{res.resume();res.on('end',()=>{try{assert.equal(res.statusCode,401);resolve();}catch(e){reject(e);}});});req.on('error',reject);req.end();})));
}
