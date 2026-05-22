# TINOLI

**Brand:** TINOLI — "There Is No Other Like It"
**Site:** https://tinoli.ru
**Repo:** https://github.com/SergioTheFirst/TINOLI
**Deploy:** GitHub Pages (auto on push to main)
**Stack:** HTML/CSS/JS + Python 3.8+ local server (stdlib only)

## Design

- Dark purple bg: `#09040f`, cards: `#1a0c2e`
- Gold accent: `#d4a84b`
- Fonts: Playfair Display (headings), DM Sans (body), Cinzel (logo/nav/buttons)
- Base font: 18px

## Structure

- `index.html` — homepage with hero + infinite-scroll gallery
- `gallery.html` — standalone gallery page (legacy, redirect candidate)
- `about.html` — about the maker
- `contact.html` — contacts (Telegram, WhatsApp, Instagram, VK)
- `admin.html` — local-only admin panel (gitignored)
- `server.py` — local dev server (gitignored)
- `config.json` — all editable text, contacts, SEO
- `works/works.json` — jewelry catalog
- `works/images/` — photos (main + hover)
- `js/admin-edit.js` — edit-work modal logic for admin panel
- `tools/` — admin patch scripts (dev-only)

## Key Features (2025-05-22)

- **Infinite scroll on homepage:** works load 12 at a time via IntersectionObserver, filter by category, state preserved in URL
- **Admin: publish button always visible** in header; click switches to deploy tab
- **Admin: edit existing works** — modal with title/category/description, saves via `POST /update-work`
- **Image compression:** client-side Canvas API, max 1500px width, JPEG quality 0.85, output cap 3MB
- **Accessibility:** `:focus-visible` gold outline, `prefers-reduced-motion` disables animations, `aria-live` on loading states
- **Scroll-to-top FAB:** appears after 800px scroll, fixed bottom-right

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

## Session Log (2026-05-22)

### What was done this session
1. **Fixed `server.bat`** — added `cd /d "%~dp0"` so it works from any folder
2. **Fixed broken `server.py`** — restored `handle_delete_work` after PowerShell insert overwrote it; added `POST /update-work` endpoint for editing works
3. **Fixed `admin.html`** — added `.catch()` on fetch, exposed `window.showMessage` / `window.loadWorksList` for `admin-edit.js`
4. **Created `js/admin-edit.js`** — edit-work modal: `switchToDeploy()`, `editWork()`, `saveEdit()`, `closeEditModal()`
5. **Synced user data** — `config.json` (cloudflare token), `works/works.json` (2 new works from admin panel)
6. **Updated this file** — documented all features and architecture

### Why `server.py` is NOT on GitHub
- `server.py`, `admin.html`, `*.bat`, `secrets.json` are **intentionally gitignored** (security hardening from 2025-05-20)
- These are **local-only dev tools**, not for public hosting
- The public site is **static HTML/CSS/JS** served by GitHub Pages — no Python server needed in production
- `server.py` runs only on your local machine (`localhost:8000`) to manage content before publishing

### Files on GitHub vs Local Only
| File | On GitHub | Local Only | Reason |
|------|-----------|------------|--------|
| `index.html`, `css/`, `js/` | ✅ Yes | ✅ Yes | Public site |
| `config.json`, `works/` | ✅ Yes | ✅ Yes | Content & config |
| `robots.txt` | ✅ Yes | ✅ Yes | SEO |
| `CLAUDE.md` | ✅ Yes | ✅ Yes | Project memory |
| `server.py` | ❌ No | ✅ Yes | `.gitignore` — security |
| `admin.html` | ❌ No | ✅ Yes | `.gitignore` — security |
| `server.bat` | ❌ No | ✅ Yes | `.gitignore` — security |
| `secrets.json` | ❌ No | ✅ Yes | `.gitignore` — tokens |

## Alert: GitHub Pages Down

- `https://tinoli.ru` returns 404 — GitHub Pages is NOT enabled for this repo
- `https://sergiothefirst.github.io/TINOLI/` also returns 404
- **Action required:** Enable Pages in repo Settings → Pages → Source: main branch
- Custom domain `tinoli.ru` may also need DNS verification if previously configured
