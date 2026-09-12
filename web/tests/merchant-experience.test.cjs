const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { transformSync } = require("../../backend/node_modules/esbuild");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

// Real page JSX with controlled hooks, browser APIs, and HTTP responses. No
// Next server, provider SDK, database, or external request is loaded by tests.
function mount(route, fetcher, { token = "merchant-fixture" } = {}) {
  const state = [], refs = [], dependencies = [];
  let cursor = 0, tree, queued = [], dirty = true;
  const hooks = {
    useState(initial) {
      const i = cursor++;
      if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial;
      return [state[i], value => { const next = typeof value === "function" ? value(state[i]) : value; if (next !== state[i]) dirty = true; state[i] = next; }];
    },
    useRef(initial) { const i = cursor++; return refs[i] ||= { current: initial }; },
    useEffect(fn, deps) { const i = cursor++; if (!dependencies[i] || deps.some((v, j) => v !== dependencies[i][j])) { dependencies[i] = deps; queued.push(fn); } },
  };
  const file = path.join(__dirname, `../app/merchant/${route}/page.tsx`);
  const code = transformSync(fs.readFileSync(file, "utf8"), { loader: "tsx", format: "cjs", jsx: "automatic" }).code;
  const module = { exports: {} }, calls = [], location = { href: "" };
  vm.runInNewContext(code, {
    module, exports: module.exports, console, Date,
    FormData: global.FormData, URL: { createObjectURL: () => "blob:fixture" },
    fetch: async (url, options = {}) => { calls.push({ url, ...options }); return fetcher(url, options); },
    localStorage: { getItem: () => token }, window: { confirm: () => true, prompt: () => "Motif fixture", location },
    navigator: { mediaDevices: { getUserMedia: async () => { throw Error("Camera denied"); } } },
    cancelAnimationFrame() {}, requestAnimationFrame() { throw Error("No camera frames expected"); },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
      if (name.endsWith("/lib/api")) return { API_URL: "https://fixture.invalid" };
      if (name === "next/link") return ({ children, ...props }) => React.createElement("a", props, children);
      if (name.endsWith("MerchantShell")) return ({ title, action, children }) => React.createElement("main", null, React.createElement("h1", null, title), action, children);
      if (name.endsWith("FoodSaveImage")) return () => null;
      throw Error(`Unexpected dependency ${name}`);
    },
  });
  function render() {
    cursor = 0; dirty = false; tree = module.exports.default();
    const html = renderToStaticMarkup(tree), effects = queued; queued = [];
    effects.forEach(fn => fn());
    return html;
  }
  function find(predicate) {
    let found;
    function visit(node) {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node || typeof node !== "object") return;
      if (predicate(node)) found = node;
      visit(node.props?.children);
    }
    visit(tree); assert.ok(found, "Expected element exists"); return found;
  }
  const page = {
    calls, location, render,
    async settle() {
      for (let i = 0; i < 12; i++) { await new Promise(r => setImmediate(r)); if (dirty) render(); }
      return render();
    },
    change(id, value) { render(); find(n => n.props?.id === id).props.onChange({ target: { value } }); render(); },
    async submit() { render(); await find(n => n.type === "form").props.onSubmit({ preventDefault() {} }); return page.settle(); },
    async click(text) { render(); const button = find(n => n.type === "button" && renderToStaticMarkup(n).includes(text)); assert.ok(!button.props.disabled); await button.props.onClick(); return page.settle(); },
  };
  render(); return page;
}
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const merchant = { id: "merchant", name: "Commerce existant", type: "BAKERY", address: "Fixture", city: "Ottawa", province: "Ontario", postalCode: "K1A 0B1", phone: "555-0100" };

test("profile remains loading until read completes; creation requires known absence", async () => {
  let release;
  const page = mount("profile", () => new Promise(resolve => { release = resolve; }));
  let html = page.render(); assert.ok(html.includes("Chargement de votre commerce")); assert.ok(!html.includes("<form"));
  release(response({}, 404)); html = await page.settle(); assert.ok(html.includes("Créer mon profil"));
  assert.ok(html.includes("Téléphone (optionnel)")); assert.ok(html.includes('for="merchant-phone"'));
});
for (const failure of ["500", "network", "malformed", "unauthenticated"]) {
  test(`profile ${failure} does not invite duplicate creation`, async () => {
    const page = mount("profile", () => { if (failure === "network") throw Error("Offline"); return response({}, failure === "500" ? 500 : 200); }, { token: failure === "unauthenticated" ? null : "fixture" });
    const html = await page.settle(); assert.ok(html.includes('role="alert"')); assert.ok(!html.includes("<form"));
    assert.ok(page.calls.every(c => c.method !== "POST"));
  });
}
for (const status of ["NOT_CONNECTED", "ONBOARDING_INCOMPLETE", "READY", "error"]) {
  test(`existing profile and payment status ${status}`, async () => {
    const page = mount("profile", url => url.endsWith("/me") ? response({ merchant }) : response({ status }, status === "error" ? 500 : 200));
    const html = await page.settle(); assert.ok(html.includes(merchant.name)); assert.ok(!html.includes("<form"));
    assert.equal(html.includes("Configuration prête"), status === "READY");
    if (status === "error") assert.ok(html.includes("Statut momentanément indisponible."));
    assert.ok(!html.includes("financées par notre"));
    assert.ok(page.calls.every(c => c.method !== "POST"));
  });
}
test("profile creation preserves exact payload and removes form on success", async () => {
  const page = mount("profile", (url, options) => options.method === "POST" ? response({ merchant }) : url.endsWith("/me") ? response({}, 404) : response({ status: "NOT_CONNECTED" }));
  await page.settle();
  for (const [id,value] of [["name","Commerce"],["address","Fixture"],["city","Ottawa"],["postalcode","K1A 0B1"],["phone","555-0100"]]) page.change("merchant-" + id, value);
  const html = await page.submit();
  const post = page.calls.filter(c => c.method === "POST"); assert.equal(post.length, 1);
  assert.ok(post[0].url.endsWith("/merchants")); assert.equal(post[0].headers.Authorization, "Bearer merchant-fixture");
  assert.deepEqual(JSON.parse(post[0].body), { name: "Commerce", type: "RESTAURANT", description: "", address: "Fixture", city: "Ottawa", province: "Ontario", postalCode: "K1A 0B1", phone: "555-0100" });
  assert.ok(!html.includes("<form"));
});
test("payment setup keeps existing POST and redirect, only on click", async () => {
  const page = mount("profile", (url, options) => options.method === "POST" ? response({ url: "https://fixture.invalid/onboarding" }) : url.endsWith("/me") ? response({ merchant }) : response({ status: "NOT_CONNECTED" }));
  await page.settle(); await page.click("Configurer mes paiements");
  const post = page.calls.find(c => c.method === "POST"); assert.ok(post.url.endsWith("/merchants/connect-stripe")); assert.equal(post.body, "{}"); assert.equal(page.location.href, "https://fixture.invalid/onboarding");
});
test("new offer retains quantities, categories, dates and numeric request fields", async () => {
  const page = mount("new-offer", () => response({ message: "Offre créée" }));
  const html = page.render(); assert.ok(html.includes('min="1"')); assert.ok(html.includes('max="1000"')); assert.ok(html.includes('value="BOULANGERIE_PATISSERIE"'));
  for (const [id,value] of [["title","Pain"],["original-price","10.00"],["discounted-price","5.00"],["quantity","2"],["pickup-start","2026-09-15T16:00"],["pickup-end","2026-09-15T18:00"]]) page.change("offer-" + id, value);
  await page.submit(); assert.equal(page.calls.length, 1);
  assert.deepEqual(JSON.parse(page.calls[0].body), { title: "Pain", description: "", category: "PLATS_PREPARES", imageUrl: "", originalPrice: 10, discountedPrice: 5, quantity: 2, pickupStart: "2026-09-15T16:00", pickupEnd: "2026-09-15T18:00" });
});
for (const route of ["offers", "sales"]) {
  test(`${route} separates HTTP failure from empty state`, async () => {
    const page = mount(route, () => response({}, 500)); const html = await page.settle();
    assert.ok(html.includes('role="alert"')); assert.ok(!html.includes("Votre première offre")); assert.ok(!html.includes("Aucune vente terminée"));
  });
  test(`${route} shows a designed empty state`, async () => {
    const page = mount(route, () => response({ offers: [], sales: [] })); const html = await page.settle();
    assert.ok(html.includes(route === "offers" ? "Votre première offre" : "Aucune vente terminée"));
  });
}
test("sales render returned figures without claiming bank receipt", async () => {
  const page = mount("sales", () => response({ summary: { totalSales: 1, totalRevenue: 5, totalCommission: .75, totalNet: 4.25 }, sales: [{ id: "s", title: "Pain", totalPrice: 5, commission: .75, net: 4.25, date: "2026-09-15" }] }));
  const html = await page.settle(); assert.ok(html.includes("4.25")); assert.ok(html.includes("Montant net des ventes")); assert.ok(html.includes("ne confirment pas qu’un versement"));
});
test("manual pickup preserves exact validation request; camera denial offers fallback", async () => {
  const page = mount("reservations", (url, options) => response(options.method === "POST" ? {} : { orders: [] }));
  await page.settle(); let html = await page.click("Scanner le QR code"); assert.ok(html.includes("caméra"));
  page.change("manual-pickup-code", "  fixture-code  "); await page.click("Valider");
  const post = page.calls.find(c => c.method === "POST"); assert.ok(post.url.endsWith("/orders/validate")); assert.deepEqual(JSON.parse(post.body), { pickupCode: "fixture-code" });
});
