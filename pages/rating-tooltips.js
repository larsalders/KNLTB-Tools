(function () {
  'use strict';

  // Cache: normalised URL → {single, double, padel} | 'pending' | 'failed'
  const cache = new Map();
  let tipEl = null;
  let tipTarget = null;
  let hoverTimer = null;

  function getTooltip() {
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.id = 'knltb-rtip';
      tipEl.style.cssText = [
        'position:fixed',
        'background:#222',
        'color:#fff',
        'padding:6px 11px',
        'border-radius:5px',
        'font-size:12px',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif',
        'pointer-events:none',
        'z-index:99999',
        'display:none',
        'white-space:nowrap',
        'box-shadow:0 2px 8px rgba(0,0,0,.4)',
        'line-height:1.7'
      ].join(';');
      document.body.appendChild(tipEl);
    }
    return tipEl;
  }

  function showTip(html, x, y) {
    const tip = getTooltip();
    tip.innerHTML = html;
    tip.style.display = 'block';
    moveTip(x, y);
  }

  function moveTip(x, y) {
    if (!tipEl || tipEl.style.display === 'none') return;
    tipEl.style.left = (x + 14) + 'px';
    tipEl.style.top  = (y - 40) + 'px';
  }

  function hideTip() {
    if (tipEl) tipEl.style.display = 'none';
  }

  // Return the best URL to fetch ratings from.
  // Player profile rating pages live at /player-profile/<id>/Rating.
  function ratingUrl(href) {
    try {
      const abs = href.startsWith('http') ? href : location.origin + (href.startsWith('/') ? href : '/' + href);
      const url = new URL(abs);
      // Normalise to the /Rating sub-page so we always hit the right endpoint.
      const parts = url.pathname.replace(/\/+$/, '').split('/');
      if (parts.length >= 3 && parts[1] === 'player-profile') {
        if (parts[parts.length - 1].toLowerCase() !== 'rating') {
          url.pathname = parts.slice(0, 3).join('/') + '/Rating';
        }
      }
      return url.toString();
    } catch (_) {
      return null;
    }
  }

  async function fetchRatings(href) {
    const url = ratingUrl(href);
    if (!url) return null;

    if (cache.has(url)) {
      const v = cache.get(url);
      return (v === 'pending' || v === 'failed') ? null : v;
    }

    cache.set(url, 'pending');
    try {
      const resp = await fetch(url, { credentials: 'include' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const html = await resp.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');

      const EXCLUDE = '.match, .match-group, #draw-matches, .module--matches, .matches, .draw, .tournament, .schedule';
      const ratingsObj = {};

      doc.querySelectorAll('span.tag-duo[data-original-title], span.tag-duo[title]').forEach(span => {
        if (span.closest(EXCLUDE)) return;
        const typeRaw = (span.getAttribute('data-original-title') || span.getAttribute('title') || '').toLowerCase();
        const valueEl = span.querySelector('.tag-duo__value');
        if (!valueEl) return;
        const val = parseFloat(valueEl.textContent.trim().replace(/\s+/g, '').replace(',', '.'));
        if (isNaN(val)) return;
        if (typeRaw.includes('single') || typeRaw.includes('enkel'))                               ratingsObj.single = val;
        if ((typeRaw.includes('double') || typeRaw.includes('dubbel')) && !typeRaw.includes('padel')) ratingsObj.double = val;
        if (typeRaw.includes('padel'))                                                               ratingsObj.padel  = val;
      });

      cache.set(url, ratingsObj);
      return ratingsObj;
    } catch (e) {
      cache.set(url, 'failed');
      return null;
    }
  }

  function formatRatings(r) {
    const fmt = v => (typeof v === 'number') ? v.toFixed(4) : null;
    const lines = [
      r.single != null ? `Singles: <strong>${fmt(r.single)}</strong>` : null,
      r.double != null ? `Doubles: <strong>${fmt(r.double)}</strong>` : null,
      r.padel  != null ? `Padel:   <strong>${fmt(r.padel)}</strong>`  : null,
    ].filter(Boolean);
    return lines.length ? lines.join('<br>') : null;
  }

  function processLink(a) {
    if (a.dataset.knltbTip) return;
    const href = a.getAttribute('href') || '';
    if (!href.toLowerCase().includes('player')) return;
    a.dataset.knltbTip = '1';

    let mx = 0, my = 0;

    a.addEventListener('mousemove', e => {
      mx = e.clientX; my = e.clientY;
      moveTip(mx, my);
    });

    a.addEventListener('mouseenter', e => {
      mx = e.clientX; my = e.clientY;
      tipTarget = a;

      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(async () => {
        if (tipTarget !== a) return;

        // Show loading only if fetch is needed
        const url = ratingUrl(href);
        const cached = url ? cache.get(url) : undefined;
        if (!cached || cached === 'pending') showTip('Loading…', mx, my);

        const ratings = await fetchRatings(href);
        if (tipTarget !== a) return;

        if (!ratings) { hideTip(); return; }
        const html = formatRatings(ratings);
        if (!html) { hideTip(); return; }
        showTip(html, mx, my);
      }, 120);
    });

    a.addEventListener('mouseleave', () => {
      clearTimeout(hoverTimer);
      if (tipTarget === a) { tipTarget = null; hideTip(); }
    });
  }

  function attachAll(root) {
    root.querySelectorAll('a[href]').forEach(a => {
      if ((a.getAttribute('href') || '').toLowerCase().includes('player')) processLink(a);
    });
  }

  attachAll(document);

  new MutationObserver(mutations => {
    mutations.forEach(m => m.addedNodes.forEach(node => {
      if (node.nodeType !== 1) return;
      if (node.tagName === 'A') processLink(node);
      else attachAll(node);
    }));
  }).observe(document.body, { childList: true, subtree: true });
})();
