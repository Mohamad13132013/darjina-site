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
