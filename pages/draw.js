function isRatingsPage() {
  return document.querySelector("table.ruler") !== null;
}

function addTeamAvgColumn() {
  const table = document.querySelector('table.ruler');
  if (!table || table.rows.length < 2) return;
  const headerRow = table.rows[0];
  if (!headerRow.cells[3] || headerRow.cells[3].textContent.trim() !== 'Rating') return;
  if (headerRow.querySelector('[data-team-avg-header]')) return;

  // Make the Rating column sortable and store data-rating on each row
  const ratingTh = headerRow.cells[3];
  ratingTh.textContent = 'Rating ⇕';
  ratingTh.style.cssText = 'cursor:pointer;white-space:nowrap;font-weight:bold;color:#1a73e8;user-select:none;';
  ratingTh.title = 'Click to sort by rating';

  for (let i = 1; i < table.rows.length; i++) {
    const row = table.rows[i];
    const ratingCell = row.cells[3];
    if (!ratingCell) continue;
    const ps = ratingCell.querySelectorAll('p');
    const raw = ps.length ? ps[0].textContent.trim() : ratingCell.textContent.trim();
    const val = parseFloat(raw.replace(',', '.'));
    ratingCell.setAttribute('data-rating', isNaN(val) ? '' : val);
  }

  let ratingDir = 1;
  ratingTh.addEventListener('click', function () {
    ratingDir *= -1;
    ratingTh.textContent = 'Rating ' + (ratingDir === 1 ? '↑' : '↓');
    avgTh.textContent = 'Team Avg ⇕';
    const rows = Array.from(table.rows).slice(1);
    rows.sort((a, b) => {
      const aVal = parseFloat(a.cells[3].getAttribute('data-rating')) || 0;
      const bVal = parseFloat(b.cells[3].getAttribute('data-rating')) || 0;
      return (aVal - bVal) * ratingDir;
    });
    const parent = table.tBodies[0] || table;
    rows.forEach(r => parent.appendChild(r));
  });

  const avgTh = document.createElement('td');
  avgTh.textContent = 'Team Avg ⇕';
  avgTh.setAttribute('data-team-avg-header', '1');
  avgTh.style.cssText = 'cursor:pointer;white-space:nowrap;font-weight:bold;color:#1a73e8;user-select:none;';
  avgTh.title = 'Click to sort by team average rating';
  headerRow.insertBefore(avgTh, headerRow.cells[4]);

  for (let i = 1; i < table.rows.length; i++) {
    const row = table.rows[i];
    const ratingCell = row.cells[3];
    if (!ratingCell) continue;
    const ps = ratingCell.querySelectorAll('p');
    let avg = null;
    if (ps.length >= 2) {
      const r1 = parseFloat(ps[0].textContent.trim().replace(',', '.'));
      const r2 = parseFloat(ps[1].textContent.trim().replace(',', '.'));
      if (!isNaN(r1) && !isNaN(r2)) avg = (r1 + r2) / 2;
    }
    const td = document.createElement('td');
    td.setAttribute('data-avg', avg !== null ? avg : '');
    td.style.cssText = 'text-align:center;font-weight:600;';
    td.textContent = avg !== null ? avg.toFixed(4).replace('.', ',') : '-';
    row.insertBefore(td, row.cells[4]);
  }

  let avgDir = 1;
  avgTh.addEventListener('click', function () {
    avgDir *= -1;
    avgTh.textContent = 'Team Avg ' + (avgDir === 1 ? '↑' : '↓');
    ratingTh.textContent = 'Rating ⇕';
    const rows = Array.from(table.rows).slice(1);
    rows.sort((a, b) => {
      const aVal = parseFloat(a.cells[4].getAttribute('data-avg')) || 0;
      const bVal = parseFloat(b.cells[4].getAttribute('data-avg')) || 0;
      return (aVal - bVal) * avgDir;
    });
    const parent = table.tBodies[0] || table;
    rows.forEach(r => parent.appendChild(r));
  });
}

// Selector for the draw links in the "mijn toernooien" list.
// h4 covers single-draw categories; h5 covers multi-draw categories where h4 is the label-only header
const CATEGORY_LINK_SELECTOR =
  'div.module__content ul > li > h4 > span > a[href], div.module__content ul > li > h5 > span > a[href]';

// Resolve a category draw link to its event overview page. This is the path that
// reliably lands on the right page, so the banner button reuses it too.
async function goToOverviewForDrawLink(a) {
  const drawHref = toAbsUrl(a.getAttribute('href') || '');
  _log('[DSS] goToOverviewForDrawLink', (a.textContent || '').trim(), drawHref);
  const tourIdM = drawHref.match(/\/tournament\/([0-9a-f-]+)/i);
  const tourId = tourIdM ? tourIdM[1] : null;

  // 1. Check if the page already has an event.aspx link for this tournament.
  // Scope to the link's own list item first — a tournament with several categories
  // has one event.aspx link per category and a document-wide lookup would grab
  // whichever comes first rather than the one belonging to this draw.
  if (tourId) {
    const sel = `a[href*="event.aspx"][href*="${tourId}"], a[href*="event.aspx"][href*="${tourId.toLowerCase()}"]`;
    const scope = (a.closest && a.closest('li')) || null;
    const pageLink = (scope && scope.querySelector(sel)) || document.querySelector(sel);
    if (pageLink) {
      window.location.href = toAbsUrl(pageLink.getAttribute('href'));
      return;
    }
  }

  // 2. Fetch the draw page and extract the event.aspx link from it
  try {
    const r = await fetch(drawHref, { credentials: 'include' });
    if (r.ok) {
      const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
      const eventLink = doc.querySelector('a[href*="event.aspx"]');
      if (eventLink) {
        window.location.href = new URL(eventLink.getAttribute('href'), drawHref).href;
        return;
      }
    }
  } catch (e) {}

  // 3. Fallback to the slow-path, bypassing the fast-path that would re-navigate to the draw
  const linkText = a.textContent.trim();
  goToOverviewForCurrentEvent({ rawTitle: linkText, eventType: normalizeEventTitle(linkText), tournamentHref: drawHref, skipFastPath: true });
}

function injectCategoryOverviewButtons() {
  const links = document.querySelectorAll(CATEGORY_LINK_SELECTOR);
  links.forEach(a => {
    if (a.dataset.dssOverviewBtn) return;
    a.dataset.dssOverviewBtn = '1';
    const btn = document.createElement('button');
    btn.className = 'dss-cat-overview-btn';
    btn.textContent = 'Go to overview';
    btn.title = a.href;
    btn.style.cssText = 'margin-left:8px;padding:2px 8px;font-size:11px;font-weight:600;border-radius:4px;background:#193291;color:#fff;border:none;cursor:pointer;vertical-align:middle;line-height:1.6;white-space:nowrap;';
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      goToOverviewForDrawLink(a);
    };
    a.after(btn);
  });
}

function isMatchSchedulePage() {
  return document.querySelector('#draw-matches') !== null;
}

function normalizeEventTitle(txt) {
  return (txt || '')
    .replace(/\s*\(.*?\)\s*/g, ' ')   // remove rating range like (5.4002 - 5.8713)
    .replace(/\s*-\s*Groep.*$/i, '')    // remove trailing " - Groep X"
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Spelling variants of the category token in a title, e.g. "GD 17" -> gd17 / gd 17 / gd-17
function categoryTokenVariants(text) {
  const out = new Set();
  const m = (text || '').toString().match(/\b(GD|HD|DD|DE|HE)\s*-?\s*(\d+)\b/i);
  if (m) {
    const b = m[1].toLowerCase(), n = m[2].toLowerCase();
    out.add(b + n); out.add(b + ' ' + n); out.add(b + '-' + n);
  }
  return out;
}

const GROUP_RX = /\b(Groep|Pool|Poule)\s+([A-Z0-9]+)\b/i;

function detectCurrentEventTitles() {
  // Reads what's on the current draw/group page
  const titleEl = document.querySelector('.page-subhead .media__title .nav-link__value');
  const rawTitle = titleEl ? titleEl.textContent.trim() : '';
  const eventType = normalizeEventTitle(rawTitle);
  return { rawTitle, eventType };
}

// Navigate to the event overview (Onderdelen) and select the matching category.
// Accepts an optional override object: { rawTitle: string, eventType: string }
async function goToOverviewForCurrentEvent(override) {
  let rawTitle, eventType;
  if (override && typeof override === 'object') {
    rawTitle = override.rawTitle || '';
    eventType = override.eventType || '';
  } else {
    const det = detectCurrentEventTitles();
    rawTitle = det.rawTitle;
    eventType = det.eventType;
  }
  try { chrome.storage.local.set({ dssEventTitle: eventType || '', dssEventTitleRaw: rawTitle || '' }); } catch {}

  // Extract group name early (e.g. "Groep B", "Pool A") — used for fast-path and onderdelen scoring
  const groupName = (GROUP_RX.exec(eventType || '') || GROUP_RX.exec(rawTitle || '') || [])[0] || null;

  // Build token variants early so the fast-path can use them
  const tokenVariants = categoryTokenVariants(eventType || rawTitle || '');
  if (!tokenVariants.size && rawTitle) tokenVariants.add(rawTitle.toLowerCase());

  // Fast path: find a draw link on the current page that matches the category (+group).
  // Covers the home-page case where "mijn toernooien" has the right group-specific link.
  if (tokenVariants.size && !(override && override.skipFastPath)) {
    // Extract tournament ID from the hint URL so we only consider links for this tournament
    const _thHref = (override && override.tournamentHref) || '';
    const _tourIdM = _thHref.match(/[?&]id=([0-9a-f-]+)/i) || _thHref.match(/\/tournament\/([0-9a-f-]+)/i);
    const _tourId = _tourIdM ? _tourIdM[1].toLowerCase() : null;
    const groupL = groupName ? groupName.toLowerCase() : null;
    let fpBest = null, fpScore = 0;
    for (const a of document.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href') || '';
      // Skip general event overview pages — that's exactly what we're trying to avoid
      if (/event\.aspx/i.test(href)) continue;
      // Only consider draw/tournament-style links
      if (!/\/tournament\//i.test(href) && !/draw\.aspx/i.test(href)) continue;
      // If we know the tournament ID, skip links for other tournaments
      if (_tourId && !href.toLowerCase().includes(_tourId)) continue;
      const txt = (a.textContent || '').trim().toLowerCase();
      let sc = 0;
      for (const tv of tokenVariants) { if (txt.includes(tv)) { sc += 60; break; } }
      if (!sc) continue;
      if (groupL && txt.includes(groupL)) sc += 80;
      if (/\/Draw\//i.test(href) || /draw\.aspx/i.test(href)) sc += 20;
      if (sc > fpScore) { fpScore = sc; fpBest = a; }
    }
    // Require category+group match when group is known; otherwise category+draw match
    if (fpBest && fpScore >= (groupL ? 140 : 80)) {
      window.location.href = toAbsUrl(fpBest.getAttribute('href'));
      return;
    }
  }

  // Helper to fetch a URL and return a parsed document, or null
  async function fetchDoc(url) {
    try {
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) return null;
      const t = await r.text();
      return new DOMParser().parseFromString(t, 'text/html');
    } catch (e) { return null; }
  }

  // Allow caller to force which tournament page to consult
  const forcedTourHref = (override && override.tournamentHref) ? toAbsUrl(override.tournamentHref) : null;

  let onderdelenHref = null;
  // Only look for an Onderdelen link on the CURRENT page when the caller has not told us
  // which tournament it means. On the home page any "Onderdelen" anchor belongs to
  // whichever tournament happens to be listed first, which sends us to the wrong event.
  if (!forcedTourHref) {
    const navCandidates = Array.from(document.querySelectorAll('a.page-nav__link, .page-nav a, nav a, a[role="tab"], a'))
      .filter(a => a.getAttribute && a.getAttribute('href'));
    const textMatch = navCandidates.find(a => /onderdeel/i.test(a.textContent || '')) || navCandidates.find(a => /onderdelen/i.test(a.textContent || ''));
    if (textMatch) onderdelenHref = toAbsUrl(textMatch.getAttribute('href'));
  }

  // If not found on the current page, try following the tournament/master link at the top of the page
  if (!onderdelenHref) {
    const topTournamentAnchor = forcedTourHref ? null : document.querySelector('.page-subhead .media__title a[href], .module__title a[href], a.tournament__link, a[href*="/tournament"], a[href*="tournament.aspx"]');
    const tourCandidate = forcedTourHref || (topTournamentAnchor ? toAbsUrl(topTournamentAnchor.getAttribute('href')) : null);
    if (tourCandidate) {
      try {
        _log('[DSS] goToOverview: fetching tournament page to locate Onderdelen', tourCandidate);
        const tourDoc = await fetchDoc(tourCandidate);
        if (tourDoc) {
          // look for onderdelen link inside the tournament page
          const tNav = Array.from(tourDoc.querySelectorAll('a')).filter(a => (a.textContent||'').trim());
          let tBest = null; let tBestScore = 0;
          for (const a of tNav) {
            try {
              const h = a.getAttribute('href') || '';
              const txt = (a.textContent||'').trim();
              let sc = 0;
              if (/onderdel/i.test(txt)) sc += 50;
              if (/onderdel/i.test(h)) sc += 40;
              if (/onderdelen\.aspx|onderdeel\.aspx/i.test(h)) sc += 45;
              if (a.closest && a.closest('.page-nav, .module__nav, .site-navigation')) sc += 6;
              if (sc > tBestScore) { tBestScore = sc; tBest = a; }
            } catch (e) {}
          }
          if (tBest && tBestScore > 0) {
            // Resolve onderdelenHref relative to the tournament page URL so relative links work
            try { onderdelenHref = new URL(tBest.getAttribute('href') || '', tourCandidate).href; } catch { onderdelenHref = toAbsUrl(tBest.getAttribute('href')); }
          }
        }
      } catch (e) { console.warn('[DSS] goToOverview: tournament fetch failed', e); }
    }
  }

  // If still not found, try scanning document-wide anchors as a final heuristic.
  // Skipped when the caller named a tournament: anything we'd find here comes from an
  // unrelated tournament on the current page, so failing loudly beats a wrong redirect.
  if (!onderdelenHref && !forcedTourHref) {
    const hrefCandidates = Array.from(document.querySelectorAll('a[href]'));
    let best = null; let bestScore = 0;
    const wantToken = (eventType || rawTitle || '').toLowerCase();
    for (const a of hrefCandidates) {
      try {
        const href = a.getAttribute('href') || '';
        const txt = (a.textContent || '').trim();
        let score = 0;
        if (/onderdel/i.test(txt)) score += 50;
        if (/onderdel/i.test(href)) score += 40;
        if (/onderdelen\.aspx|onderdeel\.aspx/i.test(href)) score += 45;
        if (/event\.aspx/i.test(href)) score += 20;
        if (wantToken && txt.toLowerCase().includes(wantToken)) score += 10;
        if (wantToken && href.toLowerCase().includes(wantToken)) score += 8;
        if (a.closest && a.closest('.page-nav, .site-navigation, .module__nav, .nav')) score += 6;
        if (score > bestScore) { bestScore = score; best = a; }
      } catch (e) {}
    }
    if (best && bestScore > 0) onderdelenHref = toAbsUrl(best.getAttribute('href'));
  }

  if (!onderdelenHref) {
    console.warn('[DSS] goToOverviewForCurrentEvent: could not locate an Onderdelen/overview link via heuristics.');
    alert('Kon de pagina "Onderdelen" niet vinden. Ga naar de toernooipagina en klik op "Onderdelen" of open het onderdeel handmatig.');
    return;
  }

  try {
    // Fetch the Onderdelen page and find the matching event link
    const resp = await fetch(onderdelenHref, { credentials: 'include' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Candidate links — include Draw and event.aspx links in addition to component lists
    const candidates = Array.from(doc.querySelectorAll('table.ruler a.nav-link, table.ruler a, .module__content a, .components-list a, a[href*="/Draw/"], a[href*="event.aspx"]'));

    let best = null; let bestScore = 0;
    const wantNorm = (rawTitle || eventType || '').toLowerCase();

    for (const a of candidates) {
      try {
        const node = a.querySelector('.nav-link__value') || a;
        const txtRaw = (node && node.textContent) ? node.textContent.trim() : (a.textContent || '').trim();
        const txt = ('' + txtRaw).toLowerCase();
        if (!txt) continue;
        let score = 0;
        // strong exact match after normalization
        if (normalizeEventTitle(txtRaw) === normalizeEventTitle(wantNorm)) score += 200;
        // token variant matches are strong
        for (const tv of tokenVariants) {
          if (tv && txt.includes(tv)) score += 140;
          const href = (a.getAttribute('href') || '').toLowerCase();
          if (tv && href.includes(tv)) score += 120;
        }
        // contains rawTitle
        if (wantNorm && txt.includes(wantNorm)) score += 40;
        // prefer 'Tennis' prefix or similar sport mentions
        if (/tennis/.test(txt) && /tennis/.test(wantNorm)) score += 10;
        const href = a.getAttribute('href') || '';
        if (/\/Draw\//i.test(href)) score += 25;         // specific draw > general event page
        if (/event\.aspx/i.test(href)) score += 5;      // reduced — often the group-less overview
        if (/onderdeel|onderdelen/i.test(href)) score += 30;
        if (groupName && txt.includes(groupName.toLowerCase())) score += 80;
        // small boost for links inside table.ruler rows / components lists
        if (a.closest && a.closest('table.ruler, .components-list, .module__list')) score += 6;
        if (score > bestScore) { bestScore = score; best = a; }
      } catch (e) { /* ignore per-anchor errors */ }
    }

    if (!best) {
      alert(`Kon het onderdeel voor "${rawTitle || eventType}" niet vinden op de Onderdelen-pagina.`);
      return;
    }

    // If the winning link is a general event.aspx page but we know the specific group,
    // try to find a more targeted Draw link for that group on the same onderdelen page.
    if (groupName && /event\.aspx/i.test(best.getAttribute('href') || '')) {
      const groupL = groupName.toLowerCase();
      const groupDraw = Array.from(doc.querySelectorAll('a[href*="/Draw/"]'))
        .find(a => (a.textContent || '').trim().toLowerCase().includes(groupL));
      if (groupDraw) best = groupDraw;
    }

    const rawHref = best.getAttribute('href') || '';
    let targetHref;
    try {
      // Resolve relative to the Onderdelen page URL so relative links work correctly
      targetHref = new URL(rawHref, onderdelenHref).href;
    } catch {
      targetHref = toAbsUrl(rawHref);
    }

    try {
      const u = new URL(targetHref);
      // If it's an event page but not under /sport/, normalize it
      if (/event\.aspx$/i.test(u.pathname) && !/^\/sport\//i.test(u.pathname)) {
        u.pathname = '/sport/event.aspx';
        targetHref = u.origin + u.pathname + u.search + u.hash;
      }
    } catch {}

    if (!targetHref) {
      alert('Gevonden onderdeel heeft geen geldige link.');
      return;
    }
    window.location.href = targetHref;
  } catch (e) {
    console.error('[DSS] Failed to resolve overview via Onderdelen:', e);
    alert('Er ging iets mis bij het openen van de Onderdelen-pagina.');
  }
}

function addGoToOverviewButton() {
  const container = document.querySelector('#draw-matches .module__banner');
  if (!container || document.querySelector('#dss-go-overview')) return;

  const goBtn = document.createElement('button');
  goBtn.id = 'dss-go-overview';
  // Use the site's button markup and class pattern
  goBtn.className = 'btn btn--primary nav-link';
  goBtn.style.marginLeft = '0';
  // Remove explicit display/alignItems (handled by class)

  goBtn.innerHTML = `
    <svg aria-hidden="true" fill="currentColor" width="16" height="16" viewBox="0 0 24 24" style="margin-right:6px;">
      <path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3z"></path>
      <path d="M5 5h7v2H7v10h10v-5h2v7H5z"></path>
    </svg>
    <span class="nav-link__value">Go to overview</span>`;

  goBtn.onclick = () => { goToOverviewForCurrentEvent(); };

  // Insert to the LEFT of the Import Matches button if present; otherwise prepend
  const importBtn = document.getElementById('dss-import-matches');
  if (importBtn && importBtn.parentNode === container) {
    container.insertBefore(goBtn, importBtn);
    importBtn.style.marginLeft = '0.75rem'; // keep Import button positioned
  } else {
    container.prepend(goBtn);
  }
}

// The tournament ID referenced by the banner's tournament link, or null.
function bannerTournamentId(banner) {
  const tourA = banner.querySelector('a[href*="/tournament"], a[href*="tournament.aspx"]');
  if (!tourA) return null;
  const tourHref = tourA.getAttribute('href') || '';
  const m = tourHref.match(/\/tournament\/([0-9a-f-]+)/i) || tourHref.match(/[?&]id=([0-9a-f-]+)/i);
  return m ? m[1].toLowerCase() : null;
}

// The "mijn toernooien" draw links belonging to one tournament.
// Draw links use /sport/draw.aspx?id=UUID format, so match by tourId rather than a path prefix.
function categoryLinksForTournament(tourId) {
  return Array.from(document.querySelectorAll(CATEGORY_LINK_SELECTOR))
    .filter(a => (a.getAttribute('href') || '').toLowerCase().includes(tourId));
}

// Returns true when the banner's tournament ID appears in the "mijn toernooien" category links,
// meaning the upcoming match is a tournament match rather than regular competition.
function bannerBelongsToTournament(banner) {
  const tourId = bannerTournamentId(banner);
  return !!tourId && categoryLinksForTournament(tourId).length > 0;
}

// Pick the "mijn toernooien" draw link matching the banner's category, so the banner
// button can resolve the overview through the same route as the per-category buttons.
// Returns null when the category cannot be pinned down unambiguously — better to let
// the Onderdelen slow path try than to navigate to a sibling category.
function findCategoryLinkForBanner(banner, rawTitle) {
  const tourId = bannerTournamentId(banner);
  if (!tourId) return null;
  const catLinks = categoryLinksForTournament(tourId);
  if (catLinks.length <= 1) return catLinks[0] || null;

  const want = normalizeEventTitle(rawTitle);
  if (!want) return null;
  const wantTokens = categoryTokenVariants(want);
  const groupM = GROUP_RX.exec(rawTitle || '');
  const groupL = groupM ? groupM[0].toLowerCase() : null;

  const scored = catLinks.map(a => {
    const raw = (a.textContent || '').trim();
    const txt = normalizeEventTitle(raw);
    let score = 0;
    if (txt) {
      if (txt === want) score += 200;
      else if (txt.includes(want) || want.includes(txt)) score += 60;
      for (const tv of wantTokens) { if (txt.includes(tv)) { score += 40; break; } }
      if (groupL && raw.toLowerCase().includes(groupL)) score += 80;
    }
    return { a, score };
  }).sort((x, y) => y.score - x.score);

  // Require a clear winner: a tie means the category text did not discriminate
  if (!scored[0].score || scored[0].score === scored[1].score) return null;
  return scored[0].a;
}

// Add a Go to overview button into the main upcoming-match banner when present
function addGoToOverviewMainBanner() {
  try {
    // Do not inject on player profile pages — their head-to-head section also uses
    // .comparison-block--inversed but it is unrelated to a match schedule overview.
    if (/\/player-profile\//i.test(window.location.pathname)) return;

    // Look for the main 'Volgende wedstrijd' comparison block
    const banner = document.querySelector('.comparison-block--inversed');
    if (!banner) return;
    // Avoid adding twice
    if (document.getElementById('dss-go-overview-main')) return;

    // Only show for tournament matches, not regular competition
    if (!bannerBelongsToTournament(banner)) return;

    const btn = document.createElement('button');
    btn.id = 'dss-go-overview-main';
    btn.className = 'btn btn--primary nav-link';
    btn.style.marginLeft = '0.5rem';
    btn.style.fontSize = '1rem';
    btn.style.padding = '10px 12px';
    btn.style.minWidth = '140px';
    btn.style.borderRadius = '8px';
    btn.innerHTML = `
      <svg aria-hidden="true" fill="currentColor" width="16" height="16" viewBox="0 0 24 24" style="margin-right:6px;">
        <path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3z"></path>
        <path d="M5 5h7v2H7v10h10v-5h2v7H5z"></path>
      </svg>
      <span class="nav-link__value">Go to overview</span>`;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      try {
        // The banner title is the TOURNAMENT name; the subtitle holds the CATEGORY
        // (e.g. "Tennis GD 17+ C (7.9403 - 8.3361)"). The overview matcher scores
        // candidates against rawTitle, so rawTitle must be the category — not the
        // tournament name — for the exact-title match to fire and disambiguate
        // between sibling categories (e.g. GD 17+ A/B/C). Mirror detectCurrentEventTitles.
        const subtitleItems = Array.from(banner.querySelectorAll('.comparison-heading__subtitle .comparison-heading__subtitle-item, .comparison-heading__subtitle .list__item, .comparison-heading__subtitle-item'))
          .map(n => (n.textContent || '').trim()).filter(Boolean);
        // Dedupe — the subtitle repeats the category once per team. Join keeps any
        // distinct group token ("Groep B") that may appear as a separate item.
        const uniqueSubtitle = [...new Set(subtitleItems)];
        let rawTitle = uniqueSubtitle.join(' ').trim();
        // Fallback to the banner title only if no subtitle category was found
        if (!rawTitle) {
          const titleNode = banner.querySelector('.comparison-heading__title .nav-link__value') || banner.querySelector('.comparison-heading__title') || banner.querySelector('.comparison-heading__time');
          if (titleNode) rawTitle = (titleNode.textContent || '').trim();
        }
        const eventType = normalizeEventTitle(rawTitle);

        // Preferred route: the "mijn toernooien" draw link for this tournament + category
        // is right here on the page, and resolving from it is what the per-category
        // buttons do. Guessing from the banner text alone is what sent us to the wrong
        // event, so only fall through to that when the category cannot be pinned down.
        const catLink = findCategoryLinkForBanner(banner, rawTitle);
        _log('[DSS] banner overview: rawTitle=', rawTitle, 'matched category link=', catLink ? (catLink.textContent || '').trim() : null);
        if (catLink) {
          goToOverviewForDrawLink(catLink);
          return;
        }

        // Also capture tournament link in the banner (e.g., 'Peelland toernooi 2025') so we can fetch its page
        let tournamentHref = null;
        try {
          // find an anchor in banner title that points to the tournament page
          const tourA = banner.querySelector('.comparison-heading__title a[href], .comparison-heading__title .nav-link a[href], a.tournament__link, a[href*="/tournament"], a[href*="tournament.aspx"]');
          if (tourA) tournamentHref = tourA.getAttribute('href');
        } catch (ex) {}
        // Skip the fast path so we reach the onderdelen slow path that finds event.aspx
        goToOverviewForCurrentEvent({ rawTitle, eventType, tournamentHref, skipFastPath: true });
      } catch (ex) {
        console.warn('[DSS] banner Go to overview click failed, falling back', ex);
        goToOverviewForCurrentEvent();
      }
    });

    // Insert into the banner's header area if present, otherwise append to banner
    const header = banner.querySelector('.comparison__collapse-header, .comparison-heading');
    if (header) {
      // Try to insert near the time element so it's prominent
      const timeEl = header.querySelector('.comparison-heading__time');
      if (timeEl && timeEl.parentNode) {
        timeEl.parentNode.insertBefore(btn, timeEl.nextSibling);
        return;
      }
      header.appendChild(btn);
      return;
    }
    banner.appendChild(btn);
  } catch (e) {
    console.warn('[DSS] addGoToOverviewMainBanner failed', e);
  }
}

function addRatingShortcut() {
  try {
    if (document.getElementById('knltb-rating-shortcut')) return;
    // Find "Mijn prestaties" link → player profile URL
    const prestatiesLink = Array.from(document.querySelectorAll('.module__aside a[href*="/player-profile/"]'))
      .find(a => /mijn\s*prestaties/i.test(a.textContent));
    // Fallback: player name link in the hero media section
    const heroLink = document.querySelector('div.media--hero.media div.media__content h5 a[href*="/player-profile/"]');
    const sourceLink = prestatiesLink || heroLink;
    if (!sourceLink) return;
    const profileHref = sourceLink.getAttribute('href');
    if (!profileHref) return;
    const aside = sourceLink.closest('.module__aside') || document.querySelector('.module__banner .module__aside');
    if (!aside) return;
    const ratingHref = toAbsUrl(profileHref.replace(/\/$/, '') + '/Rating');
    const ratingLink = document.createElement('a');
    ratingLink.id = 'knltb-rating-shortcut';
    ratingLink.href = ratingHref;
    ratingLink.className = 'btn btn--primary nav-link';
    ratingLink.style.marginLeft = '0.75rem';
    ratingLink.innerHTML = '<span class="nav-link__value">Rating</span>';
    aside.appendChild(ratingLink);
  } catch (e) {
    console.warn('[DSS] addRatingShortcut failed', e);
  }
}

function init() {
  extractTeamsFromTable();
  if (isRatingsPage()) {
    setupUI();
    populatePlayerDropdown();
    attachRowListeners();
    loadImportedMatches();
  }
  // Ensure the main page banner (upcoming match) has a Go to overview button when visible
  try { addGoToOverviewMainBanner(); } catch (e) {}
  try { addRatingShortcut(); } catch (e) {}
  try { injectCategoryOverviewButtons(); } catch (e) {}
  try { addTeamAvgColumn(); } catch (e) {}
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// Observe for dynamic insertion of the main upcoming-match banner and add the button when it appears
try {
  const bannerObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (!m.addedNodes) continue;
      for (const n of m.addedNodes) {
        try {
          if (n && n.querySelector && (n.matches && n.matches('.comparison-block--inversed') || n.querySelector('.comparison-block--inversed'))) {
            addGoToOverviewMainBanner();
            // once we've added it, we can disconnect to reduce overhead
            bannerObserver.disconnect();
            return;
          }
        } catch (e) {}
      }
    }
  });
  bannerObserver.observe(document.body, { childList: true, subtree: true });
} catch (e) {}

// Observe for dynamically loaded schedule content and inject category overview buttons.
// Also retries the banner button in case the banner was already present but the
// "mijn toernooien" links hadn't loaded yet when addGoToOverviewMainBanner first ran.
try {
  let _catBtnTimer = null;
  const catObserver = new MutationObserver(() => {
    clearTimeout(_catBtnTimer);
    _catBtnTimer = setTimeout(() => {
      try { injectCategoryOverviewButtons(); } catch (e) {}
      try { addGoToOverviewMainBanner(); } catch (e) {}
    }, 250);
  });
  catObserver.observe(document.body, { childList: true, subtree: true });
} catch (e) {}

if (isMatchSchedulePage()) {
  _log('[DSS] Match schedule page detected');
  addGoToOverviewButton();
}
