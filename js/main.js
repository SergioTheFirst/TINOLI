/* ============================================================
   Magic Stitch — Main JavaScript
   ============================================================ */

(function() {
  'use strict';

  // ===================== CONFIG LOADER =====================
  let CONFIG = null;
  let WORKS = null;

  async function loadConfig() {
    try {
      const response = await fetch('/config.json?t=' + Date.now());
      CONFIG = await response.json();
      return CONFIG;
    } catch (e) {
      console.warn('Could not load config.json, using defaults');
      return null;
    }
  }

  async function loadWorks() {
    try {
      const response = await fetch('/works/works.json?t=' + Date.now());
      const data = await response.json();
      WORKS = data.works || [];
      return WORKS;
    } catch (e) {
      console.warn('Could not load works.json');
      WORKS = [];
      return [];
    }
  }

  // ===================== APPLY CONFIG TO PAGE =====================
  function applyConfig() {
    if (!CONFIG) return;

    // Apply all elements with data-config attribute
    document.querySelectorAll('[data-config]').forEach(function(el) {
      var path = el.getAttribute('data-config');
      var value = getNestedValue(CONFIG, path);
      if (value !== undefined && value !== null) {
        if (el.tagName === 'A' && path.endsWith('_url')) {
          el.href = value;
        } else if (el.tagName === 'IMG') {
          el.src = value;
        } else {
          el.textContent = value;
        }
      }
    });

    // Apply href values
    document.querySelectorAll('[data-config-href]').forEach(function(el) {
      var path = el.getAttribute('data-config-href');
      var value = getNestedValue(CONFIG, path);
      if (value) el.href = value;
    });

    // Nav links
    document.querySelectorAll('[data-nav]').forEach(function(el) {
      var key = el.getAttribute('data-nav');
      if (CONFIG.nav && CONFIG.nav[key]) {
        el.textContent = CONFIG.nav[key];
      }
    });

    // Update page title
    if (CONFIG.seo && CONFIG.seo.title) {
      var pageTitle = document.querySelector('title');
      if (pageTitle && !pageTitle.dataset.noOverride) {
        // Keep page-specific titles, update only if default
      }
    }

    // Insert analytics
    insertAnalytics();
  }

  function getNestedValue(obj, path) {
    return path.split('.').reduce(function(o, key) {
      return o && o[key] !== undefined ? o[key] : null;
    }, obj);
  }

  // ===================== ANALYTICS =====================
  function insertAnalytics() {
    if (!CONFIG || !CONFIG.analytics) return;

    // Yandex Metrika
    if (CONFIG.analytics.yandex_metrika_id) {
      var ym = document.createElement('script');
      ym.textContent = '(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};' +
        'm[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r)return;}' +
        'k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})' +
        '(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");' +
        'ym(' + CONFIG.analytics.yandex_metrika_id + ',"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true});';
      document.head.appendChild(ym);
      var noscript = document.createElement('noscript');
      noscript.innerHTML = '<div><img src="https://mc.yandex.ru/watch/' + CONFIG.analytics.yandex_metrika_id + '" style="position:absolute;left:-9999px;" alt="" /></div>';
      document.body.appendChild(noscript);
    }

    // Google Analytics
    if (CONFIG.analytics.google_analytics_id) {
      var gaScript = document.createElement('script');
      gaScript.async = true;
      gaScript.src = 'https://www.googletagmanager.com/gtag/js?id=' + CONFIG.analytics.google_analytics_id;
      document.head.appendChild(gaScript);
      var gaInit = document.createElement('script');
      gaInit.textContent = 'window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}' +
        'gtag("js",new Date());gtag("config","' + CONFIG.analytics.google_analytics_id + '");';
      document.head.appendChild(gaInit);
    }

    // Cloudflare Web Analytics
    if (CONFIG.analytics.cloudflare_token) {
      var cfScript = document.createElement('script');
      cfScript.defer = true;
      cfScript.src = 'https://static.cloudflareinsights.com/beacon.min.js';
      cfScript.setAttribute('data-cf-beacon', '{"token":"' + CONFIG.analytics.cloudflare_token + '"}');
      document.body.appendChild(cfScript);
    }
  }

  // ===================== HEADER SCROLL =====================
  function initHeader() {
    var header = document.querySelector('.header');
    if (!header) return;

    var scrollThreshold = 50;

    function onScroll() {
      if (window.scrollY > scrollThreshold) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
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

    // Close on link click
    nav.querySelectorAll('a').forEach(function(link) {
      link.addEventListener('click', function() {
        burger.classList.remove('active');
        nav.classList.remove('open');
        document.body.style.overflow = '';
      });
    });

    // Close on outside click
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
    var elements = document.querySelectorAll('.animate-on-scroll');
    if (!elements.length) return;

    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    });

    elements.forEach(function(el) {
      observer.observe(el);
    });
  }

  // ===================== HERO PARTICLES =====================
  function initParticles() {
    var container = document.querySelector('.hero-particles');
    if (!container) return;

    for (var i = 0; i < 30; i++) {
      var particle = document.createElement('div');
      particle.className = 'particle';
      particle.style.left = Math.random() * 100 + '%';
      particle.style.top = Math.random() * 100 + '%';
      particle.style.animationDelay = Math.random() * 8 + 's';
      particle.style.animationDuration = (6 + Math.random() * 6) + 's';
      particle.style.opacity = (0.1 + Math.random() * 0.3).toString();
      particle.style.width = (1 + Math.random() * 2) + 'px';
      particle.style.height = particle.style.width;
      container.appendChild(particle);
    }
  }

  // ===================== WORKS RENDERING =====================
  function renderWorks(works, container, limit) {
    if (!container) return;

    var items = limit ? works.slice(0, limit) : works;

    if (items.length === 0) {
      container.innerHTML = '<div class="empty-state">' +
        '<div class="icon">&#10022;</div>' +
        '<p>Скоро здесь появятся работы...</p></div>';
      return;
    }

    container.innerHTML = '';

    items.forEach(function(work, index) {
      var card = document.createElement('div');
      card.className = 'work-card animate-on-scroll stagger-' + ((index % 6) + 1);
      card.setAttribute('data-category', work.category || 'other');
      card.setAttribute('data-index', index.toString());

      var imgSrc = '/works/images/' + work.filename;
      var hoverSrc = work.filename_hover ? '/works/images/' + work.filename_hover : '';

      var categoryName = '';
      if (CONFIG && CONFIG.categories && CONFIG.categories[work.category]) {
        categoryName = CONFIG.categories[work.category];
      } else {
        categoryName = work.category || '';
      }

      card.innerHTML =
        '<div class="work-card-image">' +
          '<img src="' + imgSrc + '" alt="' + escapeHtml(work.title) + '" loading="lazy">' +
          (hoverSrc ? '<img src="' + hoverSrc + '" alt="' + escapeHtml(work.title) + '" class="img-hover" loading="lazy">' : '') +
        '</div>' +
        '<div class="work-card-info">' +
          '<h3>' + escapeHtml(work.title) + '</h3>' +
          '<p>' + escapeHtml(work.description || '') + '</p>' +
          '<span class="category-tag">' + escapeHtml(categoryName) + '</span>' +
        '</div>';

      card.addEventListener('click', function() {
        openLightbox(items, index);
      });

      container.appendChild(card);
    });

    // Re-init scroll animations for new elements
    initScrollAnimations();
  }

  // ===================== FILTER =====================
  function initFilters() {
    var filterBar = document.querySelector('.filter-bar');
    var grid = document.querySelector('.works-grid');
    if (!filterBar || !grid || !WORKS) return;

    // Build filter buttons from config categories
    filterBar.innerHTML = '';
    var categories = CONFIG && CONFIG.categories ? CONFIG.categories : { all: 'Все работы' };

    Object.keys(categories).forEach(function(key) {
      var btn = document.createElement('button');
      btn.className = 'filter-btn' + (key === 'all' ? ' active' : '');
      btn.setAttribute('data-filter', key);
      btn.textContent = categories[key];
      filterBar.appendChild(btn);
    });

    // Filter click handler
    filterBar.addEventListener('click', function(e) {
      var btn = e.target.closest('.filter-btn');
      if (!btn) return;

      filterBar.querySelectorAll('.filter-btn').forEach(function(b) {
        b.classList.remove('active');
      });
      btn.classList.add('active');

      var filter = btn.getAttribute('data-filter');
      var filtered = filter === 'all' ? WORKS : WORKS.filter(function(w) {
        return w.category === filter;
      });

      renderWorks(filtered, grid);
    });
  }

  // ===================== LIGHTBOX =====================
  var lightboxData = { works: [], currentIndex: 0 };

  function openLightbox(works, index) {
    lightboxData.works = works;
    lightboxData.currentIndex = index;

    var lightbox = document.getElementById('lightbox');
    if (!lightbox) {
      createLightbox();
      lightbox = document.getElementById('lightbox');
    }

    updateLightbox();
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    var lightbox = document.getElementById('lightbox');
    if (lightbox) {
      lightbox.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  function updateLightbox() {
    var work = lightboxData.works[lightboxData.currentIndex];
    if (!work) return;

    var img = document.querySelector('.lightbox-img');
    var title = document.querySelector('.lightbox-title');
    var desc = document.querySelector('.lightbox-desc');

    if (img) img.src = '/works/images/' + work.filename;
    if (title) title.textContent = work.title;
    if (desc) desc.textContent = work.description || '';
  }

  function createLightbox() {
    var lightbox = document.createElement('div');
    lightbox.id = 'lightbox';
    lightbox.className = 'lightbox';
    lightbox.innerHTML =
      '<button class="lightbox-close" aria-label="Close">&times;</button>' +
      '<button class="lightbox-nav lightbox-prev" aria-label="Previous">&#8249;</button>' +
      '<div class="lightbox-content">' +
        '<img class="lightbox-img" src="" alt="">' +
        '<div class="lightbox-info">' +
          '<h3 class="lightbox-title"></h3>' +
          '<p class="lightbox-desc"></p>' +
        '</div>' +
      '</div>' +
      '<button class="lightbox-nav lightbox-next" aria-label="Next">&#8250;</button>';

    document.body.appendChild(lightbox);

    lightbox.querySelector('.lightbox-close').addEventListener('click', closeLightbox);

    lightbox.addEventListener('click', function(e) {
      if (e.target === lightbox) closeLightbox();
    });

    lightbox.querySelector('.lightbox-prev').addEventListener('click', function(e) {
      e.stopPropagation();
      lightboxData.currentIndex = (lightboxData.currentIndex - 1 + lightboxData.works.length) % lightboxData.works.length;
      updateLightbox();
    });

    lightbox.querySelector('.lightbox-next').addEventListener('click', function(e) {
      e.stopPropagation();
      lightboxData.currentIndex = (lightboxData.currentIndex + 1) % lightboxData.works.length;
      updateLightbox();
    });

    // Keyboard navigation
    document.addEventListener('keydown', function(e) {
      if (!lightbox.classList.contains('active')) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') {
        lightboxData.currentIndex = (lightboxData.currentIndex - 1 + lightboxData.works.length) % lightboxData.works.length;
        updateLightbox();
      }
      if (e.key === 'ArrowRight') {
        lightboxData.currentIndex = (lightboxData.currentIndex + 1) % lightboxData.works.length;
        updateLightbox();
      }
    });
  }

  // ===================== ACTIVE NAV LINK =====================
  function setActiveNav() {
    var path = window.location.pathname;
    var filename = path.split('/').pop() || 'index.html';

    document.querySelectorAll('.nav a').forEach(function(link) {
      var href = link.getAttribute('href');
      if (href === filename || (filename === '' && href === 'index.html') || (filename === '/' && href === 'index.html')) {
        link.classList.add('active');
      }
    });
  }

  // ===================== HELPERS =====================
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ===================== PAGE-SPECIFIC INIT =====================
  async function initPage() {
    // Load config and works in parallel
    await Promise.all([loadConfig(), loadWorks()]);

    // Apply config to all pages
    applyConfig();
    setActiveNav();
    initHeader();
    initMobileNav();

    // Page-specific logic
    var page = document.body.getAttribute('data-page');

    switch (page) {
      case 'home':
        initParticles();
        // Render latest works
        var homeGrid = document.querySelector('.works-grid');
        if (homeGrid && WORKS) {
          var sorted = WORKS.slice().sort(function(a, b) {
            return (b.date || '').localeCompare(a.date || '');
          });
          renderWorks(sorted, homeGrid, 6);
        }
        break;

      case 'gallery':
        var galleryGrid = document.querySelector('.works-grid');
        if (galleryGrid && WORKS) {
          var sortedAll = WORKS.slice().sort(function(a, b) {
            return (b.date || '').localeCompare(a.date || '');
          });
          renderWorks(sortedAll, galleryGrid);
          initFilters();
        }
        break;

      case 'about':
        break;

      case 'contact':
        break;
    }

    // Init scroll animations
    initScrollAnimations();
  }

  // ===================== INIT =====================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
  } else {
    initPage();
  }

})();
