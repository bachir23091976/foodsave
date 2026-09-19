const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {transformSync}=require('esbuild');
function load(file, dependencies, globals={}) {
  const module={exports:{}};
  vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),{loader:'ts',format:'cjs'}).code,{
    module,exports:module.exports,Buffer,process:{env:{JWT_SECRET:'test-only-not-production'}},console:{warn(){},error(){}},
    require(name){if(name in dependencies)return dependencies[name];throw Error('Unexpected dependency '+name);},...globals,
  });return module.exports;
}
const response=()=>({statusCode:200,status(n){this.statusCode=n;return this;},json(data){this.data=data;return this;}});
const valid=()=>({firstName:' Jean ',lastName:' Tremblay ',email:'Jean+tag@Example.ca',password:'password8',role:'CLIENT'});
function auth({exists=false,race=false,googleOnly=false}={}){
  const calls=[];
  const passwordReset={buildPasswordResetEmail(){return {subject:'fixture',text:'fixture'};},createPasswordResetToken(){return 'A'.repeat(43);},EmailDeliveryUnavailable:class extends Error{},hashPasswordResetToken(){return 'fixture-hash';},isPasswordResetToken(){return false;},PASSWORD_RESET_TTL_MS:2700000,PasswordResetError:class extends Error{},sendPasswordResetEmail:async()=>{},validateResetPassword(){return null;}};
  const controller=load('controllers/auth.controller.ts',{
    '../lib/prisma':{prisma:{user:{async findUnique(q){calls.push(['read',q]);return exists?{id:'u',password:googleOnly?null:'stored',role:'CLIENT'}:null;},async create(q){calls.push(['create',q]);if(race)throw {code:'P2002'};return {id:'u',...q.data};}},async $queryRaw(){return [{database:'fixture',user:'fixture',schema:'public'}];}}},
    bcryptjs:{hashSync(p,c){calls.push(['dummy',c]);return 'dummy-hash';},async hash(p,c){calls.push(['hash',p,c]);return 'hashed';},async compare(p,h){calls.push(['compare',p,h]);return false;}},
    jsonwebtoken:{sign(payload,secret,options){calls.push(['jwt',payload,options]);return 'mock-token';}},
    './loyalty.controller':{},
    '../lib/password-reset':passwordReset,
  });return {controller,calls};
}
test('valid registration trims names only, preserves identity, bcrypt cost and seven-day JWT',async()=>{
  const {controller,calls}=auth(),res=response();await controller.register({body:valid()},res);assert.equal(res.statusCode,201);
  const data=calls.find(c=>c[0]==='create')[1].data;assert.equal(data.firstName,'Jean');assert.equal(data.lastName,'Tremblay');assert.equal(data.email,valid().email);assert.equal(data.role,'CLIENT');
  assert.equal(calls.find(c=>c[0]==='hash')[2],10);assert.equal(calls.find(c=>c[0]==='jwt')[2].expiresIn,'7d');
  assert.equal(data.canonicalEmail,valid().email.toLowerCase());
  assert.equal(calls.find(c=>c[0]==='read')[1].where.canonicalEmail,valid().email.toLowerCase());
});
test('Google-only password login compares dummy and fails generically',async()=>{
  const {controller,calls}=auth({exists:true,googleOnly:true}),res=response();
  await controller.login({body:{email:'a@example.ca',password:'password8'}},res);
  assert.equal(res.statusCode,401);assert.equal(res.data.message,'Email ou mot de passe incorrect');
  assert.equal(calls.find(c=>c[0]==='compare')[2],'dummy-hash');
});
for(const field of ['firstName','lastName'])for(const value of [null,5,{},[],false,'','   ','x'.repeat(101)])test(`reject ${field} ${JSON.stringify(value)}`,async()=>{
  const {controller,calls}=auth(),res=response();await controller.register({body:{...valid(),[field]:value}},res);assert.equal(res.statusCode,400);assert.ok(!calls.some(c=>c[0]==='read'||c[0]==='hash'));
});
for(const email of [null,{},'invalid',' a@example.ca','a@example.ca ','a@@example.ca','.a@example.ca','a..b@example.ca','a@-example.ca','a@exa_mple.ca','a'.repeat(65)+'@example.ca','a@'+('x'.repeat(63)+'.').repeat(4)+'ca'])test(`reject invalid email ${JSON.stringify(email)}`,async()=>{
  const {controller,calls}=auth(),res=response();await controller.register({body:{...valid(),email}},res);assert.equal(res.statusCode,400);assert.ok(!calls.some(c=>c[0]==='create'));
});
for(const [password,expected] of [[null,400],[{},400],['a'.repeat(7),400],['a'.repeat(8),201],['a'.repeat(72),201],['a'.repeat(73),400],['é'.repeat(36),201],['é'.repeat(37),400]])test(`password byte boundary ${typeof password==='string'?Buffer.byteLength(password):'non-string'} => ${expected}`,async()=>{
  const {controller}=auth(),res=response();await controller.register({body:{...valid(),password}},res);assert.equal(res.statusCode,expected);
});
test('100-character names accepted; merchant registration preserved; ADMIN cannot be requested',async()=>{
  for(const [role,expected]of [['MERCHANT','MERCHANT'],['ADMIN','CLIENT']]){const {controller}=auth(),res=response();await controller.register({body:{...valid(),firstName:'a'.repeat(100),lastName:'b'.repeat(100),role}},res);assert.equal(res.statusCode,201);assert.equal(res.data.user.role,expected);}
});
for(const options of [{exists:true},{race:true}])test('duplicate registration returns existing safe response '+JSON.stringify(options),async()=>{
  const {controller}=auth(options),res=response();await controller.register({body:valid()},res);assert.equal(res.statusCode,400);assert.equal(res.data.message,'Cet email est deja utilise');
});
test('nonexistent and incorrect-password logins both compare bcrypt and return identical errors',async()=>{
  for(const exists of [false,true]){const {controller,calls}=auth({exists}),res=response();await controller.login({body:{email:'a@example.ca',password:'wrong'}},res);assert.equal(res.statusCode,401);assert.equal(res.data.message,'Email ou mot de passe incorrect');assert.equal(calls.find(c=>c[0]==='compare')[2],exists?'stored':'dummy-hash');assert.equal(calls.find(c=>c[0]==='dummy')[1],10);}
});

for(const role of ['CLIENT','MERCHANT','ADMIN',null])test('role guard uses current DB role '+role,async()=>{
  let read=0,next=0;const {requireMerchant}=load('middleware/role.middleware.ts',{'../lib/prisma':{prisma:{user:{async findUnique(q){read++;assert.equal(q.where.id,'authenticated');assert.equal(q.select.role,true);return role?{role}:null;}}}}});
  const res=response();await requireMerchant({userId:'authenticated',role:'MERCHANT',body:{role:'MERCHANT',userId:'other'}},res,()=>next++);
  assert.equal(read,1);assert.equal(next,role==='MERCHANT'?1:0);if(role!=='MERCHANT')assert.equal(res.statusCode,403);
});
test('missing authentication is 401 without a DB read; DB failure is closed',async()=>{
  const {requireMerchant}=load('middleware/role.middleware.ts',{'../lib/prisma':{prisma:{user:{findUnique(){throw Error('offline');}}}}});
  for(const [req,status]of [[{},401],[{userId:'u'},500]]){const res=response();await requireMerchant(req,res,()=>assert.fail('authorized'));assert.equal(res.statusCode,status);}
});

test('all merchant-only routes execute authenticate then guard before their existing handlers',async()=>{
  const expected={'merchant':['post /','get /me','post /connect-stripe','get /stripe-status','get /sales'],'offer':['post /','get /mine','patch /:id/deactivate'],'order':['get /merchant','post /merchant/cancel','post /validate'],'upload':['post /image']};
  for(const [file,protectedRoutes]of Object.entries(expected)){
    let currentRole='CLIENT',reached=0;
    const {authenticate}=load('middleware/auth.middleware.ts',{jsonwebtoken:{verify(){return {userId:'u',role:'MERCHANT'};}},'../lib/prisma':{prisma:{user:{async findUnique(){return {authVersion:0};}}}}});
    const {requireMerchant:guard}=load('middleware/role.middleware.ts',{'../lib/prisma':{prisma:{user:{async findUnique(){return {role:currentRole};}}}}});
    const routes=[],router={};for(const method of ['get','post','patch'])router[method]=(p,...handlers)=>routes.push({key:method+' '+p,handlers});
    const fakeMulter=()=>({single:()=>((_req,_res,next)=>next())});fakeMulter.memoryStorage=()=>({});
    const deps={express:{Router:()=>router},'../middleware/auth.middleware':{authenticate},'../middleware/role.middleware':{requireMerchant:guard},multer:fakeMulter};
    deps['../controllers/'+file+'.controller']=new Proxy({}, {get:()=>((_req,res)=>{reached++;res.json({ok:true});})});
    load('routes/'+file+'.routes.ts',deps);
    for(const route of routes){if(protectedRoutes.includes(route.key)){assert.equal(route.handlers[0],authenticate);assert.equal(route.handlers[1],guard);assert.ok(route.handlers.length>=3);}else assert.ok(!route.handlers.includes(guard),'unrelated route changed');}
    assert.equal(routes.filter(r=>r.handlers.includes(guard)).length,protectedRoutes.length);
    for(const route of routes.filter(r=>protectedRoutes.includes(r.key)))for(const role of [null,'CLIENT','MERCHANT','ADMIN']){
      currentRole=role;reached=0;const req={headers:role?{authorization:'Bearer fixture'}:{},body:{role:'MERCHANT'}},res=response();
      async function run(i){if(i>=route.handlers.length)return;let following;await route.handlers[i](req,res,()=>{following=run(i+1);});await following;}
      await run(0);assert.equal(res.statusCode,role===null?401:role==='MERCHANT'?200:403,file+' '+route.key+' '+role);assert.equal(reached,role==='MERCHANT'?1:0);
    }
  }
});
test('merchant authorization does not bypass existing offer ownership',async()=>{
  let writes=0;const {deactivateOffer}=load('controllers/offer.controller.ts',{
    '../lib/prisma':{prisma:{merchant:{async findUnique(q){assert.equal(q.where.ownerId,'owner');return {id:'mine'};}},offer:{async findUnique(){return {id:'o',merchantId:'other'};},async update(){writes++;}}}},
    './notification.controller':{},
  });const res=response();await deactivateOffer({userId:'owner',params:{id:'o'}},res);assert.equal(res.statusCode,403);assert.equal(writes,0);
});
