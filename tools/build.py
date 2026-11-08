#!/usr/bin/env python3
"""Stamp the shared <head>, header and footer around each page body.

The site itself is plain static HTML; this script only saves copy-pasting the
chrome into 14 files. Python 3.8+, standard library only. Run from anywhere:

    python website/tools/build.py

Inputs : tools/pages/<lang>/<slug>.html   (page body + a small meta block)
         tools/partials/[<lang>/]<name>.html  (reusable snippets, {{> name}})
Outputs: /<slug>/index.html (ar), /en/<slug>/index.html (en), 404.html,
         sitemap.xml, robots.txt, site.webmanifest
"""
import json
import re
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOLS = ROOT / "tools"
DOMAIN = "https://darjina.com"
# UI text shown inside the phone mockups ({{t:key}})
MOCK = json.loads((TOOLS / "mock_strings.json").read_text(encoding="utf-8"))
PAGES = ["home", "features", "how-it-works", "about", "contact", "privacy", "404"]
NAV = ["home", "features", "how-it-works", "about", "contact"]
FOOTER_LINKS = ["home", "features", "how-it-works", "about", "contact", "privacy"]

WA = "https://wa.me/97334047233"
MAIL = "mailto:info@darjina.com"
TEL = "tel:+97334047233"

# Shared strings, copied from content/<lang>/site.md (keys kept in comments)
S = {
    "ar": {
        "dir": "rtl", "locale": "ar_BH", "locale_alt": "en_BH",
        "brand": "درجينة",
        "nav.home": "الرئيسية", "nav.features": "المزايا", "nav.how-it-works": "كيف يعمل",
        "nav.about": "من نحن", "nav.contact": "تواصل معنا", "nav.privacy": "سياسة الخصوصية",
        "nav.lang_switch": "English", "nav.cta_primary": "اطلب عرضاً تجريبياً",
        "nav.menu_open": "القائمة", "nav.menu_close": "إغلاق القائمة",
        "nav.skip": "انتقل إلى المحتوى", "nav.aria": "القائمة الرئيسية",
        "cta.demo_href": "https://wa.me/97334047233?text=%D8%A3%D8%B1%D9%8A%D8%AF%20%D8%B9%D8%B1%D8%B6%D8%A7%D9%8B%20%D8%AA%D8%AC%D8%B1%D9%8A%D8%A8%D9%8A%D8%A7%D9%8B%20%D9%84%D8%AA%D8%B7%D8%A8%D9%8A%D9%82%20%D8%AF%D8%B1%D8%AC%D9%8A%D9%86%D8%A9",
        "footer.about_text": "تطبيق عربي لمحلات خياطة العبايات في الخليج. يرتّب الفواتير والقياسات والدفعات ومتابعة الطلبات في مكان واحد.",
        "footer.links_title": "روابط", "footer.contact_title": "تواصل",
        "footer.email_label": "البريد:", "footer.phone_label": "هاتف وواتساب:",
        "footer.location": "مملكة البحرين",
        "footer.availability": "متوفر الآن على iPhone عبر TestFlight، ونسخة Android جاهزة.",
        "footer.copyright": "© 2026 درجينة. جميع الحقوق محفوظة.",
        "footer.made_in": "صُنع في البحرين لمحلات العبايات في الخليج.",
        "footer.aria": "روابط التذييل",
        "logo_alt": "درجينة Darjina",
        "og_alt": "شعار درجينة: رسم لامرأة بعباءة بألوان الأخضر البحري، وعبارة The app for abaya tailor shops",
        "description": "تطبيق عربي لمحلات العبايات: فاتورة خلال ثوانٍ، قياسات على صورة العباية، دفعات وعربون، متابعة الطلبات ولوحة للمالك. اطلب عرضاً تجريبياً.",
        "placeholder": "",
    },
    "en": {
        "dir": "ltr", "locale": "en_BH", "locale_alt": "ar_BH",
        "brand": "Darjina",
        "nav.home": "Home", "nav.features": "Features", "nav.how-it-works": "How it works",
        "nav.about": "About us", "nav.contact": "Contact us", "nav.privacy": "Privacy policy",
        "nav.lang_switch": "العربية", "nav.cta_primary": "Request a demo",
        "nav.menu_open": "Menu", "nav.menu_close": "Close menu",
        "nav.skip": "Skip to content", "nav.aria": "Main menu",
        "cta.demo_href": "https://wa.me/97334047233?text=I%27d%20like%20a%20demo%20of%20the%20Darjina%20app",
        "footer.about_text": "An Arabic-first app for abaya tailor shops in the GCC. It keeps receipts, measurements, payments and order tracking together in one place.",
        "footer.links_title": "Links", "footer.contact_title": "Contact",
        "footer.email_label": "Email:", "footer.phone_label": "Phone and WhatsApp:",
        "footer.location": "Kingdom of Bahrain",
        "footer.availability": "Available now on iPhone through TestFlight; the Android version is ready.",
        "footer.copyright": "© 2026 Darjina. All rights reserved.",
        "footer.made_in": "Made in Bahrain for abaya shops across the GCC.",
        "footer.aria": "Footer links",
        "logo_alt": "Darjina",
        "og_alt": "Darjina logo: a woman in a flowing sea-green abaya, with the line The app for abaya tailor shops",
        "description": "An Arabic-first app for abaya shops: receipts in seconds, measurements on an abaya picture, deposits and payments, order tracking and an owner dashboard.",
        # Shown on every English page until content/en/<page>.md is applied
        "placeholder": "",
    },
}

FONTS = {
    "ar": "https://fonts.googleapis.com/css2?family=El+Messiri:wght@500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap",
    "en": "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600&display=swap",
}

ICONS = {
    "receipt": '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    "ruler": '<rect x="2.5" y="7" width="19" height="10" rx="2"/><path d="M6.5 7v4M10 7v2.5M13.5 7v4M17 7v2.5"/>',
    "share": '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',
    "wallet": '<path d="M19 7V5.5A1.5 1.5 0 0 0 17.5 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H5"/><circle cx="16.5" cy="13.5" r="1.3" fill="currentColor" stroke="none"/>',
    "timeline": '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M3.5 6l1.3 1.3L7 5M3.5 12l1.3 1.3L7 11"/><circle cx="5" cy="18" r="1.4"/>',
    "dashboard": '<rect x="3" y="3" width="7.5" height="9" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="5" rx="1.5"/><rect x="13.5" y="11" width="7.5" height="10" rx="1.5"/><rect x="3" y="15" width="7.5" height="6" rx="1.5"/>',
    "lock": '<rect x="4.5" y="10.5" width="15" height="10.5" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    "id-card": '<rect x="2.5" y="5" width="19" height="14" rx="2"/><circle cx="8.5" cy="11" r="2.2"/><path d="M5.5 16c.6-1.5 1.8-2.2 3-2.2s2.4.7 3 2.2M14.5 10h4M14.5 13.5h3"/>',
    "language": '<path d="M4 5h8M8 3v2M6 5c0 4 2.5 7 5.5 8.5M10 5c-.5 3.5-3 6.5-6 8"/><path d="M12.5 21l4-10 4 10M14 17.5h5"/>',
    "history": '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5"/><path d="M12 7.5V12l3 2"/>',
    "chat": '<path d="M20.5 11.5a8.5 8.5 0 0 1-12.6 7.4L3.5 20.5l1.6-4.3A8.5 8.5 0 1 1 20.5 11.5z"/><path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" stroke-width="2.6"/>',
    "mail": '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/>',
    "phone": '<path d="M5 3.5h3.2l1.6 4.3-2.1 1.4a11 11 0 0 0 5.1 5.1l1.4-2.1 4.3 1.6V17a3 3 0 0 1-3 3A15.5 15.5 0 0 1 2 6.5a3 3 0 0 1 3-3z"/>',
    "map-pin": '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    "globe": '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
    "menu": '<path d="M4 7h16M4 12h16M4 17h16"/>',
    "close": '<path d="M6 6l12 12M18 6L6 18"/>',
    "arrow": '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    "store": '<path d="M3.5 9.5L5 4h14l1.5 5.5"/><path d="M3.5 9.5a2.8 2.8 0 0 0 5.6 0 2.9 2.9 0 0 0 5.8 0 2.8 2.8 0 0 0 5.6 0"/><path d="M5 12v8h14v-8M10 20v-5h4v5"/>',
    "user": '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1.3-3.6 4.2-5.5 7.5-5.5s6.2 1.9 7.5 5.5"/>',
    "users": '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20c1-3.2 3.6-5 6.5-5s5.5 1.8 6.5 5"/><path d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6M18 15.3c1.7.7 2.9 2.3 3.5 4.7"/>',
    "search": '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.8-3.8"/>',
    "file": '<path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3v5h5M8.5 13h7M8.5 16.5h5"/>',
    "clock": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    "sparkle": '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/>',
    "check": '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    "info": '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/>',
    "plus": '<path d="M12 5v14M5 12h14"/>',
    "calendar": '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    "cancel": '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
    "tag": '<path d="M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.4"/>',
    "refund": '<path d="M4 4v5h5"/><path d="M4.6 14a8 8 0 1 0 1.9-8.3L4 9"/>',
    "alert": '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.4v.1"/>',
    "moon": '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    "scissors": '<circle cx="6" cy="6.5" r="2.8"/><circle cx="6" cy="17.5" r="2.8"/><path d="M8.2 8.2L20 18M8.2 15.8L20 6"/>',
    "package": '<path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5L12 12l8.5-4.5M12 12v9"/>',
    "branch": '<path d="M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
    "download": '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
}


def icon(name):
    return ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
            'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
            + ICONS[name] + "</svg>")


def page_path(slug):
    """Public path relative to the language root."""
    if slug == "home":
        return ""
    if slug == "404":
        return "404.html"
    return slug + "/"


def href(lang, slug):
    return ("/en/" if lang == "en" else "/") + page_path(slug)


def out_file(lang, slug):
    base = ROOT / "en" if lang == "en" else ROOT
    if slug == "home":
        return base / "index.html"
    if slug == "404":
        return base / "404.html"
    return base / slug / "index.html"


def read_page(lang, slug):
    raw = (TOOLS / "pages" / lang / f"{slug}.html").read_text(encoding="utf-8")
    m = re.match(r"\s*<!--meta\s*(.*?)-->\s*", raw, re.S)
    meta = {}
    if m:
        for line in m.group(1).strip().splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip()] = v.strip()
        raw = raw[m.end():]
    return meta, raw


def expand(text, lang, depth=0):
    def inc(m):
        name = m.group(1).strip()
        for p in (TOOLS / "partials" / lang / f"{name}.html", TOOLS / "partials" / f"{name}.html"):
            if p.exists():
                return expand(p.read_text(encoding="utf-8"), lang, depth + 1)
        raise SystemExit(f"missing partial {name} ({lang})")
    if depth > 5:
        raise SystemExit("partial recursion")
    text = re.sub(r"\{\{>\s*([\w-]+)\s*\}\}", inc, text)
    text = re.sub(r"\{\{icon:([\w-]+)\}\}", lambda m: icon(m.group(1)), text)
    vars_ = {"wa": WA, "mail": MAIL, "tel": TEL, "demo": S[lang]["cta.demo_href"],
             "root": "/en/" if lang == "en" else "/"}
    text = re.sub(r"\{\{(wa|mail|tel|demo|root)\}\}", lambda m: vars_[m.group(1)], text)
    text = re.sub(r"\{\{t:([\w-]+)\}\}", lambda m: MOCK[lang][m.group(1)], text)
    text = re.sub(r"\{\{link:([\w-]+)\}\}", lambda m: href(lang, m.group(1)), text)
    return text


def jsonld(lang):
    data = {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "Darjina",
        "alternateName": "درجينة",
        "url": DOMAIN + "/",
        "logo": DOMAIN + "/assets/img/icon-512.png",
        "email": "info@darjina.com",
        "telephone": "+97334047233",
        "address": {"@type": "PostalAddress", "addressCountry": "BH"},
        "contactPoint": [{
            "@type": "ContactPoint", "telephone": "+97334047233", "email": "info@darjina.com",
            "contactType": "sales", "areaServed": ["BH", "SA", "AE", "KW", "QA", "OM"],
            "availableLanguage": ["ar", "en"],
        }],
    }
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


def head(lang, slug, meta):
    s = S[lang]
    other = "en" if lang == "ar" else "ar"
    title = meta.get("title", "")
    desc = meta.get("description", s["description"])
    url = DOMAIN + href(lang, slug)
    is404 = slug == "404"
    og_img = DOMAIN + "/assets/img/og-image.jpg"
    lines = [
        "<!doctype html>",
        f'<html lang="{lang}" dir="{s["dir"]}">',
        "<head>",
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        f"<title>{title}</title>",
        f'<meta name="description" content="{desc}">',
    ]
    if is404:
        lines.append('<meta name="robots" content="noindex">')
    else:
        lines += [
            f'<link rel="canonical" href="{url}">',
            f'<link rel="alternate" hreflang="ar" href="{DOMAIN + href("ar", slug)}">',
            f'<link rel="alternate" hreflang="en" href="{DOMAIN + href("en", slug)}">',
            f'<link rel="alternate" hreflang="x-default" href="{DOMAIN + href("ar", slug)}">',
        ]
    lines += [
        '<meta name="theme-color" content="#0d1413">',
        '<link rel="icon" href="/favicon.ico" sizes="48x48">',
        '<link rel="icon" type="image/png" sizes="32x32" href="/assets/img/favicon-32.png">',
        '<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">',
        '<link rel="manifest" href="/site.webmanifest">',
        '<meta property="og:type" content="website">',
        f'<meta property="og:site_name" content="{s["brand"]}">',
        f'<meta property="og:title" content="{title}">',
        f'<meta property="og:description" content="{desc}">',
        f'<meta property="og:url" content="{url}">',
        f'<meta property="og:image" content="{og_img}">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        f'<meta property="og:image:alt" content="{s["og_alt"]}">',
        f'<meta property="og:locale" content="{s["locale"]}">',
        f'<meta property="og:locale:alternate" content="{s["locale_alt"]}">',
        '<meta name="twitter:card" content="summary_large_image">',
        f'<meta name="twitter:title" content="{title}">',
        f'<meta name="twitter:description" content="{desc}">',
        f'<meta name="twitter:image" content="{og_img}">',
        '<link rel="preconnect" href="https://fonts.googleapis.com">',
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
        f'<link rel="stylesheet" href="{FONTS[lang]}">',
        '<link rel="stylesheet" href="/assets/css/site.css">',
        "<script>document.documentElement.classList.add('js')</script>",
        '<script src="/assets/js/site.js" defer></script>',
        f'<script type="application/ld+json">{jsonld(lang)}</script>',
        "</head>",
    ]
    return "\n".join(lines)


def header(lang, slug):
    s = S[lang]
    other = "en" if lang == "ar" else "ar"
    other_slug = slug
    items = []
    for n in NAV:
        cur = ' aria-current="page"' if n == slug else ""
        items.append(f'<li><a href="{href(lang, n)}"{cur}>{s["nav." + n]}</a></li>')
    items.append(f'<li class="nav-mobile-cta"><a class="btn btn--light" href="{s["cta.demo_href"]}">'
                 f'{icon("chat")}{s["nav.cta_primary"]}</a></li>')
    return f"""<body>
<a class="skip-link" href="#main">{s["nav.skip"]}</a>
<header class="site-header" data-open="false">
  <div class="wrap header-inner">
    <a class="brand" href="{href(lang, "home")}"><img src="/assets/img/logo-horizontal.webp" width="131" height="44" alt="{s["logo_alt"]}"></a>
    <nav class="primary-nav" id="primary-nav" aria-label="{s["nav.aria"]}">
      <ul>
        {"".join(items)}
      </ul>
    </nav>
    <div class="header-actions">
      <a class="lang-link" href="{href(other, other_slug)}" hreflang="{other}" lang="{other}" data-lang-switch>{icon("globe")}<span>{s["nav.lang_switch"]}</span></a>
      <a class="btn btn--light header-cta" href="{s["cta.demo_href"]}">{s["nav.cta_primary"]}</a>
      <button class="nav-toggle" type="button" aria-controls="primary-nav" aria-expanded="false" aria-label="{s["nav.menu_open"]}" data-label-open="{s["nav.menu_open"]}" data-label-close="{s["nav.menu_close"]}"><span class="i-menu">{icon("menu")}</span><span class="i-close">{icon("close")}</span></button>
    </div>
  </div>
</header>"""


def footer(lang):
    s = S[lang]
    links = "".join(f'<li><a href="{href(lang, n)}">{s["nav." + n]}</a></li>' for n in FOOTER_LINKS)
    return f"""<footer class="site-footer on-dark">
  <div class="wrap">
    <div class="footer-grid">
      <div class="footer-brand">
        <img src="/assets/img/logo-full-dark.webp" width="170" height="148" alt="{s["logo_alt"]}" loading="lazy">
        <p>{s["footer.about_text"]}</p>
        <p class="footer-availability">{icon("sparkle")}<span>{s["footer.availability"]}</span></p>
      </div>
      <nav aria-label="{s["footer.aria"]}">
        <h2>{s["footer.links_title"]}</h2>
        <ul>{links}</ul>
      </nav>
      <div>
        <h2>{s["footer.contact_title"]}</h2>
        <ul class="footer-contact">
          <li>{icon("mail")}<span>{s["footer.email_label"]} <a href="{MAIL}">info@darjina.com</a></span></li>
          <li>{icon("chat")}<span>{s["footer.phone_label"]} <a href="{WA}" class="ltr">+973 3404 7233</a></span></li>
          <li>{icon("map-pin")}<span>{s["footer.location"]}</span></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <p>{s["footer.copyright"]}</p>
      <p>{s["footer.made_in"]}</p>
    </div>
  </div>
</footer>
</body>
</html>
"""


def build():
    for lang in ("ar", "en"):
        for slug in PAGES:
            if not (TOOLS / "pages" / lang / f"{slug}.html").exists():
                print("skip (no source)", lang, slug)
                continue
            meta, body = read_page(lang, slug)
            body = expand(body, lang)
            note = meta.get("placeholder")
            banner = f'<p class="placeholder-note" role="note">{note}</p>\n' if note else ""
            html = "\n".join([head(lang, slug, meta), header(lang, slug),
                              f'{banner}<main id="main" tabindex="-1">', body.strip(), "</main>", footer(lang)])
            f = out_file(lang, slug)
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_text(html, encoding="utf-8", newline="\n")
            print("wrote", f.relative_to(ROOT))

    today = date.today().isoformat()
    urls = []
    for slug in PAGES:
        if slug == "404":
            continue
        for lang in ("ar", "en"):
            alts = "".join(
                f'\n    <xhtml:link rel="alternate" hreflang="{l}" href="{DOMAIN + href(l, slug)}"/>'
                for l in ("ar", "en"))
            alts += f'\n    <xhtml:link rel="alternate" hreflang="x-default" href="{DOMAIN + href("ar", slug)}"/>'
            pr = "1.0" if slug == "home" else ("0.3" if slug == "privacy" else "0.8")
            urls.append(f"  <url>\n    <loc>{DOMAIN + href(lang, slug)}</loc>\n    <lastmod>{today}</lastmod>"
                        f"\n    <priority>{pr}</priority>{alts}\n  </url>")
    (ROOT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
        'xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + "\n".join(urls) + "\n</urlset>\n",
        encoding="utf-8", newline="\n")
    (ROOT / "robots.txt").write_text(
        "User-agent: *\nAllow: /\nDisallow: /tools/\nDisallow: /content/\n\n"
        f"Sitemap: {DOMAIN}/sitemap.xml\n", encoding="utf-8", newline="\n")
    manifest = {
        "name": "Darjina", "short_name": "Darjina", "lang": "ar", "dir": "rtl",
        "start_url": "/", "display": "browser",
        "background_color": "#0d1413", "theme_color": "#0d1413",
        "icons": [{"src": "/assets/img/icon-192.png", "sizes": "192x192", "type": "image/png"},
                  {"src": "/assets/img/icon-512.png", "sizes": "512x512", "type": "image/png"}],
    }
    (ROOT / "site.webmanifest").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
                                           encoding="utf-8", newline="\n")
    print("wrote sitemap.xml, robots.txt, site.webmanifest")


if __name__ == "__main__":
    build()
