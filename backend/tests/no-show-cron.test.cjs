const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {transformSync}=require('esbuild');
const express=require('express');
const secret='a'.repeat(64); // Synthetic test credential only.
function load(file,deps,env,logger={info(){}}){
 const module={exports:{}};
 vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),{loader:'ts',format:'cjs'}).code,{
  module,exports:module.exports,Buffer,Promise,process:{env},console:logger,
  require(name){if(Object.hasOwn(deps,name))return deps[name];if(['express','node:crypto','node:util'].includes(name))return require(name);throw Error('Forbidden dependency: '+name);}
 });return module.exports;
}
function makeApp(db,reconcile,configured=secret,logger={info(){}}){
 const env={CRON_SECRET:configured};
 const auth=load('middleware/cron-auth.middleware.ts',{},env,logger);
 const controller=load('controllers/no-show-cron.controller.ts',{'../lib/prisma':{prisma:db},'../lib/order-expiration':{reconcileNoShows:reconcile}},env,logger);
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

if(require.main===module){
 const prefix='[no-show-cron] ';
 for(const [label,configured,headers,expected,status] of [
  ['configuration',null,{},'CONFIG_UNAVAILABLE',503],
  ['authentication',secret,{},'AUTH_REJECTED',401],
  ['success',secret,{Authorization:'Bearer '+secret},null,200],
 ])test('diagnostic markers: '+label,async()=>{
  const logs=[];let calls=0;
  await serve(makeApp({},async()=>{calls++;return 0;},configured,{info:line=>logs.push(line)}),async url=>{
   const r=await fetch(url,{method:'POST',headers});assert.equal(r.status,status);
  });
  assert.deepEqual(logs,expected?[prefix+expected]:[prefix+'RECONCILE_START',prefix+'RECONCILE_OK']);
  assert.equal(calls,expected?0:1);
 });
 async function failure(error,expected){
  const logs=[];
  const controller=load('controllers/no-show-cron.controller.ts',{'../lib/prisma':{prisma:{}},'../lib/order-expiration':{reconcileNoShows:async()=>{throw error;}}},{},{info:line=>logs.push(line)});
  const res={status(n){this.code=n;return this;},json(body){this.body=body;return this;}};
  await controller.reconcileNoShowBatch({},res);
  assert.equal(res.code,503);assert.equal(JSON.stringify(res.body),JSON.stringify({error:'RECONCILIATION_FAILED'}));
  assert.deepEqual(logs,[prefix+'RECONCILE_START',prefix+'RECONCILE_FAILED code='+expected]);
 }
 for(const code of ['P1001','P1002','P1008','P1017','P2021','P2022','P2024','P2028','P2034']){
  for(const key of ['code','errorCode'])test('allowlisted literal '+key+' '+code,()=>failure({[key]:code,message:'SYNTHETIC_PRIVATE',stack:'SYNTHETIC_PRIVATE',meta:{secret:'SYNTHETIC_PRIVATE'},name:'SYNTHETIC_PRIVATE'},code));
 }
 test('unknown sensitive fields remain opaque',()=>failure({code:'SYNTHETIC_PRIVATE',errorCode:'P9999',message:'SYNTHETIC_PRIVATE',cause:'SYNTHETIC_PRIVATE',toString(){assert.fail('Coercion');}},'OTHER'));
 test('error getters never invoked',async()=>{let reads=0;const error={};for(const key of ['code','errorCode','message','stack','cause','meta','name'])Object.defineProperty(error,key,{get(){reads++;throw Error('Must not read');}});await failure(error,'OTHER');assert.equal(reads,0);});
 test('inherited code is not logged',()=>failure(Object.create({code:'P1001'}),'OTHER'));
 test('Proxy diagnostic never invokes traps',async()=>{
  let traps=0;
  const trap=()=>{traps++;throw Error('Must not inspect Proxy');};
  const error=new Proxy({code:'P1001'},{getOwnPropertyDescriptor:trap,get:trap,getPrototypeOf:trap,ownKeys:trap});
  await failure(error,'OTHER');assert.equal(traps,0);
 });
 test('response failure distinguished after successful reconciliation',async()=>{
  const logs=[];let calls=0;
  const controller=load('controllers/no-show-cron.controller.ts',{'../lib/prisma':{prisma:{}},'../lib/order-expiration':{reconcileNoShows:async()=>{calls++;return 0;}}},{},{info:line=>logs.push(line)});
  const res={status(n){this.code=n;return this;},json(body){if(this.code===200)throw Error('Synthetic response failure');this.body=body;return this;}};
  await controller.reconcileNoShowBatch({},res);
  assert.equal(calls,1);assert.equal(res.code,503);
  assert.deepEqual(logs,[prefix+'RECONCILE_START',prefix+'RECONCILE_OK',prefix+'RESPONSE_FAILED']);
 });
 for(const mode of ['config','auth','success','failure'])test('logging failure preserves behavior: '+mode,async()=>{
  let calls=0;const configured=mode==='config'?null:secret;
  await serve(makeApp({},async()=>{calls++;if(mode==='failure')throw Error('Synthetic');return 0;},configured,{info(){throw Error('Logger unavailable');}}),async url=>{
   const r=await fetch(url,{method:'POST',headers:mode==='auth'?{}:{Authorization:'Bearer '+secret}});
   const expected=mode==='auth'?401:mode==='success'?200:503;assert.equal(r.status,expected);
   assert.deepEqual(await r.json(),mode==='config'?{error:'UNAVAILABLE'}:mode==='auth'?{error:'UNAUTHORIZED'}:mode==='success'?{changed:0}:{error:'RECONCILIATION_FAILED'});
  });assert.equal(calls,['success','failure'].includes(mode)?1:0);
 });
}
