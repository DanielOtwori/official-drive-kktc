/* ==========================================================================
   DRIVE KKTC — script.js
   -----------------------------------------------------------------------
   Sections:
   1. Utilities
   2. Progress bar / sticky nav / back-to-top
   3. Dark mode
   4. Mobile nav
   5. i18n engine (language load, detect, persist, RTL switch)
   6. Language selector UI
   7. Skeleton loader (route grid)
   8. Search index + glowing search + autocomplete
   9. Advanced filter panel + URL query params + route-card filtering
   10. Recently viewed / popular searches
   11. Contact form
   12. Scroll reveals / active-nav highlight / smooth scroll
   13. Destination gallery
   14. Downloadable route guides
   ========================================================================== */
(function () {
  'use strict';

  const doc = document.documentElement;
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));
  /* ------------------------------------------------------------------
     CONTACT FORM BACKEND
     ------------------------------------------------------------------
     This is a static site with no server, so the contact form has
     nothing to submit to out of the box. 
     I'll work on this later, but for now I've left the endpoint blank so you can fill in your own Formspree or Netlify Forms URL. If you don't have one, the form will fall back to a mailto: link that opens the user's email client.
     ------------------------------------------------------------------ */
  const CONTACT_ENDPOINT = ''; // e.g. 'https://formspree.io/f/xxxxabcd'
  const CONTACT_FALLBACK_EMAIL = 'hello@drivekktc.com'; // used only by the mailto: fallback above

  /* ------------------------------------------------------------------
     1. UTILITIES
     ------------------------------------------------------------------ */
  function debounce(fn, wait) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function getNested(obj, path) {
    return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);
    const safe = escapeHtml(text);
    const idx = safe.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return safe;
    return safe.slice(0, idx) + '<mark>' + safe.slice(idx, idx + query.length) + '</mark>' + safe.slice(idx + query.length);
  }

  function showToast(msg) {
    let toast = $('#ux-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'ux-toast';
      toast.className = 'ux-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('is-visible');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('is-visible'), 2400);
  }

  function trapFocus(container, evt) {
    const focusables = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', container)
      .filter((el) => !el.hasAttribute('hidden') && el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (evt.shiftKey && document.activeElement === first) {
      evt.preventDefault(); last.focus();
    } else if (!evt.shiftKey && document.activeElement === last) {
      evt.preventDefault(); first.focus();
    }
  }

  /* ------------------------------------------------------------------
     2. PROGRESS BAR / STICKY NAV / BACK-TO-TOP
     ------------------------------------------------------------------ */
  const progressBar = $('#progress-bar');
  function updateProgress() {
    const scrollTop = window.scrollY;
    const docHeight = doc.scrollHeight - window.innerHeight;
    const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    progressBar.style.width = pct + '%';
  }

  const nav = $('#site-nav');
  const backToTop = $('#back-to-top');
  function updateScrollUI() {
    const y = window.scrollY;
    nav.classList.toggle('is-scrolled', y > 40);
    backToTop.classList.toggle('is-visible', y > 800);
  }

  let ticking = false;
  window.addEventListener('scroll', function () {
    if (!ticking) {
      window.requestAnimationFrame(function () {
        updateProgress();
        updateScrollUI();
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });

  updateProgress();
  updateScrollUI();

  backToTop.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* ------------------------------------------------------------------
     3. DARK MODE
     ------------------------------------------------------------------ */
  const themeToggle = $('#theme-toggle');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  function setTheme(isDark) {
    if (isDark) {
      doc.setAttribute('data-theme', 'dark');
      themeToggle.setAttribute('aria-pressed', 'true');
    } else {
      doc.removeAttribute('data-theme');
      themeToggle.setAttribute('aria-pressed', 'false');
    }
  }

  let storedTheme = null;
  try { storedTheme = window.localStorage.getItem('drivekktc-theme'); } catch (e) { /* storage unavailable */ }
  setTheme(storedTheme ? storedTheme === 'dark' : prefersDark);

  themeToggle.addEventListener('click', function () {
    const isDark = doc.getAttribute('data-theme') === 'dark';
    setTheme(!isDark);
    try { window.localStorage.setItem('drivekktc-theme', !isDark ? 'dark' : 'light'); } catch (e) { /* ignore */ }
  });

  /* ------------------------------------------------------------------
     4. MOBILE NAV
     ------------------------------------------------------------------ */
  const navToggle = $('#nav-toggle');
  const navLinks = $('#nav-links');
  navToggle.addEventListener('click', function () {
    const isOpen = navLinks.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });
  $$('#nav-links a').forEach(function (link) {
    link.addEventListener('click', function () {
      navLinks.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });

  /* ------------------------------------------------------------------
     5. i18n — LANGUAGE STATE
     ------------------------------------------------------------------
     Each language now lives on its own fully pre-translated, static page
     (/, /tr/, /ru/, /ar/). There's no client-side content swap and no
     fetch() of locale JSON — CURRENT_LANG is simply read from the
     <html lang> attribute the page was authored with, and used only to
     pick the right strings for the handful of UI bits that are built
     dynamically in JS (search panel states below). This also means the
     site works correctly even opened straight from disk (file://), with
     no local server required.
     ------------------------------------------------------------------ */
  const SUPPORTED_LANGS = ['en', 'tr', 'ar', 'ru'];
  const CURRENT_LANG = SUPPORTED_LANGS.indexOf(doc.getAttribute('lang')) !== -1 ? doc.getAttribute('lang') : 'en';

  const UI_STRINGS = {
    en: {
      recent_label: 'Recently viewed', clear_recent: 'Clear', popular_label: 'Popular searches',
      loading: 'Searching…', no_results_title: 'Nothing matches that search',
      no_results_body: 'Try a different landmark, region or route name — or clear filters to see everything.',
      route_label: 'Route',
      guide_facts: 'Route facts', guide_stops: 'Stops', guide_practical: 'Practical information',
      guide_tip: 'Local tip', guide_footer: 'Generated from drivekktc.com — verify details before you drive.',
      guide_btn_default: 'Download guide', guide_btn_done: 'Downloaded ✓',
      form_sending: 'Sending…', form_error: "Something went wrong — please email us directly or try again."
    },
    tr: {
      recent_label: 'Son görüntülenenler', clear_recent: 'Temizle', popular_label: 'Popüler aramalar',
      loading: 'Aranıyor…', no_results_title: 'Bu aramayla eşleşen bir şey yok',
      no_results_body: 'Farklı bir mekân, bölge veya rota adı deneyin — ya da her şeyi görmek için filtreleri temizleyin.',
      route_label: 'Rota',
      guide_facts: 'Rota bilgileri', guide_stops: 'Duraklar', guide_practical: 'Pratik bilgiler',
      guide_tip: 'Yerel ipucu', guide_footer: 'drivekktc.com üzerinden oluşturuldu — yola çıkmadan önce bilgileri doğrulayın.',
      guide_btn_default: 'Rehberi indir', guide_btn_done: 'İndirildi ✓',
      form_sending: 'Gönderiliyor…', form_error: 'Bir şeyler ters gitti — lütfen bize doğrudan e-posta gönderin veya tekrar deneyin.'
    },
    ru: {
      recent_label: 'Недавно просмотренные', clear_recent: 'Очистить', popular_label: 'Популярные запросы',
      loading: 'Идёт поиск…', no_results_title: 'По этому запросу ничего не найдено',
      no_results_body: 'Попробуйте другую достопримечательность, регион или название маршрута — или сбросьте фильтры, чтобы увидеть всё.',
      route_label: 'Маршрут',
      guide_facts: 'Информация о маршруте', guide_stops: 'Остановки', guide_practical: 'Практическая информация',
      guide_tip: 'Совет от местных', guide_footer: 'Сформировано на drivekktc.com — уточните детали перед поездкой.',
      guide_btn_default: 'Скачать гид', guide_btn_done: 'Скачано ✓',
      form_sending: 'Отправка…', form_error: 'Что-то пошло не так — напишите нам напрямую или попробуйте ещё раз.'
    },
    ar: {
      recent_label: 'شوهدت مؤخرًا', clear_recent: 'مسح', popular_label: 'عمليات بحث شائعة',
      loading: 'جارٍ البحث…', no_results_title: 'لا توجد نتائج مطابقة لهذا البحث',
      no_results_body: 'جرّب معلمًا أو منطقة أو اسم مسار مختلف — أو امسح الفلاتر لرؤية كل شيء.',
      route_label: 'مسار',
      guide_facts: 'معلومات المسار', guide_stops: 'المحطات', guide_practical: 'معلومات عملية',
      guide_tip: 'نصيحة محلية', guide_footer: 'تم إنشاؤه من drivekktc.com — يرجى التحقق من التفاصيل قبل القيادة.',
      guide_btn_default: 'تنزيل الدليل', guide_btn_done: 'تم التنزيل ✓',
      form_sending: 'جارٍ الإرسال…', form_error: 'حدث خطأ ما — يرجى مراسلتنا مباشرة أو المحاولة مرة أخرى.'
    }
  };
  const T = UI_STRINGS[CURRENT_LANG] || UI_STRINGS.en;

  /* ------------------------------------------------------------------
     6. LANGUAGE SELECTOR UI
     ------------------------------------------------------------------
     The menu items are now real links to the sibling-language pages
     (built at author time), except for the current language, which
     renders as a disabled, aria-current item. 
     ------------------------------------------------------------------ */
  const langSelect = $('#lang-select');
  const langToggle = $('#lang-toggle');
  const langMenu = $('#lang-menu');

  function openLangMenu() {
    langMenu.hidden = false;
    langToggle.setAttribute('aria-expanded', 'true');
    const active = $('#lang-menu [aria-current="true"]') || $('#lang-menu a, #lang-menu button');
    if (active) active.focus();
  }
  function closeLangMenu() {
    langMenu.hidden = true;
    langToggle.setAttribute('aria-expanded', 'false');
  }
  langToggle.addEventListener('click', function () {
    if (langMenu.hidden) openLangMenu(); else closeLangMenu();
  });
  // Carry the current section hash across a language switch, e.g. reading
  // #route-coast in Russian and switching to Arabic lands on #route-coast too.
  $$('#lang-menu a[data-lang-btn]').forEach((link) => {
    const base = link.getAttribute('href');
    link.addEventListener('click', function () {
      if (window.location.hash) link.setAttribute('href', base + window.location.hash);
    });
  });
  document.addEventListener('click', function (e) {
    if (!langSelect.contains(e.target)) closeLangMenu();
  });
  langSelect.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeLangMenu(); langToggle.focus(); }
    if (!langMenu.hidden) trapFocus(langMenu, e.key === 'Tab' ? e : { key: '', shiftKey: false, preventDefault(){} });
  });

  /* ------------------------------------------------------------------
     7. SKELETON LOADER (route grid)
     ------------------------------------------------------------------ */
  const routeGrid = $('#route-grid');
  (function initSkeleton() {
    const skeletonCount = 5;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < skeletonCount; i++) {
      const s = document.createElement('div');
      s.className = 'skeleton-card';
      s.setAttribute('aria-hidden', 'true');
      frag.appendChild(s);
    }
    routeGrid.appendChild(frag);

    const reveal = () => {
      routeGrid.setAttribute('data-loading', 'false');
      $$('.skeleton-card', routeGrid).forEach((s) => s.remove());
      // give freshly-revealed cards a chance to animate in
      $$('.route-card', routeGrid).forEach((c) => {
        requestAnimationFrame(() => c.classList.add('in-view'));
      });
    };
    // Simulate a brief, realistic load window rather than an instant swap
    if (document.fonts && document.fonts.ready) {
      Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 700))]).then(() => setTimeout(reveal, 250));
    } else {
      setTimeout(reveal, 600);
    }
  })();

  /* ------------------------------------------------------------------
     8. SEARCH INDEX + GLOWING SEARCH + AUTOCOMPLETE
     ------------------------------------------------------------------ */
  // Region labels come straight from the (already-localized) filter checkboxes,
  // so search-by-region works correctly in every language with no translation
  // table to maintain here.
  const REGION_LABELS = {};
  $$('.filter-group[data-filter-group="region"] input[type="checkbox"]').forEach((cb) => {
    const label = cb.nextElementSibling ? cb.nextElementSibling.textContent.trim() : cb.value;
    REGION_LABELS[cb.value] = label;
  });
  const RECENT_KEY = 'drivekktc-recent';
  const MAX_RECENT = 5;

  function buildSearchIndex() {
    const index = [];
    $$('.route-card').forEach((card) => {
      index.push({
        type: 'route',
        routeId: card.getAttribute('data-route-id'),
        title: $('h3', card).textContent.trim(),
        subtitle: $('p', card) ? $('p', card).textContent.trim() : '',
        region: (card.getAttribute('data-region') || '').split(' ').filter(Boolean),
        tags: (card.getAttribute('data-tags') || '').split(' ').filter(Boolean)
      });
    });
    $$('.route-detail').forEach((section) => {
      const routeId = section.id;
      const routeTitle = $('h2', section) ? $('h2', section).textContent.trim() : '';
      $$('.stop', section).forEach((stop) => {
        const title = $('h3', stop) ? $('h3', stop).textContent.trim() : '';
        const excerpt = $('p', stop) ? $('p', stop).textContent.trim().slice(0, 140) : '';
        index.push({ type: 'stop', routeId, routeTitle, title, excerpt });
      });
    });
    return index;
  }

  let SEARCH_INDEX = [];
  document.addEventListener('DOMContentLoaded', () => { SEARCH_INDEX = buildSearchIndex(); });
  // In case DOMContentLoaded already fired by the time this runs:
  if (document.readyState !== 'loading') SEARCH_INDEX = buildSearchIndex();

  function searchRoutes(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const results = [];
    SEARCH_INDEX.forEach((item) => {
      let score = 0;
      let field = '';
      if (item.type === 'route') {
        if (item.title.toLowerCase().includes(q)) { score = 3; field = item.title; }
        else if (item.subtitle.toLowerCase().includes(q)) { score = 2; field = item.subtitle; }
        else if (item.region.some((r) => (REGION_LABELS[r] || r).toLowerCase().includes(q))) { score = 2; field = item.title; }
        else if (item.tags.some((t) => t.includes(q))) { score = 1; field = item.title; }
      } else {
        if (item.title.toLowerCase().includes(q)) { score = 3; field = item.title; }
        else if (item.excerpt.toLowerCase().includes(q)) { score = 1; field = item.title; }
      }
      if (score > 0) results.push({ item, score, field });
    });
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 8);
  }

  function getRecent() {
    try { return JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) { return []; }
  }
  function pushRecent(routeId, title) {
    if (!routeId || !title) return;
    let list = getRecent().filter((r) => r.routeId !== routeId);
    list.unshift({ routeId, title });
    list = list.slice(0, MAX_RECENT);
    try { window.localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
  }

  const searchInput = $('#search-input');
  const searchClear = $('#search-clear');
  const searchField = $('.glow-search-field');
  const searchPanel = $('#search-panel');
  const searchFilterBtn = $('#search-filter-btn');
  const filterPanel = $('#filter-panel');

  function suggestionIconSvg(type) {
    return type === 'route'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 20l-5.5-2V4L9 6m0 14l6-2m-6 2V6m6 12l5.5 2V8L15 6m0 12V6m0 0L9 4"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="10" r="3"/><path d="M12 21s7-6.5 7-11a7 7 0 10-14 0c0 4.5 7 11 7 11z"/></svg>';
  }

  let activeSuggestionIndex = -1;

  function popularSearches() {
    // Use the real (already-localized) route titles rather than a hardcoded
    // English list, so this reads correctly on every language page.
    return SEARCH_INDEX.filter((i) => i.type === 'route').map((i) => i.title).slice(0, 6);
  }

  function renderDefaultPanel() {
    const recent = getRecent();
    let html = '';
    if (recent.length) {
      html += `<div class="search-panel-section">
        <div class="search-panel-label"><span>${escapeHtml(T.recent_label)}</span>
        <button type="button" id="clear-recent-btn">${escapeHtml(T.clear_recent)}</button></div>
        <div class="chip-row">${recent.map((r) => `<button type="button" data-goto="${r.routeId}">${escapeHtml(r.title)}</button>`).join('')}</div>
      </div>`;
    }
    html += `<div class="search-panel-section">
      <div class="search-panel-label"><span>${escapeHtml(T.popular_label)}</span></div>
      <div class="chip-row">${popularSearches().map((p) => `<button type="button" data-query="${escapeHtml(p)}">${escapeHtml(p)}</button>`).join('')}</div>
    </div>`;
    searchPanel.innerHTML = html;
    searchPanel.hidden = false;
    searchInput.setAttribute('aria-expanded', 'true');
    activeSuggestionIndex = -1;
  }

  function renderLoading() {
    searchPanel.innerHTML = `<div class="search-loading"><span class="search-spinner" aria-hidden="true"></span><span>${escapeHtml(T.loading)}</span></div>`;
    searchPanel.hidden = false;
  }

  function renderResults(results, query) {
    if (!results.length) {
      searchPanel.innerHTML = `<div class="search-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <h4>${escapeHtml(T.no_results_title)}</h4>
        <p>${escapeHtml(T.no_results_body)}</p>
      </div>`;
      searchPanel.hidden = false;
      activeSuggestionIndex = -1;
      return;
    }
    const items = results.map((r, i) => {
      const item = r.item;
      const meta = item.type === 'route' ? T.route_label : item.routeTitle;
      return `<div class="suggestion-item" role="option" data-index="${i}" data-route-id="${item.routeId}" tabindex="-1">
        <span class="suggestion-icon" aria-hidden="true">${suggestionIconSvg(item.type)}</span>
        <span class="suggestion-body">
          <span class="suggestion-title">${highlightMatch(item.title, query)}</span>
          <span class="suggestion-meta">${escapeHtml(meta)}</span>
        </span>
      </div>`;
    }).join('');
    searchPanel.innerHTML = `<div class="suggestion-list" role="listbox">${items}</div>`;
    searchPanel.hidden = false;
    activeSuggestionIndex = -1;
  }

  function goToRoute(routeId) {
    const section = document.getElementById(routeId);
    if (!section) return;
    const title = $('h2', section) ? $('h2', section).textContent.trim() : routeId;
    pushRecent(routeId, title);
    closeSearchPanel();
    searchInput.value = '';
    searchClear.hidden = true;
    searchField.classList.remove('has-value');
    const offset = 90;
    const top = section.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: 'smooth' });
  }

  function closeSearchPanel() {
    searchPanel.hidden = true;
    searchInput.setAttribute('aria-expanded', 'false');
    activeSuggestionIndex = -1;
  }

  const runSearch = debounce(function (query) {
    if (!query) { renderDefaultPanel(); return; }
    renderLoading();
    setTimeout(() => {
      const results = searchRoutes(query);
      renderResults(results, query);
    }, 220); // small, honest delay so the loading state is perceivable
  }, 180);

  searchInput.addEventListener('focus', function () {
    filterPanel.hidden = true;
    searchFilterBtn.setAttribute('aria-expanded', 'false');
    if (!searchInput.value.trim()) renderDefaultPanel(); else runSearch(searchInput.value);
  });
  searchInput.addEventListener('input', function () {
    const has = !!searchInput.value.trim();
    searchClear.hidden = !has;
    searchField.classList.toggle('has-value', has);
    runSearch(searchInput.value);
  });
  searchClear.addEventListener('click', function () {
    searchInput.value = '';
    searchClear.hidden = true;
    searchField.classList.remove('has-value');
    searchInput.focus();
    renderDefaultPanel();
  });

  searchPanel.addEventListener('click', function (e) {
    const suggestion = e.target.closest('.suggestion-item');
    if (suggestion) { goToRoute(suggestion.getAttribute('data-route-id')); return; }
    const gotoBtn = e.target.closest('[data-goto]');
    if (gotoBtn) { goToRoute(gotoBtn.getAttribute('data-goto')); return; }
    const queryBtn = e.target.closest('[data-query]');
    if (queryBtn) {
      searchInput.value = queryBtn.getAttribute('data-query');
      searchClear.hidden = false;
      searchField.classList.add('has-value');
      searchInput.focus();
      runSearch(searchInput.value);
      return;
    }
    const clearRecent = e.target.closest('#clear-recent-btn');
    if (clearRecent) {
      try { window.localStorage.removeItem(RECENT_KEY); } catch (err) { /* ignore */ }
      renderDefaultPanel();
    }
  });

  searchInput.addEventListener('keydown', function (e) {
    const items = $$('.suggestion-item', searchPanel);
    if (e.key === 'ArrowDown') {
      if (!items.length) return;
      e.preventDefault();
      activeSuggestionIndex = Math.min(activeSuggestionIndex + 1, items.length - 1);
      items.forEach((it, i) => it.classList.toggle('is-active', i === activeSuggestionIndex));
      items[activeSuggestionIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      if (!items.length) return;
      e.preventDefault();
      activeSuggestionIndex = Math.max(activeSuggestionIndex - 1, 0);
      items.forEach((it, i) => it.classList.toggle('is-active', i === activeSuggestionIndex));
      items[activeSuggestionIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeSuggestionIndex >= 0 && items[activeSuggestionIndex]) {
        goToRoute(items[activeSuggestionIndex].getAttribute('data-route-id'));
      } else if (items.length) {
        goToRoute(items[0].getAttribute('data-route-id'));
      }
    } else if (e.key === 'Escape') {
      closeSearchPanel();
      searchInput.blur();
    }
  });

  document.addEventListener('click', function (e) {
    if (!$('#glow-search').contains(e.target)) {
      closeSearchPanel();
    }
  });

  /* ------------------------------------------------------------------
     9. ADVANCED FILTER PANEL + URL PARAMS + ROUTE-CARD FILTERING
     ------------------------------------------------------------------ */
  const filterChips = $$('.filter-chip');
  const filterClose = $('#filter-close');
  const filterReset = $('#filter-reset');
  const filterApply = $('#filter-apply');
  const filterBadge = $('#filter-badge');
  const routeEmptyState = $('#route-empty-state');
  const routeEmptyReset = $('#route-empty-reset');

  const filterState = { region: [], type: [], duration: [], difficulty: [], chip: 'all' };

  function readCheckedValues(groupName) {
    return $$(`.filter-group[data-filter-group="${groupName}"] input[type="checkbox"]:checked`).map((i) => i.value);
  }
  function syncCheckboxesFromState() {
    ['region', 'type', 'duration', 'difficulty'].forEach((group) => {
      $$(`.filter-group[data-filter-group="${group}"] input[type="checkbox"]`).forEach((cb) => {
        cb.checked = filterState[group].indexOf(cb.value) !== -1;
      });
    });
  }

  function applyRouteFilters(opts) {
    opts = opts || {};
    let visibleCount = 0;
    $$('.route-card').forEach((card) => {
      const tags = (card.getAttribute('data-tags') || '').split(' ');
      const region = (card.getAttribute('data-region') || '').split(' ');
      const duration = card.getAttribute('data-duration');
      const difficulty = card.getAttribute('data-difficulty');

      const byChip = filterState.chip === 'all' || tags.indexOf(filterState.chip) !== -1;
      const byRegion = !filterState.region.length || filterState.region.some((r) => region.indexOf(r) !== -1);
      const byType = !filterState.type.length || filterState.type.some((t) => tags.indexOf(t) !== -1);
      const byDuration = !filterState.duration.length || filterState.duration.indexOf(duration) !== -1;
      const byDifficulty = !filterState.difficulty.length || filterState.difficulty.indexOf(difficulty) !== -1;

      const show = byChip && byRegion && byType && byDuration && byDifficulty;
      card.classList.toggle('is-hidden', !show);
      if (show) { visibleCount++; if (!card.classList.contains('in-view')) card.classList.add('in-view'); }
    });

    routeEmptyState.classList.toggle('is-visible', visibleCount === 0);
    routeEmptyState.hidden = visibleCount !== 0;

    const activeCount = filterState.region.length + filterState.type.length + filterState.duration.length + filterState.difficulty.length;
    filterBadge.hidden = activeCount === 0;
    filterBadge.textContent = String(activeCount);
    searchFilterBtn.classList.toggle('is-active', activeCount > 0);

    if (opts.updateUrl !== false) updateUrlParams();
  }

  function updateUrlParams() {
    const params = new URLSearchParams();
    if (filterState.chip !== 'all') params.set('filter', filterState.chip);
    if (filterState.region.length) params.set('region', filterState.region.join(','));
    if (filterState.type.length) params.set('type', filterState.type.join(','));
    if (filterState.duration.length) params.set('duration', filterState.duration.join(','));
    if (filterState.difficulty.length) params.set('difficulty', filterState.difficulty.join(','));
    const qs = params.toString();
    const newUrl = window.location.pathname + (qs ? '?' + qs : '') + window.location.hash;
    window.history.replaceState(null, '', newUrl);
  }

  function readUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const region = params.get('region'); if (region) filterState.region = region.split(',');
    const type = params.get('type'); if (type) filterState.type = type.split(',');
    const duration = params.get('duration'); if (duration) filterState.duration = duration.split(',');
    const difficulty = params.get('difficulty'); if (difficulty) filterState.difficulty = difficulty.split(',');
    const filter = params.get('filter');
    if (filter) {
      filterState.chip = filter;
      filterChips.forEach((c) => c.classList.toggle('is-active', c.getAttribute('data-filter') === filter));
    }
  }

  filterChips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      filterChips.forEach(function (c) { c.classList.remove('is-active'); });
      chip.classList.add('is-active');
      filterState.chip = chip.getAttribute('data-filter');
      applyRouteFilters();
    });
  });

  function openFilterPanel() {
    closeSearchPanel();
    filterPanel.hidden = false;
    searchFilterBtn.setAttribute('aria-expanded', 'true');
    const firstInput = $('input', filterPanel);
    if (firstInput) firstInput.focus();
  }
  function closeFilterPanel() {
    filterPanel.hidden = true;
    searchFilterBtn.setAttribute('aria-expanded', 'false');
  }
  searchFilterBtn.addEventListener('click', function () {
    if (filterPanel.hidden) openFilterPanel(); else closeFilterPanel();
  });
  filterClose.addEventListener('click', function () { closeFilterPanel(); searchFilterBtn.focus(); });
  document.addEventListener('click', function (e) {
    if (!filterPanel.hidden && !filterPanel.contains(e.target) && !searchFilterBtn.contains(e.target)) closeFilterPanel();
  });
  filterPanel.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeFilterPanel(); searchFilterBtn.focus(); }
    if (e.key === 'Tab') trapFocus(filterPanel, e);
  });

  // Instant filtering on checkbox change
  $$('.filter-group input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', function () {
      const group = cb.closest('.filter-group').getAttribute('data-filter-group');
      filterState[group] = readCheckedValues(group);
      applyRouteFilters();
    });
  });
  filterApply.addEventListener('click', function () { applyRouteFilters(); closeFilterPanel(); });
  filterReset.addEventListener('click', function () {
    filterState.region = []; filterState.type = []; filterState.duration = []; filterState.difficulty = [];
    syncCheckboxesFromState();
    applyRouteFilters();
  });
  routeEmptyReset.addEventListener('click', function () {
    filterState.region = []; filterState.type = []; filterState.duration = []; filterState.difficulty = [];
    filterState.chip = 'all';
    filterChips.forEach((c) => c.classList.toggle('is-active', c.getAttribute('data-filter') === 'all'));
    syncCheckboxesFromState();
    applyRouteFilters();
  });

  /* ------------------------------------------------------------------
     11. CONTACT FORM
     ------------------------------------------------------------------ */
  const contactForm = $('#contact-form');
  const formSuccess = $('#form-success');
  const formSuccessDefaultText = formSuccess ? formSuccess.textContent : '';
  const contactSubmitBtn = contactForm ? $('button[type="submit"]', contactForm) : null;
  const contactSubmitDefaultText = contactSubmitBtn ? contactSubmitBtn.textContent : '';

  function setFormStatus(message, isError) {
    if (!formSuccess) return;
    formSuccess.textContent = message;
    formSuccess.classList.toggle('is-error', !!isError);
    formSuccess.hidden = !message;
  }

  if (contactForm) {
    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();
      let valid = true;
      let firstInvalid = null;
      $$('[required]', contactForm).forEach((field) => {
        const row = field.closest('.form-row');
        const isEmpty = !field.value.trim();
        const isBadEmail = field.type === 'email' && field.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value.trim());
        const hasError = isEmpty || isBadEmail;
        row.classList.toggle('has-error', hasError);
        field.setAttribute('aria-invalid', String(hasError));
        if (hasError) { valid = false; if (!firstInvalid) firstInvalid = field; }
      });
      if (!valid) { if (firstInvalid) firstInvalid.focus(); setFormStatus('', false); return; }

      const name = $('#contact-name', contactForm).value.trim();
      const email = $('#contact-email', contactForm).value.trim();
      const routeSelect = $('#contact-route', contactForm);
      const routeLabel = routeSelect.options[routeSelect.selectedIndex].textContent.trim();
      const message = $('#contact-message', contactForm).value.trim();

      function openMailtoFallback() {
        const subject = `${T.route_label}: ${routeLabel}`;
        const body = `${message}\n\n— ${name} (${email})`;
        const mailto = `mailto:${CONTACT_FALLBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = mailto;
        setFormStatus(formSuccessDefaultText, false);
        contactForm.reset();
      }

      if (!CONTACT_ENDPOINT) {
        // No form backend configured — fall back to the visitor's own email client
        // so the message still reaches someone instead of vanishing silently.
        openMailtoFallback();
        return;
      }

      if (contactSubmitBtn) { contactSubmitBtn.disabled = true; contactSubmitBtn.textContent = T.form_sending; }
      setFormStatus('', false);

      fetch(CONTACT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name, email, route: routeLabel, message })
      })
        .then((res) => {
          if (!res.ok) throw new Error('Request failed');
          setFormStatus(formSuccessDefaultText, false);
          contactForm.reset();
        })
        .catch(() => {
          setFormStatus(T.form_error, true);
        })
        .finally(() => {
          if (contactSubmitBtn) { contactSubmitBtn.disabled = false; contactSubmitBtn.textContent = contactSubmitDefaultText; }
        });
    });
  }

  /* ------------------------------------------------------------------
     12. SCROLL REVEALS / ACTIVE-NAV HIGHLIGHT / SMOOTH SCROLL
     ------------------------------------------------------------------ */
  const sections = Array.from(document.querySelectorAll('.route-detail[id], #routes, #gallery'));
  const navAnchors = $$('[data-nav]');

  const navObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        navAnchors.forEach(function (a) {
          a.classList.toggle('is-active', a.getAttribute('href') === '#' + id);
        });
        if (entry.target.classList.contains('route-detail')) {
          const title = $('h2', entry.target) ? $('h2', entry.target).textContent.trim() : id;
          pushRecent(id, title);
        }
      }
    });
  }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });

  sections.forEach(function (section) { navObserver.observe(section); });

  const revealTargets = $$('.reveal, .route-card, .stop, .gauge');
  const revealObserver = new IntersectionObserver(function (entries, obs) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });
  revealTargets.forEach(function (el) { revealObserver.observe(el); });

  $$('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      const targetId = link.getAttribute('href');
      if (targetId.length < 2) return;
      const target = document.querySelector(targetId);
      if (!target) return;
      e.preventDefault();
      const offset = 90;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: top, behavior: 'smooth' });
    });
  });

  /* ------------------------------------------------------------------
     13. DESTINATION GALLERY
     ------------------------------------------------------------------ */
  const galleryLightbox = $('#gallery-lightbox');
  const galleryImage = $('#gallery-lightbox-image');
  const galleryCaption = $('#gallery-lightbox-caption');
  const galleryClose = $('.gallery-close', galleryLightbox);
  if (galleryLightbox && galleryImage && galleryCaption) {
    $$('.gallery-item').forEach(function (item) {
      item.addEventListener('click', function () {
        const preview = $('img', item);
        galleryImage.src = item.getAttribute('data-gallery-image');
        galleryImage.alt = preview ? preview.alt : '';
        galleryCaption.textContent = item.getAttribute('data-gallery-caption') || '';
        galleryLightbox.showModal();
        if (galleryClose) galleryClose.focus();
      });
    });
    if (galleryClose) galleryClose.addEventListener('click', function () { galleryLightbox.close(); });
    galleryLightbox.addEventListener('click', function (e) {
      if (e.target === galleryLightbox) galleryLightbox.close();
    });
    galleryLightbox.addEventListener('close', function () {
      galleryImage.removeAttribute('src');
    });
  }

  /* ------------------------------------------------------------------
     14. DOWNLOADABLE ROUTE GUIDES
     ------------------------------------------------------------------
     The site is static with no backend and no PDF library, so
     "Download guide" builds a self-contained, print-ready HTML file
     out of that route's own on-page content (already in the visitor's
     language) and saves it via a Blob download. Opening the file
     works offline, and the visitor can use their browser's own
     "Print → Save as PDF" if they want a PDF specifically.
     ------------------------------------------------------------------ */
  function collectRouteGuideData(section) {
    const title = ($('.route-hero h2', section) || {}).textContent || '';
    const tag = ($('.route-hero .card-index', section) || {}).textContent || '';
    const subtitle = ($('.route-subtitle', section) || {}).textContent || '';
    const introParas = $$('.route-intro-grid > div.reveal > p', section).map((p) => p.textContent.trim());
    const facts = $$('.route-facts dl dt', section).map((dt) => {
      const dd = dt.nextElementSibling;
      return { k: dt.textContent.trim(), v: dd ? dd.textContent.trim() : '' };
    });
    const stops = $$('.stop', section).map((stop) => ({
      index: ($('.stop-index', stop) || {}).textContent || '',
      title: ($('h3', stop) || {}).textContent || '',
      meta: $$('.stop-meta span', stop).map((s) => s.textContent.trim()).join(' · '),
      text: ($('.stop-body > p', stop) || {}).textContent || '',
      note: ($('.stop-photo-note', stop) || {}).textContent || ''
    }));
    const practical = $$('.practical-item', section).map((item) => ({
      k: ($('.k', item) || {}).textContent || '',
      v: ($('.v', item) || {}).textContent || ''
    }));
    const tip = $$('.postcard p', section).map((p) => p.textContent.trim());
    return { title: title.trim(), tag: tag.trim(), subtitle: subtitle.trim(), introParas, facts, stops, practical, tip };
  }

  function renderRouteGuideDocument(data) {
    const isRtl = doc.getAttribute('dir') === 'rtl';
    const factsRows = data.facts.map((f) => `<tr><th>${escapeHtml(f.k)}</th><td>${escapeHtml(f.v)}</td></tr>`).join('');
    const practicalRows = data.practical.map((f) => `<tr><th>${escapeHtml(f.k)}</th><td>${escapeHtml(f.v)}</td></tr>`).join('');
    const stopsHtml = data.stops.map((s) => `
      <div class="stop">
        <div class="stop-head"><span class="stop-index">${escapeHtml(s.index)}</span><h3>${escapeHtml(s.title)}</h3></div>
        <p class="stop-meta">${escapeHtml(s.meta)}</p>
        <p>${escapeHtml(s.text)}</p>
        ${s.note ? `<p class="stop-note">${escapeHtml(s.note)}</p>` : ''}
      </div>`).join('');
    const introHtml = data.introParas.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
    const tipHtml = data.tip.length
      ? `<blockquote>${data.tip.map((p, i) => `<p${i > 0 ? ' class="signoff"' : ''}>${escapeHtml(p)}</p>`).join('')}</blockquote>` : '';

    return `<!DOCTYPE html>
<html lang="${escapeHtml(doc.getAttribute('lang') || 'en')}" dir="${isRtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(data.title)} — Drive KKTC</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: Georgia, 'Times New Roman', serif; background:#f1ead9; color:#14201f; max-width:760px; margin:0 auto; padding:48px 28px 80px; line-height:1.6; }
  h1 { font-size:2rem; margin-bottom:0.2em; }
  .tag { text-transform:uppercase; letter-spacing:0.08em; font-size:0.75rem; color:#2e7d82; font-weight:700; }
  .subtitle { font-style:italic; color:#4c5a56; margin-top:0.4em; }
  h2 { border-bottom:2px solid #e3a234; padding-bottom:0.3em; margin-top:2.4em; }
  table { width:100%; border-collapse:collapse; margin:1em 0; }
  th, td { text-align:${isRtl ? 'right' : 'left'}; padding:0.5em 0.8em; border-bottom:1px solid #d9cca9; font-size:0.92rem; }
  th { color:#4c5a56; font-weight:600; width:38%; }
  .stop { margin:1.6em 0; padding-${isRtl ? 'right' : 'left'}:1em; border-${isRtl ? 'right' : 'left'}:3px solid #b5562e; }
  .stop-head { display:flex; gap:0.6em; align-items:baseline; }
  .stop-index { font-weight:700; color:#b5562e; }
  .stop-head h3 { margin:0; }
  .stop-meta { font-size:0.85rem; color:#2e7d82; font-weight:600; margin:0.2em 0 0.6em; }
  .stop-note { font-size:0.82rem; color:#4c5a56; font-style:italic; }
  blockquote { background:#faf6ec; border:1px solid #d9cca9; padding:1em 1.4em; margin:1.6em 0; font-style:italic; }
  .signoff { font-style:normal; color:#4c5a56; margin-top:0.6em; }
  footer { margin-top:3em; padding-top:1em; border-top:1px solid #d9cca9; font-size:0.8rem; color:#4c5a56; }
  @media print { body { padding:0 6mm; } }
</style>
</head>
<body>
  <p class="tag">${escapeHtml(data.tag)}</p>
  <h1>${escapeHtml(data.title)}</h1>
  <p class="subtitle">${escapeHtml(data.subtitle)}</p>

  ${introHtml}

  <h2>${escapeHtml(T.guide_facts)}</h2>
  <table>${factsRows}</table>

  <h2>${escapeHtml(T.guide_stops)}</h2>
  ${stopsHtml}

  <h2>${escapeHtml(T.guide_practical)}</h2>
  <table>${practicalRows}</table>

  ${tipHtml ? `<h2>${escapeHtml(T.guide_tip)}</h2>${tipHtml}` : ''}

  <footer>${escapeHtml(T.guide_footer)}</footer>
</body>
</html>`;
  }

  $$('[data-download-guide]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const routeId = btn.getAttribute('data-download-guide');
      const section = document.getElementById(routeId);
      if (!section) return;
      const data = collectRouteGuideData(section);
      const html = renderRouteGuideDocument(data);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `drive-kktc-${routeId.replace('route-', '')}-guide.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);

      const original = btn.textContent;
      btn.textContent = T.guide_btn_done;
      btn.disabled = true;
      setTimeout(function () { btn.textContent = original; btn.disabled = false; }, 2200);
    });
  });

  /* ------------------------------------------------------------------
     INIT — read filter state from the URL, then apply it once
     ------------------------------------------------------------------ */
  readUrlParams();
  syncCheckboxesFromState();
  applyRouteFilters({ updateUrl: false });

})();
