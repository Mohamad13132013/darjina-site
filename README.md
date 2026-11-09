# darjina.com — marketing website

Static marketing site for **Darjina / دارجينا**, the app for abaya tailor shops in the GCC.
Arabic first (RTL) at the root, English (LTR) under `/en/`. Plain HTML + one CSS file + a tiny
vanilla JS file. No framework, no build step needed to host it.

## Structure

```
website/
  index.html                 Arabic home            (lang="ar" dir="rtl")
  features/ how-it-works/ about/ contact/ privacy/   Arabic pages (folder/index.html)
  404.html                   Arabic 404 (noindex)
  en/                        English mirror of every page + en/404.html (lang="en" dir="ltr")
  assets/css/site.css        the whole design system (logical properties, works for RTL and LTR)
  assets/js/site.js          mobile menu, language-choice memory, scroll reveal (respects reduced motion)
  assets/img/                logo, mark, favicons, Open Graph image
  favicon.ico  site.webmanifest  robots.txt  sitemap.xml
  content/ar/*.md  content/en/*.md   source copy from the copywriter / translator (not served pages)
  tools/                     optional page generator (see below); not needed by the host
  assets/logo-original.webp  the original logo file
```

Every page has: `<title>`, meta description, canonical (`https://darjina.com/...`), `hreflang`
alternates (ar, en, x-default = ar), Open Graph + Twitter card tags, JSON-LD `Organization`
(name, email, telephone +97334047233, url), skip link, one `<h1>`, landmark elements.
The language switch in the header links each page to its counterpart.

## How to edit content

The served HTML files are generated from page bodies plus a shared header/footer, so a nav or
footer change is made once:

1. Edit the page body in `tools/pages/<ar|en>/<page>.html` (the `<!--meta ... -->` block at the top
   holds the page title and meta description).
2. Shared pieces:
   - header, footer, `<head>`, nav labels, footer text, SEO defaults, icons: `tools/build.py`
     (the `S` dictionary holds the strings, copied from `content/<lang>/site.md`)
   - phone mock-ups and illustrations: `tools/partials/*.html`
   - text shown inside the phone mock-ups: `tools/mock_strings.json`
3. Rebuild: `python tools/build.py` (Python 3.8+, standard library only). It rewrites every page,
   `sitemap.xml`, `robots.txt` and `site.webmanifest`.

Placeholders in the body: `{{icon:name}}`, `{{> partial}}`, `{{t:key}}` (mock-up text),
`{{link:page}}` (language-aware URL), `{{wa}}`, `{{mail}}`, `{{tel}}`, `{{demo}}`.

A quick typo fix can also be made directly in the generated HTML, but it will be overwritten the
next time the generator runs, so prefer the source file.

Copy rules: the Arabic and English text is the copywriter's text from `content/*/*.md`, used as
written. Owner placeholders (`[يُحدَّد]`, `[TBD]`) are shown on purpose with a sand highlight
(`.tbd`) until the owner supplies the value.

## Palette (taken from the logo)

| Token | Hex | Use |
|---|---|---|
| `--ink` | `#0d1413` | logo background; header, footer, dark sections |
| `--teal-800` / `--teal-700` | `#1f4741` / `#285c54` | buttons and links on light (7:1 on paper) |
| `--sea` | `#4f8a80` | logo sea-green; decoration, large accents |
| `--sea-300` | `#8fc2b8` | accent text on dark |
| `--mint` | `#e4f1ee` | logo wordmark; light buttons, soft fills |
| `--paper` / `--surface` | `#f8fbfa` / `#ffffff` | light content sections, cards |
| `--text` / `--muted` | `#13201e` / `#475a56` | body text (AA on paper) |
| `--sand` / `--sand-ink` | `#d0ad74` / `#7a5820` | warm accent on dark / on light (eyebrows, focus ring) |

Focus ring: 3px sand outline on every interactive element. Motion is reduced to nothing under
`prefers-reduced-motion: reduce`.

## Fonts (Google Fonts, `display=swap`)

- Arabic pages: **El Messiri** (headings) + **IBM Plex Sans Arabic** (body).
- English pages: **Cormorant Garamond** (headings, echoes the logo's light serif) + IBM Plex Sans
  Arabic (its Latin glyphs are IBM Plex Sans) for body.
Each language loads only its own pair.

## Images

Made from `assets/logo-original.webp` (Pillow): `mark.webp/png` (figure, transparent, for dark
backgrounds only), `mark-512.*` (figure on the brand background), `logo-full.*` (transparent
stacked logo), `logo-full-dark.*` (stacked logo on the brand background, used in the footer),
`logo-horizontal.*` (header lock-up), `favicon-16/32.png`, `favicon.ico`, `apple-touch-icon.png`
(180), `icon-192/512.png`, `og-image.jpg/png` (1200x630). The transparent versions are cut from a
dark background, so use them on dark surfaces only. App screens are drawn in HTML/CSS
(`tools/partials/mock-*.html`), no screenshots or stock photos.

## Deployment

Pure static files: upload the `website/` folder to any static host (Netlify, Cloudflare Pages,
GitHub Pages, S3 + CloudFront, nginx...). Notes:

- Serve from the domain root (`https://darjina.com/`): links and assets use root-relative paths.
- Configure the host's 404 page to `/404.html` (most hosts pick it up automatically).
- `tools/`, `content/` and `README.md` are not needed online (robots.txt already disallows the
  first two); exclude them from the upload if the host allows.
- Long cache for `/assets/`; short cache for `*.html`.
- `sitemap.xml` uses today's date as `lastmod`; rerun the generator after edits.
- Local preview: `python -m http.server 8000` inside `website/`, then open http://localhost:8000/.

## Public order page `/o/` (TICKET-047, ADR-0036)

One static page for every shop's online orders: `https://darjina.com/o/<instagram handle>[/<model code>]`
and the ad-safe form `https://darjina.com/o/?h=<handle>[&m=<code>]` (HTTP 200; use it for paid ads).

How it works:
- GitHub Pages has no rewrites, so a path link hits `404.html`. Its first `<head>` element (written by
  `tools/build.py`) matches `^/o/([^/?#]+)(?:/([^/?#]+))?/?$` and calls `location.replace('/o/?h=…&m=…')`
  (keeps `?lang=` and the `#fragment`). `/o/index.html` lowercases handle and code, restores the clean
  path with `history.replaceState`, then loads the shop's public document from the Edge Function
  `online-order` (GET) and sends the request (POST). No Supabase key is used.
- Link previews (ADR-0036 amendment 2 item 22): crawlers do not run the forwarder and get the root
  `404.html` (HTTP 404) for a path link, so its `<title>`, description, Open Graph and Twitter tags are
  the order page's generic preview (`meta.*` texts, `og:url` `/o/`); its visible body stays the
  not-found page. `en/404.html` keeps its own not-found tags. The ad-safe link (HTTP 200) always previews.
- Files: `tools/pages/o.html` (page source, text ids) -> `o/index.html` (noindex, not in the sitemap,
  `Disallow: /o/` in robots.txt, Content-Security-Policy), `assets/js/order.js` (vanilla, no framework),
  `assets/js/order-strings.js` (texts, generated: `python tools/gen_order_strings.py` reads
  `docs/design/_build/web_copy.py` of the main repository; then `python tools/build.py`),
  `assets/css/order.css`, `assets/img/abaya-measurements.svg` (copy of the design asset, inlined),
  `o/config.js`.
- Owner-written texts are always written as text (`textContent`), never parsed as markup.
- A new `client_request_id` whenever the form content changes; a resend of the unchanged form (lost
  answer, bot check failed, rate limit) reuses it, with a fresh Turnstile token each time. Switching the
  page language does not change the content (the language is still sent).
- Inside another site's frame the page shows "not available" and never the form. A function that is not
  deployed (platform 404) or that cannot be reached twice in a row (also how a CORS refusal looks) shows
  "not available" too. A failing image (signed links expire after an hour) re-reads the document, at
  most once a minute.
- Only third-party script: Cloudflare Turnstile. `localStorage` only for the language choice.
- Test (no browser): `node tools/test_order.mjs` after `python tools/build.py`.

Placeholders in `o/config.js`:
- `FUNCTION_URL` = `https://xfdrusgoqxohdxjzmucf.supabase.co/functions/v1/online-order` (final; the CSP
  is built from it, so rebuild after a change).
- `TURNSTILE_SITE_KEY` = `__TURNSTILE_SITE_KEY__`. While it is the placeholder the page loads no widget
  and every send shows "We could not confirm that a person sent this request".

Product owner, before pushing this repository (a push publishes darjina.com):
1. Create the Turnstile widget (hostnames `darjina.com`, `www.darjina.com`), put its **site key** in
   `o/config.js` (the secret key goes only into the Edge Function secret `TURNSTILE_SECRET_KEY`).
2. Deploy `online-order` with Verify JWT off and run its checks (main repo `supabase/functions/README.md`).
3. `python tools/build.py`, `node tools/test_order.mjs`, commit, then `git push darjina-site main`.
4. Open `https://darjina.com/o/<handle>` and `…/o/?h=<handle>&m=<code>` on a phone; send one test
   request and reject it in the app.
