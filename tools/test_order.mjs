// Node test of the public order page (TICKET-047), no browser: node tools/test_order.mjs (Node 18+).
// Covers the 404 forwarding script as built into 404.html, the page's pure helpers in
// assets/js/order.js (lowercasing, phone E.164 with the chosen country code, payload building, the
// client_request_id rule, error-code mapping, WhatsApp texts), the strings file, the built page and
// robots/sitemap, and that order.js never parses text as markup. The review fixes of 2026-11-09
// (ADR-0036 amendment 2, item 21: W1, W4-W6, W8-W10) are tested through their pure helpers; the busy
// flag (W2), the no-store re-reads (W3) and the page wiring were checked in headless Edge. Bug fixes
// 2026-11-09 (amendment 2, items 22 and 25): the root 404.html head previews as the order page
// (BUG-095); the confirmation snapshot and the re-read gate (BUG-096).
// Run `python tools/build.py` first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  name: ' Reem ', cc: '+973', phone: '36001122', kind: 'pick', chosen: 'm1', photos: [], insta: '',
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

test('payload: own photos, Instagram link, one branch, date, entered measurements', () => {
  const photos = { ...base(), kind: 'photos', photos: [{ key: 1, b64: 'AAA=' }, { key: 2, b64: 'BBB=' }], notes: '  ' };
  const p1 = O.buildPayload(photos, DOC);
  assert.deepEqual(p1.photos, [{ content_type: 'image/jpeg', data_base64: 'AAA=' }, { content_type: 'image/jpeg', data_base64: 'BBB=' }]);
  assert.equal('model_code' in p1, false);
  assert.equal('notes' in p1, false);

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
  assert.equal(e({ kind: 'photos', photos: [] }).model.id, 'err.modelRequired');
  assert.equal(e({ kind: 'insta', insta: '' }).model.id, 'err.modelRequired');
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
  const fp = (v, keys) => O.fingerprint(O.buildPayload(v, DOC), keys);
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

  const ph = { ...base(), kind: 'photos', photos: [{ key: 1, b64: 'AAA=' }] };
  const fpA = fp(ph, [1]);
  assert.equal(fpA.includes('AAA='), false, 'photo data is not part of the fingerprint');
  assert.notEqual(fpA, fp({ ...ph, photos: [{ key: 7, b64: 'AAA=' }] }, [7]), 'removed and added again = new content');
  assert.equal(fpA, fp(ph, [1]));
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
  assert.equal(O.fingerprint(en, []), O.fingerprint(ar, []), 'switching the language before a resend keeps the id');
  const last = { fp: O.fingerprint(ar, []), id: 'id-1' };
  assert.equal(O.requestIdFor(last, O.fingerprint(en, []), () => 'id-2'), 'id-1');
  // only the payload's own language field is left out
  assert.notEqual(O.fingerprint({ ...ar, notes: 'x' }, []), O.fingerprint(ar, []));
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
  assert.deepEqual(kept, { kind: null, chosen: null, branchId: form.branchId, lostModel: true });
  const e = O.refusalErrors(O.outcome(400, { error: 'invalid_input' }), { ...base(), kind: kept.kind, chosen: kept.chosen }, noModels, true);
  assert.deepEqual(Object.keys(e), ['model']);
  assert.equal(e.model.id, 'err.modelRequired');
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

test('W5: stored image size, resize options, one photo at a time, error ids', async () => {
  assert.deepEqual(O.imageSize(new Uint8Array(readFileSync(join(ROOT, 'assets/img/og-image.jpg')))), { width: 1200, height: 630 });
  assert.deepEqual(O.imageSize(new Uint8Array(readFileSync(join(ROOT, 'assets/img/mark-512.png')))), { width: 512, height: 512 });
  // APP1 block, fill byte, DHT (C4, not a frame), then SOF2 4000 x 3000
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x04, 0x45, 0x78, 0xff, 0xff, 0xc4, 0x00, 0x03, 0x00,
    0xff, 0xc2, 0x00, 0x11, 0x08, 0x0b, 0xb8, 0x0f, 0xa0, 0x03]);
  assert.deepEqual(O.imageSize(jpg), { width: 4000, height: 3000 });
  assert.equal(O.imageSize(jpg.slice(0, 14)), null, 'size beyond the bytes read');
  assert.equal(O.imageSize(new Uint8Array([0x47, 0x49, 0x46, 0x38])), null);
  assert.deepEqual(O.bitmapResize({ width: 4000, height: 3000 }, 1600), { resizeWidth: 1600, resizeQuality: 'high' });
  assert.deepEqual(O.bitmapResize({ width: 3000, height: 4000 }, 1600), { resizeHeight: 1600, resizeQuality: 'high' });
  assert.equal(O.bitmapResize({ width: 1600, height: 900 }, 1600), null);
  assert.equal(O.bitmapResize(null, 1600), null);
  assert.equal(O.photoErrorId(new Error('type')), 'err.photoType');
  for (const m of ['memory', 'large', 'other']) assert.equal(O.photoErrorId(new Error(m)), 'err.photoLarge', m);

  const queue = O.createQueue();
  let active = 0;
  let most = 0;
  const order = [];
  const task = (n, fail) => () => new Promise((resolve, reject) => {
    active += 1;
    most = Math.max(most, active);
    order.push('start ' + n);
    setTimeout(() => { active -= 1; order.push('end ' + n); (fail ? reject : resolve)(n); }, 5);
  });
  const runs = [queue(task(1)), queue(task(2, true)), queue(task(3))];
  const settled = await Promise.allSettled(runs);
  assert.equal(most, 1, 'never two photos at once');
  assert.deepEqual(order, ['start 1', 'end 1', 'start 2', 'end 2', 'start 3', 'end 3']);
  assert.deepEqual(settled.map((s) => s.status), ['fulfilled', 'rejected', 'fulfilled'], 'a failed photo does not stop the next');
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
    kind: 'pick', code: 'm3', name: 'عباية سوداء كلاسيكية', url: null, branchName: 'المنامة',
    customerName: 'Reem', lang: 'ar', shopPhone: '+97317001100',
  });
  assert.equal(O.whatsappText(STRINGS, sent.lang, { kind: 'model', code: sent.code, name: sent.name, customerName: sent.customerName }),
    O.fillText(STRINGS.ar['wa.model'], { code: 'm3', name: 'عباية سوداء كلاسيكية', customerName: 'Reem' }));
  // One branch: its name without a branch_id; photos and Instagram: no model.
  const one = Object.assign({}, DOC, { branches: [DOC.branches[0]] });
  const photos = Object.assign(base(), { kind: 'photos', photos: [{ key: 'p1', b64: 'AA==' }] });
  const snap = O.confirmSnapshot(photos, O.buildPayload(photos, one), one);
  assert.equal(snap.branchName, 'الرفاع');
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

test('amounts, dates, sizes, magic bytes', () => {
  assert.equal(O.formatAmount(35, 3, 'BHD'), '35.000' + NBSP + 'BHD');
  assert.equal(O.formatAmount('25.5', 3, 'BHD'), '25.500' + NBSP + 'BHD');
  assert.equal(O.formatAmount(120, 2, 'SAR'), '120.00' + NBSP + 'SAR');
  assert.equal(O.formatAmount(null, 3, 'BHD'), null);
  assert.equal(O.formatDate('2026-11-23'), '23/11/2026');
  assert.equal(O.formatDate('23/11/2026'), '');
  assert.deepEqual(O.shrinkSize(4000, 3000, 1600), { width: 1600, height: 1200 });
  assert.deepEqual(O.shrinkSize(900, 1200, 1600), { width: 900, height: 1200 });
  assert.equal(O.sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'jpg');
  assert.equal(O.sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), 'png');
  assert.equal(O.sniffImage(new Uint8Array([0x47, 0x49, 0x46, 0x38])), null);
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
  assert.equal(encodeURIComponent(O.whatsappText(STRINGS, 'ar', { kind: 'photos', customerName: 'Salwa' })).length, 421);
  assert.equal(O.whatsappLink(null, 'x'), null);
  assert.equal(O.whatsappLink('+97317001100', null), 'https://wa.me/97317001100');
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
