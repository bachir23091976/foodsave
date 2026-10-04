const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {transformSync}=require('esbuild');
function load(name,deps={}){const module={exports:{}};vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname,'../src',name+'.ts'),'utf8'),{loader:'ts',format:'cjs'}).code,{module,exports:module.exports,Date,console:{error(){}},require(n){if(n in deps)return deps[n];throw Error('Unexpected dependency '+n);}});return module.exports;}
const pricing=load('lib/checkout-pricing');
const dynamic=load('lib/dynamic-pricing',{'./checkout-pricing':pricing});
const presentation=load('lib/offer-presentation',{'./dynamic-pricing':dynamic});
module.exports={load,pricing,dynamic,presentation};
