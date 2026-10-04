const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Real rendered pages against a LOCAL Next server; all API traffic is intercepted.
test('customer offer grids stay usable in FR/EN at mobile, tablet and desktop sizes',
  { skip: !process.env.FOODSAVE_LAYOUT_URL, timeout: 180000 }, async t => {
  const url = new URL(process.env.FOODSAVE_LAYOUT_URL);
  assert.equal(url.protocol, 'http:');
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'foodsave-grid-browser-'));
  const shots = fs.mkdtempSync(path.join(os.tmpdir(), 'foodsave-grid-layouts-'));
  const browser = spawn(process.env.FOODSAVE_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-extensions',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost',
    '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank',
  ], { stdio: 'ignore', windowsHide: true });
  const offers = Array.from({ length: 8 }, (_, i) => ({
    id: 'fixture-' + i, title: i % 2 ? 'Pizza' : 'Boulangerie / Pâtisserie — assortiment généreux de pains et de viennoiseries',
    description: 'Fresh surplus food. Une description très longue pour vérifier le texte sur les petits écrans.',
    originalPrice: 14, discountedPrice: 7, quantity: i === 7 ? 0 : 3,
    dynamicPricingEnabled: i === 0, category: 'EPICERIE',
    pickupStart: '2030-10-02T17:35:00.000Z', pickupEnd: '2030-10-02T19:35:00.000Z',
    imageUrl: i % 2 ? null : url.origin + '/images/foodsave/foodsave-surplus-boxes.webp',
    merchant: { id: 'fixture-merchant', name: 'La boulangerie du quartier et ses délicieux produits artisanaux',
      city: 'Ottawa', address: 'Fixture address', type: 'BAKERY' },
  }));
  let ws, send;
  const errors = [], unexpectedWrites = [];
  try {
    let port;
    for (let n = 0; n < 100; n++) {
      try { port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; break; }
      catch { await wait(100); }
    }
    assert.ok(port, 'Local browser started');
    const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
    ws = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
    let seq = 0;
    const pending = new Map();
    send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
    });
    ws.addEventListener('message', async event => {
      const m = JSON.parse(event.data);
      if (m.id) {
        const p = pending.get(m.id); pending.delete(m.id);
        m.error ? p?.reject(Error(m.error.message)) : p?.resolve(m.result); return;
      }
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text);
      if (m.method !== 'Fetch.requestPaused') return;
      try {
        const { requestId, request, resourceType } = m.params, u = new URL(request.url);
        let body;
        if (resourceType !== 'Document' && u.pathname === '/offers') body = { offers };
        else if (u.pathname === '/orders/quote') body = { pricing: {
          merchandiseSubtotalMinor: 700, serviceFeeMinor: 49, customerTotalMinor: 749, pricingVersion: 'fixture',
        } };
        else if (u.origin === url.origin) { await send('Fetch.continueRequest', { requestId }); return; }
        else body = { favorites: [], notifications: [] };
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) unexpectedWrites.push(u.pathname);
        await send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [
          { name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' },
          { name: 'Access-Control-Allow-Headers', value: 'authorization, content-type' },
        ], body: Buffer.from(JSON.stringify(body)).toString('base64') });
      } catch (e) {
        // Navigating cancels requests from the preceding document.
        if (e.message !== 'Invalid InterceptionId.') errors.push(e.message);
      }
    });
    await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
    await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('token', 'fixture.' + btoa(JSON.stringify({role:'CLIENT'})) + '.fixture');` });
    const evaluate = async expression => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      assert.ok(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value;
    };
    for (const route of ['/', '/offers']) for (const width of [320, 390, 480, 768, 1024, 1440]) for (const locale of ['fr', 'en']) {
      await t.test(`${route} ${locale} ${width}px`, async () => {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width <= 480 });
        await send('Network.setCookie', { name: 'foodsave_locale', value: locale, url: url.origin, path: '/' });
        await send('Page.navigate', { url: url.origin + route });
        for (let n = 0; n < 100; n++) {
          if (await evaluate(`document.documentElement?.lang==='${locale}-CA' && document.querySelectorAll('[class*="offerGrid"] article').length===8`)) break;
          await wait(100);
        }
        await evaluate('document.fonts.ready'); await wait(400);
        const layout = await evaluate(`(() => {
          const grid = document.querySelector('[class*="offerGrid"]');
          const box = e => { const r=e.getBoundingClientRect(); return {width:r.width,height:r.height,left:r.left,right:r.right}; };
          return {columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length, overflow:document.documentElement.scrollWidth>innerWidth,
            notices:document.querySelectorAll('[class*="offerNotice"]').length,
            cards:[...grid.querySelectorAll('article')].map(card=>({box:box(card),text:card.textContent,
              image:box(card.firstElementChild),title:box(card.querySelector('h2,h3')),titleLine:parseFloat(getComputedStyle(card.querySelector('h2,h3')).lineHeight),
              buttons:[...card.querySelectorAll('button,a')].map(e=>({box:box(e),disabled:e.disabled, text:e.textContent})),
              overflow:[...card.querySelectorAll('p,h2,h3,button,a')].some(e=>e.getBoundingClientRect().right>card.getBoundingClientRect().right+1)
            }))}; })()`);
        assert.equal(layout.columns, width < 768 ? 2 : width < 1024 ? 3 : 4);
        assert.equal(layout.overflow, false); assert.equal(layout.notices, 1);
        assert.equal(layout.cards.length, 8);
        for (const card of layout.cards) {
          assert.equal(card.overflow, false);
          assert.ok(Math.abs(card.image.width / card.image.height - 1.5) < 0.02, 'Consistent image and fallback ratio');
          assert.ok(card.title.height <= card.titleLine * 2 + 1, 'Long titles occupy at most two lines');
          assert.ok(card.text.includes('7') && card.text.includes('14'), 'Server price and original price visible');
          if (route === '/offers') assert.ok(card.text.includes('50'), 'Existing discount remains visible');
          for (const button of card.buttons) {
            assert.ok(button.box.height >= 44, 'Comfortable touch target');
            assert.ok(button.box.left >= card.box.left && button.box.right <= card.box.right + 1);
          }
        }
        await evaluate(`window.scrollTo(0, document.querySelector('[class*="offerGrid"]').getBoundingClientRect().top + scrollY - 90)`);
        await wait(150);
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(shots, `${route === '/' ? 'home' : 'offers'}-${locale}-${width}.png`), Buffer.from(shot.data, 'base64'));
        if (route === '/offers') {
          assert.ok(layout.cards[7].buttons.some(b => b.disabled), 'Unavailable offer cannot reserve');
          await evaluate(`document.querySelector('[class*="offerGrid"] article [class*="cardBody"] > button').click()`);
          for (let n = 0; n < 50; n++) {
            if (await evaluate(`!!document.querySelector('[class*="offerGrid"] [aria-live="polite"]')`)) break;
            await wait(100);
          }
          const quote = await evaluate(`document.querySelector('[class*="offerGrid"] [aria-live="polite"]').textContent`);
          assert.match(quote, /7[.,]49/, 'Existing server quote total is displayed without card-side recomputation');
          assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Quote stays inside mobile viewport');
        }
      });
    }
    assert.deepEqual(errors, []); assert.deepEqual(unexpectedWrites, [], 'No Checkout or financial request executed');
    t.diagnostic('Local screenshots: ' + shots);
  } finally {
    if (send && ws?.readyState === 1) { try { await send('Browser.close'); } catch {} }
    ws?.close(); browser.kill();
  }
});
