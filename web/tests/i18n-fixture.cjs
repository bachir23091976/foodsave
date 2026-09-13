const { buildSync } = require("../../backend/node_modules/esbuild");
const vm = require("node:vm");
const path = require("node:path");
const result = buildSync({ stdin: { contents: 'export * from "./LocaleProvider"; export * from "./core"; export * from "./dictionary"; export * from "./messages";', resolveDir: path.join(__dirname, "../app/lib/i18n"), loader:"ts" }, bundle:true, write:false, platform:"node", format:"cjs", external:["react"] });
const mod = { exports: {} };
vm.runInNewContext(result.outputFiles[0].text, { module:mod, exports:mod.exports, require });
module.exports = mod.exports;
