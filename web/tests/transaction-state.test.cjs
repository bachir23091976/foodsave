const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { transformSync } = require("../../backend/node_modules/esbuild");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

// Execute real page components with controlled hooks and HTTP fixtures. No browser,
// server, Next font download, backend client or financial provider is started.
function mount(file, fetcher, { token = "customer-token", session = "cs_fixture" } = {}) {
  const slots = [], effects = [], cleanups = [];
  let cursor = 0, tree;
  const hooks = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useCallback(fn) { cursor++; return fn; },
    useEffect(fn) { const i = cursor++; if (!(i in slots)) { slots[i] = true; effects.push(fn); } },
  };
  const code = transformSync(fs.readFileSync(path.join(__dirname, "../app", file), "utf8"), {
    loader: "tsx", format: "cjs", jsx: "automatic",
  }).code;
  const module = { exports: {} };
  const calls = [];
  vm.runInNewContext(code, {
    module, exports: module.exports, console, Date,
    fetch: async (url, options) => { calls.push({ url, options }); return fetcher(url, options); },
    localStorage: { getItem: () => token },
    window: { confirm: () => true, prompt: () => "reason" },
    navigator: {}, setInterval: () => 1, clearInterval() {},
    require(name) {
      if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/navigation") return { useSearchParams: () => ({ get: () => session }) };
      if (name === "next/font/google") return { Bebas_Neue: () => ({}), Space_Grotesk: () => ({}) };
      if (name.endsWith("/lib/api")) return { API_URL: "https://fixture.invalid" };
      if (name === "next/link") return ({ children, ...props }) => React.createElement("a", props, children);
      if (name.includes("/components/")) return ({ children }) => children || null;
      throw Error(`Unexpected dependency ${name}`);
    },
  });
  const render = () => { cursor = 0; tree = module.exports.default(); return renderToStaticMarkup(tree); };
  render();
  for (const effect of effects) cleanups.push(effect());
  return {
    calls, render,
    async settle() { await new Promise(resolve => setImmediate(resolve)); return render(); },
    replayEffects() { cleanups.forEach(fn => fn?.()); effects.forEach(fn => fn()); },
    async click(text) {
      render();
      let match;
      function visit(node) {
        if (Array.isArray(node)) return node.forEach(visit);
        if (!node || typeof node !== "object") return;
        if (node.type === "button" && renderToStaticMarkup(node).includes(text)) match = node;
        visit(node.props?.children);
      }
      visit(tree);
      assert.ok(match, `Button ${text} exists`);
      assert.ok(!match.props.disabled, `Button ${text} enabled`);
      await match.props.onClick();
      return render();
    },
  };
}
const response = (data, ok = true) => ({ ok, json: async () => data });
const order = (status = "CONFIRMED", refund = null) => ({
  id: "order", status, pickupCode: "PICKUP-SECRET", totalPrice: 5, createdAt: new Date().toISOString(),
  customerCancellationRefund: refund && { refundStatus: refund, updatedAt: new Date().toISOString() },
  offer: { title: "Fixture offer", pickupStart: new Date(Date.now() + 86400000).toISOString(),
    pickupEnd: new Date(Date.now() + 90000000).toISOString(), merchant: { name: "Merchant", city: "Ottawa" } },
  user: { firstName: "Test", lastName: "Customer" },
});

for (const [status, label] of Object.entries({ CONFIRMED: "RÉSERVATION CONFIRMÉE", CANCELLED: "RÉSERVATION ANNULÉE",
  COMPLETED: "RÉSERVATION DÉJÀ RÉCUPÉRÉE", PENDING: "RÉSERVATION EN ATTENTE", UNRECOGNIZED: "STATUT DE LA RÉSERVATION INDISPONIBLE" })) {
  test(`success page renders ${status} and only confirmed credentials`, async () => {
    const page = mount("order-success/OrderSuccessContent.tsx", () => response({ order: order(status), qrCodeImage: "data:image/png;base64,fixture" }));
    const html = await page.settle();
    assert.ok(html.includes(label));
    assert.equal(html.includes("PICKUP-SECRET"), status === "CONFIRMED");
    assert.equal(html.includes("Montrez ce code"), status === "CONFIRMED");
    assert.equal(html.includes("QR Code de récupération"), status === "CONFIRMED");
    page.replayEffects();
    await page.settle();
    assert.equal(page.calls.length, 1, "effect replay must not issue another confirmation");
    assert.deepEqual(JSON.parse(page.calls[0].options.body), { sessionId: "cs_fixture" });
    assert.equal(page.calls[0].options.headers.Authorization, "Bearer customer-token");
  });
}
test("ownership rejection and sold-out responses preserve messages without pickup", async () => {
  for (const message of ["Cette session de paiement ne vous appartient pas", "Cette offre n’est plus disponible. Votre paiement a été remboursé automatiquement."]) {
    const page = mount("order-success/OrderSuccessContent.tsx", () => response({ message }, false));
    const html = await page.settle();
    assert.ok(html.includes(message.toUpperCase()));
    assert.ok(!html.includes("Montrez ce code"));
  }
});
test("unsuccessful HTTP response cannot expose even a supplied confirmed order", async () => {
  const page = mount("order-success/OrderSuccessContent.tsx", () => response({ order: order(), message: "Erreur" }, false));
  assert.ok(!(await page.settle()).includes("PICKUP-SECRET"));
});
test("missing auth or session never sends confirmation", async () => {
  for (const options of [{ token: null }, { session: null }]) {
    const page = mount("order-success/OrderSuccessContent.tsx", () => { throw Error("No request allowed"); }, options);
    await page.settle(); assert.equal(page.calls.length, 0);
  }
});

for (const [status, label] of Object.entries({ SUCCEEDED: "Remboursement effectué", PENDING: "Remboursement en attente",
  REQUIRES_ACTION: "Remboursement incomplet — vérification nécessaire", UNKNOWN: "Résultat du remboursement en cours de vérification",
  FAILED: "Remboursement nécessitant une vérification", CANCELED: "Remboursement nécessitant une vérification",
  NEEDS_REVIEW: "Remboursement nécessitant une vérification", NOT_REQUESTED: "État du remboursement non disponible" })) {
  test(`cancelled reservation renders durable ${status}`, async () => {
    const page = mount("reservations/page.tsx", () => response({ orders: [order("CANCELLED", status)] }));
    const html = await page.settle();
    assert.ok(html.includes("Réservation annulée")); assert.ok(html.includes(label));
    assert.ok(!html.includes("PICKUP-SECRET"));
  });
}
test("null refund does not imply success or failure; completed/pending hide credentials", async () => {
  for (const status of ["CANCELLED", "COMPLETED", "PENDING"]) {
    const page = mount("reservations/page.tsx", () => response({ orders: [order(status)] }));
    const html = await page.settle();
    assert.ok(!html.includes("PICKUP-SECRET")); assert.ok(!html.includes("Remboursement effectué"));
  }
});
for (const outcome of ["success", "202", "500", "network", "invalid-json"]) {
  test(`cancellation ${outcome} always refreshes via GET, never repeats POST`, async () => {
    let reads = 0;
    const page = mount("reservations/page.tsx", (url, options) => {
      if (options.method === "POST") {
        if (outcome === "network") throw Error("lost response");
        if (outcome === "invalid-json") return { json: async () => { throw Error("bad JSON"); } };
        return response({ message: "Annulation acceptée" }, outcome !== "500");
      }
      return response({ orders: [++reads === 1 ? order() : order("CANCELLED", outcome === "success" ? "SUCCEEDED" : "UNKNOWN")] });
    });
    await page.settle();
    const html = await page.click("Annuler la commande");
    assert.ok(html.includes("Réservation annulée")); assert.ok(!html.includes("PICKUP-SECRET"));
    assert.equal(reads, 2); assert.equal(page.calls.filter(c => c.options.method === "POST").length, 1);
  });
}
test("failed refresh hides stale fulfillment; retry only reads", async () => {
  let reads = 0;
  const page = mount("reservations/page.tsx", (url, options) => {
    if (options.method === "POST") throw Error("unknown cancellation outcome");
    if (++reads === 2) throw Error("read unavailable");
    return response({ orders: [reads === 1 ? order() : order("CANCELLED", "UNKNOWN")] });
  });
  await page.settle();
  let html = await page.click("Annuler la commande");
  assert.ok(!html.includes("PICKUP-SECRET")); assert.ok(!html.includes("Annuler la commande"));
  await page.click("Actualiser les réservations"); html = await page.settle();
  assert.ok(html.includes("Réservation annulée"));
  assert.equal(page.calls.filter(c => c.options.method === "POST").length, 1);
});
test("expired confirmed reservation remains visible without mutation", async () => {
  const expired = order(); expired.offer.pickupEnd = "2020-01-01T00:00:00Z";
  const page = mount("merchant/reservations/page.tsx", () => response({ orders: [expired] }));
  const html = await page.settle();
  assert.ok(html.includes("Fenêtre de récupération terminée (1)"));
  assert.ok(html.includes("Fixture offer")); assert.ok(html.includes("PICKUP-SECRET"));
  assert.ok(page.calls.every(c => !c.options.method || c.options.method === "GET"));
});
for (const status of ["READY", "NOT_CONNECTED", "ONBOARDING_INCOMPLETE", "UNRECOGNIZED", "error"]) {
  test(`Stripe return readiness ${status}`, async () => {
    const page = mount("merchant/stripe-success/page.tsx", () => response({ status }, status !== "error"));
    assert.ok(page.render().includes("Vérification de votre compte…"));
    const html = await page.settle();
    assert.equal(html.includes("Votre configuration de paiement est prête."), status === "READY");
    if (["error", "UNRECOGNIZED"].includes(status)) assert.ok(html.includes("Statut momentanément indisponible."));
    assert.ok(page.calls[0].url.endsWith("/merchants/stripe-status"));
  });
}
test("zero quantity uses neutral label", async () => {
  const page = mount("merchant/offers/page.tsx", () => response({ offers: [{ ...order().offer, id: "offer", quantity: 0, originalPrice: 10, discountedPrice: 5 }] }));
  const html = await page.settle();
  assert.ok(html.includes("Indisponible")); assert.ok(!html.includes("Désactivée"));
});

test("in-flight cancellation hides pickup and disables another cancellation", async () => {
  let release, reads = 0;
  const pending = new Promise(resolve => { release = resolve; });
  const page = mount("reservations/page.tsx", (url, options) => {
    if (options.method === "POST") return pending;
    return response({ orders: [++reads === 1 ? order() : order("CANCELLED", "UNKNOWN")] });
  });
  await page.settle();
  const action = page.click("Annuler la commande");
  const html = page.render();
  assert.ok(!html.includes("PICKUP-SECRET"));
  assert.ok(html.includes("Vérification de la réservation…"));
  assert.ok(html.includes("disabled"));
  release(response({ message: "Annulation acceptée" }, false));
  await action;
  assert.equal(page.calls.filter(c => c.options.method === "POST").length, 1);
});

test("Stripe network failure or missing authentication never claims readiness", async () => {
  for (const options of [{}, { token: null }]) {
    const page = mount("merchant/stripe-success/page.tsx", () => { throw Error("Network unavailable"); }, options);
    const html = await page.settle();
    assert.ok(html.includes("Statut momentanément indisponible."));
    assert.ok(!html.includes("Votre configuration de paiement est prête."));
    if (options.token === null) assert.equal(page.calls.length, 0);
  }
});

test("confirmation network failure is not automatically retried", async () => {
  const page = mount("order-success/OrderSuccessContent.tsx", () => { throw Error("Network unavailable"); });
  let html = await page.settle();
  assert.ok(html.includes("IMPOSSIBLE DE CONTACTER LE SERVEUR"));
  page.replayEffects(); html = await page.settle();
  assert.ok(!html.includes("PICKUP-SECRET")); assert.equal(page.calls.length, 1);
});
