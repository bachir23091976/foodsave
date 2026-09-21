const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { transformSync } = require('../../backend/node_modules/esbuild');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const jwt = role => `fixture.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.fixture`;

function mount(token, fetcher = async () => ({ json: async () => ({ success: true }) })) {
  const slots = [], effects = [], calls = [];
  let cursor = 0, tree;
  const module = { exports: {} };
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial;
      return [slots[i], value => { slots[i] = value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useEffect(fn) { const i = cursor++; if (!(i in slots)) { slots[i] = true; effects.push(fn); } },
  };
  vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname, '../app/admin/stripe-maintenance/page.tsx'), 'utf8'),
    { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code, {
    module, exports: module.exports,
    window: { atob: value => Buffer.from(value, 'base64').toString('binary') },
    localStorage: { getItem(key) { assert.equal(key, 'token'); return token; } },
    fetch: async (url, options) => { calls.push({ url, options }); return fetcher(); },
    console: { log() { assert.fail('No logging'); }, error() { assert.fail('No logging'); } },
    require(name) {
      if (name === 'react') return hooks;
      if (name === 'react/jsx-runtime') return require(name);
      if (name === '../../lib/api') return { API_URL: 'https://fixture.invalid' };
      throw new Error('Unexpected dependency');
    },
  });
  function render() { cursor = 0; tree = module.exports.default(); return renderToStaticMarkup(tree); }
  function button(node = tree) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.map(button).find(Boolean);
    if (node.type === 'button') return node;
    return button(node.props?.children);
  }
  render(); effects.forEach(fn => fn()); render();
  return { calls, render, button, changeToken(value) { token = value; }, replayEffects() { effects.forEach(fn => fn()); } };
}
for (const token of [null, 'malformed', jwt('CLIENT'), jwt('MERCHANT')]) {
  test('non-admin/missing/malformed session has no action or request', () => {
    const h = mount(token); assert.equal(h.button(), undefined); assert.equal(h.calls.length, 0);
  });
}
test('ADMIN needs explicit click; double click is locked synchronously; bearer auth without cookies', async () => {
  let resolve;
  const h = mount(jwt('ADMIN'), () => new Promise(r => { resolve = r; }));
  h.replayEffects(); assert.equal(h.calls.length, 0);
  const click = h.button().props.onClick;
  const pending = click(); await click();
  h.render(); assert.equal(h.button().props.disabled, true); assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].url, 'https://fixture.invalid/admin/maintenance/stripe-test-person-document');
  assert.equal(h.calls[0].options.method, 'POST'); assert.equal(h.calls[0].options.credentials, 'omit');
  assert.equal(h.calls[0].options.headers.Authorization, `Bearer ${jwt('ADMIN')}`);
  assert.equal(h.calls[0].options.body, undefined);
  resolve({ json: async () => ({ success: true, payoutsEnabled: false }) }); await pending;
  assert.match(h.render(), /payoutsEnabled/); assert.ok(!h.render().includes(jwt('ADMIN')));
  await click(); assert.equal(h.calls.length, 1);
});
test('account switch before click prevents request', async () => {
  const h = mount(jwt('ADMIN')); h.changeToken(jwt('CLIENT')); await h.button().props.onClick();
  h.render(); assert.equal(h.calls.length, 0); assert.equal(h.button(), undefined);
});
for (const kind of ['network', 'invalid-json', '403', '502']) test(`${kind} never retries or exposes thrown details`, async () => {
  const h = mount(jwt('ADMIN'), async () => {
    if (kind === 'network') throw new Error('PRIVATE');
    return { ok: false, status: Number(kind), json: async () => {
      if (kind === 'invalid-json') throw new Error('PRIVATE');
      return { success: false, code: 'MAINTENANCE_OUTCOME_UNCONFIRMED' };
    } };
  });
  const click = h.button().props.onClick; await click(); await click(); h.replayEffects();
  assert.equal(h.calls.length, 1); assert.ok(!h.render().includes('PRIVATE')); assert.equal(h.button().props.disabled, true);
});
