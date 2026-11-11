/* ============================================================
   TINOLI — site script
   Config and works from JSON, the two-shot vitrine, the bead embroidery
   of the hero, the work viewer with a loupe. No dependencies.
   ============================================================ */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  var PAGE_SIZE = 12;
  var NBSP = ' ';

  var KINDS = {
    brooch: 'Брошь', ring: 'Кольцо', bracelet: 'Браслет',
    earrings: 'Серьги', necklace: 'Колье', other: 'Украшение'
  };
  var KIND_PLURAL = {
    brooch: 'Броши', ring: 'Кольца', bracelet: 'Браслеты',
    earrings: 'Серьги', necklace: 'Колье', other: 'Другое'
  };
  var KIND_ORDER = ['brooch', 'earrings', 'necklace', 'bracelet', 'ring', 'other'];

  // ---------------------------------------------------------------- typography
  // A line never ends on a one-letter word or starts with a dash; numbers keep their units.
  // Applied at render time, so the stored texts stay exactly as written.
  function typo(text) {
    if (typeof text !== 'string' || !text) return text;
    var out = text
      .replace(/[ \t]+([—–])/g, NBSP + '$1')
      .replace(/(\d)[ \t]+(?=(см|мм|г|час|часа|часов|бусин|бусины)(?![А-Яа-яЁё]))/g, '$1' + NBSP);
    for (var pass = 0; pass < 2; pass++) {
      out = out.replace(/(^|[\s(«„"])([А-Яа-яЁё])[ \t]+/g, '$1$2' + NBSP);
    }
    return out;
  }

  function typoTree(root) {
    if (!root || !document.createTreeWalker) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    var nodes = [];
    var node;
    while ((node = walker.nextNode())) nodes.push(node);
    nodes.forEach(function (n) {
      var parent = n.parentNode ? n.parentNode.nodeName : '';
      if (parent === 'SCRIPT' || parent === 'STYLE' || parent === 'TEXTAREA') return;
      var t = typo(n.nodeValue);
      if (t !== n.nodeValue) n.nodeValue = t;
    });
  }

  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  function formatCount(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  }

  // ---------------------------------------------------------------- data
  function getJSON(url) {
    // A fresh URL each time: the owner expects a publish to show up at once.
    return fetch(url + (url.indexOf('?') === -1 ? '?' : '&') + 't=' + Date.now(), { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
        return r.json();
      });
  }

  function byPath(obj, path) {
    return path.split('.').reduce(function (o, k) {
      return o && o[k] !== undefined ? o[k] : null;
    }, obj);
  }

  function normaliseWorks(data) {
    var list = (data && Array.isArray(data.works)) ? data.works.slice() : [];
    list = list.filter(function (w) { return w && w.id && w.filename && w.title; });
    list.sort(function (a, b) {
      var d = String(b.date || '').localeCompare(String(a.date || ''));
      return d !== 0 ? d : String(b.id).localeCompare(String(a.id));
    });
    return list;
  }

  function img(file) { return '/works/images/' + encodeURIComponent(file); }
  function kindKey(work) { return KINDS[work.category] ? work.category : 'other'; }
  function kindOf(work) { return KINDS[kindKey(work)]; }

  function workMeta(work) {
    var parts = [kindOf(work)];
    if (work.year) parts.push(work.year);
    return parts.join(', ');
  }

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (attrs[k] === null || attrs[k] === undefined || attrs[k] === false) return;
        if (k === 'className') node.className = attrs[k];
        else node.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
      });
    }
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function focusVisible(node) {
    try { return node.matches(':focus-visible'); } catch (e) { return false; }
  }

  // ---------------------------------------------------------------- photos in a case
  // A photo close to the case's proportions fills it, losing a few per cent at two edges.
  // Any other is shown whole: its long edges are feathered into a ground of its own
  // colours, sampled from the edges that meet the empty bands, so there is no seam.
  var COVER_TOLERANCE = 0.1;

  function photoFit(im, w, h) {
    var nw = im.naturalWidth, nh = im.naturalHeight;
    if (!w || !h || !nw || !nh) return null;
    var k = (nw / nh) / (w / h);
    var cover = Math.abs(k - 1) <= COVER_TOLERANCE;
    var s = cover ? Math.max(w / nw, h / nh) : Math.min(w / nw, h / nh);
    var dw = nw * s, dh = nh * s;
    return { cover: cover, axis: cover ? null : (k < 1 ? 'x' : 'y'), x: (w - dw) / 2, y: (h - dh) / 2, w: dw, h: dh };
  }

  // Average colours of two opposite outer edges of a photo: left and right ('x'),
  // or top and bottom ('y').
  function edgeColours(im, axis) {
    var key = '__edges_' + axis;
    if (im[key] && im[key].src === im.currentSrc) return im[key].cols;
    var c = document.createElement('canvas');
    c.width = 36; c.height = 36;
    var g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(im, 0, 0, 36, 36);
    var px = g.getImageData(0, 0, 36, 36).data;
    var sums = [[0, 0, 0, 0], [0, 0, 0, 0]];
    for (var y = 0; y < 36; y++) {
      for (var x = 0; x < 36; x++) {
        var along = axis === 'y' ? y : x;
        var side = along < 2 ? 0 : along > 33 ? 1 : -1;
        if (side < 0) continue;
        var i = (y * 36 + x) * 4, sm = sums[side];
        sm[0] += px[i]; sm[1] += px[i + 1]; sm[2] += px[i + 2]; sm[3]++;
      }
    }
    var cols = sums.map(function (sm) {
      return [Math.round(sm[0] / sm[3]), Math.round(sm[1] / sm[3]), Math.round(sm[2] / sm[3])];
    });
    im[key] = { src: im.currentSrc, cols: cols };
    return cols;
  }

  function rgb(c) { return 'rgb(' + c.map(Math.round).join(',') + ')'; }

  function mixColour(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  // Where the ground turns from the first edge colour to the second, as fractions of the box:
  // at the middle for a whole photo (two flat halves, as the CSS ground under it), or
  // across the whole box when the photo fills it.
  function groundStops(fit, w, h) {
    if (!fit.cover) return [0.5, 0.5];
    var vertical = fit.axis === 'y';
    var size = vertical ? h : w, start = vertical ? fit.y : fit.x, len = vertical ? fit.h : fit.w;
    return [Math.max(0, start / size), Math.min(1, (start + len) / size)];
  }

  // Fits a photo into the box of its wrapper (.shot) and lays the ground under it.
  function placePhoto(im, shot) {
    var w = shot.clientWidth, h = shot.clientHeight;
    var fit = photoFit(im, w, h);
    if (!fit) return null;
    im.classList.remove('is-whole', 'is-feather-x', 'is-feather-y');
    im.style.cssText = '';
    shot.classList.remove('is-ground-y');
    shot.style.backgroundColor = '';
    shot.style.removeProperty('--ground-b');
    // A photo that fills its case needs no ground: nothing of it would show.
    if (fit.cover) return fit;
    var pct = function (v, of) { return (v / of * 100).toFixed(3) + '%'; };
    im.style.cssText = 'left:' + pct(fit.x, w) + ';top:' + pct(fit.y, h) + ';width:' + pct(fit.w, w) +
      ';height:' + pct(fit.h, h) + ';right:auto;bottom:auto';
    im.classList.add('is-whole', 'is-feather-' + fit.axis);
    // A photo still loading can be drawn as nothing: the geometry is set now, and its
    // colours are taken when it has loaded (watchPhoto places it again then).
    if (!im.complete) return fit;
    // The ground is two flat halves, each the colour of the photo's edge on its side; where
    // they meet is under the photo's opaque middle.
    try {
      var cols = edgeColours(im, fit.axis);
      shot.style.backgroundColor = rgb(cols[0]);
      shot.style.setProperty('--ground-b', rgb(cols[1]));
      if (fit.axis === 'y') shot.classList.add('is-ground-y');
    } catch (e) { /* the velvet of the case stays */ }
    return fit;
  }

  // Places the photo once it has loaded, and again whenever its case changes shape.
  // One observer serves every case on the page: placing a photo never resizes its case.
  var caseWatch = null;

  function watchPhoto(im, shot) {
    var place = function () { if (im.naturalWidth) placePhoto(im, shot); };
    shot.__place = place;
    if (im.complete && im.naturalWidth) place();
    else im.addEventListener('load', place, { once: true });
    if (!('ResizeObserver' in window)) return;
    if (!caseWatch) {
      caseWatch = new ResizeObserver(function (entries) {
        entries.forEach(function (en) { if (en.target.__place) en.target.__place(); });
      });
    }
    caseWatch.observe(shot);
  }

  // A photo in its own wrapper, ready for placePhoto.
  function shotOf(cls, attrs) {
    var shot = el('span', { className: 'shot ' + cls });
    var im = el('img', attrs);
    shot.appendChild(im);
    watchPhoto(im, shot);
    return shot;
  }

  // ---------------------------------------------------------------- config
  // Visits are counted only on the site itself, never on the admin PC or a preview copy.
  function isLiveSite() {
    var h = window.location.hostname;
    return h === 'tinoli.ru' || h === 'www.tinoli.ru';
  }

  function applyConfig(cfg) {
    document.querySelectorAll('[data-config]').forEach(function (node) {
      var value = byPath(cfg, node.getAttribute('data-config'));
      if (typeof value !== 'string' || !value.trim()) return;
      node.textContent = typo(value);
    });
    document.querySelectorAll('[data-config-paras]').forEach(function (node) {
      var value = byPath(cfg, node.getAttribute('data-config-paras'));
      if (typeof value !== 'string' || !value.trim()) return;
      var paras = value.split(/\r?\n\s*\r?\n|\r?\n/).map(function (p) { return p.trim(); }).filter(Boolean);
      node.textContent = '';
      paras.forEach(function (p) { node.appendChild(el('p', null, typo(p))); });
    });
    var token = cfg && cfg.analytics && cfg.analytics.cloudflare_token;
    // No third-party code runs on the monogram page: it promises that a photo never leaves the device.
    var quiet = document.body.getAttribute('data-page') === 'monogram';
    if (token && /^[a-f0-9]{16,64}$/i.test(token) && isLiveSite() && !quiet) {
      var s = el('script', { src: 'https://static.cloudflareinsights.com/beacon.min.js', defer: true });
      s.setAttribute('data-cf-beacon', JSON.stringify({ token: token }));
      document.body.appendChild(s);
    }
  }

  // ---------------------------------------------------------------- contacts
  var CHANNEL_HOSTS = {
    telegram: ['t.me', 'telegram.me'],
    vk: ['vk.com', 'vk.ru', 'm.vk.com'],
    whatsapp: ['wa.me', 'api.whatsapp.com'],
    instagram: ['instagram.com']
  };

  // Only an https profile on the channel's own site: no other hosts, no user:password@.
  function profileUrl(raw, hosts) {
    if (typeof raw !== 'string' || !raw.trim()) return null;
    var u;
    try { u = new URL(raw.trim()); } catch (e) { return null; }
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    if (hosts.indexOf(u.hostname.toLowerCase().replace(/^www\./, '')) === -1) return null;
    if (u.pathname.length < 2) return null;
    return u.href;
  }

  function channelsFrom(c) {
    var out = [];
    if (!c) return out;
    var tg = profileUrl(c.telegram_url, CHANNEL_HOSTS.telegram);
    var tgHandle = String(c.telegram || '').trim().replace(/^@/, '');
    if (tg) out.push({ name: 'Telegram', action: 'Написать в Telegram', label: c.telegram || tg, href: tg });
    else if (/^[A-Za-z0-9_]{5,32}$/.test(tgHandle)) {
      out.push({ name: 'Telegram', action: 'Написать в Telegram', label: '@' + tgHandle, href: 'https://t.me/' + tgHandle });
    }
    var email = String(c.email || '').trim();
    if (/^[^@\s?&#<>"%]+@[^@\s?&#<>"%]+\.[^@\s?&#<>"%]+$/.test(email)) {
      out.push({ name: 'Почта', action: 'Написать на почту', label: email, href: 'mailto:' + email });
    }
    var vk = profileUrl(c.vk_url, CHANNEL_HOSTS.vk);
    if (vk) out.push({ name: 'ВКонтакте', action: 'Написать во ВКонтакте', label: c.vk || vk, href: vk });
    var wa = profileUrl(c.whatsapp_url, CHANNEL_HOSTS.whatsapp);
    if (wa && /\d{6,}/.test(wa)) out.push({ name: 'WhatsApp*', action: 'Написать в WhatsApp', label: c.whatsapp || 'WhatsApp', href: wa });
    var ig = profileUrl(c.instagram_url, CHANNEL_HOSTS.instagram);
    if (ig) out.push({ name: 'Instagram*', action: 'Написать в Instagram', label: c.instagram || ig, href: ig });
    var digits = String(c.phone || '').replace(/\D/g, '');
    if (digits.length === 11 && digits.charAt(0) === '8') digits = '7' + digits.slice(1);
    if (digits.length >= 11) out.push({ name: 'Телефон', action: 'Позвонить', label: String(c.phone).trim(), href: 'tel:+' + digits });
    return out;
  }

  function linkAttrs(href) {
    return /^https:/i.test(href) ? { target: '_blank', rel: 'noopener' } : { target: null, rel: null };
  }

  function renderChannels(cfg) {
    var list = channelsFrom(cfg && cfg.contact);
    if (!list.length) return;
    var first = list[0];
    document.querySelectorAll('[data-primary-channel]').forEach(function (a) {
      var extra = linkAttrs(first.href);
      a.href = first.href;
      a.textContent = first.action;
      if (extra.target) { a.target = extra.target; a.rel = extra.rel; } else { a.removeAttribute('target'); a.removeAttribute('rel'); }
    });
    document.querySelectorAll('[data-channels]').forEach(function (box) {
      box.textContent = '';
      list.forEach(function (ch) {
        var row = el('div', { className: 'channels__row' });
        row.appendChild(el('span', { className: 'channels__name' }, ch.name));
        var value = el('span', { className: 'channels__value' });
        var extra = linkAttrs(ch.href);
        value.appendChild(el('a', { href: ch.href, rel: extra.rel, target: extra.target }, ch.label));
        row.appendChild(value);
        box.appendChild(row);
      });
    });
  }

  // ---------------------------------------------------------------- header
  function initHeader() {
    var hdr = document.querySelector('.hdr');
    if (!hdr) return;
    var on = false;
    var tick = function () {
      var next = window.scrollY > 8;
      if (next !== on) { on = next; hdr.classList.toggle('is-scrolled', on); }
    };
    window.addEventListener('scroll', tick, { passive: true });
    tick();
  }

  // ---------------------------------------------------------------- two shots
  function glint(node) {
    if (!node || reduceMotion.matches) return;
    node.classList.remove('glint');
    void node.offsetWidth;
    node.classList.add('glint');
  }

  // A root holds a .vitrine, an optional pin button and an optional .shots switch.
  function initSwap(root, opts) {
    opts = opts || {};
    var stage = root.querySelector('.vitrine');
    var pin = root.querySelector('[data-pin]');
    var shots = root.querySelectorAll('.shots [data-shot]');
    var hoverTarget = opts.hoverTarget || stage;
    var pinned = false, hovering = false;

    function apply() {
      var alt = pinned || hovering;
      if (pin) pin.setAttribute('aria-pressed', String(pinned));
      if (root.classList.contains('is-alt') === alt) return;
      root.classList.toggle('is-alt', alt);
      shots.forEach(function (b) { b.setAttribute('aria-pressed', String((b.getAttribute('data-shot') === 'worn') === alt)); });
      if (opts.onChange) opts.onChange(alt);
      glint(stage);
    }
    function leaveFocus(e) {
      if (e.relatedTarget && root.contains(e.relatedTarget)) return;
      hovering = false;
      apply();
    }

    if (pin) {
      pin.addEventListener('click', function (e) {
        e.preventDefault();
        pinned = !pinned;
        if (!pinned) hovering = false;
        apply();
      });
      pin.addEventListener('blur', leaveFocus);
    }
    shots.forEach(function (b) {
      b.addEventListener('click', function () {
        pinned = b.getAttribute('data-shot') === 'worn';
        hovering = false;
        apply();
      });
    });
    if (hoverTarget) {
      hoverTarget.addEventListener('pointerenter', function (e) {
        if (e.pointerType === 'mouse' && finePointer.matches) { hovering = true; apply(); }
      });
      hoverTarget.addEventListener('pointerleave', function (e) {
        if (e.pointerType === 'mouse') { hovering = false; apply(); }
      });
    }
    if (opts.focusTarget) {
      opts.focusTarget.addEventListener('focus', function () {
        if (focusVisible(opts.focusTarget)) { hovering = true; apply(); }
      });
      opts.focusTarget.addEventListener('blur', leaveFocus);
    }
  }

  // ---------------------------------------------------------------- embroidery
  // Lays a picture out in beads on velvet, the way bead embroidery is stitched:
  // the crystals first, then the beads. Finished beads are painted once onto a
  // base layer, so each frame only draws the beads still settling into place.
  var MARK_REF = 560;      // the mark is built at this size and scaled: same bead count everywhere

  // Glass beads lit from the upper left: a body from white to the bead's tone, a hairline
  // rim and a contact shadow on the cloth. The shading is still; only crystals ever glint.
  var TONES = {
    pearl: [[0, '#ffffff'], [0.42, '#ece6ee'], [1, '#b4a8b8']],
    gold: [[0, '#fbf6e6'], [0.3, '#efe3bf'], [1, '#a88f55']]
  };

  function beadCanvas(radius, pad, dpr) {
    var c = document.createElement('canvas');
    c.width = c.height = Math.max(4, Math.ceil((radius + pad) * 2 * dpr));
    var g = c.getContext('2d');
    g.scale(c.width / ((radius + pad) * 2), c.width / ((radius + pad) * 2));
    return g;
  }

  // A whole bead of a known tone, shadow included; drawn scaled to any bead of that tone.
  function makeToneSprite(radius, dpr, stops) {
    var pad = radius * 0.3 + 1, m = radius + pad;
    var g = beadCanvas(radius, pad, dpr);
    g.fillStyle = 'rgba(0,0,0,.25)';
    g.beginPath(); g.arc(m + 0.4, m + 1, radius, 0, Math.PI * 2); g.fill();
    var body = g.createRadialGradient(m - radius * 0.3, m - radius * 0.4, radius * 0.05, m, m, radius);
    stops.forEach(function (st) { body.addColorStop(st[0], st[1]); });
    g.fillStyle = body;
    g.beginPath(); g.arc(m, m, radius, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.2)';
    g.lineWidth = 0.5;
    g.beginPath(); g.arc(m, m, radius - 0.25, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.85)';
    g.beginPath(); g.arc(m - radius * 0.32, m - radius * 0.42, radius * 0.13, 0, Math.PI * 2); g.fill();
    return { canvas: g.canvas, r: radius, pad: pad };
  }

  // Light and rim laid over a bead of any colour: the beads of a photo.
  function makeShadeSprite(radius, dpr) {
    var g = beadCanvas(radius, 0, dpr), m = radius;
    var edge = g.createRadialGradient(m, m, radius * 0.55, m, m, radius);
    edge.addColorStop(0, 'rgba(0,0,0,0)');
    edge.addColorStop(1, 'rgba(0,0,0,.22)');
    g.fillStyle = edge;
    g.beginPath(); g.arc(m, m, radius, 0, Math.PI * 2); g.fill();
    var hi = g.createRadialGradient(m - radius * 0.3, m - radius * 0.4, 0, m - radius * 0.3, m - radius * 0.4, radius * 0.62);
    hi.addColorStop(0, 'rgba(255,255,255,.9)');
    hi.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hi;
    g.beginPath(); g.arc(m, m, radius, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.2)';
    g.lineWidth = 0.5;
    g.beginPath(); g.arc(m, m, radius - 0.25, 0, Math.PI * 2); g.stroke();
    return g.canvas;
  }

  // Bead positions along a rhombus grown outward by d: one on each corner, evenly spaced.
  function rhombusRow(corners, d, pitch) {
    var n = corners.length;
    var normal = function (a, b) {
      var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.sqrt(dx * dx + dy * dy);
      return [dy / len, -dx / len];
    };
    var grown = corners.map(function (c, i) {
      var n1 = normal(corners[(i + n - 1) % n], c), n2 = normal(c, corners[(i + 1) % n]);
      var bx = n1[0] + n2[0], by = n1[1] + n2[1], bl = Math.sqrt(bx * bx + by * by);
      bx /= bl; by /= bl;
      var t = d / (n1[0] * bx + n1[1] * by);
      return [c[0] + bx * t, c[1] + by * t];
    });
    var pts = [];
    for (var e = 0; e < n; e++) {
      var a = grown[e], b = grown[(e + 1) % n];
      var dx = b[0] - a[0], dy = b[1] - a[1];
      var steps = Math.max(2, Math.round(Math.sqrt(dx * dx + dy * dy) / (pitch * 0.98)));
      for (var j = 0; j < steps; j++) pts.push([a[0] + dx * j / steps, a[1] + dy * j / steps]);
    }
    return pts;
  }

  // Hand-sewn, not machine-set: every bead a little off in size, place and shade.
  // Deterministic, so the same mark is stitched every time.
  function wobble(i, salt) {
    var v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
    return v - Math.floor(v);
  }

  function sewnBead(x, y, r, tone, t0, i) {
    return {
      x: x + wobble(i, 2) - 0.5, y: y + wobble(i, 3) - 0.5, r: r * (0.95 + 0.1 * wobble(i, 1)),
      tone: tone, lift: (wobble(i, 4) - 0.5) * 0.08, t0: t0
    };
  }

  function clampRect(x, y, w, h, canvas) {
    var x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
    var x1 = Math.min(canvas.width, Math.ceil(x + w)), y1 = Math.min(canvas.height, Math.ceil(y + h));
    return [x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)];
  }

  function Embroidery(canvas, opts) {
    this.canvas = canvas;
    this.opts = opts || {};
    this.raf = 0;
    this.visible = true;
    this.beads = [];
    this.gem = null;
    this.ground = null;
    this.tones = {};
    this.finished = false;
    this.twinkleDone = false;
    this.gemAt = 420;        // ms at which the crystal is set
    this.gemFrom = 0;        // ms at which it starts to grow (a hallmark's crystal comes late)
    this.letter = null;      // the handwritten T of a portrait's hallmark
    this.letterMissing = false;
  }

  Embroidery.prototype.measure = function () {
    // A picture made for saving has a size of its own; a canvas on the page takes its box.
    var fixed = this.opts.size;
    var rect = fixed ? { width: fixed.w, height: fixed.h } : this.canvas.getBoundingClientRect();
    this.w = Math.max(1, Math.round(rect.width));
    this.h = Math.max(1, Math.round(rect.height));
    this.dpr = fixed ? 1 : Math.min(2, window.devicePixelRatio || 1);
    var cw = Math.round(this.w * this.dpr), ch = Math.round(this.h * this.dpr);
    // A portrait redrawn while its photo is dragged keeps the backing store of its canvas.
    var same = this.opts.mode === 'portrait' && this.ctx && this.canvas.width === cw && this.canvas.height === ch;
    if (!same) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    this.ctx = this.canvas.getContext('2d');
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  };

  // The O of the logo: a crystal in a bead bezel on a ring of three bead rows.
  // The rows are stitched one after another, in short runs, alternating direction.
  Embroidery.prototype.buildMark = function () {
    var k = Math.min(this.w, this.h) / MARK_REF;
    var s = 7.2;
    var cx = this.w / 2, cy = this.h / 2 + s * k;
    var R = MARK_REF * 0.34;
    var gemH = s * 3.8, gemW = gemH * 0.72, gy = -R;
    var beads = [];
    this.gem = { x: cx, y: cy + gy * k, w: gemW * k, h: gemH * k };

    var bezel = rhombusRow([[0, gy - gemH], [gemW, gy], [0, gy + gemH], [-gemW, gy]], s * 0.78, s);
    bezel.forEach(function (p, i) {
      beads.push(sewnBead(cx + p[0] * k, cy + p[1] * k, s * 0.42 * k, i % 2 ? 'pearl' : 'gold',
        320 + (i / bezel.length) * 520, beads.length));
    });

    var ROW_MS = 900, START = 950, RUN = 3;
    var rows = [[R - s, 'pearl', 1], [R, 'gold', -1], [R + s, 'pearl', 1]];
    var clear = gemH + s * 1.9;
    rows.forEach(function (row, ri) {
      var r = row[0], dir = row[2];
      var n = Math.round((Math.PI * 2 * r) / (s * 1.02));
      var kept = [];
      for (var i = 0; i < n; i++) {
        var a = -Math.PI / 2 + dir * Math.PI * 2 * (i / n);
        var x = r * Math.cos(a), y = r * Math.sin(a);
        if (Math.sqrt(x * x + Math.pow(y - gy, 2)) < clear) continue;
        kept.push([x, y]);
      }
      var runs = Math.ceil(kept.length / RUN);
      kept.forEach(function (p, idx) {
        beads.push(sewnBead(cx + p[0] * k, cy + p[1] * k, s * 0.44 * k, row[1],
          START + ri * ROW_MS + Math.floor(idx / RUN) * (ROW_MS / runs), beads.length));
      });
    });
    this.beads = beads;
    // The mark is stitched straight onto the velvet of the case: no ground of its own.
    this.ground = null;
    this.endT = START + rows.length * ROW_MS + 260;
    return beads.length;
  };

  // A close-up of the mark's crystal, as under a loupe: the crystal in its bezel and two
  // more rows of beads round it. Drawn whole at once; only the crystal glints.
  Embroidery.prototype.buildMacro = function () {
    var s = Math.min(this.w, this.h) / 20;
    var gemH = s * 3.8, gemW = gemH * 0.72;
    var cx = this.w / 2, cy = this.h / 2;
    var corners = [[cx, cy - gemH], [cx + gemW, cy], [cx, cy + gemH], [cx - gemW, cy]];
    var beads = [];
    this.gem = { x: cx, y: cy, w: gemW, h: gemH };
    [[0.78, null], [1.74, 'gold'], [2.7, 'pearl']].forEach(function (row) {
      rhombusRow(corners, s * row[0], s).forEach(function (p, i) {
        beads.push(sewnBead(p[0], p[1], s * 0.43, row[1] || (i % 2 ? 'pearl' : 'gold'), 0, beads.length));
      });
    });
    this.beads = beads;
    this.ground = null;
    this.endT = 0;
    return beads.length;
  };

  // Where the beads of the initials go. The letters are drawn in the site's handwriting
  // (Marck Script, both alphabets in it), fitted into a circle of radius rin and sampled
  // on a hexagonal grid of the bead pitch. Each letter is also stroked, so that a hairline of
  // the script holds a row of beads. Positions are relative to the centre of the circle.
  function letterCells(text, rin, pitch) {
    var chars = text.split('');
    if (!chars.length || rin < pitch * 4) return [];
    var REF = 200;           // the letters are measured at this size, then scaled to fit
    var font = function (px) { return '400 ' + px + 'px "Marck Script", Jost, "Jost Fallback", system-ui, sans-serif'; };
    var probe = document.createElement('canvas').getContext('2d');
    probe.font = font(REF);
    var gap = REF * 0.03, width = -gap, up = 0, down = 0;
    var glyphs = chars.map(function (ch) {
      var m = probe.measureText(ch);
      var left = m.actualBoundingBoxLeft || 0;
      var w = left + (m.actualBoundingBoxRight || m.width);
      up = Math.max(up, m.actualBoundingBoxAscent || REF * 0.7);
      down = Math.max(down, m.actualBoundingBoxDescent || 0);
      width += w + gap;
      return { ch: ch, left: left, w: w };
    });
    var height = up + down;
    // The corners of the letters stay inside the circle; a lone narrow letter is not stretched.
    var fit = Math.min(rin * 0.94 * 2 / Math.sqrt(width * width + height * height), rin * 1.3 / height);

    var side = Math.ceil(rin * 2), mid = side / 2;
    var mask = document.createElement('canvas');
    mask.width = mask.height = side;
    var g = mask.getContext('2d', { willReadFrequently: true });
    g.font = font(REF * fit);
    g.textBaseline = 'alphabetic';
    g.lineWidth = pitch * 0.6;
    g.lineJoin = 'round';
    var x = mid - width * fit / 2, base = mid - height * fit / 2 + up * fit;
    glyphs.forEach(function (gl) {
      g.fillText(gl.ch, x + gl.left * fit, base);
      g.strokeText(gl.ch, x + gl.left * fit, base);
      x += (gl.w + gap) * fit;
    });
    var px = g.getImageData(0, 0, side, side).data;
    var inked = function (dx, dy) {
      var ix = Math.round(mid + dx), iy = Math.round(mid + dy);
      return ix >= 0 && iy >= 0 && ix < side && iy < side && px[(iy * side + ix) * 4 + 3] > 96;
    };
    // A bead sits where most of its place is letter: the centre and four points round it.
    var near = pitch * 0.3;
    var covered = function (dx, dy) {
      var n = (inked(dx, dy) ? 1 : 0) + (inked(dx - near, dy - near) ? 1 : 0) + (inked(dx + near, dy - near) ? 1 : 0) +
        (inked(dx - near, dy + near) ? 1 : 0) + (inked(dx + near, dy + near) ? 1 : 0);
      return n >= 3;
    };
    var rowH = pitch * 0.88, rows = Math.ceil(rin / rowH), cols = Math.ceil(rin / pitch) + 1, cells = [];
    for (var j = -rows; j <= rows; j++) {
      var shift = j % 2 ? pitch / 2 : 0;
      for (var i = -cols; i <= cols; i++) {
        var dx = i * pitch + shift, dy = j * rowH;
        if (covered(dx, dy)) cells.push({ x: dx, y: dy });
      }
    }
    return cells;
  }

  // The mark as a medallion: its ring and crystal, and inside them one or two initials in
  // beads. The ring is stitched first (or stands already, when only the letters change),
  // then the letters, from left to right.
  Embroidery.prototype.buildMonogram = function () {
    this.buildMark();
    var k = Math.min(this.w, this.h) / MARK_REF, s = 7.2;
    var keep = !!this.opts.keepRing, QUICK = 0.62, LETTERS_MS = 1900;
    this.beads.forEach(function (b) { b.t0 = keep ? -240 : b.t0 * QUICK; });
    this.gemAt = keep ? 0 : 420 * QUICK;
    var from = keep ? 200 : this.endT * QUICK - 100;
    var cells = letterCells(String(this.opts.text || ''), (MARK_REF * 0.34 - s * 2.6) * k, s * k);
    var cx = this.w / 2, cy = this.h / 2 + s * k, beads = this.beads;
    cells.forEach(function (c, i) { c.key = c.x + (wobble(i, 5) - 0.5) * s * k * 3; });
    cells.sort(function (a, b) { return a.key - b.key; });
    cells.forEach(function (c, i) {
      beads.push(sewnBead(cx + c.x, cy + c.y, s * 0.44 * k, 'gold', from + (i / cells.length) * LETTERS_MS, beads.length));
    });
    this.endT = from + LETTERS_MS + 260;
    return beads.length;
  };

  // A photo laid out in beads, placed exactly like the photo itself and on the same ground,
  // so the beadwork dissolves into the photo.
  Embroidery.prototype.sampleImage = function () {
    var im = this.opts.img;
    var fit = photoFit(im, this.w, this.h);
    if (!fit) return 0;
    var cols = edgeColours(im, fit.axis || 'x');
    var stops = groundStops(fit, this.w, this.h);
    var vertical = fit.axis === 'y', w = this.w, h = this.h;
    this.ground = { vertical: vertical, stops: stops, cols: cols };
    this.gem = null;
    var groundAt = function (x, y) {
      var t = ((vertical ? y / h : x / w) - stops[0]) / Math.max(0.001, stops[1] - stops[0]);
      return mixColour(cols[0], cols[1], Math.max(0, Math.min(1, t)));
    };
    var ox = fit.x, oy = fit.y, dw = fit.w, dh = fit.h;
    var pitch = Math.max(5, Math.min(8, w / 74));
    var area = (Math.min(dw, w) / pitch) * (Math.min(dh, h) / pitch);
    if (area > 4200) pitch *= Math.sqrt(area / 4200);
    var gridW = Math.max(1, Math.floor(w / pitch)), rows = Math.max(1, Math.floor(h / pitch));
    var off = document.createElement('canvas');
    off.width = gridW; off.height = rows;
    var o = off.getContext('2d', { willReadFrequently: true });
    o.imageSmoothingEnabled = true;
    o.imageSmoothingQuality = 'high';
    o.fillStyle = rgb(mixColour(cols[0], cols[1], 0.5));
    o.fillRect(0, 0, gridW, rows);
    o.drawImage(im, ox / pitch, oy / pitch, dw / pitch, dh / pitch);
    var px = o.getImageData(0, 0, gridW, rows).data;

    var cells = [], inside = 0, marked = 0;
    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < gridW; col++) {
        var x = (col + 0.5) * pitch + (row % 2 ? pitch * 0.25 : -pitch * 0.25);
        var y = (row + 0.5) * pitch;
        if (x < ox || x > ox + dw || y < oy || y > oy + dh) continue;
        var i = (row * gridW + col) * 4;
        var c = [px[i], px[i + 1], px[i + 2]];
        var bg = groundAt(x, y);
        var far = Math.sqrt(Math.pow(c[0] - bg[0], 2) + Math.pow(c[1] - bg[1], 2) + Math.pow(c[2] - bg[2], 2)) >= 44;
        inside++;
        if (far) marked++;
        cells.push({ x: x, y: y, c: c, bead: far });
      }
    }
    // A busy photo has no clear backdrop: then the whole picture becomes beadwork.
    var mosaic = marked > inside * 0.72;
    var crystals = [], rest = [];
    var r = pitch * 0.44;
    cells.forEach(function (cell) {
      if (!(cell.bead || mosaic)) return;
      var lum = (0.2126 * cell.c[0] + 0.7152 * cell.c[1] + 0.0722 * cell.c[2]) / 255;
      var bead = { x: cell.x, y: cell.y, r: lum > 0.72 ? r * 1.16 : r, color: rgb(cell.c), lum: lum, t0: 0 };
      (lum > 0.72 ? crystals : rest).push(bead);
    });
    for (var s = crystals.length - 1; s > 0; s--) {
      var j = Math.floor(Math.random() * (s + 1));
      var tmp = crystals[s]; crystals[s] = crystals[j]; crystals[j] = tmp;
    }
    rest.forEach(function (bd) { bd.key = bd.lum + Math.random() * 0.3; });
    rest.sort(function (a, b) { return b.key - a.key; });
    crystals.forEach(function (bd, idx) { bd.t0 = (idx / Math.max(1, crystals.length)) * 700; });
    rest.forEach(function (bd, idx) { bd.t0 = 450 + (idx / Math.max(1, rest.length)) * 2100; });
    this.beads = crystals.concat(rest);
    this.endT = 450 + 2100 + 260;
    return this.beads.length;
  };

  // ---------------------------------------------------------------- portrait
  // A photo of a person laid out in beads of four tones on velvet. The photo is a canvas
  // kept in memory only (see loadPhoto); everything here reads it and nothing leaves.
  var PORTRAIT_BEADS = {
    duo: ['#6b5632', '#b89a5a', '#cfc6d2', '#f6f2f7'],
    pearl: ['#5d5263', '#8f8496', '#c3b8c6', '#f2edf4'],
    gold: ['#5c4a2a', '#8f7642', '#c2a868', '#efe3bf']
  };
  var portraitTonesMade = {};   // sprite sets by palette, radius and dpr

  function clampRange(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function hexColour(hex) {
    return [parseInt(hex.substr(1, 2), 16), parseInt(hex.substr(3, 2), 16), parseInt(hex.substr(5, 2), 16)];
  }

  // One sprite per tone level (t1 darkest .. t4 lightest). Sets are kept by palette, radius and
  // dpr, so the picture for saving does not push out the sprites of the case on the page.
  function portraitTones(key, radius, dpr) {
    var id = key + '|' + radius.toFixed(2) + '|' + dpr;
    if (portraitTonesMade[id]) return portraitTonesMade[id];
    if (Object.keys(portraitTonesMade).length >= 12) portraitTonesMade = {};
    var set = {};
    (PORTRAIT_BEADS[key] || PORTRAIT_BEADS.duo).forEach(function (hex, i) {
      var body = hexColour(hex);
      set['t' + (i + 1)] = makeToneSprite(radius, dpr, [
        [0, rgb(mixColour(body, [255, 255, 255], 0.6))], [0.42, rgb(body)], [1, rgb(mixColour(body, [0, 0, 0], 0.38))]
      ]);
    });
    portraitTonesMade[id] = set;
    return set;
  }

  // The hallmark: a miniature of the mark (eleven beads round a centre, the crystal in the
  // twelfth place) stitched into the upper left corner of every portrait, on a small round
  // window of bare velvet, with a handwritten T inside the ring. Sprites are kept by radius
  // and dpr, like the portrait's.
  var hallmarkTonesMade = {};

  function hallmarkTones(radius, dpr) {
    var id = radius.toFixed(2) + '|' + dpr;
    if (hallmarkTonesMade[id]) return hallmarkTonesMade[id];
    if (Object.keys(hallmarkTonesMade).length >= 6) hallmarkTonesMade = {};
    hallmarkTonesMade[id] = { pearl: makeToneSprite(radius, dpr, TONES.pearl), gold: makeToneSprite(radius, dpr, TONES.gold) };
    return hallmarkTonesMade[id];
  }

  function hallmarkGeometry(w) {
    var r = clampRange(w * 0.042, 15, 46), inset = Math.max(w * 0.095, r * 2.3);
    return { r: r, cx: inset, cy: inset };
  }

  // The part of the photo that fills a box of the given proportions at a zoom, placed by
  // px and py (0 to 1) within the room the zoom leaves.
  function cropRect(sw, sh, aspect, view) {
    var cw, ch;
    if (sw / sh > aspect) { ch = sh / view.zoom; cw = ch * aspect; }
    else { cw = sw / view.zoom; ch = cw / aspect; }
    return { x: (sw - cw) * view.px, y: (sh - ch) * view.py, w: cw, h: ch };
  }

  // Luminance of the crop, one value per bead cell. Odd rows sit half a bead to the right,
  // so they are read from the picture moved by a quarter cell the other way.
  var sampleScratch = null;   // one small canvas for every sampling, so nothing piles up on a phone

  function scratchContext(w, h) {
    if (!sampleScratch) sampleScratch = document.createElement('canvas');
    if (sampleScratch.width !== w || sampleScratch.height !== h) {
      sampleScratch.width = w;
      sampleScratch.height = h;
    }
    var g = sampleScratch.getContext('2d', { willReadFrequently: true });
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    return g;
  }

  function samplePortrait(source, crop, across, rows, rowsExact, top) {
    var luma = new Float32Array(across * rows);
    for (var parity = 0; parity < 2; parity++) {
      var g = scratchContext(across, rows);
      // the unmoved picture first, so the quarter cell at the edge is never empty
      g.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, top, across, rowsExact);
      g.drawImage(source, crop.x, crop.y, crop.w, crop.h, parity ? -0.25 : 0.25, top, across, rowsExact);
      var px = g.getImageData(0, 0, across, rows).data;
      for (var row = parity; row < rows; row += 2) {
        for (var col = 0; col < across; col++) {
          var i = (row * across + col) * 4;
          luma[row * across + col] = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
        }
      }
    }
    return luma;
  }

  // Mean over a square of the given radius (cells), the edge cell repeated beyond the edge.
  function boxBlur(src, cols, rows, radius) {
    var tmp = new Float32Array(src.length), out = new Float32Array(src.length);
    var span = radius * 2 + 1, x, y, k, sum;
    for (y = 0; y < rows; y++) {
      for (x = 0; x < cols; x++) {
        sum = 0;
        for (k = -radius; k <= radius; k++) sum += src[y * cols + clampRange(x + k, 0, cols - 1)];
        tmp[y * cols + x] = sum / span;
      }
    }
    for (x = 0; x < cols; x++) {
      for (y = 0; y < rows; y++) {
        sum = 0;
        for (k = -radius; k <= radius; k++) sum += tmp[clampRange(y + k, 0, rows - 1) * cols + x];
        out[y * cols + x] = sum / span;
      }
    }
    return out;
  }

  // The largest value over a square of the given radius (cells).
  function boxMax(src, cols, rows, radius) {
    var tmp = new Float32Array(src.length), out = new Float32Array(src.length);
    var x, y, k, last, best;
    for (y = 0; y < rows; y++) {
      for (x = 0; x < cols; x++) {
        best = 0;
        last = Math.min(cols - 1, x + radius);
        for (k = Math.max(0, x - radius); k <= last; k++) if (src[y * cols + k] > best) best = src[y * cols + k];
        tmp[y * cols + x] = best;
      }
    }
    for (x = 0; x < cols; x++) {
      for (y = 0; y < rows; y++) {
        best = 0;
        last = Math.min(rows - 1, y + radius);
        for (k = Math.max(0, y - radius); k <= last; k++) if (tmp[k * cols + x] > best) best = tmp[k * cols + x];
        out[y * cols + x] = best;
      }
    }
    return out;
  }

  // Tone between the 3rd and 97th percentile of what is in the frame.
  function stretchRange(values) {
    var BINS = 512, hist = new Array(BINS), i, acc = 0, lo = 0, hi = 1;
    for (i = 0; i < BINS; i++) hist[i] = 0;
    for (i = 0; i < values.length; i++) hist[Math.min(BINS - 1, Math.floor(values[i] * BINS))]++;
    var low = values.length * 0.03, high = values.length * 0.97;
    for (i = 0; i < BINS; i++) {
      acc += hist[i];
      if (acc >= low) { lo = i / BINS; break; }
    }
    acc = 0;
    for (i = 0; i < BINS; i++) {
      acc += hist[i];
      if (acc >= high) { hi = (i + 1) / BINS; break; }
    }
    return [lo, Math.max(hi, lo + 0.08)];
  }

  // Level 0 (bare velvet) to 4 for every cell: local contrast so that eyes, brows and mouth
  // survive the coarse grid, a stretch of the tones in frame, the light, and a threshold
  // pattern fixed to the grid (error diffusion would shimmer all over while the photo moves).
  var VELVET_CUT = 0.2;    // tones darker than this are left to the velvet
  var INVERSE_CUT = 0.35;  // with the dark stitched: the lighter part of the photo, left to the velvet
  var PAPER_FLOOR = 0.3;   // nothing darker than this is taken for the paper of a drawing

  // In one colour a cell holds a bead or nothing, and a bead with fewer than two of its six
  // neighbours is taken out. Odd rows sit half a bead to the right: their neighbours in the
  // rows above and below are col and col + 1, for even rows col - 1 and col.
  function thinLoners(levels, across, rows) {
    var out = new Uint8Array(levels);
    var at = function (row, col) { return row >= 0 && row < rows && col >= 0 && col < across && levels[row * across + col] ? 1 : 0; };
    for (var row = 0; row < rows; row++) {
      var lo = row % 2 ? 0 : -1;
      for (var col = 0; col < across; col++) {
        if (!levels[row * across + col]) continue;
        var n = at(row, col - 1) + at(row, col + 1) + at(row - 1, col + lo) + at(row - 1, col + lo + 1) +
          at(row + 1, col + lo) + at(row + 1, col + lo + 1);
        if (n < 2) out[row * across + col] = 0;
      }
    }
    return out;
  }

  // Where a one-colour portrait is cut in two: a little under the usual tone of the middle
  // of the frame, where the face is, so that the face is beads and its eyes, brows and mouth
  // are velvet, whatever stands behind it or below it. With the dark stitched the tones come
  // here turned over, and the cut stands as far above the middle: the face is velvet, and
  // its eyes, brows and mouth are beads. There it may go lower, down to 0.3: on a drawing
  // the middle is paper, and its thin lines are grey by the time they reach the grid.
  function middleCut(flat, across, rows, inverse) {
    var BINS = 64, hist = [], count = 0, i;
    for (i = 0; i < BINS; i++) hist[i] = 0;
    var x0 = Math.floor(across * 0.22), x1 = Math.ceil(across * 0.78);
    var y0 = Math.floor(rows * 0.17), y1 = Math.ceil(rows * 0.73);
    for (var row = y0; row < y1; row++) {
      for (var col = x0; col < x1; col++) {
        hist[Math.min(BINS - 1, Math.floor(flat[row * across + col] * BINS))]++;
        count++;
      }
    }
    var under = count * (inverse ? 0.65 : 0.35), seen = 0;
    for (i = 0; i < BINS - 1; i++) {
      seen += hist[i];
      if (seen >= under) break;
    }
    return inverse ? clampRange((i + 0.5) / BINS, 0.3, 0.7) : clampRange((i + 0.5) / BINS, 0.3, 0.6);
  }

  function turnedOver(luma) {
    var out = new Float32Array(luma.length);
    for (var i = 0; i < luma.length; i++) out[i] = 1 - luma[i];
    return out;
  }

  // Every tone against the lightest thing within a third of the frame: the paper of a
  // drawing, the wall behind a figure. Light that falls unevenly on them, or a shadow across
  // them, is then no darker than the rest, and with the dark stitched it is not stitched.
  // The paper changes slowly, so it is looked for on a grid half as fine (an eighth of the work).
  function againstPaper(luma, across, rows) {
    var hc = Math.ceil(across / 2), hr = Math.ceil(rows / 2);
    var mean = new Float32Array(hc * hr), n = new Uint8Array(hc * hr), row, col, i;
    for (row = 0; row < rows; row++) {
      for (col = 0; col < across; col++) {
        i = (row >> 1) * hc + (col >> 1);
        mean[i] += luma[row * across + col];
        n[i]++;
      }
    }
    for (i = 0; i < mean.length; i++) mean[i] /= n[i];
    var reach = Math.max(2, Math.round(across / 6));    // a third of the frame, in the cells of this grid
    // smoothed first, so that one glint is not taken for the paper; and after, so that it has no steps
    var white = boxBlur(boxMax(boxBlur(mean, hc, hr, 1), hc, hr, reach), hc, hr, Math.round(reach / 2));
    var out = new Float32Array(luma.length);
    for (row = 0; row < rows; row++) {
      for (col = 0; col < across; col++) {
        i = row * across + col;
        out[i] = Math.min(1, luma[i] / Math.max(white[(row >> 1) * hc + (col >> 1)], PAPER_FLOOR));
      }
    }
    return out;
  }

  // With inverse the beads take the dark of the photo and its light is left to the velvet
  // («Вышить тёмное»): the tones are turned over first, and the rest works on them as on any
  // photo, so the slider «Свет» adds beads in both.
  function portraitLevels(luma, across, rows, light, one, inverse) {
    if (inverse) luma = turnedOver(againstPaper(luma, across, rows));
    var soft = boxBlur(luma, across, rows, Math.max(2, Math.round(across / 14)));
    var tone = new Float32Array(luma.length), i, boost = one ? 1.1 : 0.6;
    for (i = 0; i < luma.length; i++) tone[i] = clampRange(luma[i] + boost * (luma[i] - soft[i]), 0, 1);
    var range = stretchRange(tone);
    var gamma = 0.85 * Math.pow(2, -0.9 * light);
    var levels = new Uint8Array(luma.length);
    var cut = 0;
    if (one) {
      // the cut is found before the light is applied, so the slider «Свет» moves the tones past it
      var flat = new Float32Array(luma.length);
      for (i = 0; i < luma.length; i++) flat[i] = clampRange((tone[i] - range[0]) / (range[1] - range[0]), 0, 1);
      cut = Math.pow(middleCut(flat, across, rows, inverse), 0.85) * 0.75 + 0.125;
    }
    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < across; col++) {
        i = row * across + col;
        var l = Math.pow(clampRange((tone[i] - range[0]) / (range[1] - range[0]), 0, 1), gamma);
        if (one) {
          var local = clampRange(0.5 + (luma[i] - soft[i]) * 2.2, 0, 1);
          levels[i] = l * 0.75 + local * 0.25 >= cut ? 4 : 0;
          continue;
        }
        var a = 0.06711056 * col + 0.00583715 * row;
        var noise = 52.9829189 * (a - Math.floor(a));
        noise -= Math.floor(noise);
        // Below the cut the velvet stays bare: a scatter of lone beads there reads as
        // noise, not as shadow. Above it every cell holds a bead. With the dark stitched
        // the cut is higher and the four tones are spread over what is above it.
        var graded = inverse ? (l - INVERSE_CUT) / (1 - INVERSE_CUT) : l;
        levels[i] = l < (inverse ? INVERSE_CUT : VELVET_CUT) ? 0 : clampRange(Math.floor(graded * 4 + noise), 1, 4);
      }
    }
    return levels;
  }

  // The round window of the hallmark: no bead of the portrait stands in it.
  function emptyWindow(levels, grid, hall) {
    var reach = hall.r * 1.62 + grid.pitch * 0.47;
    var lastRow = Math.min(grid.rows, Math.ceil((hall.cy + reach - grid.top) / grid.rowH));
    var lastCol = Math.min(grid.across, Math.ceil((hall.cx + reach) / grid.pitch));
    for (var row = 0; row < lastRow; row++) {
      for (var col = 0; col < lastCol; col++) {
        var dx = (col + (row % 2 ? 0.75 : 0.25)) * grid.pitch - hall.cx, dy = grid.top + (row + 0.5) * grid.rowH - hall.cy;
        if (dx * dx + dy * dy < reach * reach) levels[row * grid.across + col] = 0;
      }
    }
  }

  // The beads of a portrait: hexagonal rows, one bead per cell above level 0, stitched
  // lightest first with a little noise. In one colour every bead is the same: the lightest
  // tone of pearl, the third of gold.
  Embroidery.prototype.buildPortrait = function () {
    var view = this.opts.view, source = this.opts.source, across = view.across;
    var pitch = this.w / across, rowH = pitch * 0.88;
    var rows = Math.max(1, Math.floor(this.h / rowH)), top = (this.h - rows * rowH) / 2;
    var crop = cropRect(source.width, source.height, this.w / this.h, view);
    var luma = samplePortrait(source, crop, across, rows, this.h / rowH, -top / rowH);
    var levels = portraitLevels(luma, across, rows, view.light, !!view.one, !!view.inverse);
    var oneTone = view.beads === 'gold' ? 't3' : 't4';
    var beads = [], hall = hallmarkGeometry(this.w);
    // the window is emptied first, so that no bead is left alone at its edge
    emptyWindow(levels, { across: across, rows: rows, pitch: pitch, rowH: rowH, top: top }, hall);
    // one colour, and the dark stitched in any tones, are pictures of lines: a lone bead is noise there
    if (view.one || view.inverse) levels = thinLoners(levels, across, rows);
    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < across; col++) {
        var i = row * across + col, level = levels[i];
        if (!level) continue;
        var bx = (col + (row % 2 ? 0.75 : 0.25)) * pitch, by = top + (row + 0.5) * rowH;
        var bead = sewnBead(bx, by, pitch * 0.47, view.one ? oneTone : 't' + level, 0, i);
        bead.key = (4 - level) + wobble(i, 6) * 1.2;
        beads.push(bead);
      }
    }
    beads.sort(function (a, b) { return a.key - b.key; });
    beads.forEach(function (bead, idx) { bead.t0 = (idx / beads.length) * 2600; });
    if (!beads.length) { this.beads = beads; this.gem = null; this.letter = null; return 0; }
    // the hallmark comes after the portrait: its beads one by one, then its crystal
    for (var n = 1; n <= 11; n++) {
      var a = -Math.PI / 2 + n * Math.PI / 6;
      var mark = sewnBead(hall.cx + hall.r * Math.cos(a), hall.cy + hall.r * Math.sin(a), hall.r * 0.2,
        n % 2 ? 'gold' : 'pearl', 2700 + n * 45, n);
      mark.hall = true;
      beads.push(mark);
    }
    this.beads = beads;
    this.gem = { x: hall.cx, y: hall.cy - hall.r, w: hall.r * 0.27, h: hall.r * 0.35 };
    this.hallR = hall.r * 0.2;
    this.letter = { x: hall.cx, y: hall.cy, size: hall.r * 1.3 };
    this.gemAt = 3300;
    this.gemFrom = this.gemAt - 420;
    this.ground = null;
    this.endT = 3800;
    return beads.length;
  };

  // The finished portrait at once, in a new framing, light, bead choice or size.
  Embroidery.prototype.redraw = function (view) {
    if (this.stopped) return false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.opts.view = view;
    var count = 0;
    try {
      this.measure();
      count = this.prepare();
    } catch (err) {
      return false;
    }
    if (!count) return false;
    this.frame(Infinity);
    this.finished = true;
    this.rekindle();
    if (this.opts.onCount) this.opts.onCount(count);
    return true;
  };

  // The glint of a portrait's hallmark starts over on the crystal of the new view.
  Embroidery.prototype.rekindle = function () {
    if (this.opts.mode !== 'portrait' || this.stopped || this.opts.size) return;
    if (this.reglint) this.reglint();
    else this.twinkle();
  };

  // The portrait's tones and the hallmark's gold and pearl, both from caches.
  Embroidery.prototype.portraitSprites = function (maxR) {
    var set = {}, own = portraitTones(this.opts.view.beads, maxR, this.dpr);
    Object.keys(own).forEach(function (k) { set[k] = own[k]; });
    var hall = hallmarkTones(this.hallR, this.dpr);
    set.gold = hall.gold;
    set.pearl = hall.pearl;
    return set;
  };

  Embroidery.prototype.prepare = function () {
    var mode = this.opts.mode;
    var count = mode === 'mark' ? this.buildMark() : mode === 'macro' ? this.buildMacro()
      : mode === 'monogram' ? this.buildMonogram() : mode === 'portrait' ? this.buildPortrait() : this.sampleImage();
    if (!count) return 0;
    var maxR = 0;
    this.beads.forEach(function (bd) { if (bd.r > maxR && !bd.hall) maxR = bd.r; });
    if (mode === 'image') this.shade = makeShadeSprite(maxR, this.dpr);
    else if (mode === 'portrait') this.tones = this.portraitSprites(maxR);
    else this.tones = { pearl: makeToneSprite(maxR, this.dpr, TONES.pearl), gold: makeToneSprite(maxR, this.dpr, TONES.gold) };
    // The layer of finished beads is cleared and reused while the canvas keeps its size.
    var base = this.base;
    if (!base || base.width !== this.canvas.width || base.height !== this.canvas.height) {
      base = document.createElement('canvas');
      base.width = this.canvas.width;
      base.height = this.canvas.height;
    }
    var b = base.getContext('2d');
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.clearRect(0, 0, base.width, base.height);
    b.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.ground) {
      var gd = this.ground;
      var lin = b.createLinearGradient(0, 0, gd.vertical ? 0 : this.w, gd.vertical ? this.h : 0);
      lin.addColorStop(gd.stops[0], rgb(gd.cols[0]));
      lin.addColorStop(gd.stops[1], rgb(gd.cols[1]));
      b.fillStyle = lin;
      b.fillRect(0, 0, this.w, this.h);
    }
    this.base = base;
    this.bctx = b;
    this.gemDone = false;
    this.beads.forEach(function (bd) { bd.done = false; });
    return count;
  };

  Embroidery.prototype.drawBead = function (ctx, b, e) {
    var rr = b.r * (0.35 + 0.65 * e);
    ctx.globalAlpha = e;
    var tone = b.tone && this.tones[b.tone];
    if (tone) {
      var half = (tone.r + tone.pad) * (rr / tone.r);
      ctx.drawImage(tone.canvas, b.x - half, b.y - half, half * 2, half * 2);
      if (b.lift) {
        ctx.globalAlpha = e * Math.abs(b.lift);
        ctx.fillStyle = b.lift > 0 ? '#ffffff' : '#000000';
        ctx.beginPath(); ctx.arc(b.x, b.y, rr, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.beginPath(); ctx.arc(b.x + 0.4, b.y + 1, rr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = b.color;
      ctx.beginPath(); ctx.arc(b.x, b.y, rr, 0, Math.PI * 2); ctx.fill();
      ctx.drawImage(this.shade, b.x - rr, b.y - rr, rr * 2, rr * 2);
    }
    ctx.globalAlpha = 1;
  };

  // The crystal: eight facets lit from the upper left, from white to the darkest platinum,
  // and one white specular edge.
  Embroidery.prototype.drawGem = function (ctx, k) {
    var g = this.gem;
    var e = 1 - Math.pow(1 - k, 3);
    var w = g.w * (0.6 + 0.4 * e), h = g.h * (0.6 + 0.4 * e);
    var T = [g.x, g.y - h], R = [g.x + w, g.y], B = [g.x, g.y + h], L = [g.x - w, g.y];
    var C = [g.x, g.y - h * 0.12];
    var mid = function (a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
    var m1 = mid(T, R), m2 = mid(R, B), m3 = mid(B, L), m4 = mid(L, T);
    // Each facet brightens toward the table, the way light gathers in cut glass.
    var facets = [
      [T, m1, '#f2edf4', '#ffffff'], [m1, R, '#c3b8c6', '#e4dde6'], [R, m2, '#c3b8c6', '#e4dde6'],
      [m2, B, '#9d90a1', '#c3b8c6'], [B, m3, '#9d90a1', '#c3b8c6'], [m3, L, '#c3b8c6', '#e4dde6'],
      [L, m4, '#f2edf4', '#ffffff'], [m4, T, '#ffffff', '#f2edf4']
    ];
    var outline = function () {
      ctx.beginPath(); ctx.moveTo(T[0], T[1]); ctx.lineTo(R[0], R[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(L[0], L[1]); ctx.closePath();
    };
    ctx.save();
    ctx.globalAlpha = e;
    ctx.save();
    ctx.translate(Math.max(0.4, w * 0.01), Math.max(1, w * 0.025));
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    outline(); ctx.fill();
    ctx.restore();
    facets.forEach(function (f) {
      var edge = mid(f[0], f[1]);
      var light = ctx.createLinearGradient(edge[0], edge[1], C[0], C[1]);
      light.addColorStop(0, f[2]);
      light.addColorStop(1, f[3]);
      ctx.fillStyle = light;
      ctx.beginPath(); ctx.moveTo(f[0][0], f[0][1]); ctx.lineTo(f[1][0], f[1][1]); ctx.lineTo(C[0], C[1]); ctx.closePath(); ctx.fill();
    });
    ctx.strokeStyle = 'rgba(255,255,255,.4)';
    ctx.lineWidth = Math.max(0.5, w * 0.012);
    ctx.beginPath();
    [T, m1, R, m2, B, m3, L, m4].forEach(function (p) { ctx.moveTo(C[0], C[1]); ctx.lineTo(p[0], p[1]); });
    ctx.stroke();
    outline(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.95)';
    ctx.lineWidth = Math.max(1, w * 0.03);
    ctx.beginPath(); ctx.moveTo(L[0], L[1]); ctx.lineTo(T[0], T[1]); ctx.stroke();
    ctx.restore();
  };

  // The T of the hallmark, in champagne, its ink box centred on the ring. It is drawn only in
  // the handwriting: without it nothing stands in its place, and letterMissing tells the page
  // to redraw once the font has come.
  Embroidery.prototype.drawLetter = function (ctx, alpha) {
    var t = this.letter;
    if (!t) return;
    this.letterMissing = !handReady('T');
    if (this.letterMissing) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '400 ' + t.size + 'px "Marck Script"';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    var m = ctx.measureText('T');
    var left = m.actualBoundingBoxLeft || 0, right = m.actualBoundingBoxRight || m.width;
    var up = m.actualBoundingBoxAscent || t.size * 0.7, down = m.actualBoundingBoxDescent || 0;
    ctx.fillStyle = '#d9c595';
    ctx.fillText('T', t.x - (right - left) / 2, t.y + (up - down) / 2);
    ctx.restore();
  };

  // A glint caught by a facet: a four-point star, arms 2px wide at the centre tapering to
  // nothing, and a 3px core.
  Embroidery.prototype.drawStar = function (ctx, x, y, len, alpha) {
    var arm = function (dx, dy) {
      ctx.beginPath();
      ctx.moveTo(x - dy, y + dx);
      ctx.lineTo(x + dx * len, y + dy * len);
      ctx.lineTo(x + dy, y - dx);
      ctx.closePath();
      ctx.fill();
    };
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = alpha;
    arm(1, 0); arm(-1, 0); arm(0, 1); arm(0, -1);
    ctx.globalAlpha = alpha * 0.8;
    ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  // The needle: a point of light on the bead just stitched, so the ring reads as sewing.
  Embroidery.prototype.drawNeedle = function (ctx, x, y, r) {
    var halo = ctx.createRadialGradient(x, y, 0, x, y, r * 1.8);
    halo.addColorStop(0, 'rgba(255,255,255,.85)');
    halo.addColorStop(0.35, 'rgba(255,255,255,.3)');
    halo.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(x, y, r * 1.8, 0, Math.PI * 2); ctx.fill();
  };

  // One frame at time t (ms). t = Infinity draws the finished embroidery.
  Embroidery.prototype.frame = function (t) {
    var ctx = this.ctx, active = [], head = null;
    if (this.gem && !this.gemDone && t >= this.gemAt) { this.drawGem(this.bctx, 1); this.drawLetter(this.bctx, 1); this.gemDone = true; }
    for (var i = 0; i < this.beads.length; i++) {
      var b = this.beads[i];
      if (b.done || t < b.t0) continue;
      var k = (t - b.t0) / 240;
      if (k >= 1) { this.drawBead(this.bctx, b, 1); b.done = true; continue; }
      active.push(b, 1 - Math.pow(1 - k, 3));
      if (!head || b.t0 > head.t0) head = b;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.base, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.gem && !this.gemDone && t > this.gemFrom) {
      var grown = Math.min(1, (t - this.gemFrom) / (this.gemAt - this.gemFrom));
      this.drawGem(ctx, grown);
      this.drawLetter(ctx, grown);
    }
    for (var j = 0; j < active.length; j += 2) this.drawBead(ctx, active[j], active[j + 1]);
    if (head && (this.opts.mode === 'mark' || this.opts.mode === 'monogram')) this.drawNeedle(ctx, head.x, head.y, head.r);
  };

  Embroidery.prototype.run = function () {
    var self = this;
    try {
      this.measure();
      var count = this.prepare();
      if (!count) return false;
      if (this.opts.onCount) this.opts.onCount(count);
    } catch (err) {
      return false;
    }
    if (!this.opts.size) this.watchSize();
    if (reduceMotion.matches || this.opts.still) {
      this.frame(Infinity);
      this.finish(true);
      return true;
    }
    var start = performance.now();
    var tick = function (now) {
      var t = now - start;
      self.frame(t);
      if (t < self.endT) self.raf = requestAnimationFrame(tick);
      else { self.raf = 0; self.frame(Infinity); self.finish(false); }
    };
    this.raf = requestAnimationFrame(tick);
    return true;
  };

  Embroidery.prototype.finish = function (instant) {
    this.finished = true;
    if (this.gem && !this.opts.size) this.twinkle();
    if (this.opts.onDone) this.opts.onDone(instant);
  };

  // Ends whatever this embroidery still animates, so its canvas can be stitched anew.
  Embroidery.prototype.stop = function () {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.stopTwinkle) this.stopTwinkle();
    if (this.sizeWatch) { this.sizeWatch.disconnect(); this.sizeWatch = null; }
    if (this.unwatch) { this.unwatch(); this.unwatch = null; }
    this.opts.onDone = null;
  };

  // A new size (rotation, window resize, zoom): redraw the finished state at once.
  Embroidery.prototype.watchSize = function () {
    var self = this;
    if (this.sizeWatch || !('ResizeObserver' in window)) return;
    var lastW = this.w, lastH = this.h, pending = 0;
    this.sizeWatch = new ResizeObserver(function () {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(function () {
        if (self.stopped) return;
        var r = self.canvas.getBoundingClientRect();
        if (Math.abs(r.width - lastW) < 4 && Math.abs(r.height - lastH) < 4) return;
        if (r.width < 1 || r.height < 1) return;
        lastW = r.width; lastH = r.height;
        // A finished photo has resolved into the photo itself, which places itself.
        if (self.opts.mode === 'image' && self.finished) return;
        self.rebuild();
      });
    });
    this.sizeWatch.observe(this.canvas);
  };

  Embroidery.prototype.rebuild = function () {
    if (this.stopped) return;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.stopTwinkle) this.stopTwinkle();
    var count = 0;
    try {
      // a portrait keeps the meaning of its size slider: the bead count is refitted to the new width
      if (this.opts.refit) this.opts.view = this.opts.refit(this.canvas.getBoundingClientRect().width);
      this.measure();
      count = this.prepare();
    } catch (err) {
      return;
    }
    if (!count) return;
    if (this.opts.refit && this.opts.onCount) this.opts.onCount(count);
    this.frame(Infinity);
    var first = !this.finished;
    this.finished = true;
    this.rekindle();
    if (first && this.opts.onDone) this.opts.onDone(true);
  };

  // Once the mark is finished, the crystal (never the beads) catches the light now and
  // then for twelve seconds; only the small squares around each spark are redrawn.
  Embroidery.prototype.twinkle = function () {
    var self = this;
    if (reduceMotion.matches || !this.gem) return;
    // Arms 0.3 of the crystal's width, shortened where a facet edge is near: the star
    // never leaves the crystal. The crystal is read at each glint, so a portrait that is
    // laid out anew keeps its glint.
    var SPOTS = [[-0.2, -0.3], [0.15, -0.15], [0, 0.25], [-0.3, 0.05], [0.1, -0.5]];
    var spotAt = function (p) {
      var gem = self.gem;
      var room = Math.min(gem.w * (1 - Math.abs(p[1])) - gem.w * Math.abs(p[0]),
        gem.h * (1 - Math.abs(p[0])) - gem.h * Math.abs(p[1]));
      return { x: gem.x + gem.w * p[0], y: gem.y + gem.h * p[1], len: Math.min(gem.w * 0.6, room) * 0.9 };
    };
    var started = performance.now(), LIMIT = 12000, next = started + 500;
    var glints = [], dirty = [];

    var restore = function () {
      var ctx = self.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (var d = 0; d < dirty.length; d++) {
        var r = dirty[d];
        ctx.clearRect(r[0], r[1], r[2], r[3]);
        ctx.drawImage(self.base, r[0], r[1], r[2], r[3], r[0], r[1], r[2], r[3]);
      }
      ctx.setTransform(self.dpr, 0, 0, self.dpr, 0, 0);
      dirty = [];
    };
    var loop = function (now) {
      self.raf = 0;
      restore();
      if (!self.visible || document.hidden || reduceMotion.matches) { glints = []; return; }
      var live = now - started < LIMIT;
      if (live && now >= next && glints.length < 2) {
        var b = spotAt(SPOTS[Math.floor(Math.random() * SPOTS.length)]);
        glints.push({ x: b.x, y: b.y, len: b.len, t0: now });
        next = now + 650 + Math.random() * 600;
      }
      glints = glints.filter(function (g) {
        var k = (now - g.t0) / 1200;   // 600 ms in, 600 ms out
        if (k >= 1) return false;
        var a = Math.sin(Math.PI * k);
        var len = g.len * (0.5 + 0.5 * a);
        self.drawStar(self.ctx, g.x, g.y, len, a);
        var pad = len + 3;
        dirty.push(clampRect((g.x - pad) * self.dpr, (g.y - pad) * self.dpr, pad * 2 * self.dpr, pad * 2 * self.dpr, self.canvas));
        return true;
      });
      if (live || glints.length || dirty.length) self.raf = requestAnimationFrame(loop);
      else self.twinkleDone = true;
    };
    this.resume = function () {
      if (!self.raf && !self.twinkleDone) self.raf = requestAnimationFrame(loop);
    };
    // The layer under the sparks was drawn anew: they are gone with it, and the twelve
    // seconds start over. The observer and the listeners below stay as they are.
    this.reglint = function () {
      glints = [];
      dirty = [];
      started = performance.now();
      next = started + 500;
      self.twinkleDone = false;
      self.resume();
    };
    this.stopTwinkle = function () {
      cancelAnimationFrame(self.raf);
      self.raf = 0;
      self.twinkleDone = true;
      glints = [];
      restore();
    };
    this.resume();
    var seen = null;
    if ('IntersectionObserver' in window) {
      seen = new IntersectionObserver(function (entries) {
        self.visible = entries[entries.length - 1].isIntersecting;
        if (self.visible) self.resume();
      });
      seen.observe(this.canvas);
    }
    var onShown = function () { if (!document.hidden) self.resume(); };
    var onCalm = function () { if (reduceMotion.matches) self.stopTwinkle(); };
    document.addEventListener('visibilitychange', onShown);
    if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', onCalm);
    // What stop() takes down, so an embroidery that was replaced holds on to nothing.
    this.unwatch = function () {
      if (seen) seen.disconnect();
      document.removeEventListener('visibilitychange', onShown);
      if (reduceMotion.removeEventListener) reduceMotion.removeEventListener('change', onCalm);
    };
  };

  // ---------------------------------------------------------------- home: hero
  // The motto spells the name: the initials of its words stand a shade brighter.
  // Screen readers get the plain English phrase.
  var MOTTO = 'There Is No Other Like It';

  function mottoNode(dot) {
    var box = el('span', { lang: 'en', className: 'motto' });
    box.appendChild(el('span', { className: 'visually-hidden' }, MOTTO + (dot ? '.' : '')));
    var seen = el('span', { 'aria-hidden': 'true' });
    MOTTO.split(' ').forEach(function (word, i) {
      if (i) seen.appendChild(document.createTextNode(' '));
      seen.appendChild(el('b', null, word.charAt(0)));
      seen.appendChild(document.createTextNode(word.slice(1)));
    });
    if (dot) seen.appendChild(document.createTextNode('.'));
    box.appendChild(seen);
    return box;
  }

  function setCaption(node, note) {
    if (!node) return;
    node.textContent = '';
    node.appendChild(mottoNode(!!note));
    if (note) node.appendChild(document.createTextNode(' ' + note));
  }

  function markNote(n) {
    return typo('Знак вышит из ' + formatCount(n) + ' ' + plural(n, 'бусины', 'бусин', 'бусин') + '.');
  }

  // With no works yet the collection section steps aside: the vitrine itself says
  // that the first works will appear in it, and «Работы» leads to the vitrine.
  function emptyCollection() {
    var section = document.getElementById('works');
    var hero = document.querySelector('.hero');
    if (section && hero) {
      section.hidden = true;
      section.removeAttribute('id');
      hero.id = 'works';
    }
    var note = document.querySelector('[data-hero-note]');
    if (note) note.hidden = false;
  }

  // failed: the catalogue could not be loaded. The mark is stitched all the same, but the
  // collection is not declared empty, so the error under «Работы» stays in view.
  function initHero(works, failed) {
    var root = document.querySelector('[data-hero]');
    if (!root) return;
    var stage = root.querySelector('.vitrine');
    var canvas = root.querySelector('.embroidery');
    var obj = root.querySelector('[data-hero-obj]');
    var worn = root.querySelector('[data-hero-worn]');
    var objShot = obj.parentNode, wornShot = worn.parentNode;
    var caption = root.querySelector('[data-hero-caption]');
    var shots = root.querySelector('.shots');
    var featured = document.querySelector('[data-featured]');
    var cta = document.querySelector('[data-hero-cta]');

    function stitchMark() {
      objShot.hidden = true;
      wornShot.hidden = true;
      if (shots) shots.hidden = true;
      canvas.classList.remove('is-done');
      stage.setAttribute('aria-label', 'Знак TINOLI, вышитый бисером');
      var run = new Embroidery(canvas, {
        mode: 'mark',
        onCount: function (n) { setCaption(caption, markNote(n)); }
      });
      if (!run.run()) stage.classList.add('is-fallback');
    }

    if (!works.length) {
      if (!failed) {
        emptyCollection();
        if (cta) {
          cta.setAttribute('href', '#contact');
          cta.textContent = 'Написать мастеру';
          cta.removeAttribute('data-config');
        }
      }
      stitchMark();
      return;
    }

    var work = works[0];
    var label = kindOf(work) + ' «' + work.title + '»';
    stage.setAttribute('aria-label', label);
    obj.alt = '';
    objShot.hidden = false;
    setCaption(caption);
    if (work.filename_hover) {
      worn.src = img(work.filename_hover);
      wornShot.hidden = false;
      watchPhoto(worn, wornShot);
      if (shots) shots.hidden = false;
      initSwap(root, {
        hoverTarget: stage,
        onChange: function (alt) { stage.setAttribute('aria-label', label + (alt ? ': как носится' : '')); }
      });
    }
    if (featured) {
      featured.hidden = false;
      var link = featured.querySelector('[data-featured-link]');
      link.textContent = typo(work.title);
      link.href = '/works/' + encodeURIComponent(work.id) + '/';
      link.addEventListener('click', function () { nameCase(stage); });
      var pass = featured.querySelector('[data-featured-passport]');
      passportRows(work).forEach(function (row) { pass.appendChild(row); });
    }

    var started = false;
    var startStitch = function () {
      if (started) return;
      started = true;
      var run = new Embroidery(canvas, {
        mode: 'image',
        img: obj,
        onDone: function (instant) {
          if (instant) { canvas.classList.add('is-done'); return; }
          setTimeout(function () {
            glint(stage);
            canvas.classList.add('is-done');
          }, 450);
        }
      });
      if (!run.run()) canvas.classList.add('is-done');
    };
    // The photo is placed first, so the beads are laid on exactly its ground.
    watchPhoto(obj, objShot);
    obj.addEventListener('load', startStitch, { once: true });
    // A missing photo must not leave an empty case: stitch the mark instead.
    obj.addEventListener('error', function () { if (!started) { started = true; stitchMark(); } }, { once: true });
    obj.src = img(work.filename);
    if (obj.complete && obj.naturalWidth) startStitch();
  }

  function passportRows(work) {
    var rows = [['Вид', kindOf(work)]];
    if (work.materials) rows.push(['Материалы', work.materials]);
    if (work.size) rows.push(['Размер', work.size]);
    if (work.year) rows.push(['Год', work.year]);
    return rows.map(function (r) {
      var row = el('div', { className: 'passport__row' });
      row.appendChild(el('dt', null, r[0]));
      row.appendChild(el('dd', null, typo(String(r[1]))));
      return row;
    });
  }

  // ---------------------------------------------------------------- home: works
  function initWorks(works) {
    var grid = document.querySelector('[data-grid]');
    if (!grid || !works.length) return;
    var kindsBox = document.querySelector('[data-kinds]');
    var sentinel = document.querySelector('[data-sentinel]');
    var status = document.querySelector('[data-works-status]');

    var present = KIND_ORDER.filter(function (k) {
      return works.some(function (w) { return kindKey(w) === k; });
    });
    var params = new URLSearchParams(window.location.search);
    var current = params.get('category');
    if (!current || present.indexOf(current) === -1) current = 'all';
    var shown = 0;

    function filtered() {
      if (current === 'all') return works;
      return works.filter(function (w) { return kindKey(w) === current; });
    }

    function tile(work, eager) {
      var article = el('article', { className: 'tile' });
      var link = el('a', { className: 'tile__link', href: '/works/' + encodeURIComponent(work.id) + '/' });
      var stage = el('div', { className: 'vitrine' });
      // The link text already names the work, so the photos stay unannounced. Each photo is
      // placed like the hero's: filling the tile when close to 4:5, otherwise whole.
      // loading comes before src: an image decides on lazy loading when its src is set.
      stage.appendChild(shotOf('vitrine__shot vitrine__shot--obj', {
        loading: eager ? 'eager' : 'lazy', decoding: 'async', alt: '', src: img(work.filename)
      }));
      if (work.filename_hover) {
        stage.appendChild(shotOf('vitrine__shot vitrine__shot--worn', {
          loading: 'lazy', decoding: 'async', alt: '', src: img(work.filename_hover)
        }));
      }
      stage.appendChild(el('span', { className: 'vitrine__shade', 'aria-hidden': 'true' }));
      stage.appendChild(el('span', { className: 'vitrine__glare', 'aria-hidden': 'true' }));
      link.appendChild(stage);
      link.addEventListener('click', function () { nameCase(stage); });
      link.appendChild(el('h3', { className: 'tile__title display' }, typo(work.title)));
      link.appendChild(el('p', { className: 'tile__meta' }, workMeta(work)));
      article.appendChild(link);
      if (work.filename_hover) {
        article.appendChild(el('button', {
          className: 'tile__shot', type: 'button', 'data-pin': true, 'aria-pressed': 'false',
          'aria-label': 'Показать, как носится: ' + work.title
        }, 'Как носится'));
        initSwap(article, { hoverTarget: article, focusTarget: link });
      }
      return article;
    }

    function more() {
      var list = filtered();
      var next = list.slice(shown, shown + PAGE_SIZE);
      next.forEach(function (w, i) { grid.appendChild(tile(w, shown + i < 3)); });
      shown += next.length;
      if (sentinel) sentinel.hidden = shown >= list.length;
    }

    function render(announce) {
      grid.textContent = '';
      shown = 0;
      more();
      if (announce && status) {
        var n = filtered().length;
        status.textContent = 'Показано ' + n + ' ' + plural(n, 'работа', 'работы', 'работ');
      }
    }

    if (kindsBox && present.length > 1) {
      var options = [['all', 'Все']].concat(present.map(function (k) { return [k, KIND_PLURAL[k]]; }));
      options.forEach(function (o) {
        var b = el('button', { type: 'button', 'data-kind': o[0], 'aria-pressed': String(o[0] === current) }, o[1]);
        b.addEventListener('click', function () {
          current = o[0];
          kindsBox.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
          var url = new URL(window.location.href);
          if (current === 'all') url.searchParams.delete('category'); else url.searchParams.set('category', current);
          window.history.replaceState({}, '', url.toString());
          render(true);
        });
        kindsBox.appendChild(b);
      });
      kindsBox.hidden = false;
    }

    render(false);
    if (sentinel && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        if (entries[entries.length - 1].isIntersecting && shown < filtered().length) more();
      }, { rootMargin: '600px 0px' }).observe(sentinel);
    }
  }

  // ---------------------------------------------------------------- work page
  function initViewer() {
    var viewer = document.querySelector('[data-viewer]');
    if (!viewer) return;
    var stage = viewer.querySelector('.viewer__stage');
    var images = viewer.querySelectorAll('.viewer__img');
    var tabs = viewer.querySelectorAll('.viewer__tabs [data-shot]');
    var beforeShow = null;
    stage.appendChild(el('span', { className: 'vitrine__glare', 'aria-hidden': 'true' }));

    // Each shot stands on its own ground in the case; the wrapper fades in and out.
    images.forEach(function (im) {
      var on = im.classList.contains('is-on');
      var shot = el('span', { className: 'shot viewer__shot' + (on ? ' is-on' : '') });
      im.parentNode.insertBefore(shot, im);
      shot.appendChild(im);
      watchPhoto(im, shot);
      if (!on) im.setAttribute('aria-hidden', 'true');
    });

    function show(shot) {
      if (beforeShow) beforeShow();
      images.forEach(function (im) {
        var on = im.getAttribute('data-shot') === shot;
        im.classList.toggle('is-on', on);
        im.parentNode.classList.toggle('is-on', on);
        if (on) im.removeAttribute('aria-hidden'); else im.setAttribute('aria-hidden', 'true');
      });
      tabs.forEach(function (t) { t.setAttribute('aria-pressed', String(t.getAttribute('data-shot') === shot)); });
      glint(stage);
    }
    tabs.forEach(function (t) {
      t.addEventListener('click', function () { show(t.getAttribute('data-shot')); });
    });

    if (!finePointer.matches) {
      beforeShow = touchViewer(viewer, stage, tabs, current, show);
      return;
    }
    var lens = el('div', { className: 'loupe', 'aria-hidden': 'true' });
    stage.appendChild(lens);
    var ZOOM = 2.6, SIZE = 200;
    viewer.appendChild(el('p', { className: 'viewer__hint', 'aria-hidden': 'true' }, typo('Наведите курсор на фото, чтобы рассмотреть вышивку')));

    function current() {
      for (var i = 0; i < images.length; i++) if (images[i].classList.contains('is-on')) return images[i];
      return images[0];
    }
    stage.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var im = current();
      if (!im || !im.naturalWidth) return;
      var r = stage.getBoundingClientRect();
      var px = e.clientX - r.left, py = e.clientY - r.top;
      // The loupe follows the photo as it is placed: filling the case, or whole on its
      // ground, and then only over the photo itself.
      var fit = photoFit(im, r.width, r.height);
      if (!fit) return;
      var ix = px - fit.x, iy = py - fit.y;
      if (ix < 0 || iy < 0 || ix > fit.w || iy > fit.h) { lens.classList.remove('is-on'); return; }
      lens.style.left = px + 'px';
      lens.style.top = py + 'px';
      lens.style.backgroundImage = 'url("' + im.currentSrc.replace(/"/g, '%22') + '")';
      lens.style.backgroundSize = (fit.w * ZOOM) + 'px ' + (fit.h * ZOOM) + 'px';
      lens.style.backgroundPosition = (-(ix * ZOOM - SIZE / 2)) + 'px ' + (-(iy * ZOOM - SIZE / 2)) + 'px';
      lens.classList.add('is-on');
    });
    stage.addEventListener('pointerleave', function () { lens.classList.remove('is-on'); });
  }

  // The close-up of the crystal beside «Написать мастеру», drawn when it comes into view.
  function initMacroStages() {
    document.querySelectorAll('[data-macro-stage]').forEach(function (root) {
      var stage = root.querySelector('.vitrine');
      var canvas = root.querySelector('.embroidery');
      var start = function () {
        var run = new Embroidery(canvas, { mode: 'macro', still: true });
        if (!run.run()) stage.classList.add('is-fallback');
      };
      if (!('IntersectionObserver' in window)) { start(); return; }
      var io = new IntersectionObserver(function (entries) {
        if (entries[entries.length - 1].isIntersecting) { io.disconnect(); start(); }
      }, { threshold: 0.3 });
      io.observe(stage);
    });
  }

  // On a phone: a touch brings the photo closer, a finger moves it about, a second touch
  // lets it go; a sweep across the case changes the shot. Returns a function that lets
  // the photo go, for the moment the shot changes.
  function touchViewer(viewer, stage, tabs, current, show) {
    var ZOOM = 2.6, SWEEP = 40, SLOP = 8;
    var HINTS = [
      typo('Коснитесь фото, чтобы рассмотреть вышивку'),
      typo('Ведите пальцем по фото. Коснитесь ещё раз, чтобы отдалить')
    ];
    var hint = el('p', { className: 'viewer__hint', 'aria-hidden': 'true' }, HINTS[0]);
    var zoomed = false, tx = 0, ty = 0, start = null, moved = false;
    viewer.appendChild(hint);
    stage.classList.add('is-touch');

    function clamp(v, min) { return Math.max(min, Math.min(0, v)); }
    function place() {
      current().parentNode.style.transform = zoomed ? 'translate(' + tx + 'px,' + ty + 'px) scale(' + ZOOM + ')' : '';
    }
    function zoom(on, px, py) {
      var r = stage.getBoundingClientRect();
      zoomed = on;
      if (on) {
        tx = clamp(px * (1 - ZOOM), r.width * (1 - ZOOM));
        ty = clamp(py * (1 - ZOOM), r.height * (1 - ZOOM));
      }
      stage.classList.toggle('is-zoomed', on);
      hint.textContent = HINTS[on ? 1 : 0];
      place();
    }
    function step(dir) {
      var order = Array.prototype.map.call(tabs, function (t) { return t.getAttribute('data-shot'); });
      var next = order.indexOf(current().getAttribute('data-shot')) + dir;
      if (next >= 0 && next < order.length) show(order[next]);
    }

    // Only the first finger moves the photo; a second one is the browser's own pinch.
    stage.addEventListener('pointerdown', function (e) {
      if (!e.isPrimary) return;
      start = { x: e.clientX, y: e.clientY, tx: tx, ty: ty };
      moved = false;
    });
    stage.addEventListener('pointermove', function (e) {
      if (!start || !e.isPrimary) return;
      var dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (Math.abs(dx) > SLOP || Math.abs(dy) > SLOP) moved = true;
      if (!zoomed || !moved) return;
      var r = stage.getBoundingClientRect();
      tx = clamp(start.tx + dx, r.width * (1 - ZOOM));
      ty = clamp(start.ty + dy, r.height * (1 - ZOOM));
      stage.classList.add('is-panning');
      place();
    });
    var release = function (e) {
      if (!start || !e.isPrimary) return;
      var dx = e.clientX - start.x, dy = e.clientY - start.y;
      start = null;
      stage.classList.remove('is-panning');
      if (zoomed || e.type === 'pointercancel') return;
      if (Math.abs(dx) > SWEEP && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
    };
    stage.addEventListener('pointerup', release);
    stage.addEventListener('pointercancel', release);
    stage.addEventListener('click', function (e) {
      if (moved) return;
      var r = stage.getBoundingClientRect();
      zoom(!zoomed, e.clientX - r.left, e.clientY - r.top);
    });
    // A turned phone gives the case a new size: the photo stays inside it.
    if ('ResizeObserver' in window) {
      new ResizeObserver(function () {
        if (!zoomed) return;
        var r = stage.getBoundingClientRect();
        tx = clamp(tx, r.width * (1 - ZOOM));
        ty = clamp(ty, r.height * (1 - ZOOM));
        place();
      }).observe(stage);
    }
    return function () { if (zoomed) zoom(false, 0, 0); };
  }

  // ---------------------------------------------------------------- from page to page
  // The case that was clicked travels to the work page: it takes the name the viewer's
  // stage has there, and only one case carries it at a time.
  function nameCase(node) {
    document.querySelectorAll('.is-travelling').forEach(function (n) { n.classList.remove('is-travelling'); });
    node.classList.add('is-travelling');
  }

  // Where the browser knows how, a page of the site is fetched as soon as its link is
  // about to be followed, so it opens at once.
  function initPrefetch() {
    var S = window.HTMLScriptElement;
    if (!S || !S.supports || !S.supports('speculationrules')) return;
    var rules = el('script', { type: 'speculationrules' });
    rules.textContent = JSON.stringify({
      prefetch: [{ where: { and: [{ href_matches: '/*' }, { not: { href_matches: '/classic/*' } }] }, eagerness: 'moderate' }]
    });
    document.head.appendChild(rules);
  }

  // ---------------------------------------------------------------- writing, passing on
  // The address of this page as the site knows it (never a preview copy's).
  function pageUrl() {
    var link = document.querySelector('link[rel="canonical"]');
    return (link && link.href) || window.location.href.split(/[?#]/)[0].replace('/night/', '/');
  }

  // The first channel opened with the subject already named: a draft in Telegram, a
  // letter with its subject. No other channel can carry a draft.
  function draftHref(channel, what, url) {
    if (!channel) return null;
    var text = 'Здравствуйте! Пишу о ' + what + ': ' + url;
    if (/^https:\/\/(t|telegram)\.me\//i.test(channel.href)) {
      var base = channel.href.split('#')[0];   // a draft after a fragment would be lost
      return base + (base.indexOf('?') === -1 ? '?' : '&') + 'text=' + encodeURIComponent(text);
    }
    if (/^mailto:/i.test(channel.href)) {
      return channel.href + '?subject=' + encodeURIComponent('О ' + what) + '&body=' + encodeURIComponent(text);
    }
    return null;
  }

  function pointTo(link, href) {
    var extra = linkAttrs(href);
    link.href = href;
    if (extra.target) { link.target = extra.target; link.rel = extra.rel; }
    else { link.removeAttribute('target'); link.removeAttribute('rel'); }
  }

  // «Поделиться»: the system sheet on a phone, the address copied on a desktop.
  // read(done) hands done { title, url } and, where there is one, a picture as files.
  function shareControl(read) {
    var sheet = typeof navigator.share === 'function' && !finePointer.matches;
    var copy = !!(navigator.clipboard && navigator.clipboard.writeText);
    if (!sheet && !copy) return null;
    var box = el('span', { className: 'share' });
    var button = el('button', { type: 'button', className: 'textbtn' }, 'Поделиться');
    var status = el('span', { className: 'share__status', role: 'status' });
    var timer = 0;
    var say = function (text) {
      status.textContent = text;
      clearTimeout(timer);
      timer = setTimeout(function () { status.textContent = ''; }, 2600);
    };
    var pass = function (data) {
      if (sheet) {
        var files = data.files && navigator.canShare && navigator.canShare({ files: data.files }) ? data.files : null;
        var pack = files ? { files: files, title: data.title, text: data.title + ' ' + data.url } : { title: data.title, url: data.url };
        // Closing the sheet without choosing rejects with AbortError: that is not a failure.
        navigator.share(pack).catch(function (err) {
          if (!err || err.name !== 'AbortError') say('Не удалось открыть меню');
        });
        return;
      }
      navigator.clipboard.writeText(data.url).then(
        function () { say('Ссылка скопирована'); },
        function () { say('Не удалось скопировать ссылку'); }
      );
    };
    button.addEventListener('click', function () { read(pass); });
    box.appendChild(button);
    box.appendChild(status);
    return box;
  }

  // A work page: «Написать мастеру» opens the first channel with the work already named
  // (channel is absent when the config did not load), and beside it the work is passed on.
  function initAsk(channel) {
    var box = document.querySelector('.work__ask');
    var heading = document.querySelector('.work__title');
    if (!box || !heading) return;
    var name = heading.textContent.replace(/ /g, ' ').trim();
    var kind = document.querySelector('.passport dd');
    var url = pageUrl();
    var link = box.querySelector('a');
    var href = draftHref(channel, 'работе «' + name + '»', url);
    if (href && link) {
      pointTo(link, href);
      var note = el('p', { className: 'note' },
        typo('Откроется ' + (channel.name === 'Почта' ? 'почта' : channel.name) + ' с названием работы.') + ' ');
      note.appendChild(el('a', { href: '/night/contact.html' }, 'Другие способы связи'));
      box.parentNode.insertBefore(note, box.nextSibling);
    }
    var share = shareControl(function (done) {
      done({ title: (kind ? kind.textContent.trim() + ' ' : '') + '«' + name + '» — TINOLI', url: url });
    });
    if (share) box.appendChild(share);
  }

  // ---------------------------------------------------------------- monogram
  function monogramNote(n) {
    return typo('Монограмма вышита из ' + formatCount(n) + ' ' + plural(n, 'бусины', 'бусин', 'бусин') + '.');
  }

  // One or two letters, Russian or Latin; anything else is dropped.
  function initials(raw) {
    return String(raw || '').replace(/[^A-Za-zА-Яа-яЁё]/g, '').slice(0, 2).toUpperCase();
  }

  function roundedRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // The nameplate, the only thing laid over the embroidery: a small champagne plate at the
  // bottom centre with what the picture is and where it comes from.
  function drawNameplate(g, W, H, count, isPortrait) {
    var SANS = ' Jost, "Jost Fallback", system-ui, sans-serif';
    var line1 = (isPortrait ? 'Портрет из ' : 'Монограмма из ') + formatCount(count) + ' ' + plural(count, 'бусины', 'бусин', 'бусин');
    g.font = '400 21px' + SANS;
    var w1 = g.measureText(line1).width;
    g.font = '500 32px' + SANS;
    var w2 = g.measureText('tinoli.ru').width;
    var pw = Math.max(300, Math.ceil(Math.max(w1, w2)) + 68), ph = 96;
    var px = Math.round((W - pw) / 2), py = H - 46 - ph;
    g.save();
    g.shadowColor = 'rgba(0,0,0,.45)';
    g.shadowBlur = 22;
    g.shadowOffsetY = 8;
    g.fillStyle = '#cdb884';
    roundedRect(g, px, py, pw, ph, 8);
    g.fill();
    g.restore();
    var gold = g.createLinearGradient(0, py, 0, py + ph);
    gold.addColorStop(0, '#eadcb8');
    gold.addColorStop(1, '#cdb884');
    g.fillStyle = gold;
    roundedRect(g, px, py, pw, ph, 8);
    g.fill();
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(42,28,46,.55)';
    roundedRect(g, px + 0.5, py + 0.5, pw - 1, ph - 1, 8);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.45)';
    g.beginPath();
    g.moveTo(px + 8, py + 1.5);
    g.lineTo(px + pw - 8, py + 1.5);
    g.stroke();
    g.fillStyle = '#2a1c2e';
    g.textAlign = 'center';
    g.font = '400 21px' + SANS;
    g.fillText(line1, W / 2, py + 40);
    g.font = '500 32px' + SANS;
    g.fillText('tinoli.ru', W / 2, py + 76);
    g.textAlign = 'left';
  }

  // The case as a picture to keep, 1080 x 1350: the embroidery over the whole picture and a
  // small nameplate at the bottom; no wall and no frame. extra holds the embroidery's own
  // options (its mode and what it stitches).
  function monogramPicture(extra, done) {
    var W = 1080, H = 1350;
    var out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    var g = out.getContext('2d');
    var light = g.createLinearGradient(0, 0, 0, H);
    light.addColorStop(0, '#261a2b');
    light.addColorStop(0.6, '#1a111c');
    light.addColorStop(1, '#150d17');
    g.fillStyle = light;
    g.fillRect(0, 0, W, H);
    var opts = { still: true, size: { w: W, h: H } };
    Object.keys(extra).forEach(function (k) { opts[k] = extra[k]; });
    var layer = document.createElement('canvas');
    var run = new Embroidery(layer, opts);
    // the big canvases are emptied as soon as the file is made: a phone keeps no spare megabytes
    var release = function () {
      [out, layer, run.base].forEach(function (c) { if (c) { c.width = 0; c.height = 0; } });
    };
    if (!run.run()) { release(); done(null); return; }
    g.drawImage(layer, 0, 0);
    var portrait = opts.mode === 'portrait';
    drawNameplate(g, W, H, run.beads.length, portrait);
    out.toBlob(function (blob) {
      if (!blob) { done(null); release(); return; }
      signPicture(blob, portrait ? 'Портрет, вышитый бисером' : 'Монограмма, вышитая бисером', function (signed) {
        done(signed);
        release();
      });
    }, 'image/png');
  }

  // ---------------------------------------------------------------- the label inside the file
  // PNG text chunks with fixed strings only: nothing of the visitor, the photo or the device.
  var PNG_SOURCE = 'https://tinoli.ru/monogram.html';
  var PNG_COPYRIGHT = 'Знак и оформление картинки: © TINOLI, tinoli.ru';
  var crcTable = null;

  function crc32(bytes) {
    if (!crcTable) {
      crcTable = new Uint32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        crcTable[n] = c >>> 0;
      }
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function utf8Bytes(text) {
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(text);
    var raw = unescape(encodeURIComponent(text)), out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function latin1Bytes(text) {
    var out = new Uint8Array(text.length);
    for (var i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 255;
    return out;
  }

  function joinBytes(parts) {
    var size = 0, at = 0;
    parts.forEach(function (p) { size += p.length; });
    var out = new Uint8Array(size);
    parts.forEach(function (p) { out.set(p, at); at += p.length; });
    return out;
  }

  // One chunk: length, type, data, CRC of type and data.
  function pngChunk(type, data) {
    var body = joinBytes([latin1Bytes(type), data]), out = new Uint8Array(body.length + 8);
    var view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(body, 4);
    view.setUint32(4 + body.length, crc32(body));
    return out;
  }

  function textChunk(key, text) {
    return pngChunk('tEXt', joinBytes([latin1Bytes(key), new Uint8Array(1), latin1Bytes(text)]));
  }

  function intlChunk(key, lang, text) {
    return pngChunk('iTXt', joinBytes([latin1Bytes(key), new Uint8Array(3), latin1Bytes(lang),
      new Uint8Array(2), utf8Bytes(text)]));
  }

  function xmlText(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function xmpPacket(title) {
    var alt = function (text) { return '<rdf:Alt><rdf:li xml:lang="x-default">' + xmlText(text) + '</rdf:li></rdf:Alt>'; };
    return '<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>\n' +
      '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
      '<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/"' +
      ' xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/"' +
      ' xmp:CreatorTool="TINOLI, tinoli.ru" photoshop:Credit="TINOLI, tinoli.ru"' +
      ' photoshop:Source="' + PNG_SOURCE + '">' +
      '<dc:title>' + alt(title) + '</dc:title><dc:rights>' + alt(PNG_COPYRIGHT) + '</dc:rights>' +
      '</rdf:Description></rdf:RDF></x:xmpmeta>\n<?xpacket end="r"?>';
  }

  function labelledPng(bytes, title) {
    var SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
    if (bytes.length < 33) return null;       // shorter than the signature and IHDR
    for (var i = 0; i < 8; i++) if (bytes[i] !== SIGNATURE[i]) return null;
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var after = 8 + 12 + view.getUint32(8);    // the end of IHDR
    if (view.getUint32(12) !== 0x49484452 || after > bytes.length) return null;
    var chunks = [
      textChunk('Software', 'TINOLI (tinoli.ru)'),
      textChunk('Source', PNG_SOURCE),
      intlChunk('Title', 'ru', title),
      intlChunk('Description', 'ru', 'Вышито бисером на tinoli.ru. There Is No Other Like It.'),
      intlChunk('Copyright', 'ru', PNG_COPYRIGHT),
      intlChunk('XML:com.adobe.xmp', '', xmpPacket(title))
    ];
    return joinBytes([bytes.subarray(0, after)].concat(chunks, [bytes.subarray(after)]));
  }

  // The file gets its label right after IHDR. Whatever fails, the picture itself is kept.
  function signPicture(blob, title, done) {
    var finished = false;
    var finish = function (result) { if (!finished) { finished = true; done(result); } };
    try {
      if (typeof FileReader !== 'function' || typeof Uint8Array === 'undefined') { finish(blob); return; }
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var signed = labelledPng(new Uint8Array(reader.result), title);
          finish(signed ? new Blob([signed], { type: 'image/png' }) : blob);
        } catch (err) { finish(blob); }
      };
      reader.onerror = function () { finish(blob); };
      reader.readAsArrayBuffer(blob);
    } catch (err) { finish(blob); }
  }

  // ---------------------------------------------------------------- the case: two modes
  var PORTRAIT_HASH = '#portrait';
  var MODE_TEXT = {
    monogram: {
      title: 'Монограмма, вышитая бисером',
      lead: 'Введите инициалы. Витрина вышьет их бисером, бусина за бусиной.'
    },
    portrait: {
      title: 'Портрет, вышитый бисером',
      lead: 'Выберите фото. Витрина вышьет портрет бисером, бусина за бусиной.'
    }
  };
  var MARK_LABEL = 'Знак TINOLI, вышитый бисером';

  function markRun(app) {
    return { mode: 'mark', onCount: function (n) { setCaption(app.caption, markNote(n)); } };
  }

  // Starts a new embroidery in the case; the one that is still running is ended.
  function beginRun(app, opts) {
    if (app.run) app.run.stop();
    app.run = new Embroidery(app.canvas, opts);
    var ok = app.run.run();
    app.stage.classList.toggle('is-fallback', !ok);
    return ok;
  }

  function refreshAsk(app) {
    if (!app.ask) return;
    var mode = app.modes[app.mode];
    pointTo(app.ask, (mode.ready() && mode.askHref()) || '/night/contact.html');
  }

  // What the tools, the label of the case and the link to the master say for the mode on show.
  function refreshCase(app) {
    var mode = app.modes[app.mode];
    app.tools.hidden = !mode.ready();
    app.clear.hidden = app.mode !== 'portrait';
    app.save.textContent = 'Сохранить картинку';
    app.stage.setAttribute('aria-label', mode.ready() ? mode.label() : MARK_LABEL);
    refreshAsk(app);
  }

  function writeMode(name) {
    var url = window.location.pathname + window.location.search + (name === 'portrait' ? PORTRAIT_HASH : '');
    try { window.history.replaceState({}, '', url); } catch (err) { /* an address that cannot be rewritten stays */ }
  }

  // Shows one mode in the case: its words, its panel, and its state (the embroidery of the
  // other mode is ended first).
  function setMode(app, name, keepUrl) {
    var mode = app.modes[name];
    if (!mode) return;
    app.begun = true;
    var previous = app.modes[app.mode];
    if (previous && previous !== mode && previous.hide) previous.hide();
    app.mode = name;
    app.switches.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-mode') === name ? 'true' : 'false'); });
    app.title.textContent = typo(MODE_TEXT[name].title);
    app.lead.textContent = typo(MODE_TEXT[name].lead);
    app.form.hidden = name !== 'monogram';
    if (app.panel) app.panel.hidden = name !== 'portrait';
    app.root.classList.toggle('is-portrait', name === 'portrait');
    if (!keepUrl) writeMode(name);
    mode.show();
    refreshCase(app);
  }

  var HAND_FONT = '400 100px "Marck Script"';
  var handCame = false;    // the font file itself has come: check() alone also says yes for one that failed
  var handAsked = null;

  // The handwriting is asked for once; every caller gets the same promise, which tells
  // whether the font came and never fails. Null where fonts cannot be asked for.
  function askHand() {
    if (handAsked || !document.fonts || !document.fonts.load) return handAsked;
    handAsked = document.fonts.load(HAND_FONT, 'TАЯ').then(function (faces) {
      handCame = !!(faces && faces.length);
      return handCame;
    }, function () { return false; });
    return handAsked;
  }

  // True when the handwriting is there to draw the letters of text (or nothing can tell).
  function handReady(text) {
    if (!document.fonts || !document.fonts.check || !document.fonts.load) return true;
    if (!handCame) return false;
    try { return document.fonts.check(HAND_FONT, text); } catch (err) { return true; }
  }

  // The monogram: the initials form and the medallion they are stitched into.
  function monogramMode(app, input) {
    var mode = { text: '', picture: null, file: 'tinoli-monogram.png', early: false, stamp: 0 };
    mode.ready = function () { return !!mode.text; };
    mode.address = function () { return pageUrl() + (mode.text ? '?m=' + encodeURIComponent(mode.text) : ''); };
    mode.shareTitle = function () { return 'Монограмма «' + mode.text + '», вышитая бисером — TINOLI'; };
    mode.askHref = function () { return draftHref(app.channel, 'монограмме «' + mode.text + '»', mode.address()); };
    mode.label = function () { return 'Монограмма «' + mode.text + '», вышитая бисером'; };
    // The picture is made once the stitching has ended, or at the first call for it: the
    // animation does not share its first frames with a second, larger embroidery.
    mode.getPicture = function (done) {
      if (mode.picture || !mode.text) { done(mode.picture); return; }
      var wanted = mode.text, stamp = mode.stamp;
      monogramPicture({ mode: 'monogram', text: wanted }, function (blob) {
        if (mode.text !== wanted || mode.stamp !== stamp) { done(null); return; }
        mode.picture = blob;
        done(blob);
      });
    };
    mode.stitch = function (next) {
      var keepRing = !!app.run && app.run.opts.mode !== 'portrait';
      mode.text = next;
      mode.picture = null;
      mode.stamp++;
      // letters sampled before the handwriting came are stitched once more when it arrives
      mode.early = !!next && !handReady(next);
      var opts = {
        mode: next ? 'monogram' : 'mark', text: next, keepRing: keepRing,
        onCount: function (n) { setCaption(app.caption, next ? monogramNote(n) : markNote(n)); },
        onDone: function () { if (!mode.early) mode.getPicture(function () {}); }
      };
      beginRun(app, opts);
    };
    mode.show = function () {
      app.stage.classList.remove('is-framing');
      app.stage.removeAttribute('tabindex');
      mode.stitch(mode.text);
    };
    // The handwriting has come: initials stitched without it are stitched again, and the
    // picture kept for saving is dropped with them.
    mode.refont = function () {
      if (mode.early && app.mode === 'monogram' && mode.text) mode.stitch(mode.text);
    };
    app.form.addEventListener('submit', function (e) {
      e.preventDefault();
      var next = initials(input.value);
      input.value = next;
      if (!next) { input.focus(); return; }
      app.begun = true;
      mode.stitch(next);
      refreshCase(app);
      window.history.replaceState({}, '', '?m=' + encodeURIComponent(next));
    });
    input.addEventListener('input', function () {
      var clean = initials(input.value);
      if (clean !== input.value) input.value = clean;
    });
    return mode;
  }

  // «Сохранить картинку»: the picture of the mode on show, handed to the browser as a file.
  function saveCurrent(app) {
    var mode = app.modes[app.mode];
    mode.getPicture(function (blob) {
      if (!blob) { app.save.textContent = 'Не удалось сохранить картинку'; return; }
      var href = URL.createObjectURL(blob);
      var a = el('a', { href: href, download: mode.file });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(href); }, 4000);
    });
  }

  function bindTools(app) {
    var share = shareControl(function (done) {
      var mode = app.modes[app.mode];
      mode.getPicture(function (blob) {
        var data = { title: mode.shareTitle(), url: mode.address() };
        if (blob && typeof File === 'function') data.files = [new File([blob], mode.file, { type: 'image/png' })];
        done(data);
      });
    });
    if (share) app.tools.insertBefore(share, app.clear);
    app.save.addEventListener('click', function () { saveCurrent(app); });
    app.switches.forEach(function (b) {
      b.addEventListener('click', function () { setMode(app, b.getAttribute('data-mode')); });
    });
    window.addEventListener('hashchange', function () {
      var name = window.location.hash === PORTRAIT_HASH ? 'portrait' : 'monogram';
      if (name !== app.mode) setMode(app, name, true);
    });
  }

  // The monogram page. Returns a setter for the channel «Написать мастеру» opens, which
  // is known only once the config has come.
  function initMonogram() {
    var root = document.querySelector('[data-monogram]');
    var form = document.querySelector('[data-monogram-form]');
    var tools = document.querySelector('[data-monogram-tools]');
    if (!root || !form || !tools) return null;
    var app = {
      root: root, form: form, tools: tools, panel: document.querySelector('[data-portrait]'),
      stage: root.querySelector('.vitrine'), canvas: root.querySelector('.embroidery'),
      caption: root.querySelector('[data-hero-caption]'),
      save: tools.querySelector('[data-monogram-save]'), clear: tools.querySelector('[data-portrait-clear]'),
      ask: document.querySelector('[data-monogram-ask]'),
      title: document.getElementById('mono-title'), lead: document.querySelector('.hero__lead'),
      switches: [].slice.call(document.querySelectorAll('[data-mode]')),
      run: null, channel: null, mode: 'monogram', modes: {}, begun: false
    };
    var input = form.querySelector('input');
    app.modes.monogram = monogramMode(app, input);
    if (app.panel) app.modes.portrait = portraitMode(app, app.panel);
    bindTools(app);
    var group = document.querySelector('[data-mode-switch]');
    if (group && app.modes.portrait) group.hidden = false;

    var first = initials(new URLSearchParams(window.location.search).get('m'));
    input.value = first;
    app.modes.monogram.text = first;
    var name = app.modes.portrait && window.location.hash === PORTRAIT_HASH ? 'portrait' : 'monogram';
    // The letters are sampled from the handwriting, which is asked for on every visit (both
    // alphabets). A font that is slow to come must not leave the case empty: after 2.5 s the
    // letters are sampled from whatever the browser has, and again when the font arrives.
    // A portrait has no letters to wait for.
    var begin = function () { if (!app.begun) setMode(app, name, true); };
    var wait = askHand();
    var refont = function () {
      Object.keys(app.modes).forEach(function (k) { if (app.modes[k].refont) app.modes[k].refont(); });
    };
    if (wait) wait.then(function (came) { begin(); if (came) refont(); });
    if (name === 'monogram' && wait) setTimeout(begin, 2500);
    else begin();
    return function (found) { app.channel = found || null; refreshAsk(app); };
  }

  // ---------------------------------------------------------------- bead portrait
  // The photo is read in the visitor's browser into a canvas kept in memory, and nothing else
  // is done with it: no request, no storage. It is dropped by «Убрать фото» or with the page.
  var PHOTO_SIDE = 1600;       // the longest side of the working canvas
  var PHOTO_MAX_BYTES = 40 * 1024 * 1024;
  var PHOTO_MAX_PIXELS = 80 * 1000 * 1000;
  var PHOTO_TOO_BIG = 'Это фото слишком большое. Выберите другое.';
  var HOLD_MS = 300;           // a press this long shows the photo itself
  var HOLD_SLOP = 3;           // px a mouse press may move and still be a hold; a finger or pen may move more
  var HOLD_SLOP_TOUCH = 8;
  var NUDGE = 0.03;            // a key moves the photo by this part of its free room
  var PHOTO_ERROR = 'Не удалось открыть это фото. Выберите другое.';
  var NO_BEADS = 'Так бусин не остаётся, вышивать нечего. Портрет оставлен прежним.';
  var NO_DARK = 'Тёмного на этом фото нет, поэтому вышито светлое.';

  function merge(base, changes) {
    var out = {};
    Object.keys(base).forEach(function (k) { out[k] = base[k]; });
    Object.keys(changes).forEach(function (k) { out[k] = changes[k]; });
    return out;
  }

  function portraitNote(n) {
    return typo('Портрет вышит из ' + formatCount(n) + ' ' + plural(n, 'бусины', 'бусин', 'бусин') + '.');
  }

  // Beads across the case: from large to small, by the width of the case.
  function acrossRange(width) { return { min: Math.round(width / 9), max: Math.round(width / 4.4) }; }

  function acrossFor(width, size) {
    var r = acrossRange(width);
    return Math.round(r.max - clampRange(size, 0, 1) * (r.max - r.min));
  }

  // The slider position (0 small beads .. 1 large) that gives the starting count.
  function startSize(width) {
    var r = acrossRange(width);
    var start = clampRange(Math.round(width / 6.2), r.min, r.max);
    return (r.max - start) / Math.max(1, r.max - r.min);
  }

  function freshView(beads, size) {
    return { zoom: 1, px: 0.5, py: 0.42, light: 0, size: size, across: 0, beads: beads, one: false, inverse: false };
  }

  // The chosen file into a canvas of at most PHOTO_SIDE px, the object URL revoked at once.
  // The browser applies the photo's orientation. done(null) when it is not a picture, and
  // done(null, text) when it is too big to open on a phone.
  function loadPhoto(file, done) {
    if (!file || (file.type && file.type.indexOf('image/') !== 0)) { done(null); return; }
    if (file.size > PHOTO_MAX_BYTES) { done(null, PHOTO_TOO_BIG); return; }
    var url = null;
    try { url = URL.createObjectURL(file); } catch (err) { done(null); return; }
    var im = new Image();
    im.onload = function () {
      URL.revokeObjectURL(url);
      var nw = im.naturalWidth, nh = im.naturalHeight;
      if (!nw || !nh) { done(null); return; }
      if (nw * nh > PHOTO_MAX_PIXELS) { done(null, PHOTO_TOO_BIG); return; }
      var k = Math.min(1, PHOTO_SIDE / Math.max(nw, nh));
      var work = document.createElement('canvas');
      work.width = Math.max(1, Math.round(nw * k));
      work.height = Math.max(1, Math.round(nh * k));
      try {
        // kept in software: it is read again at every change, and a copy from the graphics card each time is slow
        var g = work.getContext('2d', { willReadFrequently: true });
        g.imageSmoothingQuality = 'high';
        g.drawImage(im, 0, 0, work.width, work.height);
      } catch (err) {
        done(null);
        return;
      }
      done(work);
    };
    im.onerror = function () { URL.revokeObjectURL(url); done(null); };
    im.src = url;
  }

  function releaseCanvas(canvas) {
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }

  function caseWidth(m) { return Math.max(120, m.app.canvas.getBoundingClientRect().width); }

  // The same words are not written again: the status would be read out anew each time.
  function sayPortrait(m, text) {
    var say = text ? typo(text) : '';
    if (m.error.textContent !== say) m.error.textContent = say;
  }

  function syncControls(m) {
    if (!m.photo) return;
    Object.keys(m.sliders).forEach(function (k) { m.sliders[k].value = String(m.view[k]); });
    m.beadButtons.forEach(function (b) {
      var key = b.getAttribute('data-beads');
      b.setAttribute('aria-pressed', key === m.view.beads ? 'true' : 'false');
      // pearl and gold together have no meaning in one colour
      b.disabled = key === 'duo' && !!m.view.one;
    });
    m.toneButtons.forEach(function (b) {
      b.setAttribute('aria-pressed', (b.getAttribute('data-tones') === 'one') === !!m.view.one ? 'true' : 'false');
    });
    m.stitchButtons.forEach(function (b) {
      b.setAttribute('aria-pressed', (b.getAttribute('data-stitch') === 'dark') === !!m.view.inverse ? 'true' : 'false');
    });
  }

  // The panel and the case as they are with a photo in them, or without one.
  function portraitFrame(m) {
    var has = !!m.photo, stage = m.app.stage;
    m.controls.hidden = !has;
    m.pick.textContent = has ? 'Выбрать другое фото' : 'Выбрать фото';
    stage.classList.toggle('is-framing', has);
    if (has) {
      stage.setAttribute('tabindex', '0');
      stage.setAttribute('aria-describedby', 'portrait-hint');
    } else {
      stage.removeAttribute('tabindex');
      stage.removeAttribute('aria-describedby');
    }
    syncControls(m);
  }

  // The embroidery's options for the portrait as it stands.
  function portraitRun(m, still) {
    return {
      mode: 'portrait', source: m.photo, view: m.view, still: still,
      refit: function (width) {
        m.view = merge(m.view, { across: acrossFor(Math.max(120, width), m.view.size) });
        m.picture = null;
        queuePicture(m);
        return m.view;
      },
      onCount: function (n) {
        if (n === m.count) return;
        m.count = n;
        setCaption(m.app.caption, portraitNote(n));
      },
      onDone: function () { queuePicture(m); }
    };
  }

  // Lays the portrait out: stitched when animate, otherwise the finished one at once.
  // said: what the page says beside a portrait that was put back (nothing otherwise).
  function portraitRender(m, animate, said) {
    var app = m.app, run = app.run;
    cancelAnimationFrame(m.frame);
    m.frame = 0;
    m.picture = null;
    m.view = merge(m.view, { across: acrossFor(caseWidth(m), m.view.size) });
    var ok, t0 = performance.now();
    if (!animate && run && run.opts.mode === 'portrait' && !run.stopped) {
      ok = run.redraw(m.view);
    } else {
      m.count = 0;
      ok = beginRun(app, portraitRun(m, !animate));
    }
    if (!ok) { portraitEmpty(m); return; }
    m.good = m.view;
    sayPortrait(m, said || '');
    m.lastAt = performance.now();
    m.cost = animate ? 0 : m.lastAt - t0;
    queuePicture(m);
  }

  // Nothing to stitch. When a change of the controls left no bead (the dark of a photo that
  // has none, the light turned all the way down), the portrait goes back to what it was
  // before the change and the page says so. A new photo with nothing dark in it, chosen while
  // the dark was stitched, is stitched by its light. A photo that gives nothing at all is put away.
  function portraitEmpty(m) {
    var back = m.good, said = NO_BEADS;
    m.good = null;
    if (!back && m.view.inverse) {
      back = merge(m.view, { inverse: false });
      said = NO_DARK;
    }
    if (!back) { portraitClear(m); sayPortrait(m, PHOTO_ERROR); return; }
    m.view = back;
    syncControls(m);
    if (m.app.run) m.app.run.stop();    // a new embroidery, so the case leaves its fallback state
    portraitRender(m, false, said);
  }

  // Changes pile up until the next animation frame: one redraw for any number of events.
  // A redraw that took longer than a frame is followed by a pause twice as long as it took.
  function portraitChange(m, changes) {
    m.view = merge(m.view, changes);
    if (m.frame) return;
    var tick = function () {
      m.frame = 0;
      if (!m.photo) return;
      if (m.cost > 16 && performance.now() < m.lastAt + 2 * m.cost) { m.frame = requestAnimationFrame(tick); return; }
      portraitRender(m, false);
    };
    m.frame = requestAnimationFrame(tick);
  }

  // The picture for saving is made after 1.5 s without changes, once the stitching is over.
  function queuePicture(m) {
    clearTimeout(m.saveTimer);
    m.saveTimer = setTimeout(function () {
      if (!m.photo) return;
      if (m.app.run && !m.app.run.finished) { queuePicture(m); return; }
      portraitPicture(m, function () {});
    }, 1500);
  }

  function portraitPicture(m, done) {
    if (m.picture || !m.photo) { done(m.picture); return; }
    var wanted = m.view;
    monogramPicture({ mode: 'portrait', source: m.photo, view: wanted }, function (blob) {
      if (m.view !== wanted) { portraitPicture(m, done); return; }
      m.picture = blob;
      done(blob);
    });
  }

  function drawPhotoView(m) {
    var rect = m.app.canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    var c = m.shown;
    c.width = Math.max(1, Math.round(rect.width * dpr));
    c.height = Math.max(1, Math.round(rect.height * dpr));
    var crop = cropRect(m.photo.width, m.photo.height, rect.width / rect.height, m.view);
    var g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(m.photo, crop.x, crop.y, crop.w, crop.h, 0, 0, c.width, c.height);
  }

  // Press and hold: the cropped photo instead of the beads, until the press ends.
  function peek(m, on) {
    if (m.peeking === on) return;
    m.peeking = on;
    if (on && m.photo) drawPhotoView(m);
    m.app.stage.classList.toggle('is-peek', on);
  }

  // The photo follows the pointer: dx, dy in screen px.
  function panPhoto(m, dx, dy) {
    var rect = m.app.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var crop = cropRect(m.photo.width, m.photo.height, rect.width / rect.height, m.view);
    var freeX = m.photo.width - crop.w, freeY = m.photo.height - crop.h;
    portraitChange(m, {
      px: freeX > 0.5 ? clampRange(m.view.px - dx * crop.w / rect.width / freeX, 0, 1) : m.view.px,
      py: freeY > 0.5 ? clampRange(m.view.py - dy * crop.h / rect.height / freeY, 0, 1) : m.view.py
    });
  }

  function endPress(m) {
    clearTimeout(m.holdTimer);
    m.drag = null;
    peek(m, false);
  }

  function bindPress(m) {
    var stage = m.app.stage;
    stage.addEventListener('pointerdown', function (e) {
      if (!m.photo || m.app.mode !== 'portrait' || !e.isPrimary || m.drag) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      m.drag = {
        id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moving: false,
        slop: e.pointerType === 'mouse' ? HOLD_SLOP : HOLD_SLOP_TOUCH
      };
      try { stage.setPointerCapture(e.pointerId); } catch (err) { /* a pointer that cannot be captured still works */ }
      clearTimeout(m.holdTimer);
      m.holdTimer = setTimeout(function () { if (m.drag && !m.drag.moving) peek(m, true); }, HOLD_MS);
    });
    stage.addEventListener('pointermove', function (e) {
      var d = m.drag;
      if (!d || d.id !== e.pointerId || m.peeking) return;
      if (!d.moving) {
        if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) < d.slop) return;
        d.moving = true;
        clearTimeout(m.holdTimer);
      }
      panPhoto(m, e.clientX - d.x, e.clientY - d.y);
      d.x = e.clientX;
      d.y = e.clientY;
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (type) {
      stage.addEventListener(type, function (e) { if (m.drag && m.drag.id === e.pointerId) endPress(m); });
    });
    stage.addEventListener('contextmenu', function (e) { if (m.photo && m.app.mode === 'portrait') e.preventDefault(); });
  }

  // Arrow keys move the photo when the case has focus; holding Space shows the photo itself.
  function bindKeys(m) {
    var stage = m.app.stage;
    var isSpace = function (e) { return e.key === ' ' || e.key === 'Spacebar'; };
    stage.addEventListener('keyup', function (e) { if (isSpace(e)) peek(m, false); });
    stage.addEventListener('blur', function () { peek(m, false); });
    stage.addEventListener('keydown', function (e) {
      if (!m.photo || e.target !== stage) return;
      if (isSpace(e)) { e.preventDefault(); peek(m, true); return; }
      var dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      var dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
      if (!dx && !dy) return;
      e.preventDefault();
      portraitChange(m, {
        px: clampRange(m.view.px - dx * NUDGE, 0, 1),
        py: clampRange(m.view.py - dy * NUDGE, 0, 1)
      });
    });
  }

  function openPhoto(m, file) {
    var id = ++m.loadId;
    loadPhoto(file, function (work, message) {
      if (id !== m.loadId) { releaseCanvas(work); return; }   // a newer choice or a removal came meanwhile
      if (!work) { sayPortrait(m, message || PHOTO_ERROR); return; }
      sayPortrait(m, '');
      releaseCanvas(m.photo);
      m.photo = work;
      m.good = null;
      // a new photo keeps the beads, the tones and the side stitched that were chosen for the one before
      m.view = merge(freshView(m.view.beads, m.view.size === null ? startSize(caseWidth(m)) : m.view.size),
        { one: !!m.view.one, inverse: !!m.view.inverse });
      if (m.app.mode !== 'portrait') return;
      portraitFrame(m);
      portraitRender(m, true);
      refreshCase(m.app);
    });
  }

  // «Убрать фото»: the working canvas, both canvases of the case and the file input are
  // emptied, and the case goes back to the plain mark.
  function portraitClear(m) {
    var app = m.app;
    m.loadId++;
    endPress(m);
    clearTimeout(m.saveTimer);
    cancelAnimationFrame(m.frame);
    m.frame = 0;
    // the mark's embroidery sizes the canvas anew, which empties what the portrait left on it
    beginRun(app, markRun(app));
    releaseCanvas(m.photo);
    releaseCanvas(m.shown);
    m.photo = null;
    m.picture = null;
    m.good = null;
    m.count = 0;
    // back to four tones and the light stitched, with the beads chosen before one colour took their place
    m.view = freshView(m.chosenBeads || m.view.beads, m.view.size);
    m.chosenBeads = null;
    m.input.value = '';
    portraitFrame(m);
    refreshCase(app);
    m.input.focus();
  }

  function portraitShow(m) {
    m.count = 0;
    portraitFrame(m);
    if (m.photo) portraitRender(m, false);
    else beginRun(m.app, markRun(m.app));
  }

  function portraitHide(m) {
    endPress(m);
    clearTimeout(m.saveTimer);
    cancelAnimationFrame(m.frame);
    m.frame = 0;
    m.app.stage.classList.remove('is-drop');
  }

  function bindPicker(m) {
    var stage = m.app.stage;
    m.input.addEventListener('change', function () {
      var file = m.input.files && m.input.files[0];
      if (file) openPhoto(m, file);
      m.input.value = '';
    });
    // A photo can be dropped on the case; the browser never opens it as a page.
    ['dragenter', 'dragover'].forEach(function (type) {
      stage.addEventListener(type, function (e) {
        e.preventDefault();
        if (m.app.mode === 'portrait') stage.classList.add('is-drop');
      });
    });
    stage.addEventListener('dragleave', function () { stage.classList.remove('is-drop'); });
    stage.addEventListener('drop', function (e) {
      e.preventDefault();
      stage.classList.remove('is-drop');
      var files = e.dataTransfer && e.dataTransfer.files;
      if (m.app.mode === 'portrait' && files && files.length) openPhoto(m, files[0]);
    });
  }

  function bindControls(m, panel) {
    [].slice.call(panel.querySelectorAll('[data-slider]')).forEach(function (input) {
      var key = input.getAttribute('data-slider');
      m.sliders[key] = input;
      input.addEventListener('input', function () {
        var v = parseFloat(input.value), change = {};
        if (isNaN(v)) return;
        change[key] = v;
        portraitChange(m, change);
      });
    });
    m.beadButtons.forEach(function (b) {
      b.addEventListener('click', function () {
        var key = b.getAttribute('data-beads');
        if (!m.photo || key === m.view.beads) return;
        m.view = merge(m.view, { beads: key });
        m.chosenBeads = key;
        syncControls(m);
        portraitRender(m, true);
      });
    });
    m.toneButtons.forEach(function (b) {
      b.addEventListener('click', function () {
        var one = b.getAttribute('data-tones') === 'one';
        if (!m.photo || one === !!m.view.one) return;
        // one colour is pearl or gold: gold when the choice was both, and back again after
        var beads = one ? (m.view.beads === 'duo' ? 'gold' : m.view.beads) : (m.chosenBeads || m.view.beads);
        if (one) m.chosenBeads = m.chosenBeads || m.view.beads;
        m.view = merge(m.view, { one: one, beads: beads });
        if (!one) m.chosenBeads = null;
        syncControls(m);
        portraitRender(m, true);
      });
    });
    // «Вышить светлое» / «Вышить тёмное»: which side of the photo the beads take
    m.stitchButtons.forEach(function (b) {
      b.addEventListener('click', function () {
        var inverse = b.getAttribute('data-stitch') === 'dark';
        if (!m.photo || inverse === !!m.view.inverse) return;
        m.view = merge(m.view, { inverse: inverse });
        syncControls(m);
        portraitRender(m, true);
      });
    });
  }

  // The portrait: a photo chosen on the device, laid out in beads, moved and lit in the case.
  function portraitMode(app, panel) {
    var m = {
      app: app, photo: null, view: freshView('duo', null), good: null, picture: null, count: 0,
      frame: 0, saveTimer: 0, holdTimer: 0, drag: null, peeking: false, sliders: {},
      loadId: 0, cost: 0, lastAt: 0,
      input: panel.querySelector('[data-portrait-file]'), pick: panel.querySelector('[data-portrait-pick]'),
      error: panel.querySelector('[data-portrait-error]'), controls: panel.querySelector('[data-portrait-controls]'),
      beadButtons: [].slice.call(panel.querySelectorAll('[data-beads]')),
      toneButtons: [].slice.call(panel.querySelectorAll('[data-tones]')), chosenBeads: null,
      stitchButtons: [].slice.call(panel.querySelectorAll('[data-stitch]')),
      shown: el('canvas', { className: 'photoview', 'aria-hidden': 'true' })
    };
    app.stage.insertBefore(m.shown, app.canvas);
    bindPicker(m);
    bindControls(m, panel);
    bindPress(m);
    bindKeys(m);
    app.clear.addEventListener('click', function () { portraitClear(m); });
    return {
      file: 'tinoli-portrait.png',
      label: function () { return 'Портрет, вышитый бисером'; },
      ready: function () { return !!m.photo; },
      address: function () { return pageUrl() + PORTRAIT_HASH; },
      shareTitle: function () { return 'Портрет, вышитый бисером — TINOLI'; },
      askHref: function () { return draftHref(app.channel, 'портрете бисером', pageUrl() + PORTRAIT_HASH); },
      getPicture: function (done) { portraitPicture(m, done); },
      show: function () { portraitShow(m); },
      // the handwriting has come: a portrait drawn without the T of its hallmark is drawn once more
      refont: function () {
        if (m.photo && app.mode === 'portrait' && app.run && app.run.letterMissing) portraitRender(m, false);
      },
      hide: function () { portraitHide(m); }
    };
  }

  // ---------------------------------------------------------------- the way to the monogram
  // The invitation is the thing itself in small: the ring of the mark with a letter in it.
  // The letter changes for twelve seconds once the link is in view and for as long as it
  // is hovered or focused; then it rests on the first one.
  var SAMPLE_LETTERS = ['А', 'М', 'Е', 'К'];

  // The mark as on the 404 page: eleven beads round a centre, the crystal in the twelfth place.
  function markRing() {
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 64 64');
    svg.setAttribute('focusable', 'false');
    for (var i = 1; i <= 11; i++) {
      var a = -Math.PI / 2 + Math.PI * 2 * i / 12;
      var bead = document.createElementNS(NS, 'circle');
      bead.setAttribute('cx', (32 + 19.7 * Math.cos(a)).toFixed(1));
      bead.setAttribute('cy', (33 + 19.7 * Math.sin(a)).toFixed(1));
      bead.setAttribute('r', '3.3');
      bead.style.animationDelay = (i * 35) + 'ms';
      svg.appendChild(bead);
    }
    var gem = document.createElementNS(NS, 'path');
    gem.setAttribute('d', 'M32 6.7L37.1 13.3L32 19.9L26.9 13.3Z');
    svg.appendChild(gem);
    return svg;
  }

  function initMonoLinks() {
    document.querySelectorAll('.monolink').forEach(function (link) {
      var ring = el('span', { className: 'monolink__ring', 'aria-hidden': 'true' });
      ring.appendChild(markRing());
      if (link.classList.contains('monolink--portrait')) {
        // the portrait invitation: a round miniature of a portrait in the ring, nothing cycles
        ring.appendChild(el('img', { className: 'monolink__mini', src: '/night/img/portrait-mini.jpg', alt: '', width: '29', height: '29', decoding: 'async' }));
        link.insertBefore(ring, link.firstChild);
        return;
      }
      var letters = SAMPLE_LETTERS.map(function (ch, i) {
        var letter = el('b', { className: i ? null : 'is-on' }, ch);
        ring.appendChild(letter);
        return letter;
      });
      link.insertBefore(ring, link.firstChild);
      if (reduceMotion.matches) return;

      var at = 0, timer = 0, held = false, until = 0;
      var show = function (n) {
        at = n % letters.length;
        letters.forEach(function (letter, i) { letter.classList.toggle('is-on', i === at); });
      };
      var tick = function () {
        if (!held && Date.now() > until) { timer = 0; show(0); return; }
        show(at + 1);
        timer = setTimeout(tick, 2400);
      };
      var play = function (ms) {
        until = Math.max(until, Date.now() + ms);
        if (!timer) timer = setTimeout(tick, 1600);
      };
      // Hovered and focused are kept apart: the pointer leaving must not stop a focused link.
      var over = false, focused = false;
      var hold = function () {
        held = over || focused;
        if (held) play(0);
      };
      link.addEventListener('pointerenter', function () { over = true; hold(); });
      link.addEventListener('pointerleave', function () { over = false; hold(); });
      link.addEventListener('focus', function () { focused = true; hold(); });
      link.addEventListener('blur', function () { focused = false; hold(); });
      // Without a way to know the link is in view, the letters change only under a pointer or focus.
      if (!('IntersectionObserver' in window)) return;
      var seen = new IntersectionObserver(function (entries) {
        if (!entries[entries.length - 1].isIntersecting) return;
        seen.disconnect();
        play(12000);
      }, { threshold: 0.6 });
      seen.observe(link);
    });
  }

  // ---------------------------------------------------------------- the portrait on the home page
  // A portrait stitched from a picture of the site's own, so the tool is one click away. The
  // picture is asked for when the stage comes within 300 px of the screen, the stitching starts
  // when a third of the case is in view. A visitor's photo is never touched here.
  var DEMO_VIEW = { zoom: 1, px: 0.5, py: 0.5, light: 0, across: 84, beads: 'duo', one: false, inverse: false };

  function initPortraitDemo() {
    var root = document.querySelector('[data-portrait-demo]');
    if (!root) return;
    var stage = root.querySelector('.vitrine'), canvas = root.querySelector('.embroidery');
    var caption = root.querySelector('[data-demo-caption]');
    var plain = caption ? caption.textContent : '';
    var photo = null, near = false, seen = false, fontWait = true, run = null, begun = false, late = false;

    // Without the picture the case keeps the mark, and the caption about the picture goes.
    var fail = function () {
      stage.classList.add('is-fallback');
      if (caption) caption.hidden = true;
    };
    var go = function () {
      if (begun || !photo || !seen || fontWait) return;
      begun = true;
      run = new Embroidery(canvas, {
        mode: 'portrait', source: photo, view: DEMO_VIEW,
        refit: function () { return DEMO_VIEW; },
        onCount: function (n) {
          if (caption) caption.textContent = plain + ' Вышито из ' + formatCount(n) + ' ' + plural(n, 'бусины', 'бусин', 'бусин') + '.';
        },
        // the handwriting came while the stitching ran: the T is added once it has ended
        onDone: function () { if (late) { late = false; run.redraw(DEMO_VIEW); } }
      });
      if (!run.run()) fail();
    };
    // The handwriting is asked for first, so the hallmark has its T. It is not waited for
    // beyond 2.5 s, and a T that comes later is drawn into the finished portrait.
    var fontWaited = function () { fontWait = false; go(); };
    var fontCame = function (came) {
      fontWaited();
      if (!came || !run || !run.letterMissing) return;
      if (run.finished) run.redraw(DEMO_VIEW);
      else late = true;
    };
    var load = function () {
      if (near) return;
      near = true;
      var img = new Image();
      img.onload = function () {
        try {
          var c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0);
          photo = c;
        } catch (err) { fail(); return; }
        go();
      };
      img.onerror = fail;
      img.src = '/night/img/portrait-demo.jpg';
      var wait = askHand();
      if (wait) { wait.then(fontCame); setTimeout(fontWaited, 2500); }
      else fontWaited();
    };
    if (!('IntersectionObserver' in window)) { seen = true; load(); return; }
    var nearWatch = new IntersectionObserver(function (entries) {
      if (entries[entries.length - 1].isIntersecting) { nearWatch.disconnect(); load(); }
    }, { rootMargin: '300px' });
    var inView = new IntersectionObserver(function (entries) {
      if (entries[entries.length - 1].isIntersecting) { inView.disconnect(); seen = true; go(); }
    }, { threshold: 0.33 });
    nearWatch.observe(root);
    inView.observe(stage);
  }

  // ---------------------------------------------------------------- boot
  // The browser jumped to #works on the page as it was before the catalogue came;
  // once the hero and the grid are final, land there again.
  function realignHash() {
    if (window.location.hash !== '#works') return;
    var target = document.getElementById('works');
    if (!target) return;
    try { target.scrollIntoView({ block: 'start', behavior: 'instant' }); } catch (e) { target.scrollIntoView(true); }
  }

  function settle() { document.documentElement.classList.add('is-settled'); }

  function boot() {
    typoTree(document.querySelector('main'));
    typoTree(document.querySelector('.ftr'));
    document.querySelectorAll('.ftr__motto').forEach(function (p) {
      p.textContent = '';
      p.appendChild(mottoNode(false));
    });
    initHeader();
    initMacroStages();
    initPrefetch();
    initMonoLinks();
    initPortraitDemo();
    var page = document.body.getAttribute('data-page');
    var monogramChannel = page === 'monogram' ? initMonogram() : null;

    getJSON('/config.json').then(function (cfg) {
      applyConfig(cfg);
      renderChannels(cfg);
      return cfg;
    }).catch(function () {
      return null;   // the static text stays in place
    }).then(function (cfg) {
      var first = channelsFrom(cfg && cfg.contact)[0];
      if (page === 'work') initAsk(first);
      if (monogramChannel) monogramChannel(first);
    });

    if (page === 'work') initViewer();

    if (page === 'home') {
      var moved = false;
      var markMoved = function () { moved = true; };
      ['wheel', 'touchstart', 'keydown'].forEach(function (type) {
        window.addEventListener(type, markMoved, { once: true, passive: true });
      });
      getJSON('/works/works.json').then(normaliseWorks).catch(function () { return null; }).then(function (works) {
        if (works === null) {
          var grid = document.querySelector('[data-grid]');
          if (grid) grid.appendChild(el('p', { className: 'grid__note', role: 'status' }, 'Не удалось загрузить работы. Обновите страницу.'));
          initHero([], true);
        } else {
          initHero(works);
          initWorks(works);
        }
        if (!moved) realignHash();
        settle();
      });
    } else if (document.readyState === 'complete') {
      settle();
    } else {
      window.addEventListener('load', settle, { once: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
