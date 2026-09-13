const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { resolveLocale, localeCookie, localeTools, fr, en, translate, safeMessageKey, notificationMessage } = require('./i18n-fixture.cjs');

for (const [header, expected] of [['fr-CA,fr;q=0.9','fr'], ['en-CA,en;q=0.8','en'], ['en-US','en'], ['es-MX,en;q=0.8','fr'], ['', 'fr'], [undefined,'fr']]) {
  test(`first visit language ${header ?? 'unavailable'}`, () => assert.equal(resolveLocale(undefined, header), expected));
}
test('saved language wins over browser language; invalid cookie is ignored', () => {
  assert.equal(resolveLocale('fr','en-CA'),'fr'); assert.equal(resolveLocale('en','fr-CA'),'en');
  assert.equal(resolveLocale('invalid','en-CA'),'en');
});
test('choice cookie persists across routes and visits without touching auth storage', () => {
  assert.equal(localeCookie('en',true),'foodsave_locale=en; Path=/; Max-Age=31536000; SameSite=Lax; Secure');
  assert.equal(localeCookie('fr'), 'foodsave_locale=fr; Path=/; Max-Age=31536000; SameSite=Lax');
});
test('dictionary keys and interpolation tokens match in both locales', () => {
  assert.deepEqual(Object.keys(fr).sort(),Object.keys(en).sort());
  for (const key of Object.keys(fr)) {
    assert.ok(fr[key].trim()); assert.ok(en[key].trim());
    assert.deepEqual(fr[key].match(/\{\w+\}/g),en[key].match(/\{\w+\}/g),key);
  }
});
for (const locale of ['fr','en']) {
  test(`${locale}: Canadian currency and plural quantities`, () => {
    const tools=localeTools(locale);
    assert.equal(tools.money(5),new Intl.NumberFormat(`${locale}-CA`,{style:'currency',currency:'CAD'}).format(5));
    assert.ok(tools.count('offers.count','offers.countPlural',2).includes('2'));
    assert.notEqual(tools.count('offers.count','offers.countPlural',1),tools.count('offers.count','offers.countPlural',2));
  });
  test(`${locale}: user-created content is not translated or interpreted as HTML`, () => {
    const title='<b>Panier spécial {title}</b>';
    const result=translate(locale,'offers.deactivate',{title}); assert.ok(result.includes(title));
    const notification=notificationMessage(`Votre reservation pour ${title} est confirmee`);
    assert.equal(notification.values.title,title);
    assert.ok(translate(locale,notification.key,notification.values).includes(title));
  });
  test(`${locale}: refund success, incomplete and uncertain remain distinct`, () => {
    const tools=localeTools(locale);
    const success=tools.message('Commande annulee et remboursement reussi.');
    const pending=tools.message('Annulation acceptee. Le remboursement est incomplet et en cours de traitement.');
    const unknown=tools.message('Annulation acceptee. Le resultat du remboursement est incertain et doit etre verifie.');
    assert.equal(new Set([success,pending,unknown]).size,3);
    assert.equal(tools.message('Prisma: secret internal stack'),tools.t('common.error'));
  });
}
test('unknown notifications do not echo technical text', () => assert.equal(notificationMessage('SQL secret').key,'notification.fallback'));
test('known ownership failure remains a rejection message', () => assert.equal(safeMessageKey('Cette session de paiement ne vous appartient pas'),'api.ownership'));
test('switching locale translates a stored message key without changing it', () => {
  const key='api.cancelUnknown'; assert.notEqual(localeTools('fr').message(key),localeTools('en').message(key)); assert.equal(key,'api.cancelUnknown');
});
test('sign-out removes only auth token and does not reset locale', () => {
  const source=fs.readFileSync(path.join(__dirname,'../app/components/Navbar.tsx'),'utf8');
  const handler=source.slice(source.indexOf('const handleLogout'),source.indexOf('return (',source.indexOf('const handleLogout')));
  assert.match(handler,/removeItem\("token"\)/); assert.doesNotMatch(handler,/clear\(|cookie|setLocale/);
});
test('no hardcoded interface text remains in JSX outside intentional brand/contact/unit exceptions', () => {
  const allowed=new Set(['Food','Save','info@foodsave.ca','km','FR','EN']);
  function scan(dir) { for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const file=path.join(dir,entry.name); if(entry.isDirectory())scan(file);
    else if(file.endsWith('.tsx')) {
      const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),99,true,4);
      function visit(node) { if(ts.isJsxText(node)&&/[A-Za-zÀ-ÿ]/.test(node.text))assert.ok(allowed.has(node.text.trim()),`${file}: ${node.text}`); ts.forEachChild(node,visit); }
      visit(source);
    }
  }} scan(path.join(__dirname,'../app'));
});
