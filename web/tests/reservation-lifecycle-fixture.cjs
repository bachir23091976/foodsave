const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {transformSync}=require('../../backend/node_modules/esbuild');
const loaded={exports:{}};
vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname,'../app/lib/reservation-lifecycle.ts'),'utf8'),{loader:'ts',format:'cjs'}).code,{module:loaded,exports:loaded.exports,Date});
module.exports=loaded.exports;
