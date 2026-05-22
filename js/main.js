/* ============================================================
   TINOLI — Main JavaScript (Modernized — Infinite Scroll)
   ============================================================ */

(function() {
  'use strict';

  // ===================== STATE =====================
  var CONFIG = null;
  var WORKS = null;
  var currentLimit = 12;
  var PAGE_SIZE = 12;
  var isLoading = false;
  var currentFilter = 'all';
  var observer = null;
  var scrollTimeout = null;

  // ===================== CONFIG & DATA LOADER =====================
  function loadConfig() {
    return fetch('/config.json?t=' + Date.now())
      .then(function(r) { return r.json(); })
      .then(function(c) { CONFIG = c; return c; })
      .catch(function() { CONFIG = {}; return null; });
  }

  function loadWorks() {
    return fetch('/works/works.json?t=' + Date.now())
      .then(function(r) { return r.json(); })
      .then(function(d) { WORKS = (d.works || []).sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); }); return WORKS; })
      .catch(function() { WORKS = []; return []; });
  }

  // ===================== APPLY CONFIG TO PAGE =====================
  function applyConfig() {
    if (!CONFIG) return;
    document.querySelectorAll('[data-config]').forEach(function(el) {
      var val = getNestedValue(CONFIG, el.getAttribute('data-config'));
      if (val === undefined || val === null) return;
      if (el.tagName === 'A' && el.getAttribute('data-config').endsWith('_url')) el.href = val;
      else if (el.tagName === 'IMG') el.src = val;
      else el.textContent = val;
    });
    document.querySelectorAll('[data-config-href]').forEach(function(el) {
      var val = getNestedValue(CONFIG, el.getAttribute('data-config-href'));
      if (val) el.href = val;
    });
    document.querySelectorAll('[data-nav]').forEach(function(el) {
      if (CONFIG.nav && CONFIG.nav[el.getAttribute('data-nav')])
        el.textContent = CONFIG.nav[el.getAttribute('data-nav')];
    });
    insertAnalytics();
  }

  function getNestedValue(obj, path) {
    return path.split('.').reduce(function(o, k) { return o && o[k] !== undefined ? o[k] : null; }, obj);
  }

  // ===================== ANALYTICS =====================
  function insertAnalytics() {
    if (!CONFIG || !CONFIG.analytics) return;
    if (CONFIG.analytics.yandex_metrika_id) {
      var ym = document.createElement('script');
      ym.textContent = "(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r)return;}k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,'script','https://mc.yandex.ru/metrika/tag.js','ym');ym(" + CONFIG.analytics.yandex_metrika_id + ",'init',{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true});";
      document.head.appendChild(ym);
      var ns = document.createElement('noscript');
      ns.innerHTML = '<div><img src="https://mc.yandex.ru/watch/' + CONFIG.analytics.yandex_metrika_id + '" style="position:absolute;left:-9999px" alt=""/></div>';
      document.body.appendChild(ns);
    }
    if (CONFIG.analytics.google_analytics_id) {
      var ga = document.createElement('script'); ga.async = true;
      ga.src = 'https://www.googletagmanager.com/gtag/js?id=' + CONFIG.analytics.google_analytics_id;
      document.head.appendChild(ga);
      var gi = document.createElement('script');
      gi.textContent = 'window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","' + CONFIG.analytics.google_analytics_id + '");';
      document.head.appendChild(gi);
    }
    if (CONFIG.analytics.cloudflare_token) {
      var cf = document.createElement('script'); cf.defer = true;
      cf.src = 'https://static.cloudflareinsights.com/beacon.min.js';
      cf.setAttribute('data-cf-beacon', '{"token":"' + CONFIG.analytics.cloudflare_token + '"}');
      document.body.appendChild(cf);
    }
  }

  // ===================== HEADER SCROLL =====================
  function initHeader() {
    var header = document.querySelector('.header');
    if (!header) return;
    function onScroll() {
      header.classList.toggle('scrolled', window.scrollY > 50);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ===================== MOBILE NAV =====================
  function initMobileNav() {
    var burger = document.querySelector('.burger');
    var nav = document.querySelector('.nav');
    if (!burger || !nav) return;
    burger.addEventListener('click', function() {
      burger.classList.toggle('active');
      nav.classList.toggle('open');
      document.body.style.overflow = nav.classList.contains('open') ? 'hidden' : '';
    });
    nav.querySelectorAll('a').forEach(function(link) {
      link.addEventListener('click', function() {
        burger.classList.remove('active');
        nav.classList.remove('open');
        document.body.style.overflow = '';
      });
    });
    document.addEventListener('click', function(e) {
      if (nav.classList.contains('open') && !nav.contains(e.target) && !burger.contains(e.target)) {
        burger.classList.remove('active');
        nav.classList.remove('open');
        document.body.style.overflow = '';
      }
    });
  }

  // ===================== SCROLL ANIMATIONS =====================
  function initScrollAnimations() {
    var elements = document.querySelectorAll('.animate-on-scroll:not(.observed)');
    if (!elements.length) return;
    var ob = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          entry.target.classList.add('observed');
          ob.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
    elements.forEach(function(el) { ob.observe(el); });
  }

  // ===================== HERO PARTICLES =====================
  function initParticles() {
    var container = document.querySelector('.hero-particles');
    if (!container) return;
    for (var i = 0; i < 30; i++) {
      var p = document.createElement('div');
      p.className = 'particle';
      p.style.left = Math.random() * 100 + '%';
      p.style.top = Math.random() * 100 + '%';
      p.style.animationDelay = Math.random() * 8 + 's';
      p.style.animationDuration = (6 + Math.random() * 6) + 's';
      p.style.opacity = (0.1 + Math.random() * 0.3);
      p.style.width = p.style.height = (1 + Math.random() * 2) + 'px';
      container.appendChild(p);
    }
  }

  // ===================== WORKS RENDERING =====================
  function createCard(work, index, isNew) {
    var card = document.createElement('div');
    var delayClass = isNew ? '' : ' animate-on-scroll stagger-' + ((index % 6) + 1);
    card.className = 'work-card' + delayClass;
    card.setAttribute('data-category', work.category || 'other');
    card.setAttribute('data-index', index.toString());

    var imgSrc = '/works/images/' + work.filename;
    var hoverSrc = work.filename_hover ? '/works/images/' + work.filename_hover : '';

    var categoryName = (CONFIG && CONFIG.categories && CONFIG.categories[work.category])
      ? CONFIG.categories[work.category] : (work.category || '');

    card.innerHTML =
      '<div class="work-card-image">' +
        '<img src="' + imgSrc + '" alt="' + escapeHtml(work.title) + '" loading="lazy" decoding="async">' +
        (hoverSrc ? '<img src="' + hoverSrc + '" alt="' + escapeHtml(work.title) + '" class="img-hover" loading="lazy" decoding="async">' : '') +
      '</div>' +
      '<div class="work-card-info">' +
        '<h3>' + escapeHtml(work.title) + '</h3>' +
        '<p>' + escapeHtml(work.description || '') + '</p>' +
        '<span class="category-tag">' + escapeHtml(categoryName) + '</span>' +
      '</div>';

    card.addEventListener('click', function() {
      openLightbox(getFilteredWorks(), getFilteredWorks().indexOf(work));
    });

    return card;
  }

  function getFilteredWorks() {
    if (!WORKS) return [];
    if (currentFilter === 'all') return WORKS;
    return WORKS.filter(function(w) { return w.category === currentFilter; });
  }

  function renderWorks(works, container) {
    if (!container) return;
    if (!works || works.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="icon">&#10022;</div><p>Скоро здесь появятся работы...</p></div>';
      document.getElementById('loading-spinner').style.display = 'none';
      document.getElementById('end-message').style.display = 'none';
      return;
    }
    container.innerHTML = '';
    currentLimit = PAGE_SIZE;
    var batch = works.slice(0, currentLimit);
    batch.forEach(function(w, i) { container.appendChild(createCard(w, i, false)); });
    initScrollAnimations();
    updateEndState(works);
  }

  function appendWorks(works, container) {
    if (!container || isLoading) return;
    isLoading = true;
    document.getElementById('loading-spinner').style.display = 'block';

    setTimeout(function() {
      var batch = works.slice(currentLimit, currentLimit + PAGE_SIZE);
      batch.forEach(function(w, i) {
        container.appendChild(createCard(w, currentLimit + i, true));
      });
      currentLimit += batch.length;
      isLoading = false;
      document.getElementById('loading-spinner').style.display = 'none';
      initScrollAnimations();
      updateEndState(works);
    }, 300);
  }

  function updateEndState(works) {
    var sentinel = document.getElementById('scroll-sentinel');
    var endMsg = document.getElementById('end-message');
    if (currentLimit >= works.length) {
      if (sentinel) sentinel.style.display = 'none';
      if (endMsg) { endMsg.style.display = 'block'; endMsg.setAttribute('aria-live', 'polite'); }
    } else {
      if (sentinel) sentinel.style.display = '';
      if (endMsg) endMsg.style.display = 'none';
    }
  }

  // ===================== INFINITE SCROLL =====================
  function initInfiniteScroll() {
    var sentinel = document.getElementById('scroll-sentinel');
    var grid = document.querySelector('.works-grid');
    if (!sentinel || !grid) return;

    var io = new IntersectionObserver(function(entries) {
      if (entries[0].isIntersecting && !isLoading) {
        var filtered = getFilteredWorks();
        if (currentLimit < filtered.length) {
          appendWorks(filtered, grid);
        }
      }
    }, { rootMargin: '400px 0px 0px 0px' });

    io.observe(sentinel);
  }

  // ===================== SCROLL-TO-TOP =====================
  function initScrollToTop() {
    var btn = document.getElementById('scroll-top');
    if (!btn) return;
    window.addEventListener('scroll', function() {
      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(function() {
        btn.classList.toggle('visible', window.scrollY > 800);
      }, 100);
    }, { passive: true });
    btn.addEventListener('click', function() {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      document.querySelector('.logo').focus({ preventScroll: true });
    });
  }

  // ===================== FILTERS =====================
  function initFilters() {
    var filterBar = document.querySelector('.filter-bar');
    var grid = document.querySelector('.works-grid');
    if (!filterBar || !grid || !WORKS) return;

    filterBar.innerHTML = '';
    var categories = CONFIG && CONFIG.categories ? CONFIG.categories : { all: 'Все работы' };

    Object.keys(categories).forEach(function(key) {
      var btn = document.createElement('button');
      btn.className = 'filter-btn' + (key === currentFilter ? ' active' : '');
      btn.setAttribute('data-filter', key);
      btn.textContent = categories[key];
      filterBar.appendChild(btn);
    });

    filterBar.addEventListener('click', function(e) {
      var btn = e.target.closest('.filter-btn');
      if (!btn) return;

      filterBar.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');

      currentFilter = btn.getAttribute('data-filter');
      currentLimit = PAGE_SIZE;

      var filtered = getFilteredWorks();
      renderWorks(filtered, grid);

      // Update URL for sharing
      if (window.history && window.history.replaceState) {
        var url = new URL(window.location);
        if (currentFilter === 'all') {
          url.searchParams.delete('category');
        } else {
          url.searchParams.set('category', currentFilter);
        }
        window.history.replaceState({}, '', url.toString());
      }
    });

    // Read initial filter from URL
    var params = new URL(window.location).searchParams;
    var urlCategory = params.get('category');
    if (urlCategory && categories[urlCategory]) {
      currentFilter = urlCategory;
      filterBar.querySelectorAll('.filter-btn').forEach(function(b) {
        b.classList.toggle('active', b.getAttribute('data-filter') === currentFilter);
      });
    }
  }

  // ===================== LIGHTBOX =====================
  var lightboxData = { works: [], currentIndex: 0 };

  function openLightbox(works, index) {
    lightboxData.works = works;
    lightboxData.currentIndex = index;
    var lb = document.getElementById('lightbox');
    if (!lb) { createLightbox(); lb = document.getElementById('lightbox'); }
    updateLightbox();
    lb.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    var lb = document.getElementById('lightbox');
    if (lb) { lb.classList.remove('active'); document.body.style.overflow = ''; }
  }

  function updateLightbox() {
    var w = lightboxData.works[lightboxData.currentIndex];
    if (!w) return;
    var img = document.querySelector('.lightbox-img');
    var title = document.querySelector('.lightbox-title');
    var desc = document.querySelector('.lightbox-desc');
    if (img) img.src = '/works/images/' + w.filename;
    if (title) title.textContent = w.title;
    if (desc) desc.textContent = w.description || '';
  }

  function createLightbox() {
    var lb = document.createElement('div');
    lb.id = 'lightbox';
    lb.className = 'lightbox';
    lb.innerHTML =
      '<button class="lightbox-close" aria-label="Закрыть">&times;</button>' +
      '<button class="lightbox-nav lightbox-prev" aria-label="Назад">&#8249;</button>' +
      '<div class="lightbox-content">' +
        '<img class="lightbox-img" src="" alt="">' +
        '<div class="lightbox-info"><h3 class="lightbox-title"></h3><p class="lightbox-desc"></p></div>' +
      '</div>' +
      '<button class="lightbox-nav lightbox-next" aria-label="Вперёд">&#8250;</button>';
    document.body.appendChild(lb);

    lb.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
    lb.addEventListener('click', function(e) { if (e.target === lb) closeLightbox(); });
    lb.querySelector('.lightbox-prev').addEventListener('click', function(e) {
      e.stopPropagation();
      lightboxData.currentIndex = (lightboxData.currentIndex - 1 + lightboxData.works.length) % lightboxData.works.length;
      updateLightbox();
    });
    lb.querySelector('.lightbox-next').addEventListener('click', function(e) {
      e.stopPropagation();
      lightboxData.currentIndex = (lightboxData.currentIndex + 1) % lightboxData.works.length;
      updateLightbox();
    });
    document.addEventListener('keydown', function(e) {
      if (!lb.classList.contains('active')) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') { lightboxData.currentIndex = (lightboxData.currentIndex - 1 + lightboxData.works.length) % lightboxData.works.length; updateLightbox(); }
      if (e.key === 'ArrowRight') { lightboxData.currentIndex = (lightboxData.currentIndex + 1) % lightboxData.works.length; updateLightbox(); }
    });
  }

  // ===================== ACTIVE NAV =====================
  function setActiveNav() {
    var filename = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav a').forEach(function(link) {
      var href = link.getAttribute('href');
      link.classList.toggle('active', href === filename || (filename === '' && href === 'index.html'));
    });
  }

  // ===================== HELPERS =====================
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ===================== INIT =====================
  function initPage() {
    Promise.all([loadConfig(), loadWorks()]).then(function() {
      applyConfig();
      setActiveNav();
      initHeader();
      initMobileNav();

      var page = document.body.getAttribute('data-page');

      switch (page) {
        case 'home':
          initParticles();
          var grid = document.querySelector('.works-grid');
          if (grid && WORKS) {
            initFilters();
            renderWorks(getFilteredWorks(), grid);
            initInfiniteScroll();
            initScrollToTop();
          }
          break;

        case 'gallery':
          var gGrid = document.querySelector('.works-grid');
          if (gGrid && WORKS) {
            initFilters();
            renderWorks(getFilteredWorks(), gGrid);
          }
          break;

        case 'about':
        case 'contact':
          break;
      }

      initScrollAnimations();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
  } else {
    initPage();
  }
})();
