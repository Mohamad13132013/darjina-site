/* Darjina public order page /o/ (TICKET-047; ADR-0036 sections 2, 4, 5, 9 and both amendments of
   2026-11-09; BR-91, BR-106, BR-108, BR-109; design S-29a-d, docs/design/copy-online-order-page.md).
   TICKET-051 (ADR-0037 sections 1, 2, 5; BR-114 to BR-116): no customer photos (a catalogue model or an
   Instagram post link; a shop without listed models shows the link field alone) and the model's exact
   price ("Price: 25.000 BHD", never "From").

   One static page for every shop: reads ?h=<handle>&m=<code> (404.html forwards the path links
   /o/<handle>[/<code>] here), restores the clean path, loads the shop's public document from the Edge
   Function `online-order` (GET), shows the shop page and the order form, and sends the request (POST).

   Rules kept here:
   - Every text the shop owner wrote (shop, branch and model names, locations, descriptions) and every
     other value from the server is written with textContent / setAttribute only; the page never parses
     server text as markup (ADR-0036 amendment 2, item 11).
   - client_request_id: one id per form content; a resend of the unchanged form reuses it (lost answer,
     bot-check failure, rate limit), any change of the content gives a new one (amendment 2, item 15).
     A replay answer {request_id, replayed: true} shows the confirmation like a first answer.
   - Turnstile tokens are single use: every send asks the widget for a fresh one and resets it after the
     send or a check error, never after a token timeout (amendment 2, item 21).
   - The page refuses to show the form inside another site's frame; an unreachable or undeployed
     function ends on the "not available" page after one Retry (item 21).
   - localStorage only for the language choice (try/catch). No other third-party script, no analytics.

   Vanilla JS, no build step. The pure helpers at the top are exported for tools/test_order.mjs (Node,
   no browser); in a browser the file starts the page. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  } else if (root && root.document) {
    root.DarjinaOrder = api;
    api.start();
  }
}(typeof window !== 'undefined' ? window : this, function (win) {
  'use strict';

  // ---------------------------------------------------------------------------------------------
  // Constants

  /** The 10 measurement points (ADR-0007 order; copy ids meas.p1..meas.p10). */
  const MEAS_KEYS = ['full_height', 'upper_height', 'shoulder_width', 'sleeve_length', 'sleeve_length_from_neck',
    'sleeve_width', 'armhole', 'bust_width', 'waist_width', 'hip_circumference'];
  /** Country codes offered before the phone (copy form.countryCode); the shop's own is added when missing. */
  const COUNTRY_CODES = ['+973', '+966', '+971', '+974', '+965', '+968', '+962', '+20'];
  const GET_TIMEOUT_MS = 20000;
  const POST_TIMEOUT_MS = 60000;
  const TOKEN_TIMEOUT_MS = 30000;
  /** Signed links of the shop logo and model photos expire after an hour: a failing image re-reads the
   * document at most this often. */
  const IMAGE_REFRESH_MS = 60000;
  const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  /** Shared with assets/js/site.js (the marketing pages remember the same choice). */
  const LANG_KEY = 'darjina-lang';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
  /** The server's check (private.online_instagram_url) after query and fragment are removed. */
  const INSTAGRAM = /^https:\/\/(www\.)?instagram\.com\/(p|reel)\/[A-Za-z0-9_-]+\/?$/;
  const PHONE_E164 = /^\+[1-9][0-9]{7,14}$/;
  const COUNTRY_CODE = /^\+[1-9][0-9]{0,2}$/;
  const NBSP = String.fromCharCode(0xa0);

  /** A regex character class from code points and [from, to] ranges (no invisible characters in this source). */
  function charClass(points) {
    return points.map(function (p) {
      return Array.isArray(p) ? String.fromCharCode(p[0]) + '-' + String.fromCharCode(p[1]) : String.fromCharCode(p);
    }).join('');
  }
  // BR-30 step 2 (private.clean_phone_input): white space, ( ) . - and the direction marks phones add.
  const PHONE_STRIP = new RegExp('[\\s().\\-' + charClass([0xa0, 0x1680, [0x2000, 0x200a], 0x2028, 0x2029, 0x202f,
    0x205f, 0x3000, 0xfeff, 0x061c, 0x200e, 0x200f, [0x202a, 0x202e], [0x2066, 0x2069]]) + ']', 'g');
  // Amendment 2, item 3 (private.online_trim_text): leading / trailing white space and invisible marks.
  const EDGE_CHARS = '[\\s' + charClass([0x85, 0xa0, 0x061c, 0x1680, 0x180e, [0x2000, 0x200f], [0x2028, 0x202f],
    [0x205f, 0x2060], [0x2066, 0x2069], 0x3000, 0xfeff]) + ']';
  const EDGE_TRIM = new RegExp('^' + EDGE_CHARS + '+|' + EDGE_CHARS + '+$', 'g');
  const ARABIC_DIGITS = [0x660, 0x6f0]; // Arabic-Indic and Extended Arabic-Indic zero
  const ARABIC_DECIMAL = String.fromCharCode(0x66b);

  // ---------------------------------------------------------------------------------------------
  // Pure helpers (tested in tools/test_order.mjs)

  /** Arabic-Indic (and Extended) digits to 0-9 (BR-30 step 1). */
  function westernDigits(text) {
    let out = '';
    for (const ch of String(text)) {
      const c = ch.charCodeAt(0);
      const base = ARABIC_DIGITS.find(function (z) { return c >= z && c <= z + 9; });
      out += base === undefined ? ch : String(c - base);
    }
    return out;
  }

  function trimText(text) {
    return String(text == null ? '' : text).replace(EDGE_TRIM, '');
  }

  /** Length in characters (code points), as the database counts. */
  function charLength(text) {
    return Array.from(String(text)).length;
  }

  /** A handle from a link: trimmed, one leading @ removed, lower case (BR-105, BR-106; the server
   * normalises again). */
  function normHandle(value) {
    let v = String(value == null ? '' : value).trim();
    if (v.charAt(0) === '@') v = v.slice(1);
    return v.toLowerCase();
  }

  /** A model code from a link: lower case (ADR-0036 amendment 1, item 5). */
  function normCode(value) {
    return String(value == null ? '' : value).trim().toLowerCase();
  }

  /** ?h=&m=&lang= of the page address. */
  function parseParams(search) {
    const p = new URLSearchParams(search || '');
    const lang = p.get('lang');
    return {
      h: normHandle(p.get('h')),
      m: normCode(p.get('m')),
      lang: lang === 'ar' || lang === 'en' ? lang : null,
    };
  }

  /** The canonical address /o/<handle>[/<code>] (ADR-0036 section 2), with ?lang=en when English. */
  function cleanPath(handle, code, lang) {
    if (!handle) return '/o/';
    return '/o/' + encodeURIComponent(handle) + (code ? '/' + encodeURIComponent(code) : '') +
      (lang === 'en' ? '?lang=en' : '');
  }

  /**
   * BR-30 (private.normalize_phone) with [countryCode] (the code chosen on the page, the shop's by
   * default): E.164 or null when BR-31 fails. The page sends this E.164 value, which the server keeps.
   */
  function normalizePhone(raw, countryCode) {
    let v = westernDigits(raw == null ? '' : raw).replace(PHONE_STRIP, '');
    if (v === '') return null;
    const cc = COUNTRY_CODE.test(String(countryCode)) ? String(countryCode).slice(1) : '';
    if (v.slice(0, 2) === '00') {
      v = '+' + v.slice(2);
    } else if (v.charAt(0) !== '+') {
      if (!cc) return null;
      if (v.charAt(0) !== '0' && v.slice(0, cc.length) === cc && v.replace(/[^0-9]/g, '').length >= 11) {
        v = '+' + v; // 3b: country code typed without +
      } else {
        if (v.charAt(0) === '0') v = v.slice(1);
        v = '+' + cc + v;
      }
    }
    return PHONE_E164.test(v) ? v : null;
  }

  /** An Instagram post or reel link as the server accepts it, '' when empty, null when not one. Query
   * and fragment are dropped; a missing or http scheme and the host's letter case are tidied. */
  function instagramUrl(raw) {
    let v = trimText(raw);
    if (v === '') return '';
    v = v.replace(/[?#].*$/, '');
    if (/^(www\.)?instagram\.com\//i.test(v)) v = 'https://' + v;
    v = v.replace(/^https?:\/\/(www\.)?instagram\.com\//i, function (m) {
      return m.toLowerCase().replace(/^http:/, 'https:');
    });
    return INSTAGRAM.test(v) && v.length <= 200 ? v : null;
  }

  /** A typed measurement: null when empty, NaN when invalid (> 0 and < 300, one decimal; BR-15),
   * else the number. Arabic digits and the Arabic decimal sign or a comma are accepted. */
  function parseMeasure(raw) {
    const v = westernDigits(trimText(raw)).split(ARABIC_DECIMAL).join('.').replace(',', '.');
    if (v === '') return null;
    if (!/^\d{1,3}(\.\d)?$/.test(v)) return NaN;
    const n = Number(v);
    return n > 0 && n < 300 ? n : NaN;
  }

  /** `35.000 BHD`: the currency's minor units, a no-break space before the code. */
  function formatAmount(value, minorUnits, code) {
    const n = typeof value === 'number' ? value : Number(value);
    if (value === null || value === '' || !isFinite(n)) return null;
    const d = Number.isInteger(minorUnits) && minorUnits >= 0 && minorUnits <= 4 ? minorUnits : 2;
    const text = n.toFixed(d);
    return code ? text + NBSP + code : text;
  }

  /** A model's exact price (ADR-0037 section 2): `from_price` (the name stays, its meaning is the price)
   * in `from_price_currency` with its `minor_units`, e.g. `25.000 BHD`; null for a model without a price
   * (missing or not above 0, possible only before batch 11), which shows no price line. */
  function modelPrice(m) {
    return m && Number(m.from_price) > 0 ? formatAmount(m.from_price, m.minor_units, m.from_price_currency) : null;
  }

  /** `YYYY-MM-DD` -> `dd/MM/yyyy` (no Date object, so no time zone); '' for anything else. */
  function formatDate(iso) {
    const m = DATE.exec(String(iso || ''));
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
  }

  /** True at most once per [ms] (the first call always). */
  function createThrottle(ms) {
    let last = null;
    return function (now) {
      if (last !== null && now - last < ms) return false;
      last = now;
      return true;
    };
  }

  /**
   * The Turnstile token store (W1). put() keeps a token and wakes the waiters; wait() answers
   * {token, timedOut}: a token at once when one is kept, else the next one, or {token: null, timedOut:
   * true} after [ms]. A waiter that timed out is removed and settled, so it never takes a later token;
   * that token stays for the next wait() (Retry). flush() wakes the waiters without a token (error).
   */
  function createTokenBox(ms) {
    const box = { token: null, waiting: [] };
    box.take = function () {
      const tok = box.token;
      box.token = null;
      return tok;
    };
    box.clear = function () { box.token = null; };
    box.flush = function () {
      const waiting = box.waiting;
      box.waiting = [];
      waiting.forEach(function (w) { w(); });
    };
    box.put = function (tok) {
      box.token = tok || null;
      box.flush();
    };
    box.wait = function () {
      if (box.token) return Promise.resolve({ token: box.take(), timedOut: false });
      return new Promise(function (resolve) {
        let settled = false;
        const waiter = function () {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ token: box.take(), timedOut: false });
        };
        const timer = setTimeout(function () {
          if (settled) return;
          settled = true;
          box.waiting = box.waiting.filter(function (w) { return w !== waiter; });
          resolve({ token: null, timedOut: true });
        }, ms);
        box.waiting.push(waiter);
      });
    };
    return box;
  }

  /**
   * fetch and read the JSON body under one timeout (W6): {status, ok, body}, body null when the answer
   * is not JSON. Rejects on a network or CORS failure and on the timeout, also while the body is read.
   */
  function fetchJson(fetchFn, url, options, ms) {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    return new Promise(function (resolve, reject) {
      let done = false;
      const finish = function (fn, value) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        fn(value);
      };
      const timer = setTimeout(function () {
        if (ctrl) ctrl.abort();
        finish(reject, new Error('timeout'));
      }, ms);
      Promise.resolve().then(function () {
        return fetchFn(url, Object.assign({ credentials: 'omit', signal: ctrl ? ctrl.signal : undefined }, options));
      }).then(function (res) {
        return Promise.resolve().then(function () { return res.json(); })
          .then(null, function () { return null; })
          .then(function (body) { return { status: res.status, ok: res.ok, body: body }; });
      }).then(function (r) { finish(resolve, r); }, function (e) { finish(reject, e); });
    });
  }

  /** The page document answer: 'ok', 'na' (page off or unknown, or 404: the platform's answer while
   * the function is not deployed) or 'error' (5xx, an unreadable answer). */
  function docResult(status, body) {
    if (status === 404) return 'na';
    if (status < 200 || status >= 300 || !body || typeof body !== 'object') return 'error';
    return body.available === true ? 'ok' : 'na';
  }

  /** The view after loading the document (W10): [result] is a docResult or 'offline' (no answer, which
   * is also how a CORS refusal looks); [failures] counts the loads in a row without an answer. The
   * first shows the load error with Retry; the same after Retry shows "not available" (an unreachable
   * or undeployed function), unless the browser knows it is offline. */
  function loadView(result, failures, online) {
    if (result !== 'offline') return result;
    return failures >= 2 && online !== false ? 'na' : 'error';
  }

  /** A page shown inside another site's frame (W10); an unreadable top counts as framed. */
  function isFramed(w) {
    try {
      return w.top !== w.self;
    } catch (e) {
      return true;
    }
  }

  /** UUID v4 (crypto.randomUUID, else getRandomValues). */
  function uuidv4(cryptoObj) {
    if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID();
    const b = new Uint8Array(16);
    cryptoObj.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  /** A text of the strings object, Arabic as fallback, the id itself as the last resort. */
  function text(strings, lang, id) {
    for (const l of [lang, 'ar']) {
      const v = strings && strings[l] && strings[l][id];
      if (typeof v === 'string') return v;
    }
    return id;
  }

  /**
   * A template split into parts: {text} for the template's own words and {text, isVar, ltr} for each
   * {placeholder}. A value is a string (a name, bidi-isolated), {text, ltr} (numbers, codes, dates,
   * amounts, links: left to right) or an array of those (joined by spaces).
   */
  function fillParts(template, vars) {
    const parts = [];
    const re = /\{(\w+)\}/g;
    let at = 0;
    let m;
    while ((m = re.exec(template)) !== null) {
      if (m.index > at) parts.push({ text: template.slice(at, m.index) });
      const value = vars ? vars[m[1]] : undefined;
      // BUG-096: an empty item (null, or {text: null}) is left out; nothing left keeps the placeholder.
      const items = (Array.isArray(value) ? value : [value]).filter(function (v) {
        return v !== undefined && v !== null && (typeof v !== 'object' || (v.text !== undefined && v.text !== null));
      });
      if (!items.length) {
        parts.push({ text: m[0] });
      } else {
        items.forEach(function (v, i) {
          if (i > 0) parts.push({ text: ' ' });
          parts.push(typeof v === 'object' ? { text: String(v.text), isVar: true, ltr: !!v.ltr }
            : { text: String(v), isVar: true, ltr: false });
        });
      }
      at = re.lastIndex;
    }
    if (at < template.length) parts.push({ text: template.slice(at) });
    return parts;
  }

  /** A template filled as plain text (WhatsApp messages, titles). */
  function fillText(template, vars) {
    return fillParts(template, vars).map(function (p) { return p.text; }).join('');
  }

  /** The WhatsApp message (copy wa.*) in [lang]: kind `model` {code, name}, `insta` {url} or
   * `openLimit`; always with the customer's own name (she sends it herself). */
  function whatsappText(strings, lang, info) {
    const id = { model: 'wa.model', insta: 'wa.instagram', openLimit: 'wa.openLimit' }[info.kind];
    return fillText(text(strings, lang, id), {
      code: info.code, name: info.name, url: info.url, customerName: info.customerName,
    });
  }

  /** `https://wa.me/<digits>[?text=...]`, null without a usable phone. */
  function whatsappLink(phone, message) {
    const digits = String(phone || '').replace(/[^0-9]/g, '');
    if (digits.length < 6) return null;
    return 'https://wa.me/' + digits + (message ? '?text=' + encodeURIComponent(message) : '');
  }

  /** A URL the page may load or link: https (http only while the page itself is http, local
   * checks); null for anything else (javascript:, data:, relative junk). */
  function safeUrl(value, pageProtocol) {
    if (typeof value !== 'string' || value === '') return null;
    try {
      const u = new URL(value);
      if (u.protocol === 'https:' || (u.protocol === 'http:' && pageProtocol === 'http:')) return u.href;
    } catch (e) {
      // not a URL
    }
    return null;
  }

  const str = function (v) { return typeof v === 'string' ? v : null; };
  const arr = function (v) { return Array.isArray(v) ? v : []; };

  /** The public document (ADR-0036 section 4) with every value checked for its type; anything else
   * of the answer is dropped. */
  function sanitizeDoc(body, pageProtocol) {
    const b = body || {};
    const shop = b.shop || {};
    const phone = str(shop.phone);
    const model = function (m) {
      m = m || {};
      const ig = str(m.instagram_url);
      return {
        code: normCode(str(m.code) || ''),
        name: str(m.name) || '',
        description: str(m.description),
        from_price: typeof m.from_price === 'number' || typeof m.from_price === 'string' ? m.from_price : null,
        from_price_currency: str(m.from_price_currency),
        minor_units: Number.isInteger(m.minor_units) ? m.minor_units : null,
        instagram_url: ig && INSTAGRAM.test(ig) ? ig : null,
        photo_urls: arr(m.photo_urls).map(function (u) { return safeUrl(u, pageProtocol); }).filter(Boolean),
      };
    };
    const minDate = str(b.min_desired_date);
    const cc = str(b.phone_country_code);
    const models = arr(b.models).map(model).filter(function (m) { return m.code !== ''; });
    const asked = b.model && typeof b.model === 'object' ? normCode(str(b.model.code) || '') : '';
    return {
      handle: normHandle(str(b.handle) || ''),
      shop: {
        name: str(shop.name) || '',
        phone: phone && /^\+?[0-9]{6,16}$/.test(phone) ? phone : null,
        logo_url: safeUrl(shop.logo_url, pageProtocol),
      },
      phone_country_code: cc && COUNTRY_CODE.test(cc) ? cc : null,
      min_desired_date: minDate && DATE.test(minDate) ? minDate : null,
      branches: arr(b.branches).filter(function (x) { return x && typeof x.id === 'string' && UUID.test(x.id); })
        .map(function (x) { return { id: x.id, name: str(x.name) || '', location: str(x.location) }; }),
      models: models,
      model: models.some(function (m) { return m.code === asked; }) ? asked : null,
      model_unavailable: b.model_unavailable === true,
    };
  }

  /** How the form names the model (ADR-0037 section 1): 'pick' (a catalogue model), 'insta' (an
   * Instagram post link) or null (nothing chosen yet). A shop without listed models has only the link
   * field (S-29b.15), so it is always 'insta' there. */
  function modelKind(v, doc) {
    if (!(doc.models || []).length) return 'insta';
    return v.kind === 'pick' || v.kind === 'insta' ? v.kind : null;
  }

  /**
   * The page's checks (BR-108), same rules as the server. [v]: {name, cc, phone, kind
   * ('pick'|'insta'|null), chosen, insta, branchId, measMode, meas:{key: typed}, pieces, notes, date}.
   * Answers {field: {id, vars?}} in screen order.
   */
  function validate(v, doc) {
    const e = {};
    const name = charLength(trimText(v.name));
    if (name < 2) e.name = { id: 'err.nameShort' };
    else if (name > 100) e.name = { id: 'err.nameLong' };
    if (trimText(v.phone) === '') e.phone = { id: 'err.phoneRequired' };
    else if (normalizePhone(v.phone, v.cc) === null) e.phone = { id: 'err.phoneInvalid' };
    const models = doc.models || [];
    const kind = modelKind(v, doc);
    if (kind === 'pick') {
      if (!models.some(function (m) { return m.code === v.chosen; })) e.model = { id: 'err.modelRequired' };
    } else if (kind === 'insta') {
      const url = instagramUrl(v.insta);
      if (url === null) e.insta = { id: 'err.instagramInvalid' };
      else if (url === '' && models.length) e.model = { id: 'err.modelRequired' };
      // Without listed models the link field stands alone: its own error under it (S-29b.16).
      else if (url === '') e.insta = { id: 'err.instagramRequired' };
    } else {
      e.model = { id: 'err.modelRequired' };
    }
    const branches = doc.branches || [];
    if (branches.length > 1 && !branches.some(function (b) { return b.id === v.branchId; })) {
      e.branch = { id: 'err.branchRequired' };
    }
    if (v.measMode === 'ENTERED') {
      MEAS_KEYS.forEach(function (k) {
        const n = parseMeasure(v.meas && v.meas[k]);
        if (n === null && k === 'full_height') e['meas.' + k] = { id: 'err.measFullHeight' };
        else if (n !== null && isNaN(n)) e['meas.' + k] = { id: 'err.measRange' };
      });
    }
    const pieces = westernDigits(trimText(v.pieces));
    if (!/^\d{1,2}$/.test(pieces) || Number(pieces) < 1) e.pieces = { id: 'err.pieces' };
    if (charLength(trimText(v.notes)) > 500) e.notes = { id: 'err.notesLong' };
    if (v.date && (!DATE.test(v.date) || (doc.min_desired_date && v.date < doc.min_desired_date))) e.date = dateEarly(doc);
    return e;
  }
  function dateEarly(doc) {
    return { id: 'err.dateEarly', vars: { date: { text: formatDate(doc.min_desired_date), ltr: true } } };
  }

  /** What of the form stays with a new document (W8): the chosen model and the branch only while still
   * offered; with no model left, only the Instagram link field remains (ADR-0037). [form]: {kind,
   * chosen, branchId}. lostModel: the chosen model is gone (the page shows the unavailable note). */
  function afterRefresh(form, doc) {
    const models = doc.models || [];
    const kept = !!form.chosen && models.some(function (m) { return m.code === form.chosen; });
    return {
      kind: models.length === 0 ? 'insta' : form.kind,
      chosen: kept ? form.chosen : null,
      branchId: form.branchId && (doc.branches || []).some(function (b) { return b.id === form.branchId; }) ? form.branchId : null,
      lostModel: !!form.chosen && !kept,
    };
  }

  /** Field errors after a refusal that re-reads the document (W8; outcome kind 'refresh' or refresh:
   * true): the page's own checks against that document. The server's field error is added only when
   * the document could not be re-read ([fresh] false) and the field still exists (the branch question
   * needs 2 or more branches). Empty: the new document already answers the refusal. */
  function refusalErrors(o, v, doc, fresh) {
    const e = validate(v, doc);
    if (o.kind === 'field' && !fresh && !e[o.field] && (o.field !== 'branch' || (doc.branches || []).length > 1)) {
      e[o.field] = o.field === 'date' ? dateEarly(doc) : { id: o.error };
    }
    return e;
  }

  /** The POST body without `client_request_id` and `turnstile_token` (ADR-0036 section 5); only the
   * chosen way of naming the model is sent, never photos (ADR-0037); [v] passed [validate]. */
  function buildPayload(v, doc) {
    const p = {
      handle: doc.handle,
      customer_name: trimText(v.name),
      phone: normalizePhone(v.phone, v.cc),
    };
    const kind = modelKind(v, doc);
    if (kind === 'pick') p.model_code = v.chosen;
    if (kind === 'insta') p.instagram_url = instagramUrl(v.insta);
    if ((doc.branches || []).length > 1) p.branch_id = v.branchId;
    p.measurement_mode = v.measMode === 'LAST' || v.measMode === 'ENTERED' ? v.measMode : 'SHOP';
    if (p.measurement_mode === 'ENTERED') {
      const m = {};
      MEAS_KEYS.forEach(function (k) {
        const n = parseMeasure(v.meas && v.meas[k]);
        if (n !== null && !isNaN(n)) m[k] = n; // only the points she entered (amendment 1, item 6)
      });
      p.measurements = m;
    }
    p.no_pieces = Number(westernDigits(trimText(v.pieces)));
    const notes = trimText(v.notes);
    if (notes !== '') p.notes = notes;
    if (v.date) p.desired_date = v.date;
    p.contact_preference = v.contact === 'CALL' ? 'CALL' : 'WHATSAPP';
    p.language = v.lang === 'en' ? 'en' : 'ar';
    return p;
  }

  /** What identifies the form content: the payload. The page language is sent but is not content
   * (W4): switching it before a resend keeps the id. */
  function fingerprint(payload) {
    return JSON.stringify(payload, function (k, val) {
      return k === 'language' && this === payload ? undefined : val;
    });
  }

  /** ADR-0036 amendment 2 item 25 (BUG-096): what the confirmation shows, taken when the request is
   * sent from the document its [payload] was built from (never the document at the answer): the
   * model's code and name, the branch name, the Instagram link, the customer's name, the language and
   * the shop's phone for the WhatsApp button. */
  function confirmSnapshot(v, payload, doc) {
    const models = (doc && doc.models) || [];
    const branches = (doc && doc.branches) || [];
    const code = payload.model_code || null;
    const m = code ? models.find(function (x) { return x.code === code; }) || null : null;
    const branch = branches.find(function (b) { return b.id === payload.branch_id; })
      || (branches.length === 1 ? branches[0] : null);
    return {
      kind: modelKind(v, doc || {}), code: code, name: m ? m.name : null, url: payload.instagram_url || null,
      branchName: branch ? branch.name : null, customerName: payload.customer_name, lang: payload.language,
      shopPhone: doc && doc.shop ? doc.shop.phone : null,
    };
  }

  /** BUG-096: a document re-read that started when [startSends] sends had begun may replace the
   * page's document only while no send runs, no request was received and no send began meanwhile. */
  function rereadApplies(state, startSends) {
    return !state.sending && !state.confirm && state.sends === startSends;
  }

  /** Amendment 2, item 15: the same id only for a resend of the unchanged form, else a new one. */
  function requestIdFor(last, fp, newId) {
    return last && last.fp === fp ? last.id : newId();
  }

  /** What the page does with the function's answer (README `online-order`, copy "Refusals"). */
  function outcome(status, body) {
    const code = body && typeof body.error === 'string' ? body.error : null;
    if (status === 201 || status === 200) {
      if (body && typeof body.request_id === 'string' && UUID.test(body.request_id)) {
        return { kind: 'ok', requestId: body.request_id, replayed: body.replayed === true };
      }
      return { kind: 'alert', alert: 'send.server', retry: true };
    }
    if (status === 404 && code === 'page_not_available') return { kind: 'na' };
    if (status === 403 && code === 'bot_check_failed') return { kind: 'alert', alert: 'send.botFailed', retry: true };
    if (status === 429 && code === 'limit_phone_open') return { kind: 'alert', alert: 'send.openLimit', tone: 'sand', wa: true };
    if (status === 429 && (code === 'limit_network' || code === 'limit_shop')) {
      return { kind: 'alert', alert: 'send.rateLimit', retry: true };
    }
    if (status === 400) {
      switch (code) {
        case 'invalid_phone': return { kind: 'field', field: 'phone', error: 'err.phoneInvalid' };
        case 'branch_required':
        case 'branch_inactive': return { kind: 'field', field: 'branch', error: 'err.branchRequired', refresh: true };
        case 'desired_date_too_early': return { kind: 'field', field: 'date', error: 'err.dateEarly', refresh: true };
        case 'instagram_url_invalid': return { kind: 'field', field: 'insta', error: 'err.instagramInvalid' };
        case 'measurements_input_invalid':
        case 'unknown_measurement_field': return { kind: 'field', field: 'meas', error: null };
        // A model deactivated since the page loaded, or another field the page could not catch.
        case 'invalid_input': return { kind: 'refresh' };
        default: break;
      }
    }
    // 413, 5xx, 503 not_configured, an unreadable answer (the function ignores `photos` since ADR-0037,
    // so photo_invalid no longer comes; an old function's answer would land here too).
    return { kind: 'alert', alert: 'send.server', retry: true };
  }

  /** The 10 x first-error order of the form (focus goes to the first). */
  const FIELD_ORDER = ['name', 'phone', 'model', 'insta', 'branch']
    .concat(MEAS_KEYS.map(function (k) { return 'meas.' + k; }), ['pieces', 'notes', 'date']);

  // ---------------------------------------------------------------------------------------------
  // The page (browser only)

  function start() {
    const doc = win.document;
    const S = win.ORDER_STRINGS || { ar: {}, en: {} };
    const CFG = win.ORDER_CONFIG || {};
    const $ = function (id) { return doc.getElementById(id); };
    const html = doc.documentElement;
    const framed = isFramed(win);
    html.classList.add('js');
    if ('scrollRestoration' in win.history) win.history.scrollRestoration = 'manual';

    const st = {
      lang: 'ar', h: '', m: '', doc: null, view: 'loading',
      kind: null, chosen: null, note: false,
      branchId: null, measOpen: false, measMode: 'SHOP', activePoint: null,
      errors: {}, summary: null, alert: null, sending: false, sends: 0, last: null, confirm: null, sheet: null,
    };
    let sheetOpener = null;

    const t = function (id) { return text(S, st.lang, id); };

    // ---- small DOM helpers (text only) ----
    function el(tag, attrs, children) {
      const e = doc.createElement(tag);
      Object.keys(attrs || {}).forEach(function (k) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : String(v));
      });
      (children || []).forEach(function (c) {
        if (c === null || c === undefined || c === false) return;
        e.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c);
      });
      return e;
    }
    function icon(name) { return $('ic-' + name).content.cloneNode(true); }
    /** A text by id with its placeholders as <bdi> (dir=ltr for numbers, codes, dates, links). */
    function frag(id, vars) {
      const f = doc.createDocumentFragment();
      fillParts(t(id), vars).forEach(function (p) {
        if (!p.isVar) { f.appendChild(doc.createTextNode(p.text)); return; }
        const b = doc.createElement('bdi');
        if (p.ltr) b.setAttribute('dir', 'ltr');
        b.textContent = p.text;
        f.appendChild(b);
      });
      return f;
    }
    function setChildren(node, children) {
      while (node.firstChild) node.removeChild(node.firstChild);
      children.forEach(function (c) { if (c) node.appendChild(c); });
    }
    const ltr = function (value) { return { text: value, ltr: true }; };

    // ---- language ----
    function storedLang() {
      try {
        const v = win.localStorage.getItem(LANG_KEY);
        return v === 'ar' || v === 'en' ? v : null;
      } catch (e) {
        return null;
      }
    }
    function storeLang(lang) {
      try { win.localStorage.setItem(LANG_KEY, lang); } catch (e) { /* storage blocked */ }
    }
    function applyStatic() {
      html.setAttribute('lang', st.lang);
      html.setAttribute('dir', st.lang === 'en' ? 'ltr' : 'rtl');
      doc.querySelectorAll('[data-s]').forEach(function (n) { n.textContent = t(n.getAttribute('data-s')); });
      doc.querySelectorAll('[data-s-attr]').forEach(function (n) {
        n.getAttribute('data-s-attr').split(';').forEach(function (pair) {
          const i = pair.indexOf('=');
          n.setAttribute(pair.slice(0, i), t(pair.slice(i + 1)));
        });
      });
      doc.querySelectorAll('[data-href-ar]').forEach(function (n) {
        n.setAttribute('href', n.getAttribute(st.lang === 'en' ? 'data-href-en' : 'data-href-ar'));
      });
      const sw = doc.querySelector('#o-lang [data-s]');
      if (sw) sw.setAttribute('lang', st.lang === 'en' ? 'ar' : 'en');
    }
    function updateUrl() {
      if (!st.h) return;
      try {
        win.history.replaceState(win.history.state, '', cleanPath(st.h, st.m, st.lang));
      } catch (e) {
        // file: or a sandbox: keep the address
      }
    }
    function setLang(lang) {
      st.lang = lang;
      applyStatic();
      renderAll();
      updateUrl();
    }

    // ---- views ----
    function showView(name) {
      st.view = name;
      ['loading', 'error', 'na', 'shop'].forEach(function (v) { $('v-' + v).hidden = v !== name; });
      renderTitle();
    }
    function renderTitle() {
      if (st.view === 'shop' && st.doc) doc.title = fillText(t('page.titleShop'), { shopName: st.doc.shop.name });
      else if (st.view === 'na') doc.title = t('page.titleNotAvailable');
      else doc.title = t('meta.title');
    }
    function showNa() {
      showView('na');
      $('o-na-title').focus({ preventScroll: true });
    }

    // ---- loading the page document ----
    const fetchFn = function (url, options) { return win.fetch(url, options); };
    function pageUrl() {
      return CFG.FUNCTION_URL + '?h=' + encodeURIComponent(st.h) + (st.m ? '&m=' + encodeURIComponent(st.m) : '');
    }
    /** GET the document: 'ok' (st.doc set), 'na', 'error' or 'offline' (no answer). [fresh]: past the
     * browser cache (W3: re-reads after a refusal or a failing image). [applies] (BUG-096): asked when
     * the answer arrives; false leaves st.doc as it is and answers 'skipped'. */
    async function fetchDoc(fresh, applies) {
      let r;
      try {
        r = await fetchJson(fetchFn, pageUrl(), fresh ? { method: 'GET', cache: 'no-store' } : { method: 'GET' }, GET_TIMEOUT_MS);
      } catch (e) {
        return 'offline';
      }
      if (applies && !applies()) return 'skipped';
      const kind = docResult(r.status, r.body);
      if (kind !== 'ok') return kind;
      st.doc = sanitizeDoc(r.body, win.location.protocol);
      if (st.doc.handle && st.doc.handle !== st.h) {
        st.h = st.doc.handle; // an alias: show the current handle (ADR-0036 section 4)
        updateUrl();
      }
      return 'ok';
    }
    let loadFailures = 0;
    /** [retried]: from the load error's Retry (past the cache). */
    async function load(retried) {
      showView('loading');
      // W10: inside another site's frame the form is never shown.
      if (framed || !st.h || !CFG.FUNCTION_URL) { showNa(); return; }
      const r = await fetchDoc(retried === true);
      loadFailures = r === 'offline' ? loadFailures + 1 : 0;
      const view = loadView(r, loadFailures, win.navigator.onLine);
      if (view === 'na') { showNa(); return; }
      if (view === 'error') { showView('error'); return; }
      resetForm(true);
      showView('shop');
      renderAll();
      bot.init();
      if (st.chosen) scrollToNode($('order'));
    }

    // ---- form state ----
    function resetForm(fromLink) {
      const d = st.doc;
      Object.assign(st, {
        kind: d.models.length > 0 ? 'pick' : 'insta',
        chosen: fromLink ? d.model : null,
        note: fromLink && d.model_unavailable,
        branchId: null, measOpen: false, measMode: 'SHOP', activePoint: null,
        errors: {}, summary: null, alert: null, sending: false, last: null, confirm: null,
      });
      $('o-form').reset();
      $('f-pieces').value = '1';
      const cc = $('f-cc');
      const codes = COUNTRY_CODES.slice();
      if (d.phone_country_code && codes.indexOf(d.phone_country_code) < 0) codes.unshift(d.phone_country_code);
      setChildren(cc, codes.map(function (c) { return el('option', { value: c, text: c }); }));
      cc.value = d.phone_country_code || codes[0];
      const date = $('f-date');
      if (d.min_desired_date) date.setAttribute('min', d.min_desired_date);
      else date.removeAttribute('min');
      setSending(false);
    }
    function values() {
      const meas = {};
      MEAS_KEYS.forEach(function (k) { meas[k] = $('m-' + k).value; });
      const checked = doc.querySelector('input[name="contact"]:checked');
      return {
        name: $('f-name').value, cc: $('f-cc').value, phone: $('f-phone').value,
        kind: st.kind, chosen: st.chosen,
        insta: $('f-insta').value, branchId: st.branchId, measMode: st.measMode, meas: meas,
        pieces: $('f-pieces').value, notes: $('f-notes').value, date: $('f-date').value,
        contact: checked ? checked.value : 'WHATSAPP', lang: st.lang,
      };
    }
    function modelByCode(code) {
      return st.doc.models.find(function (m) { return m.code === code; }) || null;
    }

    // ---- rendering ----
    function renderAll() {
      renderTitle();
      if (!st.doc) return;
      renderShop();
      renderBranches();
      renderModels();
      renderKind();
      renderPick();
      renderBranchField();
      renderPieces();
      renderCounter();
      renderDateHelp();
      renderErrors();
      renderAlert();
      renderSubmit();
      renderConfirm();
      renderSheet();
      syncChecked();
    }

    function renderShop() {
      const shop = st.doc.shop;
      $('o-shop-name').textContent = shop.name;
      const logo = $('o-logo');
      if (shop.logo_url) {
        setChildren(logo, [el('img', { onerror: onImageError, src: shop.logo_url, alt: fillText(t('shop.logoAlt'), { shopName: shop.name }) })]);
        logo.removeAttribute('aria-hidden');
      } else {
        setChildren(logo, [doc.createTextNode(Array.from(shop.name.trim())[0] || '')]);
        logo.setAttribute('aria-hidden', 'true');
      }
      const phone = $('o-shop-phone');
      phone.hidden = !shop.phone;
      setChildren(phone, shop.phone ? [el('bdi', { dir: 'ltr', text: shop.phone })] : []);
      const wa = whatsappLink(shop.phone, null);
      $('o-shop-wa').hidden = !wa;
      if (wa) $('o-shop-wa').setAttribute('href', wa);
      $('o-shop-call').hidden = !shop.phone;
      if (shop.phone) $('o-shop-call').setAttribute('href', 'tel:' + shop.phone);
      const inForm = !st.confirm;
      ['o-branches', 'o-models', 'order'].forEach(function (id) { $(id).hidden = !inForm; });
      $('o-model-note').hidden = !(inForm && st.note);
      $('o-confirm').hidden = inForm;
      $('o-shop-order').hidden = !inForm;
    }

    function renderBranches() {
      setChildren($('o-branch-list'), st.doc.branches.map(function (b) {
        return el('li', { class: 'o-brc' }, [icon('pin'), el('span', { class: 'o-brc-tx' }, [
          el('b', { text: b.name }), b.location ? el('span', { text: b.location }) : null])]);
      }));
    }

    /** "Price: 25.000 BHD" (model.price), the amount and its code in one LTR isolate; none without a price. */
    function priceLine(m) {
      const amount = modelPrice(m);
      return amount ? el('span', { class: 'o-pr' }, [frag('model.price', { amount: ltr(amount) })]) : null;
    }
    /** mode: 'button' (opens the details sheet), 'plain' (gallery) or 'thumb' (chosen-model row, no counter). */
    function photoNode(m, index, mode) {
      const n = m.photo_urls.length;
      if (n === 0) {
        return el('span', { class: 'o-ph o-ph--ig', 'aria-hidden': 'true' }, [icon('link'), el('span', { text: 'Instagram' })]);
      }
      const img = el('img', {
        onerror: onImageError, src: m.photo_urls[index], loading: 'lazy', decoding: 'async',
        alt: fillText(t('model.photoAlt'), { index: String(index + 1), count: String(n), name: m.name }),
      });
      const cnt = n > 1 && mode !== 'thumb' ? el('span', { class: 'o-cnt', dir: 'ltr', 'aria-hidden': 'true', text: (index + 1) + '/' + n }) : null;
      const button = mode === 'button';
      return el(button ? 'button' : 'span', { class: 'o-ph', type: button ? 'button' : null }, [img, cnt]);
    }
    function modelCard(m) {
      const on = st.kind === 'pick' && st.chosen === m.code;
      const ph = photoNode(m, 0, 'button');
      if (ph.tagName === 'BUTTON') {
        ph.setAttribute('aria-label', t('model.details') + ': ' + m.name);
        ph.addEventListener('click', function () { openSheet({ type: 'details', code: m.code }, ph); });
      }
      const nameBtn = el('button', { type: 'button', class: 'o-nm', text: m.name });
      nameBtn.addEventListener('click', function () { openSheet({ type: 'details', code: m.code }, nameBtn); });
      return el('article', { class: 'o-mc' + (on ? ' is-on' : '') }, [ph, el('div', { class: 'o-mc-t' }, [
        el('bdi', { class: 'o-code', dir: 'ltr', text: m.code }),
        nameBtn,
        priceLine(m),
        on ? el('span', { class: 'o-chosen' }, [icon('check'), el('span', { text: t('model.chosen') })])
          : el('button', { type: 'button', class: 'btn btn--ghost', text: t('model.choose'), onclick: function () { choose(m.code); } }),
        m.instagram_url ? el('a', { class: 'o-lnk', href: m.instagram_url, target: '_blank', rel: 'noopener noreferrer' },
          [icon('link'), el('span', { text: t('model.instagram') })]) : null,
      ])]);
    }
    function renderModels() {
      const has = st.doc.models.length > 0;
      $('o-no-models').hidden = has;
      $('o-models-intro').hidden = !has;
      setChildren($('o-model-grid'), st.doc.models.map(modelCard));
      // S-29b.15: without listed models there is nothing to choose between; the link field stands alone.
      $('f-kind-pick-row').hidden = !has;
      $('f-kind-insta-row').hidden = !has;
      $('f-insta-panel').classList.toggle('o-sub--alone', !has);
    }

    function renderKind() {
      const kind = modelKind(st, st.doc);
      doc.querySelectorAll('input[name="mkind"]').forEach(function (r) { r.checked = r.value === kind; });
      $('f-pick-panel').hidden = kind !== 'pick';
      $('f-insta-panel').hidden = kind !== 'insta';
    }

    function renderPick() {
      const m = st.chosen ? modelByCode(st.chosen) : null;
      if (m) {
        setChildren($('f-pick-panel'), [el('div', { class: 'o-pick' }, [
          photoNode(m, 0, 'thumb'),
          el('span', { class: 'o-pick-tx' }, [el('bdi', { class: 'o-code', dir: 'ltr', text: m.code }), el('b', { text: m.name }), priceLine(m)]),
          el('button', { type: 'button', class: 'o-txt', text: t('common.change'), onclick: function () { scrollToNode($('o-models')); } }),
        ])]);
      } else {
        const open = el('button', { type: 'button', class: 'btn btn--ghost o-btn-s', text: t('form.modelPickOpen') });
        open.addEventListener('click', function () { openSheet({ type: 'picker' }, open); });
        setChildren($('f-pick-panel'), [el('p', { class: 'o-hl', text: t('form.modelPickNone') }), open]);
      }
    }

    function renderBranchField() {
      const many = st.doc.branches.length > 1;
      $('f-branch').hidden = !many;
      if (!many) { setChildren($('f-branch-list'), []); return; }
      setChildren($('f-branch-list'), st.doc.branches.map(function (b) {
        const input = el('input', { type: 'radio', name: 'branch', value: b.id });
        input.checked = st.branchId === b.id;
        input.addEventListener('change', function () { st.branchId = b.id; recheck('branch'); syncChecked(); });
        return el('label', { class: 'o-rc' }, [input, el('span', { class: 'o-dot', 'aria-hidden': 'true' }),
          el('span', { class: 'o-rc-tx' }, [el('b', { text: b.name }), b.location ? el('small', { text: b.location }) : null])]);
      }));
    }

    function measCount() {
      return MEAS_KEYS.filter(function (k) { return parseMeasure($('m-' + k).value) !== null; }).length;
    }
    function renderMeas() {
      $('f-meas-toggle').setAttribute('aria-expanded', st.measOpen ? 'true' : 'false');
      $('f-meas-body').hidden = !st.measOpen;
      doc.querySelectorAll('input[name="mmode"]').forEach(function (r) { r.checked = r.value === st.measMode; });
      $('f-meas-enter').hidden = st.measMode !== 'ENTERED';
      const summary = { SHOP: 'meas.optShop', LAST: 'meas.optLast', ENTERED: 'meas.optEnter' }[st.measMode];
      setChildren($('f-meas-summary'), [doc.createTextNode(t(summary)), st.measMode === 'ENTERED'
        ? doc.createTextNode(' · ') : null, st.measMode === 'ENTERED' ? frag('meas.enteredCount', { count: ltr(String(measCount())) }) : null]);
      MEAS_KEYS.forEach(function (k) {
        const raw = westernDigits(trimText($('m-' + k).value));
        const err = !!st.errors['meas.' + k];
        const filled = raw !== '';
        const row = doc.querySelector('.o-mr[data-point="' + k + '"]');
        row.classList.toggle('is-filled', filled && !err);
        row.classList.toggle('is-error', err);
        const spot = doc.querySelector('.o-hs[data-point="' + k + '"]');
        spot.classList.toggle('is-filled', filled && !err);
        spot.classList.toggle('is-error', err);
        spot.classList.toggle('is-active', st.activePoint === k);
        const chip = doc.querySelector('.o-vc[data-chip="' + k + '"]');
        chip.hidden = !filled;
        chip.textContent = raw;
        chip.classList.toggle('is-error', err);
      });
    }

    function renderPieces() {
      const n = Number(westernDigits($('f-pieces').value));
      $('f-pieces-less').disabled = st.sending || !(n > 1);
      $('f-pieces-more').disabled = st.sending || !(n < 99);
    }
    function renderCounter() {
      setChildren($('f-notes-count'), [el('bdi', { dir: 'ltr' }, [frag('form.counter', {
        count: String($('f-notes').value.length), max: '500' })])]);
    }
    function renderDateHelp() {
      const d = formatDate(st.doc.min_desired_date);
      const help = $('f-date-help');
      help.hidden = !d || !!st.errors.date;
      setChildren(help, d ? [frag('form.dateHelp', { date: ltr(d) })] : []);
    }

    /** One error line: alert icon + text; aria-invalid on the control. */
    function showError(errId, controlId, err) {
      const node = $(errId);
      node.hidden = !err;
      setChildren(node, err ? [icon('alert'), el('span', {}, [frag(err.id, err.vars)])] : []);
      if (controlId) {
        const c = $(controlId);
        if (err) c.setAttribute('aria-invalid', 'true');
        else c.removeAttribute('aria-invalid');
      }
    }
    function renderErrors() {
      const e = st.errors;
      showError('f-name-err', 'f-name', e.name);
      showError('f-phone-err', 'f-phone', e.phone);
      showError('f-model-err', 'f-model', e.model);
      showError('f-insta-err', 'f-insta', e.insta);
      showError('f-branch-err', 'f-branch', e.branch);
      MEAS_KEYS.forEach(function (k) { showError('m-' + k + '-err', 'm-' + k, e['meas.' + k]); });
      showError('f-pieces-err', 'f-pieces', e.pieces);
      showError('f-notes-err', 'f-notes', e.notes);
      showError('f-date-err', 'f-date', e.date);
      $('f-phone-help').hidden = !!e.phone;
      $('f-insta-help').hidden = !!e.insta;
      renderDateHelp();
      const summary = $('o-summary');
      summary.hidden = !st.summary;
      $('o-summary-text').textContent = st.summary ? t(st.summary) : '';
      if (st.doc) renderMeas();
    }

    function renderAlert() {
      const box = $('o-alert');
      const a = st.alert;
      box.hidden = !a;
      if (!a) { setChildren(box, []); return; }
      const acts = [];
      if (a.retry) acts.push(el('button', { type: 'button', class: 'btn btn--ghost o-btn-s', text: t('common.retry'), onclick: retry }));
      if (a.wa) {
        const link = whatsappLink(st.doc.shop.phone, whatsappText(S, st.lang, { kind: 'openLimit', customerName: trimText($('f-name').value) }));
        if (link) {
          acts.push(el('a', { class: 'btn o-btn-s', href: link, target: '_blank', rel: 'noopener noreferrer' },
            [icon('chat'), el('span', { text: t('confirm.whatsapp') })]));
        }
      }
      setChildren(box, [el('div', { class: 'o-note ' + (a.tone === 'sand' ? 'o-note--sand' : 'o-note--err'), role: 'alert', tabindex: '-1' },
        [icon(a.tone === 'sand' ? 'info' : 'alert'), el('div', { class: 'o-note-body' }, [el('p', { text: t(a.alert) }),
          acts.length ? el('div', { class: 'o-note-acts' }, acts) : null])])]);
    }

    function renderSubmit() {
      const b = $('o-submit');
      b.setAttribute('aria-busy', st.sending ? 'true' : 'false');
      b.disabled = st.sending;
      $('o-submit-text').textContent = t(st.sending ? 'form.sending' : 'form.submit');
      $('o-fields').disabled = st.sending;
      renderPieces();
    }
    function setSending(on) {
      st.sending = on;
      renderSubmit();
    }

    function renderConfirm() {
      const c = st.confirm;
      if (!c) return;
      const model = c.kind === 'pick' ? [ltr(c.code), c.name] : t('form.modelInstagram');
      setChildren($('o-sum-model'), [frag('confirm.summaryModel', { model: model })]);
      $('o-sum-branch').hidden = !c.branchName;
      setChildren($('o-sum-branch'), c.branchName ? [frag('confirm.summaryBranch', { branch: c.branchName })] : []);
      const link = whatsappLink(c.shopPhone, whatsappText(S, c.lang, {
        kind: c.kind === 'pick' ? 'model' : 'insta', code: c.code, name: c.name, url: c.url, customerName: c.customerName,
      }));
      $('o-confirm-wa').hidden = !link;
      if (link) $('o-confirm-wa-link').setAttribute('href', link);
    }

    /** Radio labels carry .is-checked (styling without :has()). */
    function syncChecked() {
      doc.querySelectorAll('.o-rc, .o-chip').forEach(function (l) {
        const i = l.querySelector('input');
        l.classList.toggle('is-checked', !!(i && i.checked));
      });
    }

    function scrollToNode(node) {
      if (!node) return;
      node.scrollIntoView({ block: 'start' });
    }

    // ---- model choice ----
    function renderModelChoice() {
      renderModels();
      renderKind();
      renderPick();
      syncChecked();
    }
    function choose(code) {
      st.kind = 'pick';
      st.chosen = code;
      delete st.errors.model;
      closeSheet();
      renderModelChoice();
      renderErrors();
      scrollToNode($('f-model'));
    }

    // ---- bot check (Cloudflare Turnstile, explicit render; ADR-0036 section 5 step 2) ----
    const tokens = createTokenBox(TOKEN_TIMEOUT_MS);
    const bot = {
      id: null, state: 'off',
      configured: function () {
        const k = CFG.TURNSTILE_SITE_KEY;
        return typeof k === 'string' && k !== '' && !/^__.*__$/.test(k);
      },
      init: function () {
        if (!bot.configured() || bot.state === 'loading' || bot.state === 'ready') return;
        bot.state = 'loading';
        if (win.turnstile) { bot.render(); return; }
        const s = doc.createElement('script');
        s.src = TURNSTILE_SRC;
        s.async = true;
        s.onload = bot.render;
        s.onerror = function () { s.remove(); bot.fail(); };
        doc.head.appendChild(s);
      },
      render: function () {
        try {
          bot.id = win.turnstile.render($('o-turnstile'), {
            sitekey: CFG.TURNSTILE_SITE_KEY,
            language: st.lang,
            theme: 'light',
            appearance: 'interaction-only',
            'refresh-expired': 'auto',
            callback: function (token) { tokens.put(token); },
            'expired-callback': function () { tokens.clear(); },
            'error-callback': function () { tokens.clear(); tokens.flush(); },
          });
          bot.state = 'ready';
        } catch (e) {
          bot.fail();
        }
      },
      fail: function () { bot.state = 'failed'; tokens.flush(); },
      /** {token, timedOut}: a fresh single-use token, or token null (placeholder key, script blocked,
       * check failed; timedOut when no token came in time, the widget may still deliver one). */
      get: function () {
        const none = { token: null, timedOut: false };
        if (!bot.configured()) return Promise.resolve(none);
        if (bot.state === 'failed' || bot.state === 'off') { bot.state = 'off'; bot.init(); }
        if (bot.state === 'failed') return Promise.resolve(none);
        return tokens.wait();
      },
      /** After a send or a check error: the token was spent (or may have been); a new check starts.
       * Never after a timeout (W1): no token was spent and the running check would be thrown away. */
      reset: function () {
        tokens.clear();
        if (bot.id !== null && win.turnstile) {
          try { win.turnstile.reset(bot.id); } catch (e) { /* widget gone */ }
        }
      },
    };

    // ---- sending ----
    function focusFirstError() {
      const first = FIELD_ORDER.find(function (k) { return st.errors[k]; });
      if (!first) return;
      let target;
      if (first.slice(0, 5) === 'meas.') {
        st.measOpen = true;
        renderMeas();
        target = $('m-' + first.slice(5));
      } else if (first === 'model') {
        const radios = Array.from(doc.querySelectorAll('input[name="mkind"]')).filter(function (r) { return !r.closest('[hidden]'); });
        target = radios.find(function (r) { return r.checked; }) || radios[0];
      } else if (first === 'branch') {
        target = doc.querySelector('input[name="branch"]');
      } else {
        target = $({ name: 'f-name', phone: 'f-phone', insta: 'f-insta', pieces: 'f-pieces', notes: 'f-notes', date: 'f-date' }[first]);
      }
      if (target) {
        scrollToNode(target.closest('.o-f, .o-mr, .o-set') || target);
        target.focus({ preventScroll: true });
      }
    }
    function focusAlert() {
      const n = $('o-alert').firstChild;
      if (n) { scrollToNode($('o-alert')); n.focus({ preventScroll: true }); }
    }

    /**
     * W2: busy from the first tap, before any wait (the bot check, the answer), and idle again on
     * every way out; the button stays disabled meanwhile. The steps answer
     * what to show, which runs once the form is enabled again (focus cannot go into a disabled form).
     */
    async function submit() {
      if (st.sending || !st.doc) return;
      st.sends += 1;
      setSending(true);
      let show;
      try {
        show = await attempt();
      } catch (e) {
        st.alert = { alert: 'send.server', retry: true };
        show = showAlert;
      } finally {
        setSending(false);
      }
      show();
    }
    function retry() { submit(); }
    function showAlert() {
      renderAlert();
      focusAlert();
    }
    function showFieldErrors() {
      renderErrors();
      focusFirstError();
    }

    async function attempt() {
      const v = values();
      st.alert = null;
      st.errors = validate(v, st.doc);
      st.summary = Object.keys(st.errors).length ? 'form.errorSummary' : null;
      renderErrors();
      renderAlert();
      if (st.summary) return focusFirstError;
      return send(v);
    }

    async function send(v) {
      const payload = buildPayload(v, st.doc);
      const sent = confirmSnapshot(v, payload, st.doc);
      const fp = fingerprint(payload);
      const id = requestIdFor(st.last, fp, function () { return uuidv4(win.crypto); });
      st.last = { fp: fp, id: id };
      const got = await bot.get();
      if (!got.token) {
        if (!got.timedOut) bot.reset(); // W1: a timeout spent no token; the running check goes on
        st.alert = { alert: 'send.botFailed', retry: true };
        return showAlert;
      }
      const body = Object.assign({ client_request_id: id }, payload, { turnstile_token: got.token });
      let res;
      try {
        res = await fetchJson(fetchFn, CFG.FUNCTION_URL, {
          method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        }, POST_TIMEOUT_MS);
      } catch (e) {
        bot.reset();
        st.alert = { alert: 'send.offline', retry: true };
        return showAlert;
      }
      bot.reset();
      return handle(outcome(res.status, res.body), sent);
    }

    /** The answer's effect on the state; answers what to show. [sent]: the confirmation snapshot of
     * what this send sent (BUG-096). */
    async function handle(o, sent) {
      if (o.kind === 'ok') {
        st.confirm = sent;
        return function () {
          renderShop();
          renderConfirm();
          win.scrollTo(0, 0);
          $('o-confirm-title').focus({ preventScroll: true });
        };
      }
      if (o.kind === 'na') return showNa;
      if (o.kind === 'alert') {
        st.alert = o;
        return showAlert;
      }
      if (o.kind === 'refresh' || o.refresh) {
        // W3, W8: the current document (no cache), then the page's own checks against it.
        const r = await fetchDoc(true);
        if (r === 'na') return showNa;
        if (r === 'ok') refreshForm();
        st.errors = refusalErrors(o, values(), st.doc, r === 'ok');
        if (!Object.keys(st.errors).length) {
          st.alert = { alert: 'send.server', retry: true };
          return showAlert;
        }
        st.summary = 'send.invalid';
        return showFieldErrors;
      }
      // A field the server refused (kind 'field').
      st.errors = {};
      st.summary = 'send.invalid';
      if (o.field !== 'meas') {
        st.errors[o.field] = { id: o.error };
        return showFieldErrors;
      }
      st.measOpen = true;
      return function () {
        renderErrors();
        scrollToNode($('f-meas'));
        $('f-meas-toggle').focus({ preventScroll: true });
      };
    }

    /** After a new document: keep what is still offered (model, branch), new date limit. */
    function refreshForm() {
      const kept = afterRefresh(st, st.doc);
      st.kind = kept.kind;
      st.chosen = kept.chosen;
      st.branchId = kept.branchId;
      if (kept.lostModel) st.note = true;
      const date = $('f-date');
      if (st.doc.min_desired_date) date.setAttribute('min', st.doc.min_desired_date);
      else date.removeAttribute('min');
      renderAll();
    }

    /** W9: a failing image (signed links expire after an hour) re-reads the document, at most once a
     * minute, never while a request is being sent or after it was received; an answer that arrives
     * once a send has begun is dropped (BUG-096: the page never replaces its document during a send). */
    const imageRefresh = createThrottle(IMAGE_REFRESH_MS);
    function onImageError() {
      if (st.view !== 'shop' || st.sending || st.confirm || !imageRefresh(Date.now())) return;
      const sends = st.sends;
      fetchDoc(true, function () { return rereadApplies(st, sends); }).then(function (r) {
        if (r === 'skipped') return;
        if (r === 'ok') refreshForm();
        else if (r === 'na') showNa();
      });
    }

    /** Recheck one field after a change, when it already shows an error (copy "Field errors"). */
    function recheck(key) {
      if (!st.errors[key]) return;
      const e = validate(values(), st.doc);
      if (e[key]) st.errors[key] = e[key];
      else delete st.errors[key];
      if (!Object.keys(st.errors).length) st.summary = null;
      renderErrors();
    }

    // ---- sheet (model details / model picker; Back closes it) ----
    function renderSheet() {
      const s = st.sheet;
      if (!s || !st.doc) return;
      const body = $('o-sheet-body');
      if (s.type === 'picker') {
        $('o-sheet-title').textContent = t('form.modelPickOpen');
        setChildren(body, [el('div', { class: 'o-grid o-grid--one' }, st.doc.models.map(modelCard))]);
        return;
      }
      const m = modelByCode(s.code);
      if (!m) { closeSheet(); return; }
      $('o-sheet-title').textContent = m.name;
      const gallery = m.photo_urls.length
        ? el('div', { class: 'o-gal' }, m.photo_urls.map(function (u, i) { return photoNode(m, i, 'plain'); }))
        : photoNode(m, 0, 'plain');
      const on = st.kind === 'pick' && st.chosen === m.code;
      setChildren(body, [
        gallery,
        m.description ? el('p', { class: 'o-desc', text: m.description }) : null,
        priceLine(m),
        el('p', { class: 'o-small' }, [frag('model.code', { code: ltr(m.code) })]),
        on ? el('span', { class: 'o-chosen' }, [icon('check'), el('span', { text: t('model.chosen') })])
          : el('button', { type: 'button', class: 'btn o-block', text: t('model.choose'), onclick: function () { choose(m.code); } }),
        m.instagram_url ? el('a', { class: 'o-txt', href: m.instagram_url, target: '_blank', rel: 'noopener noreferrer' },
          [icon('link'), el('span', { text: t('model.instagram') })]) : null,
      ]);
    }
    function setInert(on) {
      ['main', 'o-top', 'o-foot'].forEach(function (sel) {
        const n = sel === 'main' ? $('main') : doc.querySelector('.' + sel);
        if (!n) return;
        n.inert = on;
        if (on) n.setAttribute('aria-hidden', 'true');
        else n.removeAttribute('aria-hidden');
      });
    }
    function openSheet(spec, opener) {
      const wasOpen = !!st.sheet;
      st.sheet = spec;
      sheetOpener = wasOpen ? sheetOpener : opener;
      renderSheet();
      $('o-sheet').hidden = false;
      setInert(true);
      if (!wasOpen) {
        try { win.history.pushState({ oSheet: true }, ''); } catch (e) { /* no history */ }
      }
      $('o-sheet').querySelector('.o-sheet').focus();
    }
    function closeSheet(fromPop) {
      if (!st.sheet) return;
      st.sheet = null;
      $('o-sheet').hidden = true;
      setInert(false);
      if (!fromPop && win.history.state && win.history.state.oSheet) win.history.back();
      if (sheetOpener && doc.contains(sheetOpener)) sheetOpener.focus({ preventScroll: true });
      sheetOpener = null;
    }

    // ---- events ----
    function bind() {
      $('o-lang').addEventListener('click', function () {
        const lang = st.lang === 'en' ? 'ar' : 'en';
        storeLang(lang);
        setLang(lang);
      });
      $('o-load-retry').addEventListener('click', function () { load(true); });
      $('o-shop-order').addEventListener('click', function (e) {
        e.preventDefault();
        scrollToNode($('order'));
        $('order').focus({ preventScroll: true });
      });
      $('o-form').addEventListener('submit', function (e) { e.preventDefault(); submit(); });
      doc.querySelectorAll('input[name="mkind"]').forEach(function (r) {
        r.addEventListener('change', function () {
          st.kind = r.value;
          renderModelChoice();
          recheck('model');
          if (st.errors.insta && st.kind !== 'insta') { delete st.errors.insta; renderErrors(); }
        });
      });
      $('f-meas-toggle').addEventListener('click', function () {
        st.measOpen = !st.measOpen;
        renderMeas();
      });
      doc.querySelectorAll('input[name="mmode"]').forEach(function (r) {
        r.addEventListener('change', function () {
          st.measMode = r.value;
          if (st.measMode !== 'ENTERED') {
            Object.keys(st.errors).forEach(function (k) { if (k.slice(0, 5) === 'meas.') delete st.errors[k]; });
            renderErrors();
          }
          renderMeas();
          syncChecked();
        });
      });
      MEAS_KEYS.forEach(function (k) {
        const input = $('m-' + k);
        input.addEventListener('input', renderMeas);
        input.addEventListener('focus', function () { st.activePoint = k; renderMeas(); });
        input.addEventListener('change', function () { recheck('meas.' + k); });
        input.addEventListener('blur', function () {
          if (st.activePoint === k) st.activePoint = null;
          renderMeas();
        });
      });
      doc.querySelectorAll('.o-hs').forEach(function (b) {
        b.addEventListener('click', function () { $('m-' + b.getAttribute('data-point')).focus(); });
      });
      $('f-pieces-less').addEventListener('click', function () { stepPieces(-1); });
      $('f-pieces-more').addEventListener('click', function () { stepPieces(1); });
      $('f-pieces').addEventListener('input', renderPieces);
      $('f-pieces').addEventListener('change', function () {
        const n = westernDigits($('f-pieces').value.trim());
        if (/^\d{1,2}$/.test(n) && Number(n) >= 1) $('f-pieces').value = String(Number(n));
        recheck('pieces');
        renderPieces();
      });
      $('f-notes').addEventListener('input', renderCounter);
      [['f-name', 'name'], ['f-phone', 'phone'], ['f-cc', 'phone'], ['f-insta', 'insta'], ['f-notes', 'notes'], ['f-date', 'date']]
        .forEach(function (pair) {
          // `change` fires when she leaves a field she edited (copy "Field errors": rechecked on leaving).
          $(pair[0]).addEventListener('change', function () {
            recheck(pair[1]);
            if (pair[1] === 'insta') recheck('model');
          });
        });
      doc.querySelectorAll('input[name="contact"]').forEach(function (r) { r.addEventListener('change', syncChecked); });
      $('o-confirm-back').addEventListener('click', function () {
        st.m = '';
        updateUrl();
        resetForm(false);
        renderAll();
        win.scrollTo(0, 0);
        $('o-shop-name').focus({ preventScroll: true });
      });
      doc.querySelectorAll('#o-sheet [data-close]').forEach(function (n) {
        n.addEventListener('click', function () { closeSheet(); });
      });
      doc.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && st.sheet) closeSheet();
      });
      win.addEventListener('popstate', function () { if (st.sheet) closeSheet(true); });
    }
    function stepPieces(delta) {
      const cur = Number(westernDigits($('f-pieces').value.trim()));
      const n = Math.min(99, Math.max(1, (Number.isFinite(cur) && cur >= 1 ? cur : 1) + delta));
      $('f-pieces').value = String(n);
      recheck('pieces');
      renderPieces();
    }

    // ---- start ----
    const params = parseParams(win.location.search);
    st.h = params.h;
    st.m = params.m;
    st.lang = params.lang || storedLang() || 'ar';
    bind();
    applyStatic();
    updateUrl();
    load();
  }

  return {
    MEAS_KEYS: MEAS_KEYS, COUNTRY_CODES: COUNTRY_CODES, FIELD_ORDER: FIELD_ORDER,
    westernDigits: westernDigits, trimText: trimText, charLength: charLength, normHandle: normHandle, normCode: normCode,
    parseParams: parseParams, cleanPath: cleanPath, normalizePhone: normalizePhone, instagramUrl: instagramUrl,
    parseMeasure: parseMeasure, formatAmount: formatAmount, modelPrice: modelPrice, formatDate: formatDate,
    modelKind: modelKind, createThrottle: createThrottle, createTokenBox: createTokenBox, fetchJson: fetchJson,
    docResult: docResult, loadView: loadView, isFramed: isFramed, uuidv4: uuidv4, text: text, fillParts: fillParts,
    fillText: fillText, whatsappText: whatsappText, whatsappLink: whatsappLink, safeUrl: safeUrl, sanitizeDoc: sanitizeDoc,
    validate: validate, afterRefresh: afterRefresh, refusalErrors: refusalErrors, buildPayload: buildPayload,
    fingerprint: fingerprint, requestIdFor: requestIdFor, outcome: outcome, confirmSnapshot: confirmSnapshot,
    rereadApplies: rereadApplies, start: start,
  };
}));
