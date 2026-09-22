const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { transformSync } = require('../../backend/node_modules/esbuild');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const jwt = role => `fixture.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.fixture`;

function mount(token, fetcher = async () => ({ ok: true, json: async () => ({ success: true, url: 'https://verify.stripe.com/start/fixture' }) })) {
  const slots = [], effects = [], calls = [], redirects = [];
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
    module, exports: module.exports, URL,
    window: { atob: value => Buffer.from(value, 'base64').toString('binary'), location: { assign(url) { redirects.push(url); } } },
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
  function button(node = tree, status = false) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.map(n => button(n, status)).find(Boolean);
    if (node.type === 'button' && (String(node.props.children).includes('statut') === status)) return node;
    return button(node.props?.children, status);
  }
  render(); effects.forEach(fn => fn()); render();
  return { calls, redirects, render, button, statusButton() { return button(tree, true); }, changeToken(value) { token = value; }, replayEffects() { effects.forEach(fn => fn()); } };
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
  assert.equal(h.calls[0].url, 'https://fixture.invalid/admin/maintenance/stripe-test-identity-session');
  assert.equal(h.calls[0].options.method, 'POST'); assert.equal(h.calls[0].options.credentials, 'omit');
  assert.equal(h.calls[0].options.headers.Authorization, `Bearer ${jwt('ADMIN')}`);
  assert.equal(h.calls[0].options.body, undefined);
  resolve({ ok: true, json: async () => ({ success: true, url: 'https://verify.stripe.com/start/fixture' }) }); await pending;
  assert.deepEqual(h.redirects, ['https://verify.stripe.com/start/fixture']);
  assert.ok(!h.render().includes('https://verify.stripe.com')); assert.ok(!h.render().includes(jwt('ADMIN')));
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
  assert.deepEqual(h.redirects, []);
});
for (const url of ['http://verify.stripe.com/a', 'https://verify.stripe.com.evil.invalid/a', 'https://evil.invalid', 'https://user@verify.stripe.com/a', 'https://verify.stripe.com:444/a', null]) test(`reject unsafe redirect ${url}`, async () => {
  const h = mount(jwt('ADMIN'), async () => ({ ok: true, json: async () => ({ success: true, url }) }));
  await h.button().props.onClick(); assert.deepEqual(h.redirects, []); assert.equal(h.calls.length, 1);
  assert.match(h.render(), /Outcome unconfirmed/);
});
test('status button makes only explicit GET; does not assume verification or unlock creation', async () => {
  const h = mount(jwt('ADMIN'), async () => ({ ok: true, json: async () => ({ stripeMode: 'test', account: { status: 'ONBOARDING_INCOMPLETE', payoutsEnabled: false } }) }));
  assert.equal(h.calls.length, 0); assert.match(h.render(), /Returning here does not prove success/);
  await h.statusButton().props.onClick();
  assert.equal(h.calls[0].options.method, 'GET'); assert.equal(h.calls[0].options.credentials, 'omit');
  assert.equal(h.calls[0].url, 'https://fixture.invalid/admin/maintenance/stripe-test-identity-status');
  assert.match(h.render(), /ONBOARDING_INCOMPLETE/); assert.deepEqual(h.redirects, []);
});
test('status rechecks ADMIN after account switch', async () => {
  const h = mount(jwt('ADMIN')); h.changeToken(jwt('CLIENT')); await h.statusButton().props.onClick();
  assert.equal(h.calls.length, 0);
});
test('failed creation then status check does not unlock or retry creation', async () => {
  const h = mount(jwt('ADMIN'), async () => { throw new Error('PRIVATE'); });
  const click = h.button().props.onClick; await click(); await h.statusButton().props.onClick(); await click();
  assert.equal(h.calls.length, 2); assert.equal(h.calls[1].options.method, 'GET');
  assert.ok(!h.render().includes('PRIVATE')); assert.equal(h.button().props.disabled, true);
});
test('old frontend mutation removed and synthetic-only instructions present', () => {
  const source = fs.readFileSync(path.join(__dirname, '../app/admin/stripe-maintenance/page.tsx'), 'utf8');
  assert.doesNotMatch(source, /stripe-test-person-document|file_1UI/);
  assert.match(source, /Success \/ Verified/); assert.match(source, /no real identity document or selfie/);
});
