const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { localeTools } = require('./i18n-fixture.cjs');

function component(name, mocks = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../app/components', name + '.tsx'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, ...mocks, require(id) {
    if (id === 'react') return mocks.hooks || React;
    if (id === 'react/jsx-runtime') return require(id);
    if (id.endsWith('.module.css')) return { default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (id.endsWith('LocaleProvider')) return { useLocale: () => localeTools(mocks.locale || 'fr') };
    if (id === 'next/image') return { default: ({ preload, ...props }) => React.createElement('img', { ...props, 'data-preload': String(preload) }) };
    throw Error('Unexpected dependency: ' + id);
  } });
  return module.exports.default;
}

for (const locale of ['fr', 'en']) test(`${locale}: approved photos have localized descriptions and illustrative disclosure`, () => {
  const Visual = component('EditorialVisual', { locale });
  for (const merchant of [false, true]) {
    const html = renderToStaticMarkup(React.createElement(Visual, { merchant }));
    assert.match(html, /figcaption/);
    assert.ok(html.includes(localeTools(locale).t(merchant ? 'photo.interfaceNote' : 'photo.sceneNote')));
    assert.match(html, /<img/);
    assert.match(html, /width="\d+" height="\d+"/);
    assert.doesNotMatch(html, /<button|<a |5\.00/);
  }
});

test('only the principal home image is preloaded; all other photographs are lazy', () => {
  const Visual = component('EditorialVisual');
  for (const scene of ['home', 'boxes', 'pickup', 'merchant']) {
    const regular = Visual({ scene });
    assert.equal(regular.props.children[0].props.loading, 'lazy');
    const requested = Visual({ scene, principal: true });
    assert.equal(requested.props.children[0].props.preload, scene === 'home');
  }
});

test('all four optimized local outputs exist with the specified dimensions and stripped metadata', async () => {
  const sharp = require('sharp');
  for (const scene of ['home-hero','surplus-boxes','customer-pickup','merchant-onboarding']) {
    const file = path.join(__dirname, '../public/images/foodsave/foodsave-' + scene + '.webp');
    const meta = await sharp(file).metadata();
    assert.equal(meta.format, 'webp');
    assert.equal(meta.width, scene === 'home-hero' ? 1600 : 1280);
    assert.equal(meta.height, scene === 'home-hero' ? 900 : 853);
    assert.ok(fs.statSync(file).size < 200000);
    assert.equal(meta.exif, undefined); assert.equal(meta.xmp, undefined);
  }
});

for (const mode of ['reduced', 'unsupported', 'normal']) test(`reveal remains readable in ${mode} mode and releases observer`, () => {
  let effect, callback, observed = false, disconnected = 0;
  const classes = [];
  const element = { classList: { add: value => classes.push(value) } };
  class Observer { constructor(fn) { callback = fn; } observe(target) { assert.equal(target, element); observed = true; } disconnect() { disconnected++; } }
  const Reveal = component('ScrollReveal', {
    hooks: { useRef: () => ({ current: element }), useEffect: fn => { effect = fn; } },
    window: { matchMedia: () => ({ matches: mode === 'reduced' }), ...(mode !== 'unsupported' ? { IntersectionObserver: Observer } : {}) },
    IntersectionObserver: Observer,
  });
  const tree = Reveal({ children: 'Fixture', index: 0 });
  assert.equal(tree.props.style.opacity, undefined, 'Content must not be hidden before an observer runs');
  const cleanup = effect();
  assert.equal(observed, mode === 'normal');
  if (mode === 'normal') { callback([{ isIntersecting: true }]); assert.equal(classes.length, 1); assert.equal(disconnected, 1); cleanup(); assert.equal(disconnected, 2); }
});
