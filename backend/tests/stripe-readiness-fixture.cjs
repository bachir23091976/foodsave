// Load the actual pure TypeScript policy without loading Stripe or Prisma clients.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const loaded = { exports: {} };
vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname, '../src/lib/stripe-account-readiness.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code, { module: loaded, exports: loaded.exports });
module.exports = loaded.exports;
