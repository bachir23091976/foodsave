const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const raw=process.env.FOODSAVE_TEST_DATABASE_URL;
if(!raw)throw Error('Explicit isolated test URL required; no DATABASE_URL fallback');
const target=new URL(raw);
assert.equal(target.protocol,'postgresql:');assert.equal(target.hostname,'127.0.0.1');assert.equal(target.port,'55432');
assert.equal(target.pathname,'/foodsave_test_phase_a');assert.equal(target.username,'foodsave_phase_a_runner');assert.equal(target.search,'');
const {PrismaClient}=require('@prisma/client');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const {transformSync}=require('esbuild');
function loadSource(file,dependencies){
 const module={exports:{}};
 vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),{loader:'ts',format:'cjs'}).code,{
  module,exports:module.exports,URL,Date,process:{env:{}},
  require(name){if(name in dependencies)return dependencies[name];throw Error('Unexpected dependency '+name);}
 });return module.exports;
}
const google=loadSource('lib/google-auth.ts',{'crypto':require('node:crypto'),'google-auth-library':{OAuth2Client:class {constructor(){throw Error('No real provider access permitted');}},CodeChallengeMethod:{S256:'S256'}}});
const migrationRoot=path.join(__dirname,'../prisma/migrations');
const migrations=fs.readdirSync(migrationRoot).filter(name=>fs.existsSync(path.join(migrationRoot,name,'migration.sql'))).sort();
const googleMigration='20260914000000_add_google_auth';
assert.equal(migrations.at(-1),googleMigration);
const container=JSON.parse(execFileSync('docker',['inspect','foodsave-phase-a-postgres'],{encoding:'utf8'}))[0];
assert.equal(container.Name,'/foodsave-phase-a-postgres');assert.equal(container.Config.Image,'postgres:16');assert.equal(container.State.Running,true);
assert.deepEqual(container.NetworkSettings.Ports['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'55432'}]);
const sql=name=>fs.readFileSync(path.join(migrationRoot,name,'migration.sql'),'utf8');
function psql(input,allowFailure=false){
 try{return {ok:true,output:execFileSync('docker',['exec','-i','foodsave-phase-a-postgres','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','foodsave_phase_a_runner','-d','foodsave_test_phase_a'],{input,encoding:'utf8',stdio:['pipe','pipe','pipe']})};}
 catch(error){if(!allowFailure)throw Error('Local fixture SQL failed: '+String(error.stderr));return {ok:false,output:String(error.stderr)};}
}
async function isolatedSchema(run){
 const schema='google_verify_'+randomUUID().replaceAll('-','');
 assert.match(schema,/^google_verify_[a-f0-9]{32}$/);
 psql(`CREATE SCHEMA "${schema}";`);
 const scoped=input=>`SET search_path TO "${schema}";\n${input}`;
 try{await run(schema,scoped);}finally{psql(`DROP SCHEMA "${schema}" CASCADE;`);}
}
test('complete migration chain and populated-database Google migration safety',async t=>{
 await t.test('all migrations deploy from scratch in an empty isolated schema',()=>isolatedSchema(async(schema)=>{
  const url=new URL(raw);url.searchParams.set('schema',schema);
  try{execFileSync(process.execPath,[path.join(__dirname,'../node_modules/prisma/build/index.js'),'migrate','deploy','--schema',path.join(__dirname,'../prisma/schema.prisma')],{cwd:path.join(__dirname,'..'),env:{...process.env,DATABASE_URL:url.href},stdio:'pipe'});}
  catch{throw Error('Fresh isolated-schema migrate deploy failed; no remote target was used');}
  const result=psql(`SELECT count(*) FROM "${schema}"."_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;`);
  assert.equal(Number(result.output.trim()),migrations.length);
  t.diagnostic(`${migrations.length} migrations deployed from scratch`);
 }));
 const fixture=`INSERT INTO "User" (id,email,password,"firstName","lastName",role,"updatedAt") VALUES
 ('client','MiXeD@example.invalid','preserve-hash-client','First','Last','CLIENT','2026-01-01'),
 ('merchant','Merchant@example.invalid','preserve-hash-merchant','First','Last','MERCHANT','2026-01-01'),
 ('admin','Admin@example.invalid','preserve-hash-admin','First','Last','ADMIN','2026-01-01');
 INSERT INTO "Merchant" (id,name,address,city,province,"postalCode","ownerId","updatedAt") VALUES ('shop','Fixture','Fixture','Fixture','Fixture','Fixture','merchant','2026-01-01');`;
 const snapshot=`SELECT json_agg(row_to_json(u) ORDER BY id) FROM "User" u;`;
 await t.test('existing IDs, emails, roles, password hashes and relations preserved; canonical backfill and nullable password work',()=>isolatedSchema(async(schema,scoped)=>{
  psql(scoped(migrations.slice(0,-1).map(sql).join('\n')+'\n'+fixture));
  const before=JSON.parse(psql(scoped(snapshot)).output.trim());
  psql(scoped(sql(googleMigration)));
  const after=JSON.parse(psql(scoped(snapshot)).output.trim());
  assert.deepEqual(after.map(({canonicalEmail,...u})=>u),before);
  for(const u of after)assert.equal(u.canonicalEmail,u.email.toLowerCase());
  assert.equal(psql(scoped(`SELECT "ownerId" FROM "Merchant" WHERE id='shop';`)).output.trim(),'merchant');
  psql(scoped(`INSERT INTO "User" (id,email,password,"firstName","lastName","updatedAt") VALUES ('google','Google@example.invalid',NULL,'First','Last',now());`));
  assert.equal(psql(scoped(`SELECT (password IS NULL AND "canonicalEmail"='google@example.invalid') FROM "User" WHERE id='google';`)).output.trim(),'t');
 }));
 await t.test('case-equivalent collision rolls back migration without modifying users or schema',()=>isolatedSchema(async(schema,scoped)=>{
  psql(scoped(migrations.slice(0,-1).map(sql).join('\n')+'\n'+fixture+`\nINSERT INTO "User" (id,email,password,"firstName","lastName","updatedAt") VALUES ('collision','mixed@example.invalid','preserve-collision','First','Last',now());`));
  const before=psql(scoped(snapshot)).output.trim();
  const result=psql(scoped(sql(googleMigration)),true);
  assert.equal(result.ok,false);assert.match(result.output,/Canonical email collisions require explicit investigation/);
  assert.equal(psql(scoped(snapshot)).output.trim(),before);
  assert.equal(psql(`SELECT count(*) FROM information_schema.columns WHERE table_schema='${schema}' AND column_name='canonicalEmail';`).output.trim(),'0');
  assert.equal(psql(`SELECT count(*) FROM information_schema.tables WHERE table_schema='${schema}' AND table_name IN ('ExternalIdentity','GoogleAuthTransaction');`).output.trim(),'0');
  assert.equal(psql(`SELECT is_nullable FROM information_schema.columns WHERE table_schema='${schema}' AND table_name='User' AND column_name='password';`).output.trim(),'NO');
 }));
});
test('independent PostgreSQL clients enforce Google identity and consumption constraints',async t=>{
 const a=new PrismaClient({datasources:{db:{url:raw}}}),b=new PrismaClient({datasources:{db:{url:raw}}});
 const prefix='google_'+randomUUID();const users=[];let transaction;
 try{
  await t.test('canonical trigger protects legacy writers and case-equivalent races',async()=>{
   const results=await Promise.allSettled([a,b].map((db,i)=>db.user.create({data:{email:(i?prefix.toUpperCase():prefix)+'@example.invalid',firstName:'Test',lastName:'Only',password:'fixture-only'}})));
   for(const r of results)if(r.status==='fulfilled')users.push(r.value);
   assert.equal(users.length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='P2002').length,1);
   assert.equal(users[0].canonicalEmail,users[0].email.toLowerCase());
  });
  await t.test('external subject cannot attach twice',async()=>{
   const data={provider:'GOOGLE',issuer:'https://accounts.google.com',subject:prefix,userId:users[0].id};
   const results=await Promise.allSettled([a.externalIdentity.create({data}),b.externalIdentity.create({data})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  });
  await t.test('callback and completion are independently single-consumer',async()=>{
   transaction=await a.googleAuthTransaction.create({data:{stateHash:prefix,browserHash:prefix,nonce:prefix,pkceVerifier:prefix,frontendChallenge:prefix,locale:'fr',expiresAt:new Date(Date.now()+60000)}});
   for(const field of ['consumedAt','completedAt']){const results=await Promise.all([a,b].map(db=>db.googleAuthTransaction.updateMany({where:{id:transaction.id,[field]:null,expiresAt:{gt:new Date()}},data:{[field]:new Date()}})));assert.equal(results.reduce((n,r)=>n+r.count,0),1);}
  });
  await t.test('real callback handlers on independent clients contact mocked provider once and issue one completion',async()=>{
   const state=google.randomSecret(),binding=google.randomSecret(),verifier=google.randomSecret();let providerReads=0,jwts=0;
   const row=await a.googleAuthTransaction.create({data:{stateHash:google.digest(state),browserHash:google.digest(binding),nonce:google.randomSecret(),pkceVerifier:google.randomSecret(),frontendChallenge:google.digest(verifier),locale:'fr',authorizedAt:new Date(),expiresAt:new Date(Date.now()+60000)}});
   const response=()=>({statusCode:200,set(){return this;},clearCookie(){return this;},status(n){this.statusCode=n;return this;},json(data){this.data=data;return this;},redirect(url){this.url=url;return this;}});
   const controllers=[a,b].map(db=>loadSource('controllers/google-auth.controller.ts',{
    '../lib/prisma':{prisma:db},jsonwebtoken:{sign(){jwts++;return 'fixture-jwt';}},
    '../lib/google-auth':{...google,googleConfig:()=>({frontend:'http://localhost:3000',secure:false,jwtSecret:'fixture-only'}),readGoogleIdentity:async()=>{providerReads++;return {subject:prefix+'_callback',email:prefix+'_callback@example.invalid',firstName:'Test',lastName:'Only'};}}
   }));
   const request={query:{state,code:'mock-code'},headers:{cookie:`fs_google_${google.digest(state).slice(0,16)}=${binding}`}};
   try{
    const outcomes=[response(),response()];await Promise.all(controllers.map((c,i)=>c.googleCallback(request,outcomes[i])));
    assert.equal(providerReads,1);assert.equal(outcomes.filter(r=>r.url).length,1);assert.equal(outcomes.filter(r=>r.statusCode===400).length,1);
    const created=await a.user.findUnique({where:{canonicalEmail:prefix+'_callback@example.invalid'}});assert.ok(created);users.push(created);
    assert.equal(created.password,null);assert.equal(created.role,'CLIENT');
    const handoff=new URLSearchParams(new URL(outcomes.find(r=>r.url).url).hash.slice(1)).get('handoff');
    const wrong=response();await controllers[0].googleComplete({get:()=> 'http://localhost:3000',body:{handoff,verifier:google.randomSecret()}},wrong);assert.equal(wrong.statusCode,400);
    const completions=[response(),response()];await Promise.all(controllers.map((c,i)=>c.googleComplete({get:()=> 'http://localhost:3000',body:{handoff,verifier}},completions[i])));
    assert.equal(completions.filter(r=>r.data?.token).length,1);assert.equal(jwts,1);
    const saved=await b.googleAuthTransaction.findUnique({where:{id:row.id}});assert.ok(saved.consumedAt);assert.ok(saved.completedAt);
   }finally{
    await a.googleAuthTransaction.delete({where:{id:row.id}});
    await a.externalIdentity.deleteMany({where:{subject:prefix+'_callback'}});
   }
  });
  await t.test('concurrent runtime account creation rolls back the losing account/identity atomically',async()=>{
   let arrivals=0,release;const barrier=new Promise(resolve=>{release=resolve;});
   const email=prefix+'_race@example.invalid';
   const outcomes=await Promise.allSettled([a,b].map((db,i)=>db.$transaction(async tx=>{
    const wrapped={...tx,user:{...tx.user,async findUnique(query){const result=await tx.user.findUnique(query);if(query.where.canonicalEmail===email){arrivals++;if(arrivals===2)release();await barrier;}return result;}}};
    return google.resolveGoogleUser(wrapped,{subject:prefix+'_race_'+i,email:i?email.toUpperCase():email,firstName:'Test',lastName:'Only'});
   },{timeout:15000})));
   for(const result of outcomes)if(result.status==='fulfilled')users.push(result.value);
   try{
    assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(outcomes.filter(r=>r.status==='rejected'&&r.reason.code==='P2002').length,1);
    assert.equal(await a.user.count({where:{canonicalEmail:email}}),1);
    assert.equal(await b.externalIdentity.count({where:{subject:{in:[prefix+'_race_0',prefix+'_race_1']}}}),1);
   }finally{await a.externalIdentity.deleteMany({where:{subject:{in:[prefix+'_race_0',prefix+'_race_1']}}});}
  });
 }finally{
  if(transaction)await a.googleAuthTransaction.delete({where:{id:transaction.id}});
  await a.externalIdentity.deleteMany({where:{subject:prefix}});
  for(const u of users)await a.user.delete({where:{id:u.id}});
  await Promise.all([a.$disconnect(),b.$disconnect()]);
 }
});
