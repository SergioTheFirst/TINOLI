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
    if (token && /^[a-f0-9]{16,64}$/i.test(token) && isLiveSite()) {
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
  }

  Embroidery.prototype.measure = function () {
    var rect = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, Math.round(rect.width));
    this.h = Math.max(1, Math.round(rect.height));
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
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

  Embroidery.prototype.prepare = function () {
    var mode = this.opts.mode;
    var count = mode === 'mark' ? this.buildMark() : mode === 'macro' ? this.buildMacro() : this.sampleImage();
    if (!count) return 0;
    var maxR = 0;
    this.beads.forEach(function (bd) { if (bd.r > maxR) maxR = bd.r; });
    if (mode === 'image') this.shade = makeShadeSprite(maxR, this.dpr);
    else this.tones = { pearl: makeToneSprite(maxR, this.dpr, TONES.pearl), gold: makeToneSprite(maxR, this.dpr, TONES.gold) };
    var base = document.createElement('canvas');
    base.width = this.canvas.width;
    base.height = this.canvas.height;
    var b = base.getContext('2d');
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
    if (this.gem && !this.gemDone && t >= 420) { this.drawGem(this.bctx, 1); this.gemDone = true; }
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
    if (this.gem && !this.gemDone && t > 0) this.drawGem(ctx, Math.min(1, t / 420));
    for (var j = 0; j < active.length; j += 2) this.drawBead(ctx, active[j], active[j + 1]);
    if (head && this.opts.mode === 'mark') this.drawNeedle(ctx, head.x, head.y, head.r);
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
    this.watchSize();
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
    if (this.gem) this.twinkle();
    if (this.opts.onDone) this.opts.onDone(instant);
  };

  // A new size (rotation, window resize, zoom): redraw the finished state at once.
  Embroidery.prototype.watchSize = function () {
    var self = this;
    if (this.sizeWatch || !('ResizeObserver' in window)) return;
    var lastW = this.w, lastH = this.h, pending = 0;
    this.sizeWatch = new ResizeObserver(function () {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(function () {
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
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.stopTwinkle) this.stopTwinkle();
    try {
      this.measure();
      if (!this.prepare()) return;
    } catch (err) {
      return;
    }
    this.frame(Infinity);
    var first = !this.finished;
    this.finished = true;
    if (first && this.opts.onDone) this.opts.onDone(true);
  };

  // Once the mark is finished, the crystal (never the beads) catches the light now and
  // then for twelve seconds; only the small squares around each spark are redrawn.
  Embroidery.prototype.twinkle = function () {
    var self = this;
    var gem = this.gem;
    if (reduceMotion.matches || !gem) return;
    // Arms 0.3 of the crystal's width, shortened where a facet edge is near: the star
    // never leaves the crystal.
    var spots = [[-0.2, -0.3], [0.15, -0.15], [0, 0.25], [-0.3, 0.05], [0.1, -0.5]].map(function (p) {
      var room = Math.min(gem.w * (1 - Math.abs(p[1])) - gem.w * Math.abs(p[0]),
        gem.h * (1 - Math.abs(p[0])) - gem.h * Math.abs(p[1]));
      return { x: gem.x + gem.w * p[0], y: gem.y + gem.h * p[1], len: Math.min(gem.w * 0.6, room) * 0.9 };
    });
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
        var b = spots[Math.floor(Math.random() * spots.length)];
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
    this.stopTwinkle = function () {
      cancelAnimationFrame(self.raf);
      self.raf = 0;
      self.twinkleDone = true;
      glints = [];
      restore();
    };
    this.resume();
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        self.visible = entries[entries.length - 1].isIntersecting;
        if (self.visible) self.resume();
      }).observe(this.canvas);
    }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) self.resume(); });
    if (reduceMotion.addEventListener) {
      reduceMotion.addEventListener('change', function () { if (reduceMotion.matches) self.stopTwinkle(); });
    }
  };

  // ---------------------------------------------------------------- home: hero
  // The motto stays in English and is marked so for screen readers.
  function setCaption(node, note) {
    if (!node) return;
    node.textContent = '';
    node.appendChild(el('span', { lang: 'en' }, 'There Is No Other Like It' + (note ? '.' : '')));
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

    if (!finePointer.matches) return;
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
    initHeader();
    initMacroStages();
    var page = document.body.getAttribute('data-page');

    getJSON('/config.json').then(function (cfg) {
      applyConfig(cfg);
      renderChannels(cfg);
    }).catch(function () { /* the static text stays in place */ });

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
