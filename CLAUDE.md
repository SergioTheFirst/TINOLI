# TINOLI

**Brand:** TINOLI — "There Is No Other Like It"
**Site:** https://tinoli.ru
**Repo:** https://github.com/SergioTheFirst/TINOLI
**Deploy:** GitHub Pages (auto on push to main)
**Stack:** HTML/CSS/JS + Python 3.8+ local server (stdlib only)

## Design

- Dark purple bg: `#09040f`, cards: `#1a0c2e`
- Gold accent: `#d4a84b`
- Fonts: Cinzel (logo), Cormorant Garamond (body), Great Vibes (script)
- Base font: 18px

## Structure

- `index.html` — homepage with hero + featured works
- `gallery.html` — gallery with category filters
- `about.html` — about the maker
- `contact.html` — contacts (Telegram, WhatsApp, Instagram, VK)
- `admin.html` — local-only admin panel
- `server.py` — local dev server
- `config.json` — all editable text, contacts, SEO
- `works/works.json` — jewelry catalog
- `works/images/` — photos (main + hover)

## Important

- No shop/order language — this is a gallery, not a store
- `secrets.json` is gitignored (GitHub token)
- `admin.html` and `server.py` are local-only, not for production
- All content managed via admin panel at localhost:8000/admin.html

## Security (2025-05-20)

- `.gitignore` blocks `*.py`, `*.bat`, `admin.html`, `secrets.json` from git
- Dev files removed from GitHub repo: `server.py`, `admin.html`, `.bat` files no longer public
- `server.py` locally blocks `.py`/`.bat`/`secrets.json` via 404, API restricted to localhost only
- `robots.txt` added: allows all, blocks `/admin.html`, points to sitemap

## Alert: GitHub Pages Down

- `https://tinoli.ru` returns 404 — GitHub Pages is NOT enabled for this repo
- `https://sergiothefirst.github.io/TINOLI/` also returns 404
- **Action required:** Enable Pages in repo Settings → Pages → Source: main branch
- Custom domain `tinoli.ru` may also need DNS verification if previously configured
