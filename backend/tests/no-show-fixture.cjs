const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {transformSync}=require('esbuild');
const moduleUnderTest={exports:{}};
vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname,'../src/lib/order-expiration.ts'),'utf8'),{loader:'ts',format:'cjs'}).code,
  {module:moduleUnderTest,exports:moduleUnderTest.exports,require:n=>require(n)});
module.exports=moduleUnderTest.exports;
