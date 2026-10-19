# TINOLI

**Brand:** TINOLI — "There Is No Other Like It"
**Site:** https://tinoli.ru
**Repo:** https://github.com/SergioTheFirst/TINOLI
**Deploy:** GitHub Pages (custom domain via CNAME)
**Stack:** static HTML/CSS/JS (no build step) + local admin: Python 3.8+ server (stdlib only)

## Rules that always apply

- A gallery, never a shop: no wording about buying, prices, orders, stock, delivery, payment, gifts,
  shops or exclusivity in any text, meta tag, JSON-LD (no commercial schema.org types), config key or
  doc, the privacy policy included (the owner removed it there on 2026-10-19). Re-scan with a
  Unicode-aware regex after any text change; the policy text otherwise changes only on the owner's decision.
- Premium jewellery-house level; no cheap black-and-white tricks, no particles/glow/gradient text.
- Every font must have full Cyrillic; fonts are self-hosted (no Google requests, 152-ФЗ).
- `server.py` stays Python 3.8 + stdlib; admin JS stays ES5-style (the admin runs on a weak
  32-bit Windows PC).

## Design (2026-10-19 redesign, see docs/redesign/DIRECTION.md)

- Concept: the night vitrine of a workshop; each piece is first embroidered in beads, then shown in light.
- Tokens in `css/site.css`: velvet `#120b13`, stage `#1a111c`, platinum ink `#f2edf4`/`#c3b8c6`/`#9d90a1`,
  one accent champagne `#d9c595` (actions, focus, active filter only). Dark-only by decision.
- Fonts: Jost 300–500 (text/UI) + Noto Serif Display Condensed 300 as "TINOLI Display" (display only).
- Logo: thin geometric TINOLI, the O is a ring of beads with a crystal (`img/logo.svg`, inline in pages).
- Signature: canvas bead embroidery in the hero (`Embroidery` in `js/site.js`): stitches the mark
  when the catalogue is empty, otherwise lays the newest work out in beads and resolves to the photo.
  Respects prefers-reduced-motion.
- Vitrine = a lit glass case (light from above, top edge 24%, sides 12%, faint velvet pile), no crop
  marks, no rules between sections. Photos (`placePhoto` in `js/site.js`): within 10% of the case's
  proportions they fill it (cover); otherwise whole, long edges feathered (8% mask) into a ground of
  the photo's own two edge colours; the bead layout uses the same geometry and ground. Grid tiles are
  small cases with a 14px velvet mat. Empty catalogue: «Работы» hides, the hero says so.
- Beads have a material pass (lit body, hairline rim, contact shadow); the crystal has 8 facets; only the
  crystal glints. Beside «Написать мастеру» (home and contact page) a still macro of the crystal
  (`mode: 'macro'`). The Master stays text-only by the owner's decision.

## Structure

- `index.html` — hero vitrine, works grid (filter by kind, 12 at a time), master teaser, contacts
- `about.html` (Мастер, text only), `contact.html`, `privacy.html` (policy text verbatim), `404.html`
- `gallery.html` — legacy URL, redirects to `/#works` keeping `?category=`
- `works/<id>/index.html` — generated work pages (server.py `build_work_pages()`), viewer with
  «Украшение / Как носится / Деталь» and a loupe, passport, siblings; do not edit by hand
- `sitemap.xml` — generated with the work pages
- `css/site.css`, `js/site.js` — the whole public front end; `fonts/` new fonts; `img/logo.svg`
- `favicon.svg/.ico`, `apple-touch-icon.png`, `icon-512.png`, `og.png` (1200×630)
- `classic/` — the previous site, frozen, `noindex`, linked from the footer «Прежняя версия сайта»;
  reads the same `/config.json` and `/works/works.json`
- `config.json` — all editable texts (`site`, `home`, `about`, `contact`, `footer`, `categories`,
  `analytics.cloudflare_token`, `github`, `seo`)
- `works/works.json` — catalogue: `id, filename, filename_hover?, filename_detail?, title,
  description, category, date, materials?, size?, year?`
- Local only (gitignored): `server.py`, `admin.html`, `*.bat`, `secrets.json`, `tests/`

## Admin and publishing

- Run `server.bat` (or `python server.py`), open http://localhost:8000/admin.html.
- Works get three photos: «Украшение» (main), «Как носится» (worn), «Деталь» (macro for the loupe),
  plus materials, size, year. Photos can be replaced in the edit dialog.
- «Опубликовать» pushes through the GitHub API, respects `.gitignore`, skips unchanged files and removes
  deleted files under `works/` from GitHub. By default it publishes only content (`config.json`,
  `sitemap.xml`, `works/`); the checkbox «Также опубликовать код сайта» sends the rest. This keeps a
  stale copy on the admin PC from overwriting the site.
- Publishing asks the owner to confirm (HTTP 409 `needs_confirm`, then `confirm_deletions: true`) when it
  would delete more than 5 files from GitHub or replace a populated catalogue with an empty one. A hard
  never-publish list (`*.py`, `*.bat`, `*.spec`, `admin.html`, `tests/`, `tools/`, dot-paths, secret-like
  names, `*.tmp`/`*.bak`) applies in both modes; a file containing the token aborts the publish.
- Server hardening (keep it): binds 127.0.0.1; every POST needs the header `X-TINOLI: admin` (the admin
  JS adds it to each fetch) plus same Origin/Host; GET/HEAD share one public-path check; atomic JSON
  writes with `.bak`; fine-grained token for SergioTheFirst/TINOLI only (Contents: Read and write).
- After code changes here, copy `server.py`, `admin.html`, `js/admin-edit.js`, `.gitignore` (and the
  whole site except `works/`, `config.json`, `secrets.json`, if publishing code from that PC) to the
  admin PC, restart `server.bat`, and press Ctrl+F5 once in the admin page.

## Verification

- Web Designer skill (`C:\pro\Web Designer\web-designer`): `shoot.mjs` (scan), `matrix.mjs`
  (Windows/Linux/HC/Firefox/WebKit/reflow), `filmstrip.mjs --live` for the embroidery.
- Server tests: `python -m unittest discover -s tests -v`.
