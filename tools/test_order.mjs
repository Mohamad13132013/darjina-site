// Node test of the public order page (TICKET-047), no browser: node tools/test_order.mjs (Node 18+).
// Covers the 404 forwarding script as built into 404.html, the page's pure helpers in
// assets/js/order.js (lowercasing, phone E.164 with the chosen country code, payload building, the
// client_request_id rule, error-code mapping, WhatsApp texts), the strings file, the built page and
// robots/sitemap, and that order.js never parses text as markup. The review fixes of 2026-11-09
// (ADR-0036 amendment 2, item 21: W1, W4-W6, W8-W10) are tested through their pure helpers; the busy
// flag (W2), the no-store re-reads (W3) and the page wiring were checked in headless Edge. Bug fixes
// 2026-11-09 (amendment 2, items 22 and 25): the root 404.html head previews as the order page
// (BUG-095); the confirmation snapshot and the re-read gate (BUG-096). TICKET-051 (ADR-0037 sections
// 1, 2, 5): no customer photos anywhere (no file input, no photos key, no photo texts), the Instagram
// link field alone for a shop without listed models, the exact model price ("Price: 25.000 BHD", never
// "From"), and the strings and WhatsApp examples equal to the web copy deck of the main repository.
// TICKET-055 (ADR-0038 sections 1, 4, 5): exact totals, the stock cap and «only N left», the 409
// stock refusals, the request id after a refusal, the friendly note for a model that cannot be
// ordered, the confirmation and WhatsApp totals, and answers of the batch 11 function.
// Run `python tools/build.py` first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const O = createRequire(import.meta.url)(join(ROOT, 'assets/js/order.js'));
const STRINGS = (() => {
  const ctx = { window: {} };
  vm.runInNewContext(read('assets/js/order-strings.js'), ctx);
  return ctx.window.ORDER_STRINGS;
})();
const ch = (...codes) => String.fromCharCode(...codes);
const NBSP = ch(0xa0);
// The web copy deck of the main repository (this repository sits in its `website/` folder).
const DECK_FILE = join(ROOT, '..', 'docs', 'design', 'copy-online-order-page.md');
const DECK = existsSync(DECK_FILE) ? readFileSync(DECK_FILE, 'utf8').replace(/\r\n/g, '\n') : null;
const NO_DECK = DECK ? false : `copy deck not found at ${DECK_FILE}`;
/** Ids removed by ADR-0037 (copy deck "Changes on 2026-11-09"). */
const REMOVED_IDS = ['form.modelPhotos', 'form.photosAdd', 'form.photosHelp', 'form.photoRemove', 'form.photoPreparing',
  'err.photoMax', 'err.photoType', 'err.photoLarge', 'wa.photos', 'model.from'];
/** Ids added and removed by ADR-0038 (copy deck "Changes on 2026-11-11", TICKET-055). */
const T55_IDS = ['gone.title', 'gone.body', 'gone.bodyNoModels', 'model.left1', 'model.left2', 'model.leftFew', 'form.piecesCap',
  'form.total', 'form.totalCalc', 'send.stockShort', 'send.soldOut', 'send.soldOutNoModels', 'confirm.summaryPieces', 'wa.modelPieces'];
const T55_REMOVED = ['model.unavailable'];

// ------------------------------------------------------------------------------------------------
// 404.html forwarding (ADR-0036 section 2)

function forwardScript() {
  const html = read('404.html');
  const head = html.slice(html.indexOf('<head>') + '<head>'.length).trimStart();
  assert.ok(head.startsWith('<script>'), 'the forwarding script is the first element of <head>');
  return head.slice('<script>'.length, head.indexOf('</script>'));
}
function forward(pathname, search = '', hash = '') {
  let target = null;
  const style = {};
  vm.runInNewContext(forwardScript(), {
    location: { pathname, search, hash, replace: (u) => { target = u; } },
    document: { documentElement: { style } },
    decodeURIComponent, encodeURIComponent,
  });
  return { target, hidden: style.visibility === 'hidden' };
}

test('404 script forwards /o/<handle>[/<code>] to the ad-safe address', () => {
  assert.equal(forward('/o/alnoor.abayas').target, '/o/?h=alnoor.abayas');
  assert.equal(forward('/o/alnoor.abayas/').target, '/o/?h=alnoor.abayas');
  assert.equal(forward('/o/alnoor.abayas/m1').target, '/o/?h=alnoor.abayas&m=m1');
  assert.equal(forward('/o/alnoor.abayas/m1/').target, '/o/?h=alnoor.abayas&m=m1');
  // case kept here, lowercased by the page
  assert.equal(forward('/o/AlNoor.Abayas/M1').target, '/o/?h=AlNoor.Abayas&m=M1');
  assert.equal(forward('/o/x/m1', '', '#order').target, '/o/?h=x&m=m1#order');
  assert.equal(forward('/o/x', '?lang=en').target, '/o/?h=x&lang=en');
  assert.equal(forward('/o/x', '?utm=1&lang=ar').target, '/o/?h=x&lang=ar');
  assert.equal(forward('/o/x', '?lang=fr').target, '/o/?h=x');
  assert.equal(forward('/o/x').hidden, true, 'the 404 page is not painted while forwarding');
});

test('404 script encodes what the path carries and ignores other paths', () => {
  assert.equal(forward('/o/a&m=evil').target, '/o/?h=a%26m%3Devil');
  assert.equal(forward('/o/%D8%B9').target, '/o/?h=%D8%B9');
  assert.equal(forward('/o/%E0%A4%A').target, '/o/?h=%25E0%25A4%25A'); // malformed escape kept as text
  for (const p of ['/o/', '/o', '/o/a/b/c', '/about/', '/en/o/x', '/x/o/y', '/o//m1']) {
    const r = forward(p);
    assert.equal(r.target, null, p);
    assert.equal(r.hidden, false, p);
  }
});

// The head of a built page: <title> and every <meta> as "name|property" -> content (entities decoded).
function headOf(html) {
  const head = html.slice(0, html.indexOf('</head>'));
  const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const tags = {};
  for (const m of head.matchAll(/<meta (?:name|property)="([^"]+)" content="([^"]*)">/g)) tags[m[1]] = unescape(m[2]);
  return { title: unescape(/<title>([^<]*)<\/title>/.exec(head)[1]), tags };
}
const PREVIEW_KEYS = ['description', 'og:title', 'og:description', 'og:url', 'og:image', 'og:image:alt',
  'twitter:title', 'twitter:description', 'twitter:image'];

test('BUG-095: the root 404.html (path links) previews as the generic order page; its body stays not found', () => {
  const nf = read('404.html');
  const page = headOf(nf);
  const order = headOf(read('o/index.html'));
  const ar = STRINGS.ar;
  assert.equal(page.title, ar['meta.title']);
  assert.equal(page.tags.description, ar['meta.description']);
  assert.equal(page.tags['og:title'], ar['meta.title']);
  assert.equal(page.tags['og:description'], ar['meta.description']);
  assert.equal(page.tags['og:image:alt'], ar['meta.ogImageAlt']);
  assert.equal(page.tags['twitter:title'], ar['meta.title']);
  assert.equal(page.tags['twitter:description'], ar['meta.description']);
  assert.equal(page.tags['og:url'], 'https://darjina.com/o/');
  for (const k of PREVIEW_KEYS) assert.equal(page.tags[k], order.tags[k], `${k} equals the order page's`);
  assert.equal(page.title, order.title);
  assert.equal(page.tags.robots, 'noindex');
  assert.doesNotMatch(nf.slice(0, nf.indexOf('</head>')), /غير موجودة/, 'no not-found text in the head');
  // The visible page is still the not-found page, with the forwarder first in <head>.
  const body = nf.slice(nf.indexOf('<body>'));
  assert.match(body, /<section class="notfound" id="not-found"/);
  assert.match(body, /<p class="code">404<\/p>/);
  assert.match(body, /<h1 id="nf-title">يبدو أن هذه الصفحة ضاعت/);
  forwardScript();
  // en/404.html (not the host's 404 page) keeps its own not-found head.
  const en = headOf(read('en/404.html'));
  assert.equal(en.title, 'Page not found | Darjina');
  assert.equal(en.tags['og:title'], 'Page not found | Darjina');
  assert.equal(en.tags['og:url'], 'https://darjina.com/en/404.html');
  assert.doesNotMatch(read('en/404.html'), /<script>\(function\(l\)/, 'no forwarder in en/404.html');
});

// ------------------------------------------------------------------------------------------------
// Address and lowercasing

test('page parameters: handle and model code lowercased, @ removed, language', () => {
  assert.deepEqual(O.parseParams('?h=AlNoor.Abayas&m=M1'), { h: 'alnoor.abayas', m: 'm1', lang: null });
  assert.deepEqual(O.parseParams('?h=%40Lulu_Tailoring&lang=en'), { h: 'lulu_tailoring', m: '', lang: 'en' });
  assert.deepEqual(O.parseParams('?h=+x+&m=+M2+&lang=de'), { h: 'x', m: 'm2', lang: null });
  assert.deepEqual(O.parseParams(''), { h: '', m: '', lang: null });
});

test('clean path restored after load', () => {
  assert.equal(O.cleanPath('alnoor.abayas', 'm1', 'ar'), '/o/alnoor.abayas/m1');
  assert.equal(O.cleanPath('alnoor.abayas', '', 'en'), '/o/alnoor.abayas?lang=en');
  assert.equal(O.cleanPath('', 'm1', 'ar'), '/o/');
});

// ------------------------------------------------------------------------------------------------
// Phone (BR-30, BR-31) with the country code chosen on the page

test('phone normalisation to E.164 (BR-30 table)', () => {
  const cases = [
    ['+973', '33112233', '+97333112233'],
    ['+973', '3311 2233', '+97333112233'],
    ['+973', ch(0x663, 0x663, 0x661, 0x661, 0x662, 0x662, 0x663, 0x663), '+97333112233'],
    ['+973', ch(0x6f3, 0x6f3, 0x6f1, 0x6f1, 0x6f2, 0x6f2, 0x6f3, 0x6f3), '+97333112233'],
    ['+973', ch(0x200f) + '33112233', '+97333112233'],
    ['+973', '0097333112233', '+97333112233'],
    ['+973', '97333112233', '+97333112233'],
    ['+973', '97333112', '+97397333112'],
    ['+973', '+966 55 123 4567', '+966551234567'],
    ['+966', '0551234567', '+966551234567'],
    ['+966', '551234567', '+966551234567'],
    ['+966', '966551234567', '+966551234567'],
    ['+973', '0551234567', '+973551234567'],
    ['+973', '36001122', '+97336001122'],
    ['+973', '0097336001122', '+97336001122'],
    ['+973', '(3600)-11.22', '+97336001122'],
  ];
  for (const [cc, typed, e164] of cases) assert.equal(O.normalizePhone(typed, cc), e164, `${cc} ${typed}`);
});

test('phone refusals', () => {
  for (const typed of ['3311', '', '   ', '+0123456789', '+97312345678901234', 'abc']) {
    assert.equal(O.normalizePhone(typed, '+973'), null, typed);
  }
  assert.equal(O.normalizePhone('36001122', 'nonsense'), null);
});

// ------------------------------------------------------------------------------------------------
// Form values, validation and payload

const DOC = O.sanitizeDoc({
  available: true, handle: 'alnoor.abayas',
  shop: { name: 'عبايات النور', phone: '+97317001100', logo_url: 'https://x.supabase.co/storage/v1/object/sign/l.png?token=1' },
  currency: { code: 'BHD', minor_units: 3 }, phone_country_code: '+973', min_desired_date: '2026-11-23',
  branches: [
    { id: '11111111-1111-4111-8111-111111111111', name: 'الرفاع', location: 'الرفاع الشرقي' },
    { id: '22222222-2222-4222-8222-222222222222', name: 'المنامة', location: null },
  ],
  models: [
    { code: 'm3', name: 'عباية سوداء كلاسيكية', description: null, from_price: 25.5, from_price_currency: 'BHD', minor_units: 3, instagram_url: 'https://www.instagram.com/p/C7abc/', photo_urls: [] },
    { code: 'm1', name: 'عباية كريب مطرزة', description: 'كريب', from_price: 35, from_price_currency: 'BHD', minor_units: 3, instagram_url: null, photo_urls: ['https://x.supabase.co/a.jpg', 'javascript:alert(1)'] },
  ],
  model: { code: 'm1' }, model_unavailable: false,
}, 'https:');

const base = () => ({
  name: ' Reem ', cc: '+973', phone: '36001122', kind: 'pick', chosen: 'm1', insta: '',
  branchId: '11111111-1111-4111-8111-111111111111', measMode: 'SHOP', meas: {}, pieces: '1',
  notes: 'Size M, black', date: '', contact: 'WHATSAPP', lang: 'ar',
});

test('sanitizeDoc keeps only the public document with safe links', () => {
  assert.equal(DOC.model, 'm1');
  assert.deepEqual(DOC.models[1].photo_urls, ['https://x.supabase.co/a.jpg']);
  assert.equal(DOC.shop.logo_url.startsWith('https://'), true);
  const bad = O.sanitizeDoc({
    handle: 'X', shop: { name: 'S', phone: 'tel:1', logo_url: 'javascript:alert(1)' },
    branches: [{ id: 'not-a-uuid', name: 'b' }], models: [{ code: 'M9', name: 'n', instagram_url: 'https://evil.example/p/1' }],
    model: { code: 'zz' }, model_unavailable: true, cr: 'secret',
  }, 'https:');
  assert.equal(bad.handle, 'x');
  assert.equal(bad.shop.phone, null);
  assert.equal(bad.shop.logo_url, null);
  assert.deepEqual(bad.branches, []);
  assert.equal(bad.models[0].code, 'm9');
  assert.equal(bad.models[0].instagram_url, null);
  assert.equal(bad.model, null);
  assert.equal(bad.model_unavailable, true);
  assert.equal('cr' in bad, false);
  assert.equal(O.safeUrl('http://127.0.0.1/x.jpg', 'https:'), null);
  assert.equal(O.safeUrl('http://127.0.0.1/x.jpg', 'http:'), 'http://127.0.0.1/x.jpg');
});

test('a complete request with a preselected model (US-ONL-002)', () => {
  const v = base();
  assert.deepEqual(O.validate(v, DOC), {});
  assert.deepEqual(O.buildPayload(v, DOC), {
    handle: 'alnoor.abayas', customer_name: 'Reem', phone: '+97336001122', model_code: 'm1',
    branch_id: '11111111-1111-4111-8111-111111111111', measurement_mode: 'SHOP', no_pieces: 1,
    notes: 'Size M, black', contact_preference: 'WHATSAPP', language: 'ar',
  });
});

test('payload: Instagram link, one branch, date, entered measurements; never photos', () => {
  // A stale form value from an old page state (ADR-0037): no photos key, no model, a model error.
  const stale = { ...base(), kind: 'photos', photos: [{ key: 1, b64: 'AAA=' }], notes: '  ' };
  const p1 = O.buildPayload(stale, DOC);
  assert.equal('photos' in p1, false, 'the body never carries photos');
  assert.equal('model_code' in p1, false);
  assert.equal('instagram_url' in p1, false);
  assert.equal('notes' in p1, false);
  assert.equal(O.validate(stale, DOC).model.id, 'err.modelRequired');

  const insta = { ...base(), kind: 'insta', insta: ' https://www.instagram.com/p/C7def/?igsh=abc ', lang: 'en', contact: 'CALL' };
  const p2 = O.buildPayload(insta, DOC);
  assert.equal(p2.instagram_url, 'https://www.instagram.com/p/C7def/');
  assert.equal('model_code' in p2, false);
  assert.equal(p2.language, 'en');
  assert.equal(p2.contact_preference, 'CALL');

  const one = { ...DOC, branches: [DOC.branches[0]] };
  const p3 = O.buildPayload({ ...base(), branchId: null, date: '2026-11-30', pieces: ch(0x663) }, one);
  assert.equal('branch_id' in p3, false, 'one ACTIVE branch: the server sets it');
  assert.equal(p3.desired_date, '2026-11-30');
  assert.equal(p3.no_pieces, 3);

  const entered = { ...base(), measMode: 'ENTERED', meas: { full_height: '138.0', sleeve_length: '57,5', bust_width: ch(0x664, 0x666), waist_width: ' ' } };
  assert.deepEqual(O.validate(entered, DOC), {});
  const p4 = O.buildPayload(entered, DOC);
  assert.equal(p4.measurement_mode, 'ENTERED');
  assert.deepEqual(p4.measurements, { full_height: 138, sleeve_length: 57.5, bust_width: 46 }, 'only entered points, as numbers');

  const last = O.buildPayload({ ...base(), measMode: 'LAST', meas: { full_height: '140' } }, DOC);
  assert.equal(last.measurement_mode, 'LAST');
  assert.equal('measurements' in last, false, 'values only with ENTERED');
});

test('validation mirrors BR-108 (negative cases)', () => {
  const e = (patch, doc = DOC) => O.validate({ ...base(), ...patch }, doc);
  assert.equal(e({ name: 'R' }).name.id, 'err.nameShort');
  assert.equal(e({ name: '  ' + ch(0x200f) + 'R' + ch(0xa0) }).name.id, 'err.nameShort');
  assert.equal(e({ name: 'x'.repeat(101) }).name.id, 'err.nameLong');
  assert.equal(e({ phone: '' }).phone.id, 'err.phoneRequired');
  assert.equal(e({ phone: '3311' }).phone.id, 'err.phoneInvalid');
  assert.equal(e({ chosen: null }).model.id, 'err.modelRequired');
  assert.equal(e({ chosen: 'm2' }).model.id, 'err.modelRequired');
  assert.equal(e({ kind: null }).model.id, 'err.modelRequired');
  assert.equal(e({ kind: 'photos' }).model.id, 'err.modelRequired', 'no photos choice any more');
  assert.equal(e({ kind: 'insta', insta: '' }).model.id, 'err.modelRequired', 'with models: the choice fieldset error');
  assert.equal(e({ kind: 'insta', insta: '' }).insta, undefined);
  assert.equal(e({ kind: 'insta', insta: 'https://www.tiktok.com/@x/video/1' }).insta.id, 'err.instagramInvalid');
  assert.equal(e({ branchId: null }).branch.id, 'err.branchRequired');
  assert.equal(e({ branchId: '33333333-3333-4333-8333-333333333333' }).branch.id, 'err.branchRequired');
  assert.equal(e({ branchId: null }, { ...DOC, branches: [DOC.branches[0]] }).branch, undefined);
  const m = e({ measMode: 'ENTERED', meas: { sleeve_length: '0', bust_width: '300', waist_width: '58.55', hip_circumference: '.5' } });
  assert.equal(m['meas.full_height'].id, 'err.measFullHeight');
  for (const k of ['sleeve_length', 'bust_width', 'waist_width', 'hip_circumference']) assert.equal(m['meas.' + k].id, 'err.measRange', k);
  assert.equal(e({ measMode: 'SHOP', meas: { sleeve_length: '0' } })['meas.sleeve_length'], undefined);
  assert.equal(e({ pieces: '0' }).pieces.id, 'err.pieces');
  assert.equal(e({ pieces: '100' }).pieces.id, 'err.pieces');
  assert.equal(e({ pieces: '' }).pieces.id, 'err.pieces');
  assert.equal(e({ notes: 'n'.repeat(501) }).notes.id, 'err.notesLong');
  assert.equal(e({ notes: 'n'.repeat(500) }).notes, undefined);
  const d = e({ date: '2026-11-20' }).date;
  assert.equal(d.id, 'err.dateEarly');
  assert.deepEqual(d.vars.date, { text: '23/11/2026', ltr: true });
  assert.equal(e({ date: '2026-11-23' }).date, undefined);
  assert.deepEqual(O.FIELD_ORDER.slice(0, 5), ['name', 'phone', 'model', 'insta', 'branch']);
});

test('Instagram link check as the server (private.online_instagram_url)', () => {
  assert.equal(O.instagramUrl('https://www.instagram.com/p/C7def/'), 'https://www.instagram.com/p/C7def/');
  assert.equal(O.instagramUrl('https://instagram.com/reel/AbC_1-2?utm=x#y'), 'https://instagram.com/reel/AbC_1-2');
  assert.equal(O.instagramUrl('HTTPS://WWW.INSTAGRAM.COM/p/C7def'), 'https://www.instagram.com/p/C7def');
  assert.equal(O.instagramUrl('instagram.com/p/x1'), 'https://instagram.com/p/x1');
  assert.equal(O.instagramUrl('http://www.instagram.com/p/x1/'), 'https://www.instagram.com/p/x1/');
  assert.equal(O.instagramUrl('  '), '');
  for (const bad of ['https://www.instagram.com/alnoor.abayas/', 'https://www.instagram.com/reels/x/', 'https://evil.com/instagram.com/p/x',
    'javascript:alert(1)', 'https://www.instagram.com/p/' + 'a'.repeat(200)]) {
    assert.equal(O.instagramUrl(bad), null, bad);
  }
});

// ------------------------------------------------------------------------------------------------
// client_request_id (ADR-0036 amendment 2, item 15)

test('the same id only for a resend of the unchanged form', () => {
  let n = 0;
  const newId = () => `id-${++n}`;
  const fp = (v) => O.fingerprint(O.buildPayload(v, DOC));
  const v = base();
  let last = null;
  const id1 = O.requestIdFor(last, fp(v), newId);
  last = { fp: fp(v), id: id1 };
  assert.equal(O.requestIdFor(last, fp(base()), newId), id1, 'retry of the unchanged form (lost answer, bot check, rate limit)');
  const changed = { ...base(), notes: 'Size L' };
  const id2 = O.requestIdFor(last, fp(changed), newId);
  assert.notEqual(id2, id1, 'notes changed');
  last = { fp: fp(changed), id: id2 };
  assert.notEqual(O.requestIdFor(last, fp(base()), newId), id2, 'changed back: content differs from the last send');
  assert.equal(O.requestIdFor(null, fp(v), newId), 'id-4');

  const link = { ...base(), kind: 'insta', insta: 'https://www.instagram.com/p/C7def/' };
  assert.notEqual(fp(link), fp({ ...link, insta: 'https://www.instagram.com/p/C7xyz/' }), 'another link = new content');
  assert.equal(fp(link), fp({ ...link, insta: ' https://www.instagram.com/p/C7def/?igsh=1 ' }), 'the same link as sent');
  for (const patch of [{ phone: '36001123' }, { cc: '+966', phone: '551234567' }, { kind: 'pick', chosen: 'm3' }, { branchId: DOC.branches[1].id },
    { measMode: 'LAST' }, { pieces: '2' }, { date: '2026-12-01' }, { contact: 'CALL' }, { name: 'Reema' }]) {
    assert.notEqual(fp({ ...base(), ...patch }), fp(base()), JSON.stringify(patch));
  }
});

test('W4: the page language is sent but is not part of the fingerprint', () => {
  const ar = O.buildPayload(base(), DOC);
  const en = O.buildPayload({ ...base(), lang: 'en' }, DOC);
  assert.equal(ar.language, 'ar');
  assert.equal(en.language, 'en', 'still sent');
  assert.equal(O.fingerprint(en), O.fingerprint(ar), 'switching the language before a resend keeps the id');
  const last = { fp: O.fingerprint(ar), id: 'id-1' };
  assert.equal(O.requestIdFor(last, O.fingerprint(en), () => 'id-2'), 'id-1');
  // only the payload's own language field is left out
  assert.notEqual(O.fingerprint({ ...ar, notes: 'x' }), O.fingerprint(ar));
  assert.notEqual(O.fingerprint({ ...ar, measurements: { language: 'x' } }), O.fingerprint({ ...ar, measurements: { language: 'y' } }));
});

// ------------------------------------------------------------------------------------------------
// Review fixes 2026-11-09 (ADR-0036 amendment 2, item 21)

const tick = () => new Promise((r) => setImmediate(r));

test('W1: a Turnstile waiter that timed out never takes a later token; Retry gets it', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const box = O.createTokenBox(30000);
  let first = null;
  box.wait().then((r) => { first = r; });
  t.mock.timers.tick(29999);
  await tick();
  assert.equal(first, null, 'still waiting');
  t.mock.timers.tick(1);
  await tick();
  assert.deepEqual(first, { token: null, timedOut: true });
  assert.equal(box.waiting.length, 0, 'the timed-out waiter is removed');
  box.put('tok-late'); // the widget finishes after the timeout
  assert.equal(box.token, 'tok-late', 'the late token is kept, not taken by the old waiter');
  assert.deepEqual(await box.wait(), { token: 'tok-late', timedOut: false }, 'Retry uses it at once');
  assert.equal(box.token, null, 'single use');

  let second = null;
  box.wait().then((r) => { second = r; });
  box.put('tok-2');
  await tick();
  assert.deepEqual(second, { token: 'tok-2', timedOut: false }, 'a waiter gets the next token');
  t.mock.timers.tick(30000);
  await tick();
  assert.deepEqual(second, { token: 'tok-2', timedOut: false }, 'its timer was cleared');

  let third = null;
  box.wait().then((r) => { third = r; });
  box.flush(); // error-callback
  await tick();
  assert.deepEqual(third, { token: null, timedOut: false }, 'a check error is not a timeout (the widget is reset)');
});

test('W6: the fetch timeout covers reading the body, GET and POST', async () => {
  const calls = [];
  const hanging = (url, opts) => {
    calls.push({ url, opts });
    return Promise.resolve({
      status: 200, ok: true,
      json: () => new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(new Error('aborted')))),
    });
  };
  for (const opts of [{ method: 'GET', cache: 'no-store' }, { method: 'POST', cache: 'no-store', body: '{}' }]) {
    const started = Date.now();
    await assert.rejects(O.fetchJson(hanging, 'https://f.test/fn', opts, 40), /timeout/, opts.method);
    assert.ok(Date.now() - started < 1000, 'rejected by the timer');
    const c = calls.at(-1);
    assert.equal(c.opts.signal.aborted, true, 'the request is aborted');
    assert.equal(c.opts.credentials, 'omit');
    assert.equal(c.opts.cache, 'no-store');
    assert.equal(c.opts.method, opts.method);
  }
  const ok = await O.fetchJson(() => Promise.resolve({ status: 201, ok: true, json: () => Promise.resolve({ a: 1 }) }), 'u', {}, 1000);
  assert.deepEqual(ok, { status: 201, ok: true, body: { a: 1 } });
  const notJson = await O.fetchJson(() => Promise.resolve({ status: 502, ok: false, json: () => Promise.reject(new SyntaxError('x')) }), 'u', {}, 1000);
  assert.deepEqual(notJson, { status: 502, ok: false, body: null });
  await assert.rejects(O.fetchJson(() => Promise.reject(new TypeError('Failed to fetch')), 'u', {}, 1000), TypeError);
  await assert.rejects(O.fetchJson(() => { throw new TypeError('sync'); }, 'u', {}, 1000), TypeError);
});

test('W10: platform 404 and a failing function end on "not available"; framed pages', () => {
  assert.equal(O.docResult(404, { code: 'NOT_FOUND', message: 'Requested function was not found' }), 'na', 'function not deployed');
  assert.equal(O.docResult(404, null), 'na');
  assert.equal(O.docResult(200, { available: false }), 'na');
  assert.equal(O.docResult(200, { available: true }), 'ok');
  assert.equal(O.docResult(200, null), 'error', 'unreadable answer');
  assert.equal(O.docResult(503, { error: 'server_error' }), 'error', '5xx keeps the load error');
  assert.equal(O.loadView('offline', 1, true), 'error', 'first failure: load error with Retry');
  assert.equal(O.loadView('offline', 2, true), 'na', 'again after Retry (CORS refusal, unreachable): not available');
  assert.equal(O.loadView('offline', 2, undefined), 'na');
  assert.equal(O.loadView('offline', 3, false), 'error', 'the browser is offline: keep the load error');
  for (const r of ['ok', 'na', 'error']) assert.equal(O.loadView(r, 5, true), r);
  const self = {};
  self.top = self;
  self.self = self;
  assert.equal(O.isFramed(self), false);
  assert.equal(O.isFramed({ self: {}, top: {} }), true);
  assert.equal(O.isFramed({ self: {}, get top() { throw new Error('cross-origin'); } }), true);
});

test('W8: after a re-fetch the page checks again; one branch left, no models left', () => {
  const form = { kind: 'pick', chosen: 'm1', branchId: DOC.branches[0].id };
  const oneBranch = { ...DOC, branches: [DOC.branches[1]] };
  assert.deepEqual(O.afterRefresh(form, oneBranch), { kind: 'pick', chosen: 'm1', branchId: null, lostModel: false });
  const v1 = { ...base(), branchId: null };
  const branchRefusal = O.outcome(400, { error: 'branch_inactive' });
  assert.deepEqual(O.refusalErrors(branchRefusal, v1, oneBranch, true), {}, 'one branch left: no branch error (the server sets it)');
  assert.deepEqual(O.refusalErrors(branchRefusal, v1, oneBranch, false), {}, 'not even when the re-fetch failed');
  const twoOther = { ...DOC, branches: [DOC.branches[1], { id: '33333333-3333-4333-8333-333333333333', name: 'x', location: null }] };
  assert.equal(O.refusalErrors(branchRefusal, v1, twoOther, true).branch.id, 'err.branchRequired');
  assert.equal(O.refusalErrors(branchRefusal, base(), DOC, false).branch.id, 'err.branchRequired', 're-fetch failed: the server error stays');

  const noModels = { ...DOC, models: [] };
  const kept = O.afterRefresh(form, noModels);
  assert.deepEqual(kept, { kind: 'insta', chosen: null, branchId: form.branchId, lostModel: true }, 'only the link field is left (ADR-0037)');
  const e = O.refusalErrors(O.outcome(400, { error: 'invalid_input' }), { ...base(), kind: kept.kind, chosen: kept.chosen }, noModels, true);
  assert.deepEqual(Object.keys(e), ['insta']);
  assert.equal(e.insta.id, 'err.instagramRequired');
  assert.equal(O.afterRefresh({ kind: 'insta', chosen: null, branchId: null }, DOC).kind, 'insta', 'models back: the typed link stays chosen');
  const gone = O.afterRefresh({ kind: 'pick', chosen: 'm1', branchId: null }, { ...DOC, models: [DOC.models[0]] });
  assert.deepEqual(gone, { kind: 'pick', chosen: null, branchId: null, lostModel: true });
  assert.equal(O.refusalErrors({ kind: 'refresh' }, { ...base(), chosen: null }, DOC, true).model.id, 'err.modelRequired');
  assert.deepEqual(O.refusalErrors({ kind: 'refresh' }, base(), DOC, true), {}, 'nothing left to mark: the page shows send.server');

  const later = { ...DOC, min_desired_date: '2026-11-25' };
  const dateRefusal = O.outcome(400, { error: 'desired_date_too_early' });
  const d = O.refusalErrors(dateRefusal, { ...base(), date: '2026-11-24' }, later, true);
  assert.deepEqual(d.date, { id: 'err.dateEarly', vars: { date: { text: '25/11/2026', ltr: true } } }, 'the new minimum date');
  assert.equal(O.refusalErrors(dateRefusal, { ...base(), date: '2026-11-24' }, DOC, false).date.vars.date.text, '23/11/2026');
  const both = O.refusalErrors(dateRefusal, { ...base(), date: '2026-11-24', phone: '1' }, later, true);
  assert.deepEqual(Object.keys(both), ['phone', 'date'], 'every field error of the page is shown');
});

test('W9: a failing image re-reads the document at most once a minute', () => {
  const allow = O.createThrottle(60000);
  assert.equal(allow(1000), true);
  assert.equal(allow(1001), false, 'several images failing together: one re-fetch');
  assert.equal(allow(60999), false);
  assert.equal(allow(61000), true);
  assert.equal(allow(61001), false);
});

test('BUG-096: the confirmation is the snapshot of what was sent; a re-read never lands during a send', () => {
  // The document the payload was built from (m3 chosen, Manama) ...
  const v = Object.assign(base(), { chosen: 'm3', branchId: '22222222-2222-4222-8222-222222222222' });
  const payload = O.buildPayload(v, DOC);
  const sent = O.confirmSnapshot(v, payload, DOC);
  // ... then a re-read without m3, without Manama and with another shop phone: the snapshot keeps them.
  const later = O.sanitizeDoc({
    available: true, handle: 'alnoor.abayas', shop: { name: 'عبايات النور', phone: '+97317009999' },
    branches: [{ id: '11111111-1111-4111-8111-111111111111', name: 'الرفاع' }],
    models: [{ code: 'm1', name: 'عباية كريب مطرزة' }],
  }, 'https:');
  assert.equal(O.confirmSnapshot(v, payload, later).name, null, 'the later document no longer offers m3');
  assert.deepEqual(sent, {
    kind: 'pick', code: 'm3', name: 'عباية سوداء كلاسيكية', url: null, pieces: 1, price: '25.500' + NBSP + 'BHD', total: null,
    branchName: 'المنامة', customerName: 'Reem', lang: 'ar', shopPhone: '+97317001100',
  });
  assert.equal(O.whatsappText(STRINGS, sent.lang, { kind: 'model', code: sent.code, name: sent.name, customerName: sent.customerName }),
    O.fillText(STRINGS.ar['wa.model'], { code: 'm3', name: 'عباية سوداء كلاسيكية', customerName: 'Reem' }));
  // One branch: its name without a branch_id; an Instagram link: no model.
  const one = Object.assign({}, DOC, { branches: [DOC.branches[0]] });
  const link = Object.assign(base(), { kind: 'insta', insta: 'https://www.instagram.com/reel/C9xyz/' });
  const snap = O.confirmSnapshot(link, O.buildPayload(link, one), one);
  assert.equal(snap.branchName, 'الرفاع');
  assert.equal(snap.kind, 'insta');
  assert.equal(snap.url, 'https://www.instagram.com/reel/C9xyz/');
  assert.equal(snap.code, null);
  assert.equal(snap.name, null);
  // The model line never throws on an empty item (the page threw `null.text`); nothing left keeps the
  // placeholder.
  const parts = O.fillParts('الموديل: {model}', { model: [{ text: 'm3', ltr: true }, null] });
  assert.deepEqual(parts, [{ text: 'الموديل: ' }, { text: 'm3', isVar: true, ltr: true }]);
  assert.deepEqual(O.fillParts('{model}', { model: [{ text: null, ltr: true }, null] }), [{ text: '{model}' }]);
  // A re-read applies only with no send running, none received and none begun since it started.
  assert.equal(O.rereadApplies({ sending: false, confirm: null, sends: 2 }, 2), true);
  assert.equal(O.rereadApplies({ sending: true, confirm: null, sends: 3 }, 3), false, 'a send runs');
  assert.equal(O.rereadApplies({ sending: false, confirm: sent, sends: 3 }, 3), false, 'received');
  assert.equal(O.rereadApplies({ sending: false, confirm: null, sends: 3 }, 2), false, 'a send began and ended meanwhile');
});

test('uuid v4 with and without crypto.randomUUID', () => {
  const re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  assert.match(O.uuidv4(globalThis.crypto), re);
  const fallback = O.uuidv4({ getRandomValues: (b) => globalThis.crypto.getRandomValues(b) });
  assert.match(fallback, re);
});

// ------------------------------------------------------------------------------------------------
// Error codes (README `online-order`)

test('answers mapped to the page states', () => {
  const id = '7c1d2e3f-4a5b-4c6d-8e7f-901234567890';
  assert.deepEqual(O.outcome(201, { request_id: id, replayed: false }), { kind: 'ok', requestId: id, replayed: false });
  assert.deepEqual(O.outcome(201, { request_id: id, replayed: true }), { kind: 'ok', requestId: id, replayed: true }, 'replay = confirmation');
  assert.equal(O.outcome(201, { request_id: 'x' }).alert, 'send.server');
  assert.deepEqual(O.outcome(404, { error: 'page_not_available' }), { kind: 'na' });
  assert.equal(O.outcome(404, { code: 'NOT_FOUND' }).alert, 'send.server', 'function not deployed');
  assert.deepEqual(O.outcome(403, { error: 'bot_check_failed' }), { kind: 'alert', alert: 'send.botFailed', retry: true });
  assert.deepEqual(O.outcome(429, { error: 'limit_phone_open' }), { kind: 'alert', alert: 'send.openLimit', tone: 'sand', wa: true });
  for (const c of ['limit_network', 'limit_shop']) {
    assert.deepEqual(O.outcome(429, { error: c }), { kind: 'alert', alert: 'send.rateLimit', retry: true }, c);
  }
  assert.deepEqual(O.outcome(400, { error: 'invalid_phone' }), { kind: 'field', field: 'phone', error: 'err.phoneInvalid' });
  for (const c of ['branch_required', 'branch_inactive']) {
    assert.deepEqual(O.outcome(400, { error: c }), { kind: 'field', field: 'branch', error: 'err.branchRequired', refresh: true }, c);
  }
  assert.deepEqual(O.outcome(400, { error: 'desired_date_too_early' }), { kind: 'field', field: 'date', error: 'err.dateEarly', refresh: true });
  assert.deepEqual(O.outcome(400, { error: 'instagram_url_invalid' }), { kind: 'field', field: 'insta', error: 'err.instagramInvalid' });
  for (const c of ['measurements_input_invalid', 'unknown_measurement_field']) {
    assert.deepEqual(O.outcome(400, { error: c }), { kind: 'field', field: 'meas', error: null }, c);
  }
  assert.deepEqual(O.outcome(400, { error: 'invalid_input' }), { kind: 'refresh' });
  for (const [s, b] of [[400, { error: 'photo_invalid' }], [413, { error: 'payload_too_large' }], [503, { error: 'not_configured' }],
    [500, { error: 'server_error' }], [401, { msg: 'jwt' }], [502, null], [400, null], [405, { error: 'method_not_allowed' }]]) {
    assert.deepEqual(O.outcome(s, b), { kind: 'alert', alert: 'send.server', retry: true }, `${s} ${JSON.stringify(b)}`);
  }
});

// ------------------------------------------------------------------------------------------------
// Texts, formats, WhatsApp

test('amounts and dates', () => {
  assert.equal(O.formatAmount(35, 3, 'BHD'), '35.000' + NBSP + 'BHD');
  assert.equal(O.formatAmount('25.5', 3, 'BHD'), '25.500' + NBSP + 'BHD');
  assert.equal(O.formatAmount(120, 2, 'SAR'), '120.00' + NBSP + 'SAR');
  assert.equal(O.formatAmount(null, 3, 'BHD'), null);
  assert.equal(O.formatDate('2026-11-23'), '23/11/2026');
  assert.equal(O.formatDate('23/11/2026'), '');
});

test('TICKET-051: exact model price in its currency and decimals, never "From"', () => {
  // DOC models as sanitized from the public document (from_price keeps its name, ADR-0037 section 2).
  assert.equal(O.modelPrice(DOC.models[0]), '25.500' + NBSP + 'BHD', 'BHD: 3 decimals');
  assert.equal(O.modelPrice(DOC.models[1]), '35.000' + NBSP + 'BHD');
  const sar = O.sanitizeDoc({ models: [{ code: 'k1', name: 'n', from_price: '30.5', from_price_currency: 'SAR', minor_units: 2 }] }, 'https:');
  assert.equal(O.modelPrice(sar.models[0]), '30.50' + NBSP + 'SAR', 'SAR: 2 decimals (copy deck example)');
  for (const p of [null, undefined, '', 0, '0', -5, 'abc']) {
    const m = O.sanitizeDoc({ models: [{ code: 'k', name: 'n', from_price: p, from_price_currency: 'BHD', minor_units: 3 }] }, 'https:').models[0];
    assert.equal(O.modelPrice(m), null, `no price line for ${JSON.stringify(p)} (possible only before batch 11)`);
  }
  // The label: "السعر: 25.500 BHD" / "Price: 25.500 BHD", the amount with its code in one LTR isolate.
  assert.equal(STRINGS.ar['model.price'], 'السعر: {amount}');
  assert.equal(STRINGS.en['model.price'], 'Price: {amount}');
  const amount = { text: O.modelPrice(DOC.models[0]), ltr: true };
  assert.deepEqual(O.fillParts(STRINGS.ar['model.price'], { amount }), [{ text: 'السعر: ' }, { text: '25.500' + NBSP + 'BHD', isVar: true, ltr: true }]);
  assert.equal(O.fillText(STRINGS.en['model.price'], { amount }), 'Price: 25.500' + NBSP + 'BHD');
  const src = read('assets/js/order.js');
  assert.match(src, /frag\('model\.price', \{ amount: ltr\(amount\) \}, 'o-amt'\)/, 'the page writes model.price with an LTR, prominent amount');
  assert.match(src, /const amount = modelPrice\(m\);/, 'the price line uses modelPrice');
  for (const lang of ['ar', 'en']) {
    for (const [id, v] of Object.entries(STRINGS[lang])) {
      assert.doesNotMatch(v, /يبدأ من|\bFrom \{amount\}|\bfrom \{amount\}/, `${lang} ${id}: no "From" price`);
    }
  }
  assert.doesNotMatch(src, /model\.from/);
});

test('TICKET-051: a shop without listed models has the Instagram link field alone (S-29b.15/16)', () => {
  const noModels = { ...DOC, models: [] };
  const e = (patch) => O.validate({ ...base(), kind: 'insta', chosen: null, ...patch }, noModels);
  assert.equal(O.modelKind({ kind: 'pick' }, noModels), 'insta', 'nothing to choose between: always the link');
  assert.equal(O.modelKind({ kind: null }, noModels), 'insta');
  assert.equal(O.modelKind({ kind: 'photos' }, DOC), null);
  assert.equal(O.modelKind({ kind: 'pick' }, DOC), 'pick');
  const empty = e({ insta: '  ' });
  assert.deepEqual(Object.keys(empty), ['insta'], 'the error under the field, no choice error');
  assert.equal(empty.insta.id, 'err.instagramRequired');
  assert.equal(e({ kind: 'pick', insta: '' }).insta.id, 'err.instagramRequired', 'a stale pick still means the link field');
  assert.equal(e({ insta: 'https://www.tiktok.com/@x/video/1' }).insta.id, 'err.instagramInvalid', 'S-29b.4 rule kept');
  assert.deepEqual(e({ insta: 'https://www.instagram.com/reel/C9xyz/' }), {});
  const p = O.buildPayload({ ...base(), kind: 'pick', chosen: 'm1', insta: 'https://www.instagram.com/reel/C9xyz/' }, noModels);
  assert.equal(p.instagram_url, 'https://www.instagram.com/reel/C9xyz/');
  assert.equal('model_code' in p, false);
  assert.equal('photos' in p, false);
  // The built page: no radio is shown by default for the link field's row ids the script hides.
  const page = read('o/index.html');
  assert.match(page, /<label class="o-rc" id="f-kind-pick-row">/);
  assert.match(page, /<label class="o-rc" id="f-kind-insta-row">/);
  assert.match(page, /id="f-insta-help" data-s="form.instagramHelp"/);
  assert.match(page, /aria-describedby="f-insta-help f-insta-err"/);
  const src = read('assets/js/order.js');
  assert.match(src, /\$\('f-kind-pick-row'\)\.hidden = !has;\s+\$\('f-kind-insta-row'\)\.hidden = !has;/, 'both radio rows hidden without models');
  assert.match(src, /kind: d\.models\.length > 0 \? 'pick' : 'insta'/, 'a new form without models starts on the link');
});

test('TICKET-051: no customer photos anywhere on the page', () => {
  const page = read('o/index.html');
  const src = read('assets/js/order.js');
  assert.doesNotMatch(page, /type="file"/, 'no file input');
  assert.doesNotMatch(page, /f-photo|f-tiles|o-tile|value="photos"|ic-close/);
  assert.doesNotMatch(src, /'photos'|\.photos\b|data_base64|createImageBitmap|toBlob|FileReader|createObjectURL/);
  assert.doesNotMatch(read('assets/css/order.css'), /o-tile/);
  assert.doesNotMatch(page, /img-src[^;]*blob:/, 'no blob: images in the CSP (only the photo previews used them)');
  for (const id of REMOVED_IDS) {
    assert.equal(id in STRINGS.ar || id in STRINGS.en, false, `strings: ${id} removed`);
    assert.equal(src.includes(`'${id}'`) || page.includes(`"${id}"`), false, `page: ${id} unused`);
  }
  // No text asks for her photos (model.photoAlt is the alt of the shop's own model photos; «الصورة» in
  // meas.enterHelp is the abaya picture).
  const photoWords = { ar: /صوري|صورك|صور العباية|إضافة صورة/, en: /photo/i };
  for (const lang of ['ar', 'en']) {
    for (const [id, v] of Object.entries(STRINGS[lang])) {
      if (id !== 'model.photoAlt') assert.doesNotMatch(v, photoWords[lang], `${lang} ${id} mentions photos`);
    }
  }
});

test('TICKET-051: strings equal the web copy deck (ids, Arabic, English)', { skip: NO_DECK }, () => {
  const rows = {};
  for (const line of DECK.split('\n')) {
    const m = /^\| `([a-zA-Z]+\.[A-Za-z0-9.]+)` \| (.*?) \| (.*?) \| .*\|$/.exec(line);
    if (m) rows[m[1]] = { ar: m[2], en: m[3] };
  }
  assert.deepEqual(Object.keys(rows).sort(), Object.keys(STRINGS.ar).sort(), 'the same ids as the deck');
  assert.deepEqual(Object.keys(STRINGS.en).sort(), Object.keys(STRINGS.ar).sort());
  for (const [id, r] of Object.entries(rows)) {
    assert.equal(STRINGS.ar[id], r.ar, `ar ${id}`);
    assert.equal(STRINGS.en[id], r.en, `en ${id}`);
  }
  for (const id of ['model.price', 'form.instagramHelp', 'err.instagramRequired', 'shop.modelsIntro', 'shop.noModels',
    'form.modelInstagram', 'err.modelRequired'].concat(T55_IDS)) {
    assert.ok(rows[id], `deck has ${id}`);
  }
  for (const id of REMOVED_IDS.concat(T55_REMOVED)) assert.equal(id in rows, false, `deck no longer has ${id}`);
});

test('placeholders become isolated parts; names stay plain text', () => {
  assert.deepEqual(O.fillParts('{a} x {b}', { a: { text: '1', ltr: true }, b: '<b>n</b>' }), [
    { text: '1', isVar: true, ltr: true }, { text: ' x ' }, { text: '<b>n</b>', isVar: true, ltr: false }]);
  assert.deepEqual(O.fillParts('M: {model}', { model: [{ text: 'm1', ltr: true }, 'Name'] }).map((p) => p.text), ['M: ', 'm1', ' ', 'Name']);
  assert.equal(O.fillText('{missing}', {}), '{missing}');
});

test('WhatsApp messages equal the copy file examples', () => {
  const t1 = O.whatsappText(STRINGS, 'ar', { kind: 'model', code: 'm1', name: 'عباية كريب مطرزة', customerName: 'Reem' });
  const l1 = O.whatsappLink('+97317001100', t1);
  assert.equal(l1.startsWith('https://wa.me/97317001100?text=%D9%85%D8%B1%D8%AD'), true);
  assert.equal(encodeURIComponent(t1).length, 416, 'copy example 1: encoded text 416 characters');
  const t4 = O.whatsappText(STRINGS, 'en', { kind: 'insta', url: 'https://www.instagram.com/p/C7def/', customerName: 'Dana' });
  assert.equal(O.whatsappLink('+97317001100', t4),
    'https://wa.me/97317001100?text=Hello%2C%20I%20sent%20a%20request%20from%20your%20Darjina%20page%20for%20this%20post%3A%20https%3A%2F%2Fwww.instagram.com%2Fp%2FC7def%2F%20Name%3A%20Dana.');
  assert.equal(encodeURIComponent(O.whatsappText(STRINGS, 'en', { kind: 'model', code: 'm1', name: 'عباية كريب مطرزة', customerName: 'Reem' })).length, 201);
  // Example 3 (ADR-0037): an Instagram link in Arabic, no photos message any more.
  const t3 = O.whatsappText(STRINGS, 'ar', { kind: 'insta', url: 'https://www.instagram.com/reel/C9xyz/', customerName: 'Salwa' });
  assert.equal(t3, 'مرحباً، أرسلت طلباً من صفحتكم على دارجينا لهذا المنشور: https://www.instagram.com/reel/C9xyz/ الاسم: Salwa.');
  assert.equal(encodeURIComponent(t3).length, 400, 'copy example 3: encoded text 400 characters');
  assert.equal(O.whatsappLink(null, 'x'), null);
  assert.equal(O.whatsappLink('+97317001100', null), 'https://wa.me/97317001100');
});

test('TICKET-051/055: the six WhatsApp links equal the copy deck examples', { skip: NO_DECK }, () => {
  const links = [...DECK.matchAll(/^(https:\/\/wa\.me\/\S+)$/gm)].map((m) => m[1]);
  assert.equal(links.length, 6);
  // Examples 5 and 6 (TICKET-055): m3 × 2, from the confirmation snapshot as the page builds it.
  const v = { ...base(), name: 'Hind', chosen: 'm3', pieces: '2' };
  const snap = (lang) => O.confirmSnapshot(v, O.buildPayload({ ...v, lang }, DOC), DOC);
  const made = [
    O.whatsappText(STRINGS, 'ar', { kind: 'model', code: 'm1', name: 'عباية كريب مطرزة', customerName: 'Reem' }),
    O.whatsappText(STRINGS, 'en', { kind: 'model', code: 'm1', name: 'عباية كريب مطرزة', customerName: 'Reem' }),
    O.whatsappText(STRINGS, 'ar', { kind: 'insta', url: 'https://www.instagram.com/reel/C9xyz/', customerName: 'Salwa' }),
    O.whatsappText(STRINGS, 'en', { kind: 'insta', url: 'https://www.instagram.com/p/C7def/', customerName: 'Dana' }),
    ...['ar', 'en'].map((lang) => {
      const c = snap(lang);
      return O.whatsappText(STRINGS, c.lang, { kind: 'model', code: c.code, name: c.name, pieces: c.pieces, total: c.total, customerName: c.customerName });
    }),
  ].map((m) => O.whatsappLink('+97317001100', m));
  assert.deepEqual(made, links);
});

test('every text id the page uses exists in Arabic and English', () => {
  const ids = new Set();
  const src = read('assets/js/order.js');
  for (const m of src.matchAll(/\b(?:t|frag)\('([a-z]+\.[A-Za-z0-9.]+)'/g)) ids.add(m[1]);
  for (const m of src.matchAll(/'((?:err|send|meas|form|model|confirm|wa|page|common|shop)\.[A-Za-z0-9]+)'/g)) ids.add(m[1]);
  const page = read('o/index.html');
  for (const m of page.matchAll(/data-s="([\w.]+)"/g)) ids.add(m[1]);
  for (const m of page.matchAll(/data-s-attr="([^"]+)"/g)) for (const pair of m[1].split(';')) ids.add(pair.split('=')[1]);
  assert.ok(ids.size > 90, `ids found: ${ids.size}`);
  for (const id of ids) {
    assert.equal(typeof STRINGS.ar[id], 'string', `ar ${id}`);
    assert.equal(typeof STRINGS.en[id], 'string', `en ${id}`);
  }
  for (const k of O.MEAS_KEYS.keys()) assert.ok(page.includes(`data-s="meas.p${k + 1}"`));
});

// ------------------------------------------------------------------------------------------------
// TICKET-055 (ADR-0038 sections 1, 4, 5; BR-120, BR-122, BR-125)

/** The S1 document of 11/11/2026 (wireframe S-29a.8): m4 1 left, m3 3 left, m1 unlimited. */
const raw55 = (models, extra = {}) => ({
  available: true, handle: 'alnoor.abayas', shop: { name: 'عبايات النور', phone: '+97317001100' },
  phone_country_code: '+973', branches: [{ id: '11111111-1111-4111-8111-111111111111', name: 'الرفاع' }], models, ...extra,
});
const M4 = { code: 'm4', name: 'عباية مخمل شتوية', from_price: 40, from_price_currency: 'BHD', minor_units: 3, available_pieces: 1, photo_urls: [] };
const M3 = { code: 'm3', name: 'عباية سوداء كلاسيكية', from_price: 25.5, from_price_currency: 'BHD', minor_units: 3, available_pieces: 3, photo_urls: [] };
const M1 = { code: 'm1', name: 'عباية كريب مطرزة', from_price: 35, from_price_currency: 'BHD', minor_units: 3, available_pieces: null, photo_urls: [] };
const S1 = O.sanitizeDoc(raw55([M4, M3, M1]), 'https:');
const S1m = (code) => S1.models.find((m) => m.code === code);

test('TICKET-055 T1: available_pieces from the page answer; batch 11 answers (no key) are unlimited', () => {
  assert.deepEqual(S1.models.map((m) => m.available_pieces), [1, 3, null]);
  const odd = O.sanitizeDoc(raw55([
    { ...M1, code: 'a', available_pieces: 150 }, { ...M1, code: 'b', available_pieces: '3' }, { ...M1, code: 'c', available_pieces: -1 },
    { ...M1, code: 'd', available_pieces: 2.5 }, { ...M1, code: 'e', available_pieces: 0 }, { ...M1, code: 'f' },
  ]), 'https:');
  assert.deepEqual(odd.models.map((m) => [m.code, m.available_pieces]), [['a', 99], ['b', null], ['c', null], ['d', null], ['f', null]],
    'clamped to 99; anything but an integer >= 0 is unlimited; a sold-out entry is never offered');
  // The live batch 11 function: no available_pieces anywhere -> no cap, no «only N left», no stock note.
  const b11 = O.sanitizeDoc(raw55([{ code: 'm3', name: 'n', from_price: 25.5, from_price_currency: 'BHD', minor_units: 3, photo_urls: [] }],
    { model: { code: 'm3' } }), 'https:');
  assert.equal(b11.models[0].available_pieces, null);
  assert.equal(O.pieceCap(b11.models[0]), 99);
  assert.equal(O.stockLeft(b11.models[0]), null);
  assert.equal(O.piecesHelp(b11.models[0], 99), null);
  assert.deepEqual(O.validate({ ...base(), chosen: 'm3', branchId: null, pieces: '99' }, b11), {});
  assert.equal(b11.model, 'm3');
  assert.equal(b11.model_unavailable, false);
});

test('TICKET-055 T2: the pieces cap is min(99, available); «only N left» for 1 to 5 only', () => {
  const cap = (n) => O.pieceCap({ available_pieces: n });
  assert.deepEqual([cap(1), cap(3), cap(98), cap(99), cap(null)], [1, 3, 98, 99, 99], 'US-ONL-024 picker outline');
  assert.equal(O.pieceCap(O.sanitizeDoc(raw55([{ ...M1, available_pieces: 150 }]), 'https:').models[0]), 99, 'a model with 150 available');
  assert.equal(O.pieceCap(null), 99, 'an Instagram link or no model');
  const left = (n) => O.stockLeft({ available_pieces: n });
  assert.deepEqual(left(1), { id: 'model.left1' });
  assert.deepEqual(left(2), { id: 'model.left2' });
  for (const n of [3, 4, 5]) assert.deepEqual(left(n), { id: 'model.leftFew', vars: { count: { text: String(n), ltr: true } } });
  for (const n of [6, 50, 99, null, 0]) assert.equal(left(n), null, String(n));
  assert.equal(O.fillText(STRINGS.ar['model.leftFew'], left(3).vars), 'بقيت 3 قطع فقط');
  assert.equal(O.fillText(STRINGS.en['model.leftFew'], left(3).vars), 'Only 3 left');
  assert.equal(STRINGS.ar['model.left1'], 'بقيت قطعة واحدة فقط');
});

test('TICKET-055 T3: the line under the stepper: only N left from the start, the cap once reached (6..98)', () => {
  assert.deepEqual(O.piecesHelp(S1m('m4'), 1), { id: 'model.left1' }, 'S-29b.18');
  assert.equal(O.piecesHelp(S1m('m3'), 1).id, 'model.leftFew', 'S-29b.17: from the start');
  const m8 = { available_pieces: 8 };
  assert.equal(O.piecesHelp(m8, 7), null, 'S-29b.19: not before the cap');
  assert.deepEqual(O.piecesHelp(m8, 8), { id: 'form.piecesCap', vars: { count: { text: '8', ltr: true } } });
  assert.equal(O.piecesHelp({ available_pieces: 6 }, 6).id, 'form.piecesCap', '6 available: the stepper stops and says so');
  assert.equal(O.piecesHelp({ available_pieces: 99 }, 99), null, '99 or more: as unlimited');
  assert.equal(O.piecesHelp(S1m('m1'), 99), null, 'unlimited: nothing');
  assert.equal(O.fillText(STRINGS.ar['form.piecesCap'], O.piecesHelp(m8, 8).vars), 'أقصى عدد متاح من هذا الموديل: 8');
});

test('TICKET-055 T4: totals in integer minor units (BHD 3, SAR 2), no floating-point drift', () => {
  const m3 = S1m('m3');
  assert.equal(O.modelPrice(m3, 2), '51.000' + NBSP + 'BHD', 'US-ONL-021: 25.500 × 2');
  assert.equal(O.modelPrice(m3, 3), '76.500' + NBSP + 'BHD');
  assert.equal(O.modelPrice({ ...m3, available_pieces: 8 }, 8), '204.000' + NBSP + 'BHD', 'S-29b.19');
  const sar = O.sanitizeDoc(raw55([{ code: 's1', name: 'n', from_price: '30.50', from_price_currency: 'SAR', minor_units: 2 }]), 'https:').models[0];
  assert.equal(O.modelPrice(sar, 3), '91.50' + NBSP + 'SAR', 'US-ONL-021: S2 30.50 SAR × 3');
  // A price with more decimals than its currency: one half-up rounding of the exact product.
  assert.equal((2.675 * 3).toFixed(2), '8.02', 'floating point drifts here (8.024999...)');
  assert.equal(O.formatAmount(2.675, 2, 'SAR', 3), '8.03' + NBSP + 'SAR');
  assert.equal(O.formatAmount(30.505, 2, 'SAR', 3), '91.52' + NBSP + 'SAR');
  assert.equal(O.formatAmount('30.505', 2, 'SAR'), '30.51' + NBSP + 'SAR', '(30.505).toFixed(2) is 30.50');
  assert.equal(O.formatAmount(0.1, 3, 'BHD', 3), '0.300' + NBSP + 'BHD');
  assert.equal(O.formatAmount('999999999.999', 3, 'BHD', 99), '98999999999.901' + NBSP + 'BHD', 'numeric(12,3) × 99 exact');
  assert.equal(O.formatAmount(1, 0, 'JPY', 2), '2' + NBSP + 'JPY');
  assert.equal(O.formatAmount(7, 2), '7.00');
  for (const bad of ['abc', '1.2.3', NaN, Infinity, '', null, undefined, 0, -1, '-2.5']) assert.equal(O.formatAmount(bad, 3, 'BHD'), null, String(bad));
  assert.equal(O.formatAmount(1, 3, 'BHD', 1.5), null);
  // The total line: 2 or more pieces of a priced model, up to the cap.
  assert.deepEqual(O.orderTotal(m3, 2), { total: '51.000' + NBSP + 'BHD', amount: '25.500' + NBSP + 'BHD', pieces: 2 });
  assert.equal(O.orderTotal(m3, 1), null, 'one piece: the price is the amount');
  assert.equal(O.orderTotal(m3, 4), null, 'above the cap: no total for a number she cannot send');
  assert.equal(O.orderTotal(null, 2), null, 'Instagram link or no model');
  assert.equal(O.orderTotal({ ...m3, from_price: null }, 2), null, 'no price, no total');
  assert.equal(O.orderTotal(m3, NaN), null);
  const calc = O.orderTotal(m3, 2);
  assert.equal(O.fillText(STRINGS.ar['form.total'], { total: calc.total }), 'الإجمالي: 51.000' + NBSP + 'BHD');
  assert.equal(O.fillText(STRINGS.en['form.total'], { total: calc.total }), 'Total: 51.000' + NBSP + 'BHD', 'US-ONL-021 English');
  assert.equal(O.fillText(STRINGS.en['form.totalCalc'], { amount: calc.amount, pieces: '2' }), '25.500' + NBSP + 'BHD × 2');
});

test('TICKET-055 T5: the page never sends more pieces than the chosen model has left', () => {
  const v = (patch) => ({ ...base(), branchId: null, ...patch });
  assert.deepEqual(O.validate(v({ chosen: 'm3', pieces: '3' }), S1), {});
  assert.deepEqual(O.validate(v({ chosen: 'm3', pieces: '4' }), S1).pieces, { id: 'form.piecesCap', vars: { count: { text: '3', ltr: true } } });
  assert.equal(O.validate(v({ chosen: 'm4', pieces: '2' }), S1).pieces.id, 'form.piecesCap');
  assert.deepEqual(O.validate(v({ chosen: 'm1', pieces: '99' }), S1), {}, 'unlimited: 1 to 99');
  assert.deepEqual(O.validate(v({ kind: 'insta', chosen: 'm4', insta: 'https://www.instagram.com/p/C7def/', pieces: '50' }), S1), {},
    'a link takes no stock');
  assert.equal(O.validate(v({ chosen: 'm1', pieces: '100' }), S1).pieces.id, 'err.pieces', '1..99 rule unchanged');
  assert.equal(O.chosenModel({ kind: 'pick', chosen: 'm3' }, S1).code, 'm3');
  assert.equal(O.chosenModel({ kind: 'insta', chosen: 'm3' }, S1), null);
  assert.equal(O.chosenModel({ kind: 'pick', chosen: 'zz' }, S1), null);
});

test('TICKET-055 T6: 409 stock_insufficient mapped; the batch 11 function keeps its generic error', () => {
  assert.deepEqual(O.outcome(409, { error: 'stock_insufficient', available: 3 }), { kind: 'stock', available: 3 });
  assert.deepEqual(O.outcome(409, { error: 'stock_insufficient', available: 0 }), { kind: 'stock', available: 0 });
  assert.deepEqual(O.outcome(409, { error: 'stock_insufficient', available: 150 }), { kind: 'stock', available: 99 });
  for (const a of [undefined, null, '3', -1, 2.5]) {
    const body = { error: 'stock_insufficient' };
    if (a !== undefined) body.available = a;
    assert.deepEqual(O.outcome(409, body), { kind: 'stock', available: null }, `available ${JSON.stringify(a)}: re-read`);
  }
  for (const [s, b] of [[500, { error: 'server_error' }], [409, { error: 'other' }], [409, null], [400, { error: 'stock_insufficient', available: 3 }]]) {
    assert.deepEqual(O.outcome(s, b), { kind: 'alert', alert: 'send.server', retry: true }, `${s} ${JSON.stringify(b)}`);
  }
});

test('TICKET-055 T7: a stock refusal lowers and caps the pieces, or removes a sold-out model', () => {
  // S-29b.20: hint 3 for 4 pieces.
  const short = O.stockRefusal(S1, 'm3', 4, 3);
  assert.equal(short.action, 'short');
  assert.equal(short.count, 3);
  const m3 = short.doc.models.find((m) => m.code === 'm3');
  assert.equal(O.pieceCap(m3), 3, 'capped there');
  assert.equal(O.orderTotal(m3, 3).total, '76.500' + NBSP + 'BHD', 'total recomputed');
  assert.equal(S1m('m3').available_pieces, 3, 'the page document itself is not changed');
  assert.equal(O.fillText(STRINGS.ar['send.stockShort'], { count: '3' }),
    'بقي من هذا الموديل 3 فقط، فعدّلنا عدد القطع إلى 3. راجعي الإجمالي ثم أرسلي الطلب مرة أخرى.');
  const short2 = O.stockRefusal(S1, 'm1', 8, 5);
  assert.equal(O.pieceCap(short2.doc.models.find((m) => m.code === 'm1')), 5, 'an unlimited model that became limited');
  // S-29b.21: hint 0 -> sold out, the model leaves the grid, the others stay.
  const out = O.stockRefusal(S1, 'm4', 1, 0);
  assert.equal(out.action, 'soldOut');
  assert.equal(out.noModels, false);
  assert.deepEqual(out.doc.models.map((m) => m.code), ['m3', 'm1']);
  assert.deepEqual(S1.models.map((m) => m.code), ['m4', 'm3', 'm1']);
  const only = O.sanitizeDoc(raw55([M4]), 'https:');
  const last = O.stockRefusal(only, 'm4', 1, 0);
  assert.deepEqual([last.action, last.noModels, last.doc.models.length], ['soldOut', true, 0], 'no other model left');
  assert.deepEqual(O.goneTexts(last.doc), { body: 'gone.bodyNoModels', sent: 'send.soldOutNoModels' });
  assert.equal(O.modelKind({ kind: 'pick' }, last.doc), 'insta', 'the Instagram field alone');
  // No count in the answer: the re-read document decides (a missing model is sold out).
  const reread = O.sanitizeDoc(raw55([{ ...M3, available_pieces: 2 }, M1]), 'https:');
  assert.deepEqual([O.stockRefusal(reread, 'm3', 3, null).action, O.stockRefusal(reread, 'm3', 3, null).count], ['short', 2]);
  assert.equal(O.stockRefusal(reread, 'm4', 1, null).action, 'soldOut', 'm4 gone from the list');
  assert.equal(O.stockRefusal(reread, 'm1', 9, null).action, 'retry', 'unlimited again: nothing to lower');
  assert.equal(O.stockRefusal(reread, 'm3', 2, null).action, 'retry', 'the pieces fit again');
  assert.equal(O.stockRefusal(S1, null, 2, 0).action, 'retry', 'no model chosen');
});

test('TICKET-055 T8: after a stock refusal the next send has a new id; a lost answer still replays', () => {
  let n = 0;
  const newId = () => `id-${++n}`;
  const fp = O.fingerprint(O.buildPayload({ ...base(), branchId: null, chosen: 'm3', pieces: '2' }, S1));
  const run = (o) => {
    let last = { fp, id: O.requestIdFor(null, fp, newId) }; // the first send
    if (!O.keepsRequestId(o)) last = null; // as send() does with the answer
    return [last ? last.id : null, O.requestIdFor(last, fp, newId)]; // the next send of the unchanged form
  };
  const [first, next] = run({ kind: 'stock', available: 5 });
  assert.equal(first, null);
  assert.notEqual(next, 'id-1', 'nothing was stored: a new request, never a replay of nothing');
  for (const o of [O.outcome(503, null), { kind: 'alert', alert: 'send.offline', retry: true }, O.outcome(403, { error: 'bot_check_failed' }),
    O.outcome(429, { error: 'limit_network' }), O.outcome(201, { request_id: '7c1d2e3f-4a5b-4c6d-8e7f-901234567890' })]) {
    const [id, again] = run(o);
    assert.equal(again, id, `${o.kind} ${o.alert || ''}: the unchanged form resends the same id (replay)`);
  }
  // The lowered pieces change the content anyway (S-29b.20).
  const lowered = O.fingerprint(O.buildPayload({ ...base(), branchId: null, chosen: 'm3', pieces: '1' }, S1));
  assert.notEqual(lowered, fp);
  const src = read('assets/js/order.js');
  assert.match(src, /const o = outcome\(res\.status, res\.body\);\s+if \(!keepsRequestId\(o\)\) st\.last = null;/, 'send() applies the rule');
});

test('TICKET-055 T9: a model link that cannot be ordered gets the friendly note and the other models', () => {
  // Sold out, INACTIVE, no price and unknown all answer the same: model null, model_unavailable true.
  const gone = O.sanitizeDoc(raw55([M4, M3, M1], { model: null, model_unavailable: true }), 'https:');
  assert.equal(gone.model, null, 'no preselected model');
  assert.equal(gone.model_unavailable, true);
  assert.deepEqual(gone.models.map((m) => m.code), ['m4', 'm3', 'm1']);
  assert.deepEqual(O.goneTexts(gone), { body: 'gone.body', sent: 'send.soldOut' }, 'S-29a.5');
  const none = O.sanitizeDoc(raw55([], { model: null, model_unavailable: true }), 'https:');
  assert.deepEqual(O.goneTexts(none), { body: 'gone.bodyNoModels', sent: 'send.soldOutNoModels' }, 'S-29a.7');
  // A listed entry at 0 (never sent by the server) is still not offered, and its link gets the note.
  const zero = O.sanitizeDoc(raw55([{ ...M4, available_pieces: 0 }, M1], { model: { ...M4, available_pieces: 0 }, model_unavailable: false }), 'https:');
  assert.deepEqual([zero.model, zero.model_unavailable], [null, true]);
  // Back in stock (US-ONL-027): the link preselects it.
  assert.equal(O.sanitizeDoc(raw55([{ ...M4, available_pieces: 2 }], { model: { code: 'm4' } }), 'https:').model, 'm4');
  assert.equal(STRINGS.ar['gone.title'], 'نفد هذا الموديل بسرعة كبيرة!');
  assert.equal(STRINGS.en['gone.title'], 'This model sold out so fast!');
  const page = read('o/index.html');
  assert.match(page, /<h2 id="o-gone-title" tabindex="-1" data-s="gone.title">نفد هذا الموديل بسرعة كبيرة!<\/h2><p id="o-gone-body"><\/p>/);
  assert.doesNotMatch(page, /model\.unavailable/);
  const src = read('assets/js/order.js');
  assert.match(src, /\$\('o-gone-body'\)\.textContent = t\(goneTexts\(st\.doc\)\.body\);/);
  assert.match(src, /else if \(st\.note\) \$\('o-gone-title'\)\.focus/, 'focus moves to the note');
  assert.match(src, /if \(st\.note && !st\.doc\.models\.length\) \$\('o-models'\)\.hidden = true;/, 'S-29a.7: no empty models section');
});

test('TICKET-055 T10: the confirmation and the WhatsApp text carry the pieces and the total', () => {
  const v = { ...base(), name: 'Hind', branchId: null, chosen: 'm3' };
  const snap = (pieces) => O.confirmSnapshot({ ...v, pieces }, O.buildPayload({ ...v, pieces }, S1), S1);
  const two = snap('2');
  assert.deepEqual([two.pieces, two.price, two.total], [2, null, '51.000' + NBSP + 'BHD'], 'S-29c.4');
  const one = snap('1');
  assert.deepEqual([one.pieces, one.price, one.total], [1, '25.500' + NBSP + 'BHD', null], '1 piece: the price line');
  const link = { ...v, kind: 'insta', insta: 'https://www.instagram.com/p/C7def/', pieces: '2' };
  const ls = O.confirmSnapshot(link, O.buildPayload(link, S1), S1);
  assert.deepEqual([ls.pieces, ls.price, ls.total], [2, null, null], 'an Instagram link: no amount');
  assert.equal(O.fillText(STRINGS.ar['confirm.summaryPieces'], { pieces: '2' }), 'عدد القطع: 2');
  const wa = (c, lang) => O.whatsappText(STRINGS, lang, { kind: 'model', code: c.code, name: c.name, pieces: c.pieces, total: c.total, customerName: c.customerName });
  assert.equal(wa(two, 'en'), 'Hello, I sent a request from your Darjina page for the model m3 عباية سوداء كلاسيكية, 2 pieces, total 51.000' + NBSP + 'BHD. Name: Hind.');
  assert.equal(wa(one, 'ar'), O.fillText(STRINGS.ar['wa.model'], { code: 'm3', name: 'عباية سوداء كلاسيكية', customerName: 'Hind' }), '1 piece keeps wa.model');
  assert.doesNotMatch(wa(two, 'ar'), /25\.500/, 'never the one-piece price as the amount of a 2-piece order');
  const page = read('o/index.html');
  assert.match(page, /<p id="o-sum-model"><\/p><p id="o-sum-pieces"><\/p><p id="o-sum-amount" hidden><\/p>/);
});

test('TICKET-055 T11: every new text exists in both languages with its placeholders; model.unavailable is gone', () => {
  const holders = { 'model.leftFew': ['{count}'], 'form.piecesCap': ['{count}'], 'form.total': ['{total}'], 'form.totalCalc': ['{amount}', '{pieces}'],
    'send.stockShort': ['{count}'], 'confirm.summaryPieces': ['{pieces}'], 'wa.modelPieces': ['{code}', '{name}', '{pieces}', '{total}', '{customerName}'] };
  for (const id of T55_IDS) {
    for (const lang of ['ar', 'en']) {
      assert.equal(typeof STRINGS[lang][id], 'string', `${lang} ${id}`);
      for (const h of holders[id] || []) assert.ok(STRINGS[lang][id].includes(h), `${lang} ${id} has ${h}`);
    }
  }
  for (const id of T55_REMOVED) assert.equal(id in STRINGS.ar || id in STRINGS.en, false, id);
});

test('TICKET-055 T12: page wiring: capped stepper, live total box, stock note above the button', () => {
  const page = read('o/index.html');
  assert.match(page, /aria-describedby="f-pieces-help f-pieces-err"/);
  assert.match(page, /<p class="o-hl" id="f-pieces-help" hidden><\/p>/);
  assert.match(page, /<div class="o-total" id="f-total" aria-live="polite" hidden><\/div>/);
  assert.match(page, /<div id="o-stock" hidden><\/div>\s*<button type="submit"/, 'send.stockShort above the send button');
  const src = read('assets/js/order.js');
  assert.match(src, /const cap = Math\.max\(1, pieceCap\(chosenModel\(st, st\.doc\)\)\);/, '+ stops at the cap');
  assert.match(src, /const steps = stepperState\(n, pieceCap\(m\)\);\s+\$\('f-pieces-less'\)\.disabled = steps\.less;\s+\$\('f-pieces-more'\)\.disabled = steps\.more;/);
  assert.match(src, /const total = orderTotal\(m, n\);/);
  assert.match(src, /if \(o\.kind === 'stock'\) return stockRefused\(o, sent\);/);
  const css = read('assets/css/order.css');
  assert.match(css, /\.o-amt \{\s+font-size: 19px; line-height: 1\.35; font-weight: 700; color: var\(--teal-900\);/, 'web.price.amount');
  assert.match(css, /\.o-pick \.o-amt, \.o-sheet \.o-amt \{ font-size: 22px; \}/);
  assert.match(css, /\.o-left--chip \{[^}]*background: var\(--sand\); color: var\(--ink\)/, 'web.stock.left chip');
});

// TICKET-055 code-review fixes W1-W9 (2026-11-11).

/** The body of a function of the page (4-space indented `function name() { ... }`). */
const fnBody = (src, name) => {
  const m = new RegExp(`function ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n    \\}`).exec(src);
  assert.ok(m, `function ${name}`);
  return m[1];
};

test('TICKET-055 review fix W1: a stock refusal concerns the model sent, never a choice made while sending', () => {
  const doc = O.sanitizeDoc(raw55([M4, { ...M3, available_pieces: 5 }, M1]), 'https:');
  const sentOf = (code, pieces) => {
    const v = { ...base(), branchId: null, chosen: code, pieces: String(pieces) };
    return O.confirmSnapshot(v, O.buildPayload(v, doc), doc);
  };
  const SERVER = { alert: 'send.server', retry: true };
  // She sent m3 × 5 and tapped m1 in the grid (outside the disabled fieldset) before the answer: 3 left.
  const moved = O.stockOutcome({ kind: 'pick', chosen: 'm1', pieces: 5 }, sentOf('m3', 5), doc, 3);
  assert.equal(O.pieceCap(O.findModel(moved.doc, 'm3')), 3, 'the refused model is capped');
  assert.equal(O.findModel(moved.doc, 'm1').available_pieces, null, 'her new choice is untouched');
  assert.deepEqual([moved.kind, moved.chosen, moved.pieces, moved.stock], ['pick', 'm1', 5, null]);
  assert.deepEqual(moved.alert, SERVER, 'never «we set your pieces to 3» about m1');
  // Still m3: the pieces SENT are lowered and the note shows.
  const kept = O.stockOutcome({ kind: 'pick', chosen: 'm3', pieces: 5 }, sentOf('m3', 5), doc, 3);
  assert.deepEqual([kept.chosen, kept.pieces, kept.stock, kept.alert], ['m3', 3, 3, null]);
  // m1 × 4 refused (2 left) while she moved to m4 (1 left): m1 capped, m4 kept with its pieces re-clamped.
  const clamp = O.stockOutcome({ kind: 'pick', chosen: 'm4', pieces: 4 }, sentOf('m1', 4), doc, 2);
  assert.equal(O.pieceCap(O.findModel(clamp.doc, 'm1')), 2);
  assert.deepEqual([clamp.chosen, clamp.pieces, clamp.alert], ['m4', 1, SERVER]);
  // m4 sold out while she moved to m3: m4 leaves the grid, m3 stays chosen.
  const gone = O.stockOutcome({ kind: 'pick', chosen: 'm3', pieces: 1 }, sentOf('m4', 1), doc, 0);
  assert.deepEqual(gone.doc.models.map((m) => m.code), ['m3', 'm1']);
  assert.deepEqual([gone.kind, gone.chosen, gone.pieces, gone.alert], ['pick', 'm3', 1, SERVER]);
  // She switched to an Instagram link meanwhile: the link stays, nothing about it was refused.
  const link = O.stockOutcome({ kind: 'insta', chosen: 'm4', pieces: 1 }, sentOf('m4', 1), doc, 0);
  assert.deepEqual([link.kind, link.chosen, link.alert], ['insta', null, SERVER]);
  // Same model, sold out: the friendly alert, choice cleared.
  const out = O.stockOutcome({ kind: 'pick', chosen: 'm4', pieces: 1 }, sentOf('m4', 1), doc, 0);
  assert.deepEqual([out.kind, out.chosen, out.alert], ['pick', null, { gone: true }]);
  const src = read('assets/js/order.js');
  assert.match(src, /if \(o\.kind === 'stock'\) return stockRefused\(o, sent\);/, 'the snapshot reaches the refusal');
  assert.match(fnBody(src, 'stockRefused'), /const s = stockOutcome\(form, sent, st\.doc, available\);/);
});

test('TICKET-055 review fix W2: changing the pieces (stepper or typing) clears the stock note', () => {
  const src = read('assets/js/order.js');
  assert.match(fnBody(src, 'piecesEdited'), /st\.stock = null;/);
  assert.match(src, /\$\('f-pieces'\)\.addEventListener\('input', piecesEdited\);/, 'typing');
  assert.match(fnBody(src, 'stepPieces'), /piecesEdited\(\);/, 'stepper');
});

test('TICKET-055 review fix W3/W9: the live total and the stock alert are rebuilt only when their text changes', () => {
  const node = {
    kids: [],
    get firstChild() { return this.kids[0] || null; },
    removeChild(c) { this.kids.splice(this.kids.indexOf(c), 1); },
    appendChild(c) { this.kids.push(c); },
  };
  let builds = 0;
  const build = () => [{ n: ++builds }];
  assert.equal(O.renderOnce(node, 'ar|51.000', build), true);
  const first = node.kids[0];
  assert.equal(O.renderOnce(node, 'ar|51.000', build), false, 'same text: the node (and its announcement) stays');
  assert.equal(node.kids[0], first);
  assert.equal(builds, 1);
  assert.equal(O.renderOnce(node, 'ar|76.500', build), true);
  assert.deepEqual([builds, node.kids.length], [2, 1]);
  assert.equal(O.renderOnce(node, '', () => []), true);
  assert.equal(node.kids.length, 0);
  const src = read('assets/js/order.js');
  assert.doesNotMatch(fnBody(src, 'renderErrors'), /renderPieces\(\)/, 'not a side effect of renderErrors');
  assert.doesNotMatch(fnBody(src, 'renderSubmit'), /renderPieces\(\)/, 'nor of renderSubmit (each send would announce again)');
  assert.match(fnBody(src, 'renderAll'), /renderPieces\(\);/);
  assert.match(fnBody(src, 'renderPieces'), /renderOnce\(box, /);
  assert.match(fnBody(src, 'renderPieces'), /renderOnce\(note, /);
});

test('TICKET-055 review fix W4: an empty pieces field keeps + enabled and − disabled', () => {
  assert.deepEqual(O.stepperState(NaN, 3), { less: true, more: false }, 'empty: + starts from 1');
  assert.deepEqual(O.stepperState(NaN, 99), { less: true, more: false });
  assert.deepEqual(O.stepperState(1, 3), { less: true, more: false });
  assert.deepEqual(O.stepperState(2, 3), { less: false, more: false });
  assert.deepEqual(O.stepperState(3, 3), { less: false, more: true }, 'at the cap');
  assert.deepEqual(O.stepperState(50, 3), { less: false, more: true }, 'typed above the cap');
  assert.deepEqual(O.stepperState(1, 1), { less: true, more: true });
});

test('TICKET-055 review fix W5: with the page-level note shown, a sold-out alert adds only its soldOut line', () => {
  const last = O.stockRefusal(O.sanitizeDoc(raw55([M4]), 'https:'), 'm4', 1, 0).doc;
  assert.deepEqual(O.goneAlert(last, true), [{ tag: 'p', id: 'send.soldOutNoModels' }], 'gone.bodyNoModels only in the top note');
  assert.deepEqual(O.goneAlert(S1, true), [{ tag: 'p', id: 'send.soldOut' }]);
  assert.deepEqual(O.goneAlert(S1, false), [{ tag: 'h3', id: 'gone.title' }, { tag: 'p', id: 'gone.body' }, { tag: 'p', id: 'send.soldOut' }]);
  assert.deepEqual(O.goneAlert(last, false).map((x) => x.id), ['gone.title', 'gone.bodyNoModels', 'send.soldOutNoModels']);
  assert.equal(O.goneTexts(last).body, 'gone.bodyNoModels', 'the top note follows the document');
  assert.match(read('assets/js/order.js'), /goneAlert\(st\.doc, st\.note\)/);
});

test('TICKET-055 review fix W6: the WhatsApp text says the pieces when more than 1, also without a total', () => {
  const priceless = O.sanitizeDoc(raw55([{ ...M1, from_price: null }]), 'https:');
  const v = { ...base(), name: 'Hind', branchId: null, chosen: 'm1', pieces: '3' };
  const c = O.confirmSnapshot(v, O.buildPayload(v, priceless), priceless);
  assert.deepEqual([c.pieces, c.total], [3, null]);
  const wa = (lang, info) => O.whatsappText(STRINGS, lang, { customerName: 'Hind', ...info });
  const pieces = (lang, n) => O.fillText(STRINGS[lang]['confirm.summaryPieces'], { pieces: String(n) });
  const model = { kind: 'model', code: 'm1', name: c.name, pieces: c.pieces, total: c.total };
  for (const lang of ['ar', 'en']) {
    assert.equal(wa(lang, model), O.fillText(STRINGS[lang]['wa.model'], { code: 'm1', name: c.name, customerName: 'Hind' }) + ' ' + pieces(lang, 3));
  }
  const url = 'https://www.instagram.com/p/C7def/';
  assert.equal(wa('en', { kind: 'insta', url, pieces: 2, total: null }),
    'Hello, I sent a request from your Darjina page for this post: https://www.instagram.com/p/C7def/ Name: Hind. Pieces: 2');
  // 1 piece, a priced total and the open-limit message keep the deck texts unchanged.
  assert.equal(wa('en', { kind: 'insta', url, pieces: 1 }), O.fillText(STRINGS.en['wa.instagram'], { url, customerName: 'Hind' }));
  const total = '51.000' + NBSP + 'BHD';
  assert.equal(wa('en', { kind: 'model', code: 'm3', name: 'n', pieces: 2, total }),
    O.fillText(STRINGS.en['wa.modelPieces'], { code: 'm3', name: 'n', pieces: '2', total, customerName: 'Hind' }));
  assert.equal(wa('en', { kind: 'openLimit', pieces: 3 }), O.fillText(STRINGS.en['wa.openLimit'], { customerName: 'Hind' }));
});

test('TICKET-055 review fix W7: a count that allows the pieces sent is never «short»; the document decides', () => {
  assert.deepEqual([O.usableStock(3, 4), O.usableStock(0, 1)], [3, 0]);
  for (const [a, p] of [[3, 3], [5, 2], [null, 2], [2.5, 4]]) assert.equal(O.usableStock(a, p), null, `${a} for ${p}`);
  // She sent m3 × 2; the answer says 3 left (the document still allows 2): nothing to lower.
  assert.equal(O.stockRefusal(S1, 'm3', 2, 3).action, 'retry');
  const o = O.stockOutcome({ kind: 'pick', chosen: 'm3', pieces: 2 }, { code: 'm3', pieces: 2 }, S1, O.usableStock(3, 2));
  assert.deepEqual([o.stock, o.pieces, o.alert], [null, 2, { alert: 'send.server', retry: true }], 'never «we set your pieces to 3»');
  // She sent 3, the answer says 3 but the re-read document has 2: lowered from the document.
  const reread = O.sanitizeDoc(raw55([{ ...M3, available_pieces: 2 }, M1]), 'https:');
  const s = O.stockRefusal(reread, 'm3', 3, 3);
  assert.deepEqual([s.action, s.count], ['short', 2]);
  assert.match(fnBody(read('assets/js/order.js'), 'stockRefused'),
    /const available = usableStock\(o\.available, sent\.pieces\);\s+if \(available === null\) \{\s+const r = await fetchDoc\(true\);/);
});

test('TICKET-055 review fix W8: every amount the Number()-based page showed still shows', () => {
  const old = (v, d) => Number(v).toFixed(d); // the TICKET-051 formatter
  for (const [v, d] of [[0.1 + 0.2, 3], [25.12345678, 3], ['25.1234567', 3], ['1e3', 3], ['2.5E1', 2], ['.5', 2], ['25.', 3],
    [' 25.5 ', 3], [1.5e-7, 3], ['0x10', 2], [25.5, 3], ['30.50', 2], [123456789.123, 3]]) {
    assert.equal(O.formatAmount(v, d), old(v, d), `${String(v)} (${d})`);
  }
  assert.equal(O.formatAmount(1e21, 2), '1000000000000000000000.00', 'exponent form of a large number');
  assert.equal(O.formatAmount(0.1 + 0.2, 3, 'BHD', 3), '0.900' + NBSP + 'BHD');
  assert.equal(O.formatAmount('1e3', 3, 'BHD', 2), '2000.000' + NBSP + 'BHD');
  // The exact half-up rounding of the total stays.
  assert.equal(O.formatAmount(2.675, 2, 'SAR', 3), '8.03' + NBSP + 'SAR');
  assert.equal(O.formatAmount('0.0005', 3), '0.001');
  assert.equal(O.formatAmount('9.9995', 3), '10.000');
  assert.equal(O.formatAmount('33.3333333', 2, null, 3), '100.00');
  for (const bad of [null, undefined, '', ' ', NaN, Infinity, -Infinity, 0, '0', -3, '-0.5', 'abc']) {
    assert.equal(O.formatAmount(bad, 3, 'BHD'), null, String(bad));
  }
  assert.equal(O.modelPrice({ from_price: 0.1 + 0.2, from_price_currency: 'BHD', minor_units: 3 }), '0.300' + NBSP + 'BHD');
});

// ------------------------------------------------------------------------------------------------
// Static checks

test('order.js never parses text as markup', () => {
  const src = read('assets/js/order.js');
  for (const bad of [/innerHTML/, /outerHTML/, /insertAdjacentHTML/, /document\.write/, /\beval\(/, /new Function/, /DOMParser/,
    /createContextualFragment/, /srcdoc/]) {
    assert.doesNotMatch(src, bad, String(bad));
  }
});

test('config: function URL and the Turnstile site key, no Supabase key', () => {
  const ctx = { window: {} };
  vm.runInNewContext(read('o/config.js'), ctx);
  assert.equal(ctx.window.ORDER_CONFIG.FUNCTION_URL, 'https://xfdrusgoqxohdxjzmucf.supabase.co/functions/v1/online-order');
  assert.match(ctx.window.ORDER_CONFIG.TURNSTILE_SITE_KEY, /^0x4[A-Za-z0-9_-]{18,}$/);
  for (const f of ['o/config.js', 'assets/js/order.js', 'o/index.html']) {
    assert.doesNotMatch(read(f), /eyJhbGciOi|sb_publishable_|anon[_-]?key|service_role/i, f);
  }
});

test('built page: noindex, generic preview, CSP, no shop data; robots and sitemap', () => {
  const page = read('o/index.html');
  assert.match(page, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(page, new RegExp(`<title>${STRINGS.ar['meta.title']}</title>`));
  assert.match(page, /<meta property="og:image" content="https:\/\/darjina.com\/assets\/img\/og-image.jpg">/);
  assert.match(page, /Content-Security-Policy" content="default-src 'self'; script-src 'self' https:\/\/challenges.cloudflare.com;/);
  assert.match(page, /connect-src 'self' https:\/\/xfdrusgoqxohdxjzmucf.supabase.co/);
  assert.match(page, /img-src 'self' data: https:\/\/xfdrusgoqxohdxjzmucf.supabase.co;/);
  assert.match(page, /<html lang="ar" dir="rtl">/);
  assert.doesNotMatch(page, /<script>/, 'no inline script (CSP)');
  const scripts = [...page.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(scripts, ['/o/config.js', '/assets/js/order-strings.js', '/assets/js/order.js']);
  assert.match(page, /class="o-pic-svg" aria-hidden="true"/);
  assert.equal((page.match(/class="o-hs"/g) || []).length, 10);
  assert.match(read('robots.txt'), /^Disallow: \/o\/$/m);
  assert.doesNotMatch(read('sitemap.xml'), /\/o\//);
  assert.equal(read('assets/img/abaya-measurements.svg').includes('hs-full_height-anchor'), true);
});
