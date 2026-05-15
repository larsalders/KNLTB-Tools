(function () {
  // Existing rating calculation logic remains intact
  const normalizeName = (name) => {
    if (window.KNLTBUtils && typeof window.KNLTBUtils.normalizeName === 'function') {
      return window.KNLTBUtils.normalizeName(name);
    }
    if (typeof name !== 'string') return '';
    return name.toLowerCase().trim().replace(/\s+/g, " ");
  };

  function calculateTeamRatingImpact(r1, r2, r3, r4) {
    const K = 0.275;
    const q = 2.012;
    const avg1 = (r1 + r2) / 2;
    const avg2 = (r3 + r4) / 2;
    const expected = 1 / (1 + Math.exp(q * (avg1 - avg2)));
    const change = K * (expected - 1);
    return {
      newTeam1Rating1: r1 + change,
      newTeam1Rating2: r2 + change,
      newTeam2Rating1: r3 - change,
      newTeam2Rating2: r4 - change,
      expected
    };
  }

  function formatRating(newR, oldR) {
    const diff = newR - oldR;
    const sign = diff > 0 ? "+" : "";
    return `${newR.toFixed(4)} (${sign}${diff.toFixed(4)})`;
  }

  function formatPlayerLine(name, newRating, oldRating) {
    const delta = newRating - oldRating;
    const arrow = delta < 0 ? "▲" : "▼";
    const color = delta < 0 ? "green" : "red";
    const deltaStr = `<span style="color:${color}; font-weight:bold;">${arrow}${delta.toFixed(4)}</span>`;
    return `${name} (${newRating.toFixed(4)}) ${deltaStr}`;
  }

  const teams = [];
  const playerRatings = {};
  // Baseline (starting) ratings for each player (seeded from teams table, updated on refresh)
  const playerBaselineRatings = {};
  const matchQueue = [];
  // Map from normalized player name to profile URL (for fetching ratings)
  const playerUrls = {};

  // Track which players' ratings changed in the last refresh
  let dssLastChangedPlayers = new Set();
  let dssPanel = null;

  function autoResizePanel(panel) {
    if (!panel || !(panel instanceof HTMLElement)) return;
    try {
      panel.style.width = 'auto';
      panel.style.height = 'auto';
      const minWidth = 340;
      const minHeight = 160;
      const maxWidth = Math.max(window.innerWidth - 40, minWidth);
      const maxHeight = Math.max(window.innerHeight - 40, minHeight);
      const table = panel.querySelector('#matchList');
      const contentWidth = table && table.scrollWidth ? table.scrollWidth + 40 : panel.scrollWidth;
      const width = Math.min(Math.max(contentWidth, minWidth), maxWidth);
      const height = Math.min(Math.max(panel.scrollHeight, minHeight), maxHeight);
      panel.style.width = `${width}px`;
      panel.style.height = `${height}px`;
    } catch (e) {
      console.warn('[DSS] autoResizePanel failed', e);
    }
  }

  // --- Loading UI helpers ---
let dssSpinnerStylesInjected = false;
function ensureSpinnerStyles() {
  if (dssSpinnerStylesInjected) return;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes dss-spin { 0% { transform: rotate(0deg);} 100% { transform: rotate(360deg);} }
    .dss-spinner { width:16px; height:16px; border:2px solid #ccc; border-top-color:#1a73e8; border-radius:50%; animation:dss-spin 0.8s linear infinite; display:inline-block; vertical-align:middle; margin-right:8px; }

    /* DO NOT touch site buttons; only style panel buttons */
    .dss-panel .btn { 
      display: inline-block; 
      border: 1px solid transparent; 
      border-radius: 4px; 
      padding: 8px 12px; 
      font-weight: 600; 
      line-height: 1.2; 
      cursor: pointer; 
      text-align: center; 
      user-select: none; 
      white-space: nowrap; 
    }
    .dss-panel .btn.btn--primary { 
      background-color: #193291; 
      border-color: transparent; 
      box-shadow: 0 1px 4px rgba(25, 50, 145, .5); 
      color: #fff; 
    }
    .dss-panel .btn.btn--primary:hover { 
      background-color: #142672; 
    }
    .dss-panel .btn.btn--primary:disabled { 
      opacity: .65; 
      cursor: default; 
      box-shadow: none; 
    }

    /* --- Mobile responsiveness for Selected Matches panel --- */
    @media (max-width: 640px) {
      .dss-panel {
        position: fixed !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        top: auto !important;
        width: 100% !important;
        min-width: 0 !important;
        max-height: 75vh !important;
        border-radius: 12px 12px 0 0 !important;
        padding: 14px !important;
        box-shadow: 0 -6px 20px rgba(0,0,0,.15) !important;
        background: #f9f9f9 !important;
      }
      .dss-panel #dss-action-row { 
        display: flex; 
        gap: 10px; 
        flex-wrap: wrap; 
        margin-bottom: 12px; 
      }
      .dss-panel #dss-action-row .btn { 
        flex: 1 1 100%; 
        width: 100% !important; 
        justify-content: center; 
      }
      .dss-panel #matchList { 
        font-size: 13px; 
      }
      .dss-panel .dss-table-wrap { 
        overflow-x: visible; 
      }
      .dss-panel .dss-table-wrap table { 
        width: 100%;
        min-width: 0;
      }
      /* Make click targets a bit larger */
      .dss-panel td button { 
        padding: 8px 10px; 
        font-size: 14px; 
      }
    }
  `;
  document.head.appendChild(style);
  dssSpinnerStylesInjected = true;
}

function ensureBlinkStyles() {
  if (document.getElementById('dss-blink-styles')) return;
  const style = document.createElement('style');
  style.id = 'dss-blink-styles';
  style.textContent = `
    @keyframes dss-blink {
      0%, 100% { background-color: transparent; }
      50% { background-color: #a8f0b5; } /* soft green */
    }
    .dss-blink { animation: dss-blink 1.2s ease-in-out 3; }
  `;
  document.head.appendChild(style);
}

// Extra header control button styles for visibility
if (!document.getElementById('dss-header-control-styles')) {
  const hdrStyle = document.createElement('style');
  hdrStyle.id = 'dss-header-control-styles';
  hdrStyle.textContent = `
    /* Header control buttons: higher contrast, clearer hover/focus */
    #dss-btn-collapse, #dss-btn-maximize, #dss-btn-minimize {
      background: #ffffff;
      color: #1f2937; /* dark slate */
      border: 1px solid rgba(0,0,0,0.12);
      box-shadow: 0 1px 2px rgba(0,0,0,0.03);
      font-weight: 600;
      min-width: 30px;
      height: 28px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background .12s ease, transform .06s ease;
      cursor: pointer;
    }
    #dss-btn-collapse:hover, #dss-btn-maximize:hover, #dss-btn-minimize:hover,
    #dss-btn-collapse:focus, #dss-btn-maximize:focus, #dss-btn-minimize:focus {
      background: #f0f4f8;
      transform: translateY(-1px);
      outline: none;
    }
    /* Rounded subtle outline on focus for accessibility */
    #dss-btn-collapse:focus-visible, #dss-btn-maximize:focus-visible, #dss-btn-minimize:focus-visible {
      box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
    }
  `;
  document.head.appendChild(hdrStyle);
}

function setLoading(isLoading, message = "") {
  const loader = document.getElementById('dss-loading');
  const status = document.getElementById('matchStatus');
  const autoBtn = document.getElementById('autoGroupMatchesBtn');
  const refreshBtn = document.getElementById('refreshPlayerRatingsBtn');
  const loadBtn = document.getElementById('loadImportedBtn');
  if (loader) loader.style.display = isLoading ? 'flex' : 'none';
  if (status && message) status.textContent = message;
  [autoBtn, refreshBtn, loadBtn].forEach(btn => { if (btn) btn.disabled = !!isLoading; });
}

  function extractTeamsFromTable() {
    const table = document.querySelectorAll("table.ruler")[1];
    if (!table) {
      console.log("[DSS] No table found for teams extraction.");
      return;
    }

    const rows = table.querySelectorAll("tbody tr");
    rows.forEach((row, index) => {
      const playerCell = row.cells[1];
      const ratingCell = row.cells[3];
      if (!playerCell || !ratingCell) {
        console.log(`[DSS] Skipping row ${index}: Missing player or rating cell.`);
        return;
      }

      // Singles support: allow for 1 player per team
      const playerLinks = playerCell.querySelectorAll("a");
      if (playerLinks.length === 0) {
        console.log(`[DSS] Skipping row ${index}: No player links found.`);
        return;
      }
      // Gather player names and their URLs
      const players = Array.from(playerLinks).map(a => a.textContent.trim());
      Array.from(playerLinks).forEach(a => {
        const name = a.textContent.trim();
        const url = a.getAttribute("href");
        if (url) {
          playerUrls[normalizeName(name)] = url;
        }
      });

      // Ratings extraction: support for single plain text rating
      let ratings = Array.from(ratingCell.querySelectorAll("p")).map(p => parseFloat(p.textContent.replace(",", ".")));
      if (ratings.length === 0) {
        const text = ratingCell.textContent?.trim().replace(",", ".");
        // Try to parse as float directly
        const parsed = parseFloat(text);
        if (!isNaN(parsed)) {
          ratings = [parsed];
        } else {
          // Enhanced fallback: split text on non-digit, non-dot, non-minus characters to extract multiple ratings
          const splits = text.split(/[^0-9\.\-]+/).filter(s => s.trim() !== "");
          const parsedRatings = splits.map(s => parseFloat(s));
          if (parsedRatings.every(r => !isNaN(r))) {
            ratings = parsedRatings;
          } else {
            console.log(`[DSS] Skipping row ${index}: Unable to parse ratings from text '${text}'.`);
            return;
          }
        }
      }

      // Validation: players.length must match ratings.length, and must not be zero
      if (players.length !== ratings.length || players.length === 0) {
        console.log(`[DSS] Skipping row ${index}: Players count (${players.length}) does not match ratings count (${ratings.length}) or zero players.`);
        return;
      }

      const teamKey = players.map(normalizeName).join("|");
      players.forEach((name, i) => {
        const nn = normalizeName(name);
        playerRatings[nn] = ratings[i];
        if (playerBaselineRatings[nn] === undefined) {
          playerBaselineRatings[nn] = ratings[i]; // seed baseline from table; refresh will overwrite
        }
      });

      teams.push({ element: row, players, ratings, teamKey });
      console.log(`[DSS] Added team: ${players.join(" & ")} with ratings: ${ratings.join(", ")}`);
    });
    console.log(`[DSS] Total teams parsed: ${teams.length}`);
    console.log(`[DSS] All teams:`);
    teams.forEach(t => console.log(`  - ${t.players.join(" & ")}`));
    // Removed call to populatePlayerDropdown() from here
  }

  const toAbsUrl = (url) => {
    if (window.KNLTBUtils && typeof window.KNLTBUtils.toAbsUrl === 'function') {
      return window.KNLTBUtils.toAbsUrl(url);
    }
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('/')) return window.location.origin + url;
    try {
      return new URL(url, window.location.href).href;
    } catch (e) {
      return null;
    }
  };

  // Robust match type detector using page title, headings, and context
  function detectMatchTypeFromPage() {
    // Prefer an explicit event title token when available (works on event and draw pages)
    let titleText = '';
    try {
      // If the helper exists (draw/overview pages), prefer it
      const ctx = typeof detectCurrentEventTitles === 'function' ? detectCurrentEventTitles() : null;
      titleText = (ctx && ctx.rawTitle) ? String(ctx.rawTitle) : '';
    } catch (e) { titleText = ''; }

    // If still empty, aggregate likely header/title nodes (cover draw page variations)
    if (!titleText) {
      const candidates = [
        '.page-subhead .media__title .nav-link__value',
        '.module__title .nav-link__value',
        '.module__title',
        '.module__subtitle',
        '.media__title',
        '.page-title',
        '.module__heading',
        '#draw-matches .module__title',
        'h1', 'h2', 'title', 'meta[property="og:title"]'
      ];
      for (const sel of candidates) {
        try {
          if (sel.startsWith('meta')) {
            const m = document.querySelector('meta[property="og:title"]');
            if (m && m.getAttribute('content')) { titleText = m.getAttribute('content'); break; }
            continue;
          }
          const el = document.querySelector(sel);
          if (el) { titleText = (el.textContent || el.getAttribute && el.getAttribute('content')) || ''; break; }
        } catch (e) { continue; }
      }
    }

    titleText = (titleText || document.title || '').toString().toLowerCase().replace(/\s+/g, ' ').trim();

    // Strong signals from title/ambient text
    if (/\bpadel\b/.test(titleText) || /padel\s*double/.test(titleText)) {
      console.log('[DSS] Match type: padel (from title/ambient) →', titleText);
      return 'padel';
    }
    if (/\b(HD|DD|GD)\b/i.test(titleText) || /\bdubbel\b/i.test(titleText) || /\bdoubles?\b/i.test(titleText)) {
      console.log('[DSS] Match type: double (from title/ambient) →', titleText);
      return 'double';
    }
    if (/\b(HE|DE)\b/i.test(titleText) || /\b(enkel|single|singles?)\b/.test(titleText)) {
      console.log('[DSS] Match type: single (from title/ambient) →', titleText);
      return 'single';
    }

    // Team-size heuristic as a reliable fallback (handles draw pages where labels are absent)
    if (Array.isArray(teams) && teams.length) {
      const allSingles = teams.every(t => (t.players || []).length === 1);
      const anyDoubles = teams.some(t => (t.players || []).length === 2);
      if (allSingles) {
        console.log('[DSS] Match type: single (from team size fallback)');
        return 'single';
      }
      if (anyDoubles) {
        console.log('[DSS] Match type: double (from team size fallback)');
        return 'double';
      }
    }

    // Last-chance ambient scan for key tokens anywhere on the page
    try {
      const ambient = Array.from(document.querySelectorAll('body *'))
        .slice(0, 200) // limit scanning cost
        .map(el => (el.textContent || '').toLowerCase())
        .join(' ');
      if (/\bpadel\b/.test(ambient)) return 'padel';
      if (/\bdubbel\b|\bdouble(s)?\b|\b(dd|gd|hd)\b/i.test(ambient)) return 'double';
      if (/\benkel\b|\bsingle(s)?\b|\b(he|de)\b/i.test(ambient)) return 'single';
    } catch (e) {}

    console.log('[DSS] Match type: defaulting to double (no explicit signal)');
    return 'double';
  }
  
  // Async function to refresh all player ratings from their profile URLs
  async function refreshPlayerRatings() {
    console.log("[DSS] Refreshing player ratings from profile URLs...");
    setLoading(true, 'Refreshing player ratings…');

    const prevRatings = { ...playerRatings };

    // Determine match type from page title and context (robust DD/GD/HD vs padel)
    const currentMatchType = detectMatchTypeFromPage();
    console.log('[DSS] Using match type for rating extraction:', currentMatchType);

    for (const [normName, url] of Object.entries(playerUrls)) {
      try {
        // If url is relative, construct absolute URL
        let absUrl = url;
        if (/^\//.test(url)) {
          absUrl = window.location.origin + url;
        }
        const resp = await fetch(absUrl, { credentials: "include" });
        if (!resp.ok) {
          console.warn(`[DSS] Failed to fetch profile for ${normName} (${url}).`);
          continue;
        }
        const html = await resp.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        // Diagnostics: log fetched URL and basic markers
        console.log(`[DSS] Fetched profile for ${normName}: ${absUrl}`);
        const bodyText = doc.body ? doc.body.textContent.slice(0, 200) : '';
        // Detect login/unauthorized pages heuristically
        const looksLikeLogin = /inloggen|login|wachtwoord|password/i.test(bodyText) || doc.querySelector('form[action*="login"], input[type="password"]');
        if (looksLikeLogin) {
          console.warn(`[DSS] Profile fetch appears to be a login page for ${normName}. Skipping.`);
          continue;
        }

        // Robust extraction:
        // Strategy A: pick spans with data-original-title or title and .tag-duo__value, excluding those inside match/schedule/draw modules.
        let ratingsObj = {};
        const EXCLUDE_ANCESTOR_SELECTOR = '.match, .match-group, #draw-matches, .module--matches, .matches, .draw, .tournament, .schedule';
        const tooltipSpans = Array.from(
          doc.querySelectorAll('span.tag-duo[data-original-title], span.tag-duo[title]')
        )
          .filter(span => span.querySelector('.tag-duo__value'))
          .filter(span => !span.closest(EXCLUDE_ANCESTOR_SELECTOR));
        console.log(`[DSS] tooltip spans found (filtered): ${tooltipSpans.length}`);
        tooltipSpans.forEach(span => {
          const typeRaw = (
            span.getAttribute('data-original-title') || span.getAttribute('title') || ''
          ).toLowerCase();
          const valueEl = span.querySelector('.tag-duo__value');
          if (!valueEl) return;
          const raw = valueEl.textContent.trim().replace(/\s+/g, '');
          const numeric = parseFloat(raw.replace(/[^\d,.\-]/g, '').replace(',', '.'));
          if (isNaN(numeric)) return;
          if (typeRaw.includes('single')) ratingsObj.single = numeric;
          if (typeRaw.includes('double') && !typeRaw.includes('padel')) ratingsObj.double = numeric;
          if (typeRaw.includes('padel')) ratingsObj.padel = numeric;
        });
        console.log('[DSS] ratingsObj after tooltip scan:', ratingsObj);
        
        // Strategy B: if A yielded nothing useful, fall back to scanning candidate ULs and pick the best one
        if (
          (ratingsObj.single === undefined || isNaN(ratingsObj.single)) &&
          (ratingsObj.double === undefined || isNaN(ratingsObj.double)) &&
          (ratingsObj.padel === undefined || isNaN(ratingsObj.padel))
        ) {
          const candidateLists = Array.from(doc.querySelectorAll('ul.list--inline.list'));
          const filteredLists = candidateLists.filter(ul => !ul.closest(EXCLUDE_ANCESTOR_SELECTOR));
          function extractFromRoot(root) {
            const res = {};
            root.querySelectorAll('span.tag-duo[data-original-title], span.tag-duo[title]').forEach(span => {
              const type = (
                span.getAttribute('data-original-title') || span.getAttribute('title') || ''
              ).toLowerCase();
              const valueEl = span.querySelector('.tag-duo__value');
              if (!valueEl) return;
              const raw = valueEl.textContent.trim().replace(/\s+/g, '');
              const val = parseFloat(raw.replace(/[^\d,.\-]/g, '').replace(',', '.'));
              if (isNaN(val)) return;
              if (type.includes('single')) res.single = val;
              if (type.includes('double') && !type.includes('padel')) res.double = val;
              if (type.includes('padel')) res.padel = val;
            });
            return res;
          }
          function score(res) {
            let s = 0;
            if (res.single !== undefined && !isNaN(res.single)) s++;
            if (res.double !== undefined && !isNaN(res.double)) s++;
            if (res.padel !== undefined && !isNaN(res.padel)) s++;
            return s;
          }
          let best = null, bestScore = -1, bestIndex = -1;
          const listsToCheck = filteredLists.length ? filteredLists : candidateLists;
          listsToCheck.forEach((ul, idx) => {
            const res = extractFromRoot(ul);
            const s = score(res);
            console.log(`[DSS] Candidate rating list #${idx}:`, res, `score=${s}`);
            if (s > bestScore) { best = res; bestScore = s; bestIndex = idx; }
          });
          if (best) ratingsObj = best;
          console.log(`[DSS] Chosen rating list #${bestIndex}:`, ratingsObj);
        }
        
        // Ultimate fallback: doc-wide search for any tag-duo__value + data-original-title or title pair
        if (
          (ratingsObj.single === undefined || isNaN(ratingsObj.single)) &&
          (ratingsObj.double === undefined || isNaN(ratingsObj.double)) &&
          (ratingsObj.padel === undefined || isNaN(ratingsObj.padel))
        ) {
          doc.querySelectorAll('.tag-duo__value').forEach(valueEl => {
            const container = valueEl.closest('span.tag-duo[data-original-title], span.tag-duo[title]');
            if (!container) return;
            const type = (
              container.getAttribute('data-original-title') || container.getAttribute('title') || ''
            ).toLowerCase();
            const raw = valueEl.textContent.trim().replace(/\s+/g, '');
            const val = parseFloat(raw.replace(/[^\d,.\-]/g, '').replace(',', '.'));
            if (isNaN(val)) return;
            if (type.includes('single')) ratingsObj.single = val;
            if (type.includes('double') && !type.includes('padel')) ratingsObj.double = val;
            if (type.includes('padel')) ratingsObj.padel = val;
          });
          console.log('[DSS] Fallback (doc-wide) rating extraction:', ratingsObj);
        }

        // Pick the rating for the current match type
        let appliedRating = ratingsObj[currentMatchType];
        // Defensive fallback: if not found for type, use any available
        if (appliedRating === undefined || isNaN(appliedRating)) {
          appliedRating = ratingsObj.single ?? ratingsObj.double ?? ratingsObj.padel;
        }

        if (appliedRating !== undefined && !isNaN(appliedRating)) {
          playerRatings[normName] = appliedRating;
          // Update baseline as requested (starting rating should reflect refreshed profile values)
          playerBaselineRatings[normName] = appliedRating;
          // Try to get original name for logging
          let originalName = normName;
          for (const team of teams) {
            for (const p of team.players) {
              if (normalizeName(p) === normName) {
                originalName = p;
                break;
              }
            }
          }
          console.log(
            `[DSS] Updated ratings for ${originalName} (${normName}): ` +
              `Single=${ratingsObj.single ?? "?"}, Double=${ratingsObj.double ?? "?"}, Padel=${ratingsObj.padel ?? "?"}. ` +
              `Applied "${currentMatchType}" rating: ${appliedRating}`
          );
        } else {
          console.warn(`[DSS] Could not extract rating for ${normName} from profile page.`);
        }
      } catch (e) {
        console.warn(`[DSS] Error fetching or parsing profile for ${normName} (${url}):`, e);
      }
    }

    // Compute which players changed
    const changed = new Set();
    for (const [norm, newVal] of Object.entries(playerRatings)) {
      const oldVal = prevRatings[norm];
      if (oldVal === undefined && typeof newVal === 'number') {
        changed.add(norm);
      } else if (typeof newVal === 'number' && typeof oldVal === 'number' && Math.abs(newVal - oldVal) > 1e-6) {
        changed.add(norm);
      }
    }
    dssLastChangedPlayers = changed;

    setLoading(false, 'Ratings refreshed.');
    renderMatches();
  }

  function populatePlayerDropdown() {
  const select = document.getElementById("playerRatingName");
  if (!select) return;

  const seen = new Set();
  const playerNames = [];

  teams.forEach(team => {
    team.players.forEach(name => {
      const norm = normalizeName(name);
      if (!seen.has(norm)) {
        seen.add(norm);
        playerNames.push({ norm, original: name });
      }
    });
  });

  playerNames.sort((a, b) => a.original.localeCompare(b.original));

  select.innerHTML = "";
  playerNames.forEach(({ norm, original }) => {
    const option = document.createElement("option");
    option.value = norm;
    option.textContent = original;
    select.appendChild(option);
  });
}

  function waitForGroupLinks(timeoutMs = 10000) {
    return new Promise(resolve => {
      const hasLinks = () => {
        // Primary: detect rows where Type column says 'Poule' and first column has a link
        const tables = document.querySelectorAll('table.ruler');
        for (const table of tables) {
          const rows = table.querySelectorAll('tbody tr');
          for (const row of rows) {
            const tds = row.querySelectorAll('td');
            if (tds.length >= 3) {
              const typeText = (tds[2].textContent || '').trim().toLowerCase();
              if (/poule/i.test(typeText)) {
                const anchor = tds[0].querySelector('a[href]');
                if (anchor) return true;
              }
            }
          }
        }
        // Fallback: old heuristic on anchor text containing 'Groep'
        return Array.from(document.querySelectorAll('table.ruler a'))
          .some(a => /\bgroep\b/i.test(a.textContent.trim()));
      };

      if (hasLinks()) return resolve(true);

      const obs = new MutationObserver(() => {
        if (hasLinks()) {
          obs.disconnect();
          resolve(true);
        }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });

      setTimeout(() => {
        obs.disconnect();
        resolve(false);
      }, timeoutMs);
    });
  }

  function loadGroupPageViaIframe(url, timeoutMs = 15000) {
    return new Promise((resolve) => {
      try {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = url;
        document.body.appendChild(iframe);

        let done = false;
        const cleanUp = () => {
          if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
        };

        const finish = () => {
          if (done) return;
          done = true;
          try {
            const doc = iframe.contentDocument || iframe.contentWindow?.document;
            resolve(doc || null);
          } catch (e) {
            console.warn('[DSS] [auto] Could not access iframe document for', url, e);
            resolve(null);
          } finally {
            cleanUp();
          }
        };

        iframe.addEventListener('load', () => {
          setTimeout(finish, 1200);
        });

        setTimeout(finish, timeoutMs);
      } catch (e) {
        console.error('[DSS] [auto] Iframe load error for', url, e);
        resolve(null);
      }
    });
  }

  function setupUI() {
    const { panel, contentWrap } = window.KNLTBPanel.createStandardPanel('KNLTB Tools - Draw', {
      id: 'dss-panel',
      className: 'dss-panel',
      top: '80px',
      right: '20px',
      width: '720px',
      minWidth: '520px'
    });
    dssPanel = panel;
    // Restore saved position if any
    try {
      chrome.storage.local.get('dssPanelPos', (res) => {
        const pos = res && res.dssPanelPos;
        if (pos && typeof pos.left === 'number' && typeof pos.top === 'number') {
          panel.style.left = `${pos.left}px`;
          panel.style.top = `${pos.top}px`;
          panel.style.right = '';
        }
      });
    } catch {}

    // Add action button row (flex container)
    const actionRow = document.createElement('div');
    actionRow.id = 'dss-action-row';
    actionRow.style.display = 'flex';
    actionRow.style.gap = '8px';
    actionRow.style.flexWrap = 'wrap';
    actionRow.style.margin = '0 0 12px 0';
    contentWrap.appendChild(actionRow);
    // Add "Automatically detect group matches" button (primary, as <a>)
    const autoGroupsBtn = document.createElement('a');
    autoGroupsBtn.id = 'autoGroupMatchesBtn';
    autoGroupsBtn.href = '#';
    autoGroupsBtn.className = 'btn btn--primary';
    autoGroupsBtn.style.display = 'inline-flex';
    autoGroupsBtn.style.alignItems = 'center';
    autoGroupsBtn.innerHTML = `
      <svg aria-hidden="true" fill="currentColor" width="20" height="20" viewBox="0 0 24 24" style="vertical-align: middle; position: relative; top: -1px; margin-right: 8px;">
        <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.36 7.36 0 0 0-1.63-.94l-.36-2.55a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.55c-.58.23-1.13.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.82 14.52a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.5.4 1.05.72 1.63.94l.36 2.55c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.55c.58-.22 1.13-.54 1.63-.94l2.39.96c.21.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"/>
      </svg>
      Show Matches
    `;
    autoGroupsBtn.onclick = function(e) { e.preventDefault(); autoDetectGroupMatches(); };
    actionRow.appendChild(autoGroupsBtn);

    // "Find all" button: follow each player's link and look for similar categories
    const findAllBtn = document.createElement('a');
    findAllBtn.id = 'findAllSimilarBtn';
    findAllBtn.href = '#';
    findAllBtn.className = 'btn btn--secondary';
    findAllBtn.style.display = 'inline-flex';
    findAllBtn.style.alignItems = 'center';
    findAllBtn.style.marginLeft = '0.5rem';
    findAllBtn.innerHTML = `
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="margin-right:8px;">
        <path d="M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm0 2a5 5 0 1 1 0 10A5 5 0 0 1 10 5z"></path>
        <path d="M21.7 20.3l-4-4 1.4-1.4 4 4-1.4 1.4z"></path>
      </svg>
      <span class="nav-link__value">Find all</span>`;
    findAllBtn.onclick = function(e) { e.preventDefault(); findAllSimilarCategories(); };
    actionRow.appendChild(findAllBtn);

    // Hide the button if no group links are visible on this page (Type = Poule or fallback)
    const hasGroupLinks = (() => {
      const tables = document.querySelectorAll('table.ruler');
      for (const table of tables) {
        const rows = table.querySelectorAll('tbody tr');
        for (const row of rows) {
          const tds = row.querySelectorAll('td');
          if (tds.length >= 3) {
            const typeText = (tds[2].textContent || '').trim().toLowerCase();
            if (/poule/i.test(typeText) && tds[0].querySelector('a[href]')) return true;
          }
        }
      }
      return Array.from(document.querySelectorAll('table.ruler a')).some(a => /\bgroep\b/i.test(a.textContent.trim()));
    })();
    if (!hasGroupLinks) autoGroupsBtn.style.display = 'none';

    // If links are injected later (AJAX), reveal the button when they appear
    waitForGroupLinks(10000).then(found => {
      if (found) autoGroupsBtn.style.display = '';
    });

    // Add "Refresh Player Ratings" button (primary, as <a>)
    const refreshRatingsBtn = document.createElement("a");
    refreshRatingsBtn.id = "refreshPlayerRatingsBtn";
    refreshRatingsBtn.href = "#";
    refreshRatingsBtn.className = 'btn btn--primary';
    refreshRatingsBtn.style.display = 'inline-flex';
    refreshRatingsBtn.style.alignItems = 'center';
    refreshRatingsBtn.style.marginLeft = '0.75rem';
    refreshRatingsBtn.innerHTML = `
      <svg aria-hidden="true"
           width="20" height="20"
           viewBox="-1 -1 26 26"
           fill="currentColor"
           style="vertical-align: middle; position: relative; top: -1px; margin-right: 8px;">
        <path d="M12 6V3L8 7l4 4V8c2.76 0 5 2.24 5 5 0 .34-.03.67-.08 1h2.02c.04-.33.06-.66.06-1 0-3.87-3.13-7-7-7zM7 11c0-.34.03-.67.08-1H5.06c-.04.33-.06.66-.06 1 0 3.87 3.13 7 7 7v3l4-4-4-4v3c-2.76 0-5-2.24-5-5z"/>
      </svg>
      <span class="nav-link__value">Refresh Ratings</span>
    `;
    refreshRatingsBtn.onclick = function(e) { e.preventDefault(); refreshPlayerRatings(); };
    actionRow.appendChild(refreshRatingsBtn);

    const status = document.createElement("div");
    status.id = "matchStatus";
    status.style.margin = "6px 0";
    status.style.fontSize = "12px";
    status.style.fontStyle = "italic";
  contentWrap.appendChild(status);

    // Loading row (spinner + message), hidden by default
    ensureSpinnerStyles();
    ensureBlinkStyles();
    const loadingRow = document.createElement('div');
    loadingRow.id = 'dss-loading';
    loadingRow.style.display = 'none';
    loadingRow.style.alignItems = 'center';
    loadingRow.style.gap = '8px';
    loadingRow.style.margin = '6px 0';
    const spinner = document.createElement('span');
    spinner.className = 'dss-spinner';
    const loadingMsg = document.createElement('span');
    loadingMsg.textContent = 'Working…';
    loadingRow.appendChild(spinner);
    loadingRow.appendChild(loadingMsg);
  contentWrap.appendChild(loadingRow);

    const matchTable = document.createElement("table");
    matchTable.id = "matchList";
    matchTable.style.fontSize = "12px";
    matchTable.style.borderCollapse = "collapse";
    matchTable.style.width = "auto";
    matchTable.style.minWidth = "max-content";
    matchTable.style.whiteSpace = "nowrap";
    matchTable.style.tableLayout = "auto";
    matchTable.style.marginTop = "8px";
    matchTable.style.border = "1px solid #ddd";
    matchTable.innerHTML = `
    <thead>
      <tr style="background:#eee;font-weight:bold">
        <th>Date/Time</th>
        <th>Team 1</th>
        <th>T1 Start</th>
        <th>vs</th>
        <th>Team 2</th>
        <th>T2 Start</th>
        <th>Avg (T1 | T2)</th>
        <th>Win % (T1 | T2)</th>
        <th>Category</th>
        <th>Result</th>
        <th>Winner</th>
      </tr>
    </thead>
    <tbody></tbody>`;
    // Wrap the match table in a horizontally scrollable container for mobile
    const tableWrap = document.createElement('div');
    tableWrap.className = 'dss-table-wrap';
    tableWrap.style.overflowX = 'visible';
    tableWrap.style.maxWidth = '100%';
    tableWrap.appendChild(matchTable);
  contentWrap.appendChild(tableWrap);

    // Summary heading & table
    const summaryTitle = document.createElement('h5');
    summaryTitle.textContent = 'Player rating summary';
    summaryTitle.style.margin = '14px 0 6px 0';
  contentWrap.appendChild(summaryTitle);

    const summaryTable = document.createElement('table');
    summaryTable.id = 'dss-summary';
    summaryTable.style.fontSize = '12px';
    summaryTable.style.borderCollapse = 'collapse';
    summaryTable.style.width = '100%';
    summaryTable.style.maxWidth = "420px"; // keep it compact
    summaryTable.style.margin = "0"; // align left
    summaryTable.innerHTML = `
      <thead>
        <tr style="background:#eee;font-weight:bold">
          <th style="text-align:left;padding:6px 8px;">Player</th>
          <th style="text-align:center;padding:6px 8px;white-space:nowrap;">Start</th>
          <th style="text-align:center;padding:6px 8px;white-space:nowrap;">Current</th>
          <th style="text-align:center;padding:6px 8px;white-space:nowrap;">Δ</th>
        </tr>
      </thead>
      <tbody></tbody>`;
  contentWrap.appendChild(summaryTable);
    // Add zebra striping to summary table rows
    if (!document.getElementById('dss-summary-zebra-style')) {
      const zebra = document.createElement('style');
      zebra.id = 'dss-summary-zebra-style';
      zebra.textContent = `
        #dss-summary tbody tr:nth-child(odd) {
          background-color: #f9f9f9;
        }
      `;
      document.head.appendChild(zebra);
    }
    // Add some padding to table headers for better spacing
    Array.from(matchTable.querySelectorAll('th')).forEach(th => {
      th.style.padding = '6px 8px';
    });

    // --- Add manual player rating adjustment form ---
    const adjustSection = document.createElement("div");
    adjustSection.style.marginTop = "18px";
    adjustSection.style.paddingTop = "10px";
    adjustSection.style.borderTop = "1px solid #ddd";

    const adjustTitle = document.createElement("div");
    adjustTitle.textContent = "Manual Player Rating Adjustment";
    adjustTitle.style.fontWeight = "bold";
    adjustTitle.style.marginBottom = "5px";
    adjustSection.appendChild(adjustTitle);

    const form = document.createElement("form");
    form.id = "playerRatingForm";
    form.style.display = "flex";
    form.style.alignItems = "center";
    form.style.gap = "8px";
    form.autocomplete = "off";

    const nameLabel = document.createElement("label");
    nameLabel.textContent = "Player:";
    nameLabel.style.fontSize = "12px";
    nameLabel.htmlFor = "playerRatingName";
    form.appendChild(nameLabel);

    const nameSelect = document.createElement("select");
    nameSelect.id = "playerRatingName";
    nameSelect.style.width = "140px";
    nameSelect.style.fontSize = "12px";
    nameSelect.required = true;
    form.appendChild(nameSelect);

    const ratingLabel = document.createElement("label");
    ratingLabel.textContent = "Rating:";
    ratingLabel.style.fontSize = "12px";
    ratingLabel.htmlFor = "playerRatingValue";
    form.appendChild(ratingLabel);

    const ratingInput = document.createElement("input");
    ratingInput.type = "number";
    ratingInput.id = "playerRatingValue";
    ratingInput.placeholder = "e.g. 6.123";
    ratingInput.step = "any";
    ratingInput.style.width = "70px";
    ratingInput.style.fontSize = "12px";
    ratingInput.required = true;
    form.appendChild(ratingInput);

    const submitBtn = document.createElement('a');
    submitBtn.id = 'dss-set-rating';
    submitBtn.href = '#';
    submitBtn.className = 'btn btn--primary nav-link';
    submitBtn.innerHTML = `<span class="nav-link__value">Set</span>`;
    // Clicking this anchor should submit the form
    submitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof form.requestSubmit === 'function') {
        form.requestSubmit();
      } else {
        // Fallback for older browsers
        const evt = new Event('submit', { bubbles: true, cancelable: true });
        form.dispatchEvent(evt);
      }
    });
    form.appendChild(submitBtn);

    adjustSection.appendChild(form);

    const feedback = document.createElement("div");
    feedback.id = "playerRatingFeedback";
    feedback.style.fontSize = "11px";
    feedback.style.marginTop = "4px";
    feedback.style.color = "#1a7f1a";
    adjustSection.appendChild(feedback);

  contentWrap.appendChild(adjustSection);

    // Form submit handler: update playerRatings and re-render matches
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      const name = nameSelect.value.trim();
      const ratingStr = ratingInput.value.trim();
      if (!name || !ratingStr) {
        feedback.textContent = "Please enter both name and rating.";
        feedback.style.color = "#b00";
        return;
      }
      const rating = parseFloat(ratingStr.replace(",", "."));
      if (isNaN(rating)) {
        feedback.textContent = "Invalid rating value.";
        feedback.style.color = "#b00";
        return;
      }
      playerRatings[normalizeName(name)] = rating;
      feedback.textContent = `Set rating for "${name}" to ${rating.toFixed(4)}.`;
      feedback.style.color = "#1a7f1a";
      renderMatches();
    });

    document.body.appendChild(panel);
  }

  function attachRowListeners() {
    let selectedTeam = null;
    teams.forEach(team => {
      team.element.style.cursor = "pointer";
      team.element.addEventListener("click", () => {
        if (!selectedTeam) {
          selectedTeam = team;
          team.element.style.backgroundColor = "#d0f0d0";
          document.getElementById("matchStatus").textContent = `Selected: ${team.players.join(" & ")} (waiting for opponent)`;
        } else {
          if (selectedTeam === team) return;
          team.element.style.backgroundColor = "#f0d0d0";
          addMatch(selectedTeam, team);
          selectedTeam.element.style.backgroundColor = "";
          team.element.style.backgroundColor = "";
          selectedTeam = null;
          document.getElementById("matchStatus").textContent = "";
        }
      });
    });
  }

  function addMatch(team1, team2) {
    matchQueue.push({ team1, team2, winner: null });
    renderMatches();
  }

  function renderMatches() {
    // Ensure matches are processed in chronological order (oldest first) because rating calculations depend on order
    try {
      // Stable sort: pair each item with its original index so ties keep import order
      const paired = matchQueue.map((m, i) => ({ m, i, t: getMatchTimestamp(m) }));
      paired.sort((A, B) => {
        const ta = A.t;
        const tb = B.t;
        if (ta === null && tb === null) return A.i - B.i;
        if (ta === null) return 1; // unknown dates go last
        if (tb === null) return -1;
        if (ta === tb) return A.i - B.i;
        return ta - tb;
      });
      for (let idx = 0; idx < paired.length; idx++) matchQueue[idx] = paired[idx].m;
    } catch (e) { console.warn('[DSS] Failed to sort matchQueue by date', e); }

    const table = document.getElementById('matchList');
    const tbody = table ? table.querySelector('tbody') : null;
    if (!tbody) {
      console.warn('[DSS] renderMatches: missing #matchList tbody');
      return;
    }
    tbody.innerHTML = "";

    if (matchQueue.length === 0) {
      const emptyRow = document.createElement('tr');
      const emptyCell = document.createElement('td');
      emptyCell.colSpan = 11;
      emptyCell.textContent = 'No matches loaded yet. Press "Find all" or "Show Matches" to import and display matches.';
      emptyCell.style.padding = '12px 8px';
      emptyCell.style.textAlign = 'center';
      emptyCell.style.color = '#444';
      emptyCell.style.fontStyle = 'italic';
      emptyRow.appendChild(emptyCell);
      tbody.appendChild(emptyRow);
      return;
    }

    let tempRatings = { ...playerRatings };

    matchQueue.forEach((match, index) => {
      // Defensive: skip malformed match entries that don't have expected shape
      if (!match || !match.team1 || !match.team2 || !Array.isArray(match.team1.players) || !Array.isArray(match.team2.players)) {
        try { console.warn('[DSS] Skipping malformed match entry at index', index, match); } catch (e) {}
        return; // skip this entry
      }
      const tr = document.createElement("tr");
      if (index % 2 === 1) tr.style.backgroundColor = "#f2f2f2";

      const tdDate = document.createElement("td");
      const td1 = document.createElement("td");
      const td1r = document.createElement("td");
      const td2 = document.createElement("td");
      td2.textContent = "vs";
      td2.style.textAlign = "center";
      const td3 = document.createElement("td");
      const td3r = document.createElement("td");
      const tdAvg = document.createElement("td");
      const tdProb = document.createElement("td");
  const tdRes = document.createElement("td");
  const tdCat = document.createElement("td");
  const td4 = document.createElement("td");

      // Date/Time cell
      const dateStr = match.dateTime || match.date || '—';
      tdDate.textContent = dateStr;
      tdDate.style.whiteSpace = 'nowrap';
      tdDate.style.textAlign = 'center';

      // Precompute old ratings for display
      const team1OldRatings = match.team1.players.map((p, i) => {
        return tempRatings[normalizeName(p)] ?? 0;
      });
      const team2OldRatings = match.team2.players.map((p, i) => {
        return tempRatings[normalizeName(p)] ?? 0;
      });

      // Set ratings and averages (each rating on its own line)
      const t1RatingsHTML = team1OldRatings
        .map(r => `<div>${(r ?? 0).toFixed(4)}</div>`) 
        .join("");
      const t2RatingsHTML = team2OldRatings
        .map(r => `<div>${(r ?? 0).toFixed(4)}</div>`) 
        .join("");
      td1r.innerHTML = t1RatingsHTML;
      td3r.innerHTML = t2RatingsHTML;
      td1r.style.textAlign = 'right';
      td3r.style.textAlign = 'left';

      const t1Avg = team1OldRatings.length ? team1OldRatings.reduce((a,b)=>a+(b??0),0)/team1OldRatings.length : 0;
      const t2Avg = team2OldRatings.length ? team2OldRatings.reduce((a,b)=>a+(b??0),0)/team2OldRatings.length : 0;
      tdAvg.textContent = `${t1Avg.toFixed(4)} | ${t2Avg.toFixed(4)}`;
      tdAvg.style.textAlign = 'center';
      tdAvg.style.whiteSpace = 'nowrap';
      // Probability calculation and styling
      const qProb = 2.012; // same q as rating function
      const expectedT1 = 1 / (1 + Math.exp(qProb * (t1Avg - t2Avg)));
      tdProb.textContent = `${(expectedT1 * 100).toFixed(1)}% | ${(100 - expectedT1 * 100).toFixed(1)}%`;
      tdProb.style.textAlign = 'center';
      tdProb.style.whiteSpace = 'nowrap';

  // Category column
  tdCat.textContent = match.category || '—';
  tdCat.style.textAlign = 'center';
  tdCat.style.whiteSpace = 'nowrap';

  // Result column (render set scores if available). If no score but we have a special
      // result flag (walkover/opgave), display that instead of a dash.
      if (Array.isArray(match.score) && match.score.length) {
        const resStr = match.score.map(p => `${p[0]}-${p[1]}`).join(' ');
        tdRes.textContent = resStr;
      } else if (match.result) {
        const r = (match.result || '').toLowerCase();
        if (r === 'walkover') tdRes.textContent = 'Walkover';
        else if (r === 'opgave') tdRes.textContent = 'Opgave';
        else tdRes.textContent = (match.result || '—');
      } else {
        tdRes.textContent = '—';
      }
      tdRes.style.textAlign = 'center';
      tdRes.style.whiteSpace = 'nowrap';

      // Blink rating cells if any player on that team changed in the last refresh
      const t1Changed = match.team1.players.some(p => dssLastChangedPlayers.has(normalizeName(p)));
      const t2Changed = match.team2.players.some(p => dssLastChangedPlayers.has(normalizeName(p)));
      if (t1Changed) { td1r.classList.remove('dss-blink'); void td1r.offsetWidth; td1r.classList.add('dss-blink'); }
      if (t2Changed) { td3r.classList.remove('dss-blink'); void td3r.offsetWidth; td3r.classList.add('dss-blink'); }
      if (t1Changed || t2Changed) { tdAvg.classList.remove('dss-blink'); void tdAvg.offsetWidth; tdAvg.classList.add('dss-blink'); }

      // Add padding so columns don't "touch"
  [tdDate, td1r, td3r, tdAvg, tdProb, tdCat, tdRes, td2, td4].forEach(td => { td.style.padding = '4px 8px'; });

      // Default: just show names (no ratings)
      td1.innerHTML = match.team1.players.map((p, i) => `<div>${p}</div>`).join("");
      td3.innerHTML = match.team2.players.map((p, i) => `<div>${p}</div>`).join("");
      td1.style.textAlign = "left";
      td1.style.padding = "4px 8px";
      td3.style.textAlign = "left";
      td3.style.padding = "4px 8px";
      tr.style.lineHeight = '1.3';

      ["team1", "team2"].forEach(side => {
        const btn = document.createElement("button");
        btn.textContent = side === "team1" ? "⬅️" : "➡️";
        btn.style.margin = "0 4px";
        btn.onclick = () => {
          match.winner = side;
          recomputeRatings();
        };
        td4.appendChild(btn);
      });

      tr.appendChild(tdDate);
      tr.appendChild(td1);
      tr.appendChild(td1r);
      tr.appendChild(td2);
      tr.appendChild(td3);
      tr.appendChild(td3r);
  tr.appendChild(tdAvg);
  tr.appendChild(tdProb);
  tr.appendChild(tdCat);
  tr.appendChild(tdRes);
  tr.appendChild(td4);

      if (match.winner) {
        // Detect special result flags
        const resFlag = match.result || null;
        const teamSize = (match.team1 && Array.isArray(match.team1.players) ? match.team1.players.length : (Array.isArray(match.team1) ? match.team1.length : 0)) || 0;
        const isDoublesOrPadel = teamSize === 2;
        const skipRatingImpact = (resFlag === 'walkover' && isDoublesOrPadel);

        // Defensive: fallback to 0 if player missing, fallback to [0] rating if only one player
        const r1 = team1OldRatings[0];
        const r2 = match.team1.players[1] ? team1OldRatings[1] : r1;
        const r3 = team2OldRatings[0];
        const r4 = match.team2.players[1] ? team2OldRatings[1] : r3;

        if (skipRatingImpact) {
          // Walkover in doubles: visually show winner but do not change ratings
          if (match.winner === 'team1') {
            td1.style.backgroundColor = "#d0ffd0";
            td3.style.backgroundColor = "#ffd0d0";
          } else {
            td3.style.backgroundColor = "#d0ffd0";
            td1.style.backgroundColor = "#ffd0d0";
          }
          td1.innerHTML = match.team1.players.map((p) => `<div>${p}</div>`).join("");
          td3.innerHTML = match.team2.players.map((p) => `<div>${p}</div>`).join("");
        } else {
          const impact = match.winner === "team1"
            ? calculateTeamRatingImpact(r1, r2, r3, r4)
            : calculateTeamRatingImpact(r3, r4, r1, r2);

          if (match.winner === "team1") {
            if (match.team1.players[0]) {
              tempRatings[normalizeName(match.team1.players[0])] = impact.newTeam1Rating1;
            }
            if (match.team1.players[1]) {
              tempRatings[normalizeName(match.team1.players[1])] = impact.newTeam1Rating2;
            }
            if (match.team2.players[0]) {
              tempRatings[normalizeName(match.team2.players[0])] = impact.newTeam2Rating1;
            }
            if (match.team2.players[1]) {
              tempRatings[normalizeName(match.team2.players[1])] = impact.newTeam2Rating2;
            }

            td1.style.backgroundColor = "#d0ffd0";
            td3.style.backgroundColor = "#ffd0d0";

            // Show starting rating and change for each player
            td1.innerHTML = match.team1.players.map((p, i) => {
              const oldR = i === 0 ? r1 : r2;
              const newR = i === 0 ? impact.newTeam1Rating1 : impact.newTeam1Rating2;
              const delta = newR - oldR;
              const arrow = delta < 0 ? "▲" : "▼";
              const color = delta < 0 ? "green" : "red";
              return `<div>${p} (${oldR.toFixed(4)} → ${newR.toFixed(4)}) <span style="color:${color}; font-weight:bold;">${arrow}${Math.abs(delta).toFixed(4)}</span></div>`;
            }).join("");
            td3.innerHTML = match.team2.players.map((p, i) => {
              const oldR = i === 0 ? r3 : r4;
              const newR = i === 0 ? impact.newTeam2Rating1 : impact.newTeam2Rating2;
              const delta = newR - oldR;
              const arrow = delta < 0 ? "▲" : "▼";
              const color = delta < 0 ? "green" : "red";
              return `<div>${p} (${oldR.toFixed(4)} → ${newR.toFixed(4)}) <span style="color:${color}; font-weight:bold;">${arrow}${Math.abs(delta).toFixed(4)}</span></div>`;
            }).join("");
          } else {
            if (match.team2.players[0]) {
              tempRatings[normalizeName(match.team2.players[0])] = impact.newTeam1Rating1;
            }
            if (match.team2.players[1]) {
              tempRatings[normalizeName(match.team2.players[1])] = impact.newTeam1Rating2;
            }
            if (match.team1.players[0]) {
              tempRatings[normalizeName(match.team1.players[0])] = impact.newTeam2Rating1;
            }
            if (match.team1.players[1]) {
              tempRatings[normalizeName(match.team1.players[1])] = impact.newTeam2Rating2;
            }

            td3.style.backgroundColor = "#d0ffd0";
            td1.style.backgroundColor = "#ffd0d0";

            td3.innerHTML = match.team2.players.map((p, i) => {
              const oldR = i === 0 ? r3 : r4;
              const newR = i === 0 ? impact.newTeam1Rating1 : impact.newTeam1Rating2;
              const delta = newR - oldR;
              const arrow = delta < 0 ? "▲" : "▼";
              const color = delta < 0 ? "green" : "red";
              return `<div>${p} (${oldR.toFixed(4)} → ${newR.toFixed(4)}) <span style="color:${color}; font-weight:bold;">${arrow}${Math.abs(delta).toFixed(4)}</span></div>`;
            }).join("");
            td1.innerHTML = match.team1.players.map((p, i) => {
              const oldR = i === 0 ? r1 : r2;
              const newR = i === 0 ? impact.newTeam2Rating1 : impact.newTeam2Rating2;
              const delta = newR - oldR;
              const arrow = delta < 0 ? "▲" : "▼";
              const color = delta < 0 ? "green" : "red";
              return `<div>${p} (${oldR.toFixed(4)} → ${newR.toFixed(4)}) <span style="color:${color}; font-weight:bold;">${arrow}${Math.abs(delta).toFixed(4)}</span></div>`;
            }).join("");
          }
        }
      }

      tbody.appendChild(tr);
    });
    
    // --- Build Player Rating Summary (grouped by team) ---
    const summaryTable = document.getElementById('dss-summary');
    if (summaryTable) {
      const sBody = summaryTable.querySelector('tbody');
      sBody.innerHTML = '';
      // Collect unique teams from the match queue (both sides)
      const teamList = [];
      const seenTeams = new Set();
      const keyForTeam = (t) => (t.players || []).map(p => normalizeName(p)).sort().join('|');
      matchQueue.forEach(m => {
        [m.team1, m.team2].forEach(t => {
          if (!t || !t.players) return;
          const k = keyForTeam(t);
          if (!seenTeams.has(k)) { seenTeams.add(k); teamList.push(t); }
        });
      });
      // Fallback: if no matches yet, show teams parsed from table
      if (teamList.length === 0 && Array.isArray(teams)) {
        teams.forEach(t => {
          const k = keyForTeam(t);
          if (!seenTeams.has(k)) { seenTeams.add(k); teamList.push(t); }
        });
      }

      // Ensure baseline exists for all players present
      const ensureBaseline = (p) => {
        const nn = normalizeName(p);
        if (playerBaselineRatings[nn] === undefined && playerRatings[nn] !== undefined) {
          playerBaselineRatings[nn] = playerRatings[nn];
        }
      };

      teamList.forEach((t, ti) => {
        (t.players || []).forEach(p => ensureBaseline(p));
        // Render each player as a row; keep teammates adjacent
        (t.players || []).forEach((p, idx) => {
          const nn = normalizeName(p);
          const start = playerBaselineRatings[nn];
          const current = tempRatings[nn] ?? playerRatings[nn] ?? start ?? 0;
          const diff = (current ?? 0) - (start ?? 0);

          const trS = document.createElement('tr');
          // Use zebra striping alternating by team index, not per player
          const zebraByTeam = (ti % 2) === 1;
          trS.style.backgroundColor = zebraByTeam ? '#f7f7f7' : '#ffffff';

          const tdName = document.createElement('td');
          tdName.textContent = p;
          tdName.style.padding = '4px 8px';
          tdName.style.whiteSpace = 'nowrap';

          const tdStart = document.createElement('td');
          tdStart.textContent = (start !== undefined) ? Number(start).toFixed(4) : '—';
          tdStart.style.textAlign = 'center';
          tdStart.style.padding = '4px 8px';

          const tdCurr = document.createElement('td');
          tdCurr.textContent = (current !== undefined) ? Number(current).toFixed(4) : '—';
          tdCurr.style.textAlign = 'center';
          tdCurr.style.padding = '4px 8px';

          const tdDiff = document.createElement('td');
          const sign = (diff > 0 ? '+' : '');
          tdDiff.innerHTML = `<span style="color:${diff < 0 ? 'green' : (diff > 0 ? 'red' : '#555')};font-weight:bold;">${sign}${diff.toFixed(4)}</span>`;
          tdDiff.style.textAlign = 'center';
          tdDiff.style.padding = '4px 8px';

          trS.appendChild(tdName);
          trS.appendChild(tdStart);
          trS.appendChild(tdCurr);
          trS.appendChild(tdDiff);
          sBody.appendChild(trS);
        });
        // Separator row between teams for visual grouping
        const sep = document.createElement('tr');
        sep.style.background = 'transparent';
        const sepTd = document.createElement('td');
        sepTd.colSpan = 4;
        sepTd.style.height = '6px';
        sep.appendChild(sepTd);
        sBody.appendChild(sep);
      });
    }
    // After rendering once, clear the changed-set so blink only happens immediately after refresh
    if (dssLastChangedPlayers && dssLastChangedPlayers.size) {
      setTimeout(() => { dssLastChangedPlayers = new Set(); }, 0);
    }
    autoResizePanel(dssPanel);
  }

  function recomputeRatings() {
    renderMatches();
  }

function findTeamByPlayers(playerNames) {
  const normSet = new Set(playerNames.map(normalizeName));
  const foundTeam = teams.find(team => {
    const teamSet = new Set(team.players.map(normalizeName));
    const normSize = normSet.size;
    const teamSize = teamSet.size;
    const isExactMatch = normSize === teamSize && [...normSet].every(p => teamSet.has(p));
    if (isExactMatch) {
      console.log(`[DSS] Exact match found: imported players [${[...normSet].join(", ")}] match team [${[...teamSet].join(", ")}]`);
      return true;
    }
    // Allow partial matches if one set is subset of the other (allow one player difference)
    const isSubset = [...normSet].every(p => teamSet.has(p));
    const isSuperset = [...teamSet].every(p => normSet.has(p));
    if ((isSubset && (teamSize - normSize) <= 1) || (isSuperset && (normSize - teamSize) <= 1)) {
      console.log(`[DSS] Partial match accepted: imported players [${[...normSet].join(", ")}] partial match with team [${[...teamSet].join(", ")}]`);
      return true;
    }
    console.log(`[DSS] No match: imported players [${[...normSet].join(", ")}] vs team [${[...teamSet].join(", ")}]`);
    return false;
  });
  return foundTeam;
}

// Create a stable signature for a match so we can deduplicate matches across
// sources. Accepts either imported-match objects ({team1: [...], team2:[...], score, date/dateTime})
// or internal matchQueue entries ({team1: {players:[...]}, team2:{players:[...]}, score, date/dateTime}).
function matchSignature(m) {
  try {
    const t1 = Array.isArray(m.team1) ? m.team1 : (m.team1 && Array.isArray(m.team1.players) ? m.team1.players : []);
    const t2 = Array.isArray(m.team2) ? m.team2 : (m.team2 && Array.isArray(m.team2.players) ? m.team2.players : []);
    const norm = (arr) => (arr || []).map(s => normalizeName(String(s || ''))).filter(Boolean).sort().join('|');
    const s1 = norm(t1);
    const s2 = norm(t2);
    // Make team part order-insensitive so TeamA vs TeamB == TeamB vs TeamA
    const teamsSorted = [s1, s2].sort().join('||');
    // Normalize date to YYYY-MM-DD if possible (inputs like '8-9-2025' or '8-9-2025 19:45')
    const rawDate = (m.dateTime || m.date || '') + '';
    let dateSig = '';
    try {
      const dmatch = rawDate.match(/(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/);
      if (dmatch) {
        const dd = dmatch[1].padStart(2, '0');
        const mm = dmatch[2].padStart(2, '0');
        const yyyy = dmatch[3];
        dateSig = `${yyyy}-${mm}-${dd}`;
      } else if (rawDate.trim()) {
        // fallback: use raw trimmed text (shortened) to avoid completely ignoring date differences
        dateSig = rawDate.trim().slice(0, 32);
      }
    } catch (e) { dateSig = rawDate + ''; }
    const score = Array.isArray(m.score) ? JSON.stringify(m.score) : '';
    return `${teamsSorted}::${dateSig}::${score}`;
  } catch (e) {
    return JSON.stringify(m);
  }
}

// Parse a match's date/dateTime fields into a numeric timestamp (ms since epoch).
// Supports formats like '8-9-2025', '8-9-2025 19:45', '2025-09-08', and ISO-like strings.
function getMatchTimestamp(m) {
  try {
    let raw = (m && (m.dateTime || m.date || '') || '').toString().trim();
    if (!raw) return null;
    // Strip common weekday prefixes like 'ma', 'di', 'wo', 'do', 'vr', 'za', 'zo' or localized weekday words
    raw = raw.replace(/^\s*(ma|di|wo|do|vr|za|zo|mon|tue|wed|thu|fri|sat|sun)\b\.?,?\s*/i, '');
    // Extract the first date-like token (supports 'D-M-YYYY' with optional time)
    const dtMatch = raw.match(/(\d{1,2}[\.\-/]\d{1,2}[\.\-/]\d{4}(?:\s+\d{1,2}:\d{2})?)/);
    if (dtMatch) {
      const token = dtMatch[1];
      // Try parsing token parts
      const dmy = token.match(/(\d{1,2})[\.\-/](\d{1,2})[\.\-/](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
      if (dmy) {
        const dd = parseInt(dmy[1], 10);
        const mon = parseInt(dmy[2], 10) - 1;
        const yyyy = parseInt(dmy[3], 10);
        const hh = dmy[4] ? parseInt(dmy[4], 10) : 0;
        const mi = dmy[5] ? parseInt(dmy[5], 10) : 0;
        const dt = new Date(yyyy, mon, dd, hh, mi, 0);
        return dt.getTime();
      }
    }

    // ISO-like fallback
    const iso = Date.parse(raw);
    if (!Number.isNaN(iso)) return iso;

    // Try YYYY-MM-DD patterns
    const ymd = raw.match(/(\d{4})[\.\-/](\d{1,2})[\.\-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{2}))?/);
    if (ymd) {
      const yyyy = parseInt(ymd[1], 10);
      const mon = parseInt(ymd[2], 10) - 1;
      const dd = parseInt(ymd[3], 10);
      const hh = ymd[4] ? parseInt(ymd[4], 10) : 0;
      const mi = ymd[5] ? parseInt(ymd[5], 10) : 0;
      const dt = new Date(yyyy, mon, dd, hh, mi, 0);
      return dt.getTime();
    }
  } catch (e) {
    console.warn('[DSS] getMatchTimestamp parse error for', m, e);
  }
  return null;
}

  function loadImportedMatches() {
    // Read both importedMatches and the optional importedProfilesCache created by the crawler
    chrome.storage.local.get(["importedMatches", "importedProfilesCache"], (result) => {
      const imported = result.importedMatches;
      const importedProfilesCache = result.importedProfilesCache || { profiles: {}, ratings: {} };
      if (!imported || !Array.isArray(imported)) return;

      // Determine expected team size from current page context so we don't import
      // singles when the current page is a doubles match overview (and vice versa).
      const pageMatchType = detectMatchTypeFromPage();
      let requiredTeamSize = null;
      if (pageMatchType === 'double' || pageMatchType === 'padel') requiredTeamSize = 2;
      else if (pageMatchType === 'single') requiredTeamSize = 1;
      console.log('[DSS] loadImportedMatches: page match type=', pageMatchType, 'requiredTeamSize=', requiredTeamSize);

      let importedCount = 0;
      // Build a set of existing match signatures to avoid pushing duplicates
      const existingSigs = new Set(matchQueue.map(mq => matchSignature(mq)));
      // Also maintain a relaxed set that ignores date/time differences (teams+score only)
      const existingRelaxed = new Set(Array.from(existingSigs).map(s => {
        // relaxed form: drop the date/score suffix if present (teams::date::score -> teams::)
        const parts = s.split('::');
        return parts[0] + '::' + (parts[2] || '');
      }));
      // Also dedupe the imported array itself by signature
      const seenImported = new Set();
      // We'll process imports sequentially but may await rating fetches inside loop
      const processPromise = (async function processImported() {
      for (let idx = 0; idx < imported.length; idx++) {
        const impRaw = imported[idx];
        const { team1, team2, winner, score, date, dateTime, _playerProfiles, result } = impRaw;
          // If the page expects doubles (or singles), drop imports that don't match the team size.
          try {
            const t1len = Array.isArray(team1) ? team1.length : (team1 && Array.isArray(team1.players) ? team1.players.length : 0);
            const t2len = Array.isArray(team2) ? team2.length : (team2 && Array.isArray(team2.players) ? team2.players.length : 0);
            if (requiredTeamSize !== null && (t1len !== requiredTeamSize || t2len !== requiredTeamSize)) {
              console.log('[DSS] Skipping imported match due to team-size mismatch vs page type - expected', requiredTeamSize, 'got', t1len, '&', t2len, 'for imported match #', idx+1);
              continue;
            }
          } catch (e) {
            // Fall through to normal handling if something unexpected in shape
          }

          const imp = { team1, team2, winner, score, date, dateTime, _playerProfiles };
  const sig = matchSignature(imp);
        if (seenImported.has(sig)) {
          console.log('[DSS] Skipping duplicate imported match (dupe in imported array) #', idx+1);
          continue;
        }
        seenImported.add(sig);
        if (existingSigs.has(sig)) {
          console.log('[DSS] Skipping import because exact match already exists in queue #', idx+1);
          continue;
        }
        // relaxed signature: ignore date/time differences so we don't import duplicates that only differ by missing/variant dates
        const parts = sig.split('::');
        const relaxedSig = (parts[0] || '') + '::' + (parts[2] || '');
        if (existingRelaxed.has(relaxedSig)) {
          console.log('[DSS] Skipping import because a matching teams+score entry already exists in queue #', idx+1);
          continue;
        }
  console.log("===============================================");
  console.log(`[DSS] Processing imported match #${idx + 1}:`);
  console.log(`[DSS] Looking for Team1: [${(team1||[]).join(", ")}]`);
  console.log(`[DSS] Looking for Team2: [${(team2||[]).join(", ")}]`);
        // Show normalized player names for debug
        const normTeam1 = team1.map(normalizeName);
        const normTeam2 = team2.map(normalizeName);
        console.log(`[DSS] Normalized Team1 player names: [${normTeam1.join(", ")}]`);
        console.log(`[DSS] Normalized Team2 player names: [${normTeam2.join(", ")}]`);
        // Ensure we have ratings for imported players where possible. If playerBaselineRatings or playerRatings
        // are missing for a normalized player name, attempt to fetch from stored profile URL or global playerUrls map.
        // Also try fuzzy matching (surname/substring) against any attached _playerProfiles and global playerUrls.
          const findProfileRatingForName = (nn) => {
          try {
            // safety: normalize requested key
            const want = normalizeName(nn);
            // exact rating in imported match metadata
            if (_playerProfiles && _playerProfiles.__ratings && _playerProfiles.__ratings[want]) {
              return { rating: _playerProfiles.__ratings[want], url: _playerProfiles[want] || null, key: want };
            }
            // exact profile url in imported match metadata
            if (_playerProfiles && _playerProfiles[want]) {
              return { rating: (_playerProfiles.__ratings && _playerProfiles.__ratings[want]) || null, url: _playerProfiles[want], key: want };
            }

            // consult global cache created during crawling (normalized keys expected)
            if (importedProfilesCache) {
              try {
                if (importedProfilesCache.ratings && importedProfilesCache.ratings[want]) {
                  return { rating: importedProfilesCache.ratings[want], url: importedProfilesCache.profiles && importedProfilesCache.profiles[want] || null, key: want };
                }
                if (importedProfilesCache.profiles && importedProfilesCache.profiles[want]) {
                  return { rating: (importedProfilesCache.ratings && importedProfilesCache.ratings[want]) || null, url: importedProfilesCache.profiles[want], key: want };
                }
              } catch (e) { console.warn('[DSS] consulting importedProfilesCache failed', e); }
            }

            // surname-first / initials-stripped fallback
            const parts = want.split(' ').filter(Boolean);
            const surname = parts.length ? parts[parts.length - 1] : want;
            const stripped = parts.map(p => p.replace(/^[a-z]\.?$/i, '')).filter(Boolean).join(' ');
            // Helper to attempt matching inside a map by fuzzy surname or substring
            const fuzzySearchMap = (map) => {
              for (const k of Object.keys(map || {})) {
                if (!k) continue;
                if (k === want) return k;
                if (k.includes(surname) || surname.includes(k)) return k;
                if (stripped && (k.includes(stripped) || stripped.includes(k))) return k;
                // try last-name-only compare
                const kParts = k.split(' ').filter(Boolean);
                const kSurname = kParts.length ? kParts[kParts.length-1] : k;
                if (kSurname === surname) return k;
              }
              return null;
            };

            // Check imported match metadata first
            try {
              const rmap = (_playerProfiles && _playerProfiles.__ratings) ? _playerProfiles.__ratings : {};
              let fk = fuzzySearchMap(rmap);
              if (fk) return { rating: rmap[fk], url: (_playerProfiles && _playerProfiles[fk]) || null, key: fk };
              const pkeys = _playerProfiles ? Object.keys(_playerProfiles).filter(x => x !== '__ratings') : [];
              fk = fuzzySearchMap(Object.fromEntries(pkeys.map(k => [k, _playerProfiles[k]])));
              if (fk) return { rating: (_playerProfiles.__ratings && _playerProfiles.__ratings[fk]) || null, url: _playerProfiles[fk], key: fk };
            } catch (e) {}

            // Check global importedProfilesCache maps
            try {
              let fk = fuzzySearchMap(importedProfilesCache && importedProfilesCache.ratings ? importedProfilesCache.ratings : {});
              if (fk) return { rating: importedProfilesCache.ratings[fk], url: importedProfilesCache.profiles && importedProfilesCache.profiles[fk] || null, key: fk };
              fk = fuzzySearchMap(importedProfilesCache && importedProfilesCache.profiles ? importedProfilesCache.profiles : {});
              if (fk) return { rating: importedProfilesCache.ratings && importedProfilesCache.ratings[fk] || null, url: importedProfilesCache.profiles[fk], key: fk };
            } catch (e) {}

            // global playerUrls fallback
            try {
              let fk = fuzzySearchMap(playerUrls);
              if (fk) return { rating: (playerBaselineRatings[fk] !== undefined ? playerBaselineRatings[fk] : (playerRatings[fk] !== undefined ? playerRatings[fk] : null)), url: playerUrls[fk], key: fk };
            } catch (e) {}
          } catch (e) { console.warn('[DSS] findProfileRatingForName error for', nn, e); }
          return null;
        };

        const ensureRatingsForPlayers = async (playerArray, preferredMatchTypeToken = null) => {
          if (!Array.isArray(playerArray)) return;
          for (const pn of playerArray) {
            try {
              const nn = normalizeName(pn);
              if (playerRatings[nn] !== undefined && typeof playerRatings[nn] === 'number') continue;
              // First, try to find a rating or URL via fuzzy/exact lookups in the imported match's metadata and global maps
              try {
                const candidate = findProfileRatingForName(nn);
                if (candidate) {
                  if (candidate.rating !== null && candidate.rating !== undefined) {
                    playerRatings[nn] = candidate.rating;
                    if (playerBaselineRatings[nn] === undefined) playerBaselineRatings[nn] = candidate.rating;
                    console.log('[DSS] Seeded rating from candidate match data for', pn, nn, candidate.rating, 'matchedKey=', candidate.key);
                    continue;
                  }
                  if (candidate.url) {
                    const pref = preferredMatchTypeToken ? tokenToMatchType(preferredMatchTypeToken) : null;
                    const val = await fetchProfileRating(candidate.url, pref || pageMatchType);
                    if (val !== null) {
                      playerRatings[nn] = val;
                      if (playerBaselineRatings[nn] === undefined) playerBaselineRatings[nn] = val;
                      console.log('[DSS] Seeded rating from profile (candidate url) for', pn, nn, val, 'matchedKey=', candidate.key);
                      continue;
                    } else {
                      console.log('[DSS] fetchProfileRating returned null for candidate url', pn, nn, candidate.url);
                    }
                  }
                }
              } catch (e) { console.warn('[DSS] candidate lookup failed for', pn, e); }

              // If we reach here, nothing was found
              console.log('[DSS] No profile URL or rating candidate found for', pn, nn);
              try { console.log('[DSS] Imported match _playerProfiles snapshot:', JSON.parse(JSON.stringify(_playerProfiles || {}))); } catch(e){}
            } catch (e) { console.warn('[DSS] ensureRatingsForPlayers error for', pn, e); }
          }
        };

        // Try to infer category token from the imported match set or surrounding metadata; prefer doubles/singles
        let inferredToken = null;
        try {
          // If the imported match came with a category token stored under _playerProfiles (rare), use that
          // Otherwise let token detection remain null and prefer pageMatchType in fetchProfileRating
          inferredToken = null;
        } catch (e) { inferredToken = null; }

        // Pre-fetch ratings for both teams in parallel
        try {
          await Promise.all([ensureRatingsForPlayers(team1, inferredToken), ensureRatingsForPlayers(team2, inferredToken)]);
        } catch (e) { console.warn('[DSS] Pre-fetch ratings failed for imported match #', idx+1, e); }

        const matchTeam1 = findTeamByPlayers(team1);
        const matchTeam2 = findTeamByPlayers(team2);
        if (matchTeam1) {
          console.log(`[DSS] Found matching team for Team1: [${matchTeam1.players.join(", ")}]`);
        } else {
          console.log(`[DSS] Imported match team1 not found: [${team1.join(", ")}]`);
        }
        if (matchTeam2) {
          console.log(`[DSS] Found matching team for Team2: [${matchTeam2.players.join(", ")}]`);
        } else {
          console.log(`[DSS] Imported match team2 not found: [${team2.join(", ")}]`);
        }
        // If either team isn't found among parsed teams, create a synthetic team object so the match
        // can still be displayed in the overview. Seed baseline ratings from known playerRatings when available.
        let finalTeam1 = matchTeam1;
        let finalTeam2 = matchTeam2;
        if (!finalTeam1) {
          finalTeam1 = { players: Array.isArray(team1) ? team1.slice() : [], teamKey: (Array.isArray(team1) ? team1.map(normalizeName).join('|') : '') };
          (finalTeam1.players || []).forEach(p => {
            try { const nn = normalizeName(p); if (playerBaselineRatings[nn] === undefined && typeof playerRatings[nn] === 'number') playerBaselineRatings[nn] = playerRatings[nn]; } catch(e){}
          });
          console.log('[DSS] Created synthetic Team1 for import:', finalTeam1.players.join(', '));
        }
        if (!finalTeam2) {
          finalTeam2 = { players: Array.isArray(team2) ? team2.slice() : [], teamKey: (Array.isArray(team2) ? team2.map(normalizeName).join('|') : '') };
          (finalTeam2.players || []).forEach(p => {
            try { const nn = normalizeName(p); if (playerBaselineRatings[nn] === undefined && typeof playerRatings[nn] === 'number') playerBaselineRatings[nn] = playerRatings[nn]; } catch(e){}
          });
          console.log('[DSS] Created synthetic Team2 for import:', finalTeam2.players.join(', '));
        }
          if (finalTeam1 && finalTeam2) {
          const initialWinner = (winner === 'team1' || winner === 'team2') ? winner : null;
          const initialScore = Array.isArray(score) ? score : null;
          const candidate = { team1: finalTeam1, team2: finalTeam2, winner: initialWinner, score: initialScore, date: date || null, dateTime: dateTime || null, result: result || null, category: impRaw.category || null };
          const candSig = matchSignature(candidate);
          const candParts = candSig.split('::');
          const candRelaxed = (candParts[0] || '') + '::' + (candParts[2] || '');
          if (existingSigs.has(candSig)) {
            console.log('[DSS] Skipping push: candidate exact match already present in queue');
          } else if (existingRelaxed.has(candRelaxed)) {
            console.log('[DSS] Skipping push: candidate teams+score already present in queue (date mismatch)');
          } else {
            matchQueue.push(candidate);
            existingSigs.add(candSig);
            existingRelaxed.add(candRelaxed);
            importedCount++;
          }
          console.log(`[DSS] Imported winner: ${initialWinner ?? 'none'}, score=${initialScore ? initialScore.map(p => `${p[0]}-${p[1]}`).join(' ') : 'n/a'}`);
          console.log(`[DSS] Imported winner: ${initialWinner ?? 'none'}`);
          console.log(`[DSS] Pushed imported match: Team1=[${team1.join(", ")}], Team2=[${team2.join(", ")}], date=${date || '—'}${dateTime ? ` (${dateTime})` : ''}`);
        }
  }
  })();

      // When processing completes, render the updated queue, update UI and clear stored imports
      processPromise.then(() => {
        try {
          console.log('[DSS] render after import: matchQueue length=', matchQueue.length, 'sample=', matchQueue.slice(0,3));
          renderMatches();
        } catch (e) { console.warn('[DSS] renderMatches after import failed', e); }
        // Update status element to show number of imported matches
        const status = document.getElementById("matchStatus");
        if (status && importedCount > 0) {
          status.textContent = `Imported ${importedCount} match${importedCount === 1 ? "" : "es"} from schedule.`;
        }
        console.log("[DSS] Imported matches added to match queue.");
        // Optionally clear them after loading
        try { chrome.storage.local.remove("importedMatches"); } catch (e) { console.warn('[DSS] Failed to remove importedMatches', e); }
      }).catch(e => {
        console.warn('[DSS] processImported failed', e);
        try { console.log('[DSS] render on failure: matchQueue length=', matchQueue.length); renderMatches(); } catch (e) {}
        try { chrome.storage.local.remove("importedMatches"); } catch (e) {}
      });
    });
  }

  async function autoDetectGroupMatches() {
    setLoading(true, 'Detecting group matches…');
    try {
      // Wait for dynamic group links if the page loads them late
      const ready = await waitForGroupLinks(8000);
      if (!ready) {
        console.warn('[DSS] [auto] No Groep links appeared within wait window. Proceeding anyway.');
      }
      // Gather group links by Type = Poule in column 3, with fallback to old method
      let groupLinks = [];
      const tables = document.querySelectorAll('table.ruler');
      for (const table of tables) {
        const rows = table.querySelectorAll('tbody tr');
        for (const row of rows) {
          const tds = row.querySelectorAll('td');
          if (tds.length >= 3) {
            const typeText = (tds[2].textContent || '').trim().toLowerCase();
            if (/poule/i.test(typeText)) {
              const a = tds[0].querySelector('a[href]');
              if (a) groupLinks.push(a);
            }
          }
        }
      }
      // Fallback: accept anchors whose text contains 'Groep'
      if (groupLinks.length === 0) {
        groupLinks = Array.from(document.querySelectorAll('table.ruler a'))
          .filter(a => /\bgroep\b/i.test(a.textContent.trim()));
      }
      // De-duplicate by absolute href
      const hrefSet = new Set();
      groupLinks = groupLinks.filter(a => {
        const href = toAbsUrl(a.getAttribute('href') || '');
        if (!href || hrefSet.has(href)) return false;
        hrefSet.add(href);
        return true;
      });
      if (groupLinks.length === 0) {
        console.warn('[DSS] [auto] No group links found (Groep A/B/..., Type = Poule).');
        const status = document.getElementById('matchStatus');
        if (status) status.textContent = 'No Groep links found on this page.';
        setLoading(false);
        return;
      }
      console.log(`[DSS] [auto] Found ${groupLinks.length} group links.`);

      const allMatches = [];
      for (const a of groupLinks) {
        const url = toAbsUrl(a.getAttribute('href'));
        if (!url) continue;

        console.log(`[DSS] [auto] Fetching group page: ${url}`);
        const resp = await fetch(url, { credentials: 'include' });
        if (!resp.ok) {
          console.warn(`[DSS] [auto] Failed to fetch ${url}`);
          continue;
        }
        const html = await resp.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        let extracted = extractMatchesFromDoc(doc);
        // Capture a human-friendly category label for this group page and attach to extracted matches
        try {
          const titleLabel = (doc.querySelector('.page-subhead .media__title .nav-link__value') || doc.querySelector('.module__title .nav-link__value') || doc.querySelector('.module__title') || doc.querySelector('.media__title'))?.textContent?.trim() || (doc.title || '').trim();
          if (extracted && extracted.length && titleLabel) {
            extracted.forEach(m => { try { if (!m.category) m.category = titleLabel; if (!m._source) m._source = url; } catch(e){} });
          }
        } catch (e) {}
        console.log(`[DSS] [auto] Extracted ${extracted.length} matches from ${url}`);
        if (!extracted || extracted.length === 0) {
          console.log('[DSS] [auto] No matches via fetch. Trying iframe fallback for', url);
          const iframeDoc = await loadGroupPageViaIframe(url);
          if (iframeDoc) {
            extracted = extractMatchesFromDoc(iframeDoc);
            console.log(`[DSS] [auto] Iframe extracted ${extracted.length} matches from ${url}`);
          } else {
            console.warn('[DSS] [auto] Iframe fallback returned no document for', url);
          }
        }
        allMatches.push(...(extracted || []));
      }

      if (allMatches.length === 0) {
        console.warn('[DSS] [auto] No matches extracted from group pages.');
        const status = document.getElementById('matchStatus');
        if (status) status.textContent = 'No matches found in group pages.';
        setLoading(false);
        return;
      }

      chrome.storage.local.set({ importedMatches: allMatches }, () => {
        console.log(`[DSS] [auto] Stored ${allMatches.length} imported matches from groups.`);
        const status = document.getElementById('matchStatus');
        if (status) status.textContent = `Imported ${allMatches.length} matches from groups. Loading into panel...`;
        loadImportedMatches();
      });
      setLoading(false);
    } catch (e) {
      setLoading(false);
      console.error('[DSS] [auto] Error during automatic group match detection:', e);
      const status = document.getElementById('matchStatus');
      if (status) status.textContent = 'Error while auto-detecting group matches (see console).';
    }
  }

  // Helper: determine category type token from a category string
  function categoryTokenFromText(txt) {
    if (!txt) return null;
    const s = txt.toUpperCase();
    // Match explicit category tokens possibly followed by a number (e.g. DD5, GD10, DD-5)
    // Accept separators like space or dash between token and number.
    const m = s.match(/\b(GD|HD|DD|HE|DE)(?:\s*[-]?\s*\d+)?\b/);
    if (m) return m[1];
    // Sometimes the string contains words like 'dubbel' or 'single'
    if (/\b(dubbel|doubles|double)\b/i.test(txt)) return 'D';
    if (/\b(single|singles|enkel)\b/i.test(txt)) return 'S';
    return null;
  }

  // Reprocess already-stored importedMatches to prefer draw/event sources over profile pages.
  // Exposed as window.dssReprocessImportedMatches() for manual invocation.
  async function reprocessImportedMatches(opts = {}) {
    try {
      console.log('[DSS] reprocessImportedMatches: starting');
      chrome.storage.local.get(['importedMatches'], async (res) => {
        const imported = Array.isArray(res.importedMatches) ? res.importedMatches : [];
        if (!imported.length) { console.log('[DSS] No importedMatches found to reprocess'); return; }
        let changed = 0;
        const MAX_REFETCH = opts.max || 80;
        let refetchCount = 0;
        for (const m of imported) {
          try {
            // If match already has a token-like categoryRaw with number, skip
            if (m && m.categoryRaw && m.categoryRaw.match(/\b(GD|HD|DD|DE|HE)\s*-?\s*\d+\b/i)) continue;
            const src = m && m._source ? m._source : null;
            if (!src) continue;
            // Skip if source already appears to be an event/draw page
            try {
              const u = new URL(src, window.location.href);
              const p = (u.pathname || '').toLowerCase();
              if (!/player|profile|spel|persoon|lid|persoonlijk/.test(p)) continue;
            } catch (e) { /* invalid URL, skip */ continue; }

            if (refetchCount >= MAX_REFETCH) { console.warn('[DSS] reprocessImportedMatches: reached refetch cap'); break; }
            refetchCount++;
            console.log('[DSS] reprocessImportedMatches: fetching profile', src);
            const resp = await fetch(src, { credentials: 'include' });
            if (!resp.ok) { console.warn('[DSS] profile fetch failed', src, resp.status); continue; }
            const html = await resp.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const anchors = Array.from(doc.querySelectorAll('a')).filter(a => (a.textContent || '').trim());
            const candidates = [];
            const currentToken = null;
            for (const a of anchors) {
              try {
                const txt = (a.textContent || '').trim();
                const href = a.getAttribute('href');
                if (!href || !txt) continue;
                const token = categoryTokenFromText(txt);
                if (!token) continue;
                const targetHref = toAbsUrl(href);
                if (!targetHref) continue;
                let score = 0;
                const hrefLower = (targetHref || '').toLowerCase();
                const txtLower = (txt || '').toLowerCase();
                if (/draw\.aspx|\/draw\//.test(hrefLower)) score += 200;
                if (/event\.aspx|\/event\.aspx/.test(hrefLower)) score += 180;
                if (/onderdeel|onderdelen|component|wedstrijd/.test(hrefLower) || /onderdeel|onderdelen|component|wedstrijd/.test(txtLower)) score += 120;
                if (/\bgroep\b/.test(txtLower)) score += 60;
                if (/\bdraw\b/.test(txtLower)) score += 80;
                if (/player|profile|speler|persoon|lid/.test(hrefLower) || /player|speler|persoon|lid/.test(txtLower)) score -= 150;
                if (/\b(gd|hd|dd|de|he)\s*-?\s*\d+\b/i.test(txt)) score += 40;
                candidates.push({ txt, href: targetHref, score });
              } catch (e) {}
            }
            if (!candidates.length) continue;
            candidates.sort((a,b) => (b.score||0) - (a.score||0));
            const best = candidates[0];
            if (!best) continue;
            const normalizedTarget = (() => { try { return (new URL(best.href, window.location.href)).href; } catch(e){ return best.href; } })();
            console.log('[DSS] reprocessImportedMatches: best candidate', best.txt, normalizedTarget, 'score=', best.score);
            // fetch target page to extract title
            try {
              const pageResp = await fetch(normalizedTarget, { credentials: 'include' });
              if (pageResp && pageResp.ok) {
                const pageHtml = await pageResp.text();
                const pdoc = new DOMParser().parseFromString(pageHtml, 'text/html');
                const titleLabel = (pdoc.querySelector('.page-subhead .media__title .nav-link__value') || pdoc.querySelector('.module__title .nav-link__value') || pdoc.querySelector('.module__title') || pdoc.querySelector('.media__title'))?.textContent?.trim() || (pdoc.title || '').trim() || null;
                const rawLabel = titleLabel || best.txt || null;
                const compact = rawLabel ? normalizeCategoryLabel(rawLabel) : null;
                if (rawLabel && compact) {
                  m._source = normalizedTarget;
                  m.categoryRaw = rawLabel;
                  m.category = compact;
                  changed++;
                  console.log('[DSS] reprocessImportedMatches: updated match with category', compact, rawLabel);
                } else if (best.txt) {
                  // fallback: use anchor text even if we couldn't fetch or parse target title
                  const compact2 = normalizeCategoryLabel(best.txt) || null;
                  if (compact2) {
                    m._source = normalizedTarget;
                    m.categoryRaw = best.txt;
                    m.category = compact2;
                    changed++;
                    console.log('[DSS] reprocessImportedMatches: updated match (fallback) with category', compact2, best.txt);
                  }
                }
              }
            } catch (e) { console.warn('[DSS] reprocessImportedMatches: fetch target failed', normalizedTarget, e); }
          } catch (e) { console.warn('[DSS] reprocessImportedMatches: per-match error', e); }
        }
        if (changed) {
          chrome.storage.local.set({ importedMatches: imported }, () => { console.log('[DSS] reprocessImportedMatches: persisted', changed, 'updates to importedMatches'); });
        } else {
          console.log('[DSS] reprocessImportedMatches: no updates made');
        }
      });
    } catch (e) { console.warn('[DSS] reprocessImportedMatches: unexpected error', e); }
  }
  // Expose helper for manual invocation
  try { window.dssReprocessImportedMatches = reprocessImportedMatches; } catch (e) {}

  // Map a category token to a match type string used by rating extraction
  function tokenToMatchType(token) {
    if (!token) return null;
    const t = ('' + token).toString().toUpperCase().trim();
    // Check explicit single tokens first (HE, DE, ENKEL, SINGLE)
    if (/^(HE|DE|S|ENKEL|SINGLE)(?:\s*[-]?\s*\d*)?$/.test(t)) return 'single';
    // Padel explicit
    if (/^PADEL/.test(t)) return 'padel';
    // Doubles tokens (GD, HD, DD, or a generic 'D' from words like 'dubbel')
    if (/^(GD|HD|DD|D)(?:\s*[-]?\s*\d*)?$/.test(t)) return 'double';
    return null;
  }

  // Normalize a human-friendly title to a compact category token when possible
  function normalizeCategoryLabel(txt) {
    if (!txt) return null;
    const s = ('' + txt).trim();
    // Try to find explicit token like 'GD5', 'DD-5', 'GD 5'
    const m = s.match(/\b(GD|HD|DD|HE|DE|GD|HD)(?:\s*[-]?\s*(\d{1,2}))\b/i);
    if (m) return (m[1].toUpperCase() + (m[2] ? m[2] : '')).replace(/\s+/g, '');
    // Also accept single/double words 'dubbel', 'enkel' with optional number
    const m2 = s.match(/\b(GD|HD|DD|HE|DE)\b/i);
    if (m2) return m2[1].toUpperCase();
    // If the string contains a trailing number after token words like 'GD 5' anywhere
    const m3 = s.match(/\b(GD|HD|DD|HE|DE)\b.*?(\d{1,2})/i);
    if (m3) return (m3[1].toUpperCase() + m3[2]);
    // fallback: if it contains word 'dubbel' => 'D', 'enkel' => 'S', 'padel' => 'PADEL'
    if (/\bdubbel|double|dd|gd|hd\b/i.test(s)) return 'D';
    if (/\benkel|single|enkel\b/i.test(s)) return 'S';
    if (/\bpadel\b/i.test(s)) return 'PADEL';
    return null;
  }

  // Fetch a player profile URL and attempt to extract a rating for the requested matchType.
  // Returns a Promise resolving to a number (rating) or null on failure.
  async function fetchProfileRating(profileUrl, preferredMatchType = null) {
    try {
      if (!profileUrl) return null;
      const abs = toAbsUrl(profileUrl);
      if (!abs) return null;
      const resp = await fetch(abs, { credentials: 'include' });
      if (!resp.ok) return null;
      const html = await resp.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');

      // Reuse the same extraction heuristics as refreshPlayerRatings but scoped
      const EXCLUDE_ANCESTOR_SELECTOR = '.match, .match-group, #draw-matches, .module--matches, .matches, .draw, .tournament, .schedule';
      const ratingsObj = {};
      const tooltipSpans = Array.from(
        doc.querySelectorAll('span.tag-duo[data-original-title], span.tag-duo[title]')
      )
        .filter(span => span.querySelector('.tag-duo__value'))
        .filter(span => !span.closest(EXCLUDE_ANCESTOR_SELECTOR));
      tooltipSpans.forEach(span => {
        const typeRaw = (
          span.getAttribute('data-original-title') || span.getAttribute('title') || ''
        ).toLowerCase();
        const valueEl = span.querySelector('.tag-duo__value');
        if (!valueEl) return;
        const raw = valueEl.textContent.trim().replace(/\s+/g, '');
        const numeric = parseFloat(raw.replace(/[^\d,\.\-]/g, '').replace(',', '.'));
        if (isNaN(numeric)) return;
        if (typeRaw.includes('single')) ratingsObj.single = numeric;
        if (typeRaw.includes('double') && !typeRaw.includes('padel')) ratingsObj.double = numeric;
        if (typeRaw.includes('padel')) ratingsObj.padel = numeric;
      });

      if (!ratingsObj.single && !ratingsObj.double && !ratingsObj.padel) {
        // fallback scans
        doc.querySelectorAll('.tag-duo__value').forEach(valueEl => {
          const container = valueEl.closest('span.tag-duo[data-original-title], span.tag-duo[title]');
          if (!container) return;
          const type = (
            container.getAttribute('data-original-title') || container.getAttribute('title') || ''
          ).toLowerCase();
          const raw = valueEl.textContent.trim().replace(/\s+/g, '');
          const val = parseFloat(raw.replace(/[^\d,\.\-]/g, '').replace(',', '.'));
          if (isNaN(val)) return;
          if (type.includes('single')) ratingsObj.single = val;
          if (type.includes('double') && !type.includes('padel')) ratingsObj.double = val;
          if (type.includes('padel')) ratingsObj.padel = val;
        });
      }

      // Pick preferred match type first, else any available
      let applied = null;
      if (preferredMatchType && ratingsObj[preferredMatchType]) applied = ratingsObj[preferredMatchType];
      applied = applied ?? ratingsObj.single ?? ratingsObj.double ?? ratingsObj.padel ?? null;
      return (typeof applied === 'number' && !Number.isNaN(applied)) ? applied : null;
    } catch (e) {
      console.warn('[DSS] fetchProfileRating error for', profileUrl, e);
      return null;
    }
  }

  // Finds all similar categories for players on the current page and extracts matches
  async function findAllSimilarCategories() {
    console.log('[DSS] findAllSimilarCategories: triggered');
    setLoading(true, 'Finding similar categories for players…');
    try {
      // Collect all player links on the current event page (table.ruler entries)
      const playerAnchors = Array.from(document.querySelectorAll('table.ruler a.nav-link, table.ruler a')).filter(a => (a.textContent || '').trim());
      // Map of absolute HTTP(S) profileUrl -> player name (skip mailto/js/tel/# links)
      const profileMap = new Map();
      playerAnchors.forEach(a => {
        const rawHref = a.getAttribute('href');
        const text = (a.textContent || '').trim();
        if (!rawHref || !text) return;
        const abs = toAbsUrl(rawHref);
        if (!abs) return;
        try {
          const u = new URL(abs, window.location.href);
          if (u.protocol !== 'http:' && u.protocol !== 'https:') {
            // skip mailto:, javascript:, tel:, etc.
            console.log('[DSS] Skipping non-HTTP profile link:', abs);
            return;
          }
          profileMap.set(u.href, text);
        } catch (e) {
          // ignore invalid URLs
        }
      });

      console.log('[DSS] findAllSimilarCategories: profiles found=', profileMap.size);
      if (!profileMap.size) {
        alert('No player profile links found on this page.');
        return;
      }

  const collectedMatches = [];
  // Global maps discovered while crawling category pages: normalizedName -> profileUrl / rating
  const discoveredProfiles = {};
  const discoveredRatings = {};

      // Support a cancellable run: set a global flag so repeated clicks can cancel
      if (window._dssFindAllRunning) {
        // Signal running process to stop; the running loop checks this flag periodically
        window._dssFindAllRunning = false;
        console.log('[DSS] findAllSimilarCategories: cancellation requested (already running).');
        setLoading(false);
        return;
      }
      window._dssFindAllRunning = true;

      // Track processed profile/category URLs to avoid repeated fetches and loops
      const processedProfileUrls = new Set();
      const processedCategoryUrls = new Set();
      let categoryFetchCount = 0;
      const MAX_CATEGORY_FETCHES = 60; // safety cap (reduced)
  const discoveredCategoryUrls = new Set();
  // Map of category page URL -> human-friendly category label (e.g. "Tennis GD5")
  const discoveredCategoryTitles = {};
  // Fallback: map of category page URL -> anchor text we followed from profile pages
  const discoveredCategoryAnchors = {};

      // Helper: map over items with limited concurrency and cancellation support.
      // This implementation PRESERVES input order by storing results at the
      // same index as their source item. That removes nondeterminism caused by
      // pushing results in completion order (which changed across runs).
      // items must be an array or iterable; mapper may receive (item, index).
      const mapWithConcurrency = async (items, mapper, concurrency = 6) => {
        const arr = Array.isArray(items) ? items : Array.from(items);
        const results = new Array(arr.length);
        let idx = 0; // next index to start
        let active = 0;
        return new Promise((resolve) => {
          const next = () => {
            if (!window._dssFindAllRunning) return resolve(results);
            if (idx >= arr.length) {
              if (active === 0) resolve(results);
              return;
            }
            const currentIndex = idx++;
            active++;
            (async () => {
              try {
                const res = await mapper(arr[currentIndex], currentIndex);
                results[currentIndex] = res;
              } catch (e) {
                results[currentIndex] = null;
              } finally {
                active--;
                // Schedule next worker
                next();
              }
            })();
          };
          const starters = Math.min(Math.max(1, concurrency), arr.length);
          for (let i = 0; i < starters; i++) next();
        });
      };

  // Determine current page match type (single/double/padel) and only follow category
  // links that map to the same match type. This avoids following a profile to a
  // singles category when the current page is doubles.
  const pageMatchType = (typeof detectMatchTypeFromPage === 'function') ? detectMatchTypeFromPage() : null;
  console.log('[DSS] findAllSimilarCategories: pageMatchType=', pageMatchType);

  // Convert profileMap to an array for controlled parallel processing
      const profileEntries = Array.from(profileMap.entries());

      // Process profiles in parallel with moderate concurrency. Each mapper returns an array of candidate category anchors to follow.
      const profileMappers = await mapWithConcurrency(profileEntries, async ([profileUrl, playerName]) => {
        // Early cancellation and cap checks
        if (!window._dssFindAllRunning) return null;
        if (categoryFetchCount >= MAX_CATEGORY_FETCHES) return null;
        if (processedProfileUrls.has(profileUrl)) return null;
        processedProfileUrls.add(profileUrl);
        try {
          console.log('[DSS] Fetching profile for', playerName, profileUrl);
          const resp = await fetch(profileUrl, { credentials: 'include' });
          if (!resp.ok) { console.warn('[DSS] Profile fetch not OK', profileUrl, resp.status); return null; }
          const html = await resp.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');

          // Heuristic: find links that look like category/event pages.
          const anchors = Array.from(doc.querySelectorAll('a')).filter(a => (a.textContent || '').trim());
          // Determine the current event token roughly from page
          const currentToken = categoryTokenFromText(document.title || document.querySelector('.page-subhead .media__title .nav-link__value')?.textContent || '');

          const candidates = [];
          for (const a of anchors) {
            try {
              const txt = (a.textContent || '').trim();
              const href = a.getAttribute('href');
              if (!href || !txt) continue;
              const token = categoryTokenFromText(txt);
              if (!token) continue; // only follow anchors that contain a category token
              const targetHref = toAbsUrl(href);
              if (!targetHref) continue;
              let score = 0;
              const hrefLower = (targetHref || '').toLowerCase();
              const txtLower = (txt || '').toLowerCase();
              if (/draw\.aspx|\/draw\//.test(hrefLower)) score += 200;
              if (/event\.aspx|\/event\.aspx/.test(hrefLower)) score += 180;
              if (/onderdeel|onderdelen|component|wedstrijd/.test(hrefLower) || /onderdeel|onderdelen|component|wedstrijd/.test(txtLower)) score += 120;
              if (/\bgroep\b/.test(txtLower)) score += 60;
              if (/\bdraw\b/.test(txtLower)) score += 80;
              if (/player|profile|speler|persoon|lid/.test(hrefLower) || /player|speler|persoon|lid/.test(txtLower)) score -= 150;
              if (/\b(gd|hd|dd|de|he)\s*-?\s*\d+\b/i.test(txt)) score += 40;
              // Prefer same token family as current token when present
              if (currentToken && token && currentToken === token) score += 30;
              candidates.push({ txt, href: targetHref, token, score });
            } catch (e) { /* ignore per-anchor errors */ }
          }
          if (!candidates.length) return null;
          candidates.sort((a,b) => (b.score||0) - (a.score||0));
          return candidates.map(c => ({ href: c.href, txt: c.txt, token: c.token, score: c.score }));
        } catch (e) {
          console.warn('[DSS] Failed to fetch profile', profileUrl, e);
          return null;
        }
      }, 6);

      // Flatten candidate category links in score order and dedupe by URL
      const allCandidateCategoryLinks = [];
      for (const arr of profileMappers) {
        if (!arr || !Array.isArray(arr)) continue;
        for (const c of arr) allCandidateCategoryLinks.push(c);
      }
      allCandidateCategoryLinks.sort((a,b) => (b.score||0) - (a.score||0));
      let uniqueCategoryLinks = [];
      const seenCat = new Set();
      for (const c of allCandidateCategoryLinks) {
        try {
          const abs = toAbsUrl(c.href);
          if (!abs) continue;
          if (seenCat.has(abs)) continue;
          seenCat.add(abs);
          uniqueCategoryLinks.push({ href: abs, txt: c.txt, token: c.token });
        } catch (e) {}
      }

      // Filter category links to only those that map to the current page match type.
      // If a candidate has no recognizable token, we drop it to avoid wandering into
      // unrelated (e.g., singles) categories. Log any drops for debugging.
      try {
        const before = uniqueCategoryLinks.length;
        const kept = [];
        const dropped = [];
        uniqueCategoryLinks.forEach(c => {
          try {
            if (!c) { dropped.push({ c, reason: 'no-candidate' }); return; }
            const token = c.token || null;
            if (!token) { dropped.push({ c, reason: 'no-token' }); return; }
            const mapped = tokenToMatchType(token);
            if (!mapped) { dropped.push({ c, reason: 'unmapped-token', token }); return; }
            if (mapped === pageMatchType) { kept.push(c); } else { dropped.push({ c, reason: 'mismatch', token, mapped }); }
          } catch (e) { dropped.push({ c, reason: 'exception' }); }
        });
        uniqueCategoryLinks = kept;
        const after = uniqueCategoryLinks.length;
        try { console.log('[DSS] findAllSimilarCategories: filtered category links - before=', before, 'after=', after, 'kept_sample=', kept.slice(0,10).map(x=>x.href), 'dropped_sample=', dropped.slice(0,8).map(d=>({href: d.c && d.c.href, reason: d.reason, token: d.token, mapped: d.mapped}))); } catch(e){}
      } catch (e) { console.warn('[DSS] findAllSimilarCategories: error filtering category links', e); }

  // Debug: log the candidate category links order so we can detect non-deterministic variations
  try { console.log('[DSS] findAllSimilarCategories: uniqueCategoryLinks (count=', uniqueCategoryLinks.length, '):', uniqueCategoryLinks.map(c=>c.href).slice(0,60)); } catch(e){}
  // Now fetch category pages in parallel (bounded concurrency) and process extraction logic
  const categoryEntries = uniqueCategoryLinks;
      const categoryResults = await mapWithConcurrency(categoryEntries, async (entry) => {
        const targetHref = entry.href;
        const txt = entry.txt;
        const token = entry.token;
        console.log('[DSS] candidate category link:', txt, '->', targetHref, 'token=', token);
        discoveredCategoryAnchors[targetHref] = discoveredCategoryAnchors[targetHref] || txt;
        try {
          if (processedCategoryUrls.has(targetHref)) { console.log('[DSS] Skipping already-processed category', targetHref); return null; }
          if (categoryFetchCount >= MAX_CATEGORY_FETCHES) { console.warn('[DSS] MAX_CATEGORY_FETCHES reached; skipping', targetHref); return null; }
          if (!window._dssFindAllRunning) { console.log('[DSS] findAllSimilarCategories: aborted by user before fetching', targetHref); return null; }
          console.log('[DSS] Fetching category page', targetHref);
          const pageResp = await fetch(targetHref, { credentials: 'include' });
          if (!pageResp.ok) { console.warn('[DSS] Category fetch not OK', targetHref, pageResp.status); processedCategoryUrls.add(targetHref); return null; }
          const pageHtml = await pageResp.text();
          const pdoc = new DOMParser().parseFromString(pageHtml, 'text/html');
          try { const titleLabel = (pdoc.querySelector('.page-subhead .media__title .nav-link__value') || pdoc.querySelector('.module__title .nav-link__value') || pdoc.querySelector('.module__title') || pdoc.querySelector('.media__title'))?.textContent?.trim() || (pdoc.title || '').trim(); if (titleLabel) discoveredCategoryTitles[targetHref] = titleLabel; } catch (e) {}
          let extracted = [];
          try { extracted = extractMatchesFromDoc(pdoc); } catch (e) { console.warn('[DSS] extractMatchesFromDoc error', e); }
          try {
            let ev = extractRatingsFromEventDoc(pdoc);
            if ((!ev || (!Object.keys(ev.profiles||{}).length && !Object.keys(ev.ratings||{}).length))) {
              try {
                const possibleEventAnchor = pdoc.querySelector('a[href*="event.aspx"], a[href*="/sport/event.aspx"], a[href*="event="]');
                if (possibleEventAnchor) {
                  const evHref = toAbsUrl(possibleEventAnchor.getAttribute('href'));
                  if (evHref && !processedCategoryUrls.has(evHref)) {
                    console.log('[DSS] No event-level ratings on category page; fetching event overview', evHref);
                    const evResp = await fetch(evHref, { credentials: 'include' });
                    if (evResp && evResp.ok) {
                      const evHtml = await evResp.text();
                      const evDoc = new DOMParser().parseFromString(evHtml, 'text/html');
                      const ev2 = extractRatingsFromEventDoc(evDoc);
                      ev = ev || { profiles: {}, ratings: {} };
                      try { for (const [k, v] of Object.entries(ev2.profiles || {})) { ev.profiles[k] = ev.profiles[k] || v; } for (const [k, v] of Object.entries(ev2.ratings || {})) { ev.ratings[k] = ev.ratings[k] || v; } } catch (e) { }
                      try { processedCategoryUrls.add(evHref); } catch(e){}
                    }
                  }
                }
              } catch (e) { console.warn('[DSS] event overview fallback failed', e); }
            }
            if (ev && (Object.keys(ev.profiles||{}).length || Object.keys(ev.ratings||{}).length)) {
              (extracted || []).forEach(m => {
                m._playerProfiles = m._playerProfiles || {};
                for (const [rawK, v] of Object.entries(ev.profiles || {})) { try { const k = normalizeName(rawK); if (!m._playerProfiles[k]) m._playerProfiles[k] = v; } catch (e) {} }
                m._playerProfiles.__ratings = m._playerProfiles.__ratings || {};
                for (const [rawK, v] of Object.entries(ev.ratings || {})) { try { const k = normalizeName(rawK); if (!m._playerProfiles.__ratings[k]) m._playerProfiles.__ratings[k] = v; } catch (e) {} }
                try { m._source = targetHref; } catch (e) {}
              });
              try { for (const [rawK, v] of Object.entries(ev.profiles || {})) { try { const kn = normalizeName(rawK); if (!discoveredProfiles[kn]) discoveredProfiles[kn] = v; } catch (e) {} } for (const [rawK, v] of Object.entries(ev.ratings || {})) { try { const kn = normalizeName(rawK); if (!discoveredRatings[kn]) discoveredRatings[kn] = v; } catch (e) {} } } catch (e) { console.warn('[DSS] merging into discoveredProfiles failed', e); }
            }
          } catch (e) { console.warn('[DSS] merging event-level ratings failed', e); }

          const needsIframeFallback = (!extracted || extracted.length === 0) || (Array.isArray(extracted) && extracted.some(m => !m.result));
          if (needsIframeFallback) {
            console.log('[DSS] fetch-extracted matches missing or lacking result flags; trying iframe for', targetHref);
            try {
              const iframeDoc = await loadGroupPageViaIframe(targetHref);
              if (iframeDoc) {
                const iframeExtracted = extractMatchesFromDoc(iframeDoc);
                try {
                  const ev2 = extractRatingsFromEventDoc(iframeDoc);
                  if (ev2 && (Object.keys(ev2.profiles||{}).length || Object.keys(ev2.ratings||{}).length)) {
                    (iframeExtracted || []).forEach(m => {
                      m._playerProfiles = m._playerProfiles || {};
                      for (const [rawK, v] of Object.entries(ev2.profiles || {})) { try { const k = normalizeName(rawK); if (!m._playerProfiles[k]) m._playerProfiles[k] = v; } catch (e) {} }
                      m._playerProfiles.__ratings = m._playerProfiles.__ratings || {};
                      for (const [rawK, v] of Object.entries(ev2.ratings || {})) { try { const k = normalizeName(rawK); if (!m._playerProfiles.__ratings[k]) m._playerProfiles.__ratings[k] = v; } catch (e) {} }
                    });
                  }
                } catch (e) { console.warn('[DSS] iframe event-level rating merge failed', e); }
                if (iframeExtracted && iframeExtracted.length) { extracted = iframeExtracted; console.log('[DSS] Iframe extracted', extracted.length, 'matches from', targetHref); } else { console.log('[DSS] Iframe extracted 0 matches from', targetHref); }
              }
            } catch (e) { console.warn('[DSS] iframe fallback failed for', targetHref, e); }
          } else {
            console.log('[DSS] Extracted', extracted.length, 'matches from', targetHref);
          }

          try { processedCategoryUrls.add(targetHref); } catch (e) {}
          try { discoveredCategoryUrls.add(targetHref); } catch (e) {}
          categoryFetchCount++;
          if (categoryFetchCount % 8 === 0) {
            const status = document.getElementById('matchStatus'); if (status) status.textContent = `Processed ${categoryFetchCount} category pages...`;
            await new Promise(r => setTimeout(r, 20));
          }

          return { targetHref, extracted };
        } catch (e) { console.warn('[DSS] Failed to fetch category page', targetHref, e); try { processedCategoryUrls.add(targetHref); } catch (e) {} return null; }
      }, 5);

      // Merge results from categoryResults into collectedMatches
      for (const r of categoryResults) {
        if (!r || !r.extracted) continue;
        const extracted = r.extracted;
        // Validate and normalize extracted match objects (existing logic expects this)
        const valid = [];
        const invalid = [];
        extracted.forEach(m => {
          if (!m || !m.team1 || !m.team2) { invalid.push(m); return; }
          const t1Arr = Array.isArray(m.team1) ? m.team1 : (m.team1.players && Array.isArray(m.team1.players) ? m.team1.players : null);
          const t2Arr = Array.isArray(m.team2) ? m.team2 : (m.team2.players && Array.isArray(m.team2.players) ? m.team2.players : null);
          if (!t1Arr || !t2Arr) { invalid.push(m); return; }
          valid.push({ date: m.date || null, dateTime: m.dateTime || null, team1: t1Arr, team2: t2Arr, winner: m.winner || null, score: Array.isArray(m.score) ? m.score : null, result: m.result || null, _playerProfiles: m._playerProfiles || {}, _source: r.targetHref });
        });
        if (valid.length) collectedMatches.push(...valid);
      }

      // Remove matches that contain placeholder team names (e.g., 'Groep #1', 'Bye') - reuse existing filtering logic
      const placeholderFiltered = collectedMatches.filter(m => {
        const containsPlaceholder = (arr) => (arr || []).some(n => {
          if (!n) return true;
          const nn = normalizeName(String(n));
          if (!nn) return true;
          if (/\b(groep|groepa|groepb|groepc|bye|groeppoule)\b/.test(nn)) return true;
          if (/^groep\s*#?\d+/.test(nn)) return true;
          return false;
        });
        return !containsPlaceholder(m.team1) && !containsPlaceholder(m.team2);
      });
      if (placeholderFiltered.length !== collectedMatches.length) {
        console.log('[DSS] findAllSimilarCategories: Dropped', (collectedMatches.length - placeholderFiltered.length), 'matches containing placeholders (Groep/Bye).');
      }
      collectedMatches.length = 0;
      collectedMatches.push(...placeholderFiltered);

      if (collectedMatches.length) {
        // Deduplicate extracted matches by signature to avoid storing the same match
        const uniq = [];
        const seen = new Set();
        collectedMatches.forEach(m => {
          const sig = matchSignature(m);
          if (!seen.has(sig)) { seen.add(sig); uniq.push(m); }
        });
                  const toStore = uniq;
        // Store extracted matches to chrome.storage so the existing loader can map them to team objects
        // and perform the same matching/deduplication logic as manual imports.
        try {
          // Enhance stored matches with optional playerProfileUrls map so we can later fetch missing ratings
                  const enhanced = toStore.map(m => {
            // start with any profiles that may have been attached during extraction (including __ratings)
            const rawExisting = (m && m._playerProfiles && typeof m._playerProfiles === 'object') ? { ...m._playerProfiles } : {};
            const existing = {};
            // normalize any existing keys into normalized form
            try {
              for (const [rawK, v] of Object.entries(rawExisting)) {
                if (rawK === '__ratings') continue;
                try { existing[normalizeName(rawK)] = v; } catch (e) { /* fallback: copy raw */ existing[rawK] = v; }
              }
              existing.__ratings = {};
              if (rawExisting.__ratings && typeof rawExisting.__ratings === 'object') {
                for (const [rawK, v] of Object.entries(rawExisting.__ratings)) {
                  try { existing.__ratings[normalizeName(rawK)] = v; } catch (e) { existing.__ratings[rawK] = v; }
                }
              }
            } catch (e) { /* ignore */ }
            // fill any missing profile URLs from the original page's playerUrls map
            (m.team1 || []).forEach(name => {
              try {
                const nn = normalizeName(name);
                if (!existing[nn] && playerUrls[nn]) existing[nn] = playerUrls[nn];
              } catch (e) {}
            });
            (m.team2 || []).forEach(name => {
              try {
                const nn = normalizeName(name);
                if (!existing[nn] && playerUrls[nn]) existing[nn] = playerUrls[nn];
              } catch (e) {}
            });
            // Merge any globally discovered profiles/ratings (do not overwrite per-match values)
            try {
              for (const [k, v] of Object.entries(discoveredProfiles)) if (!existing[k]) existing[k] = v;
              existing.__ratings = existing.__ratings || {};
              for (const [k, v] of Object.entries(discoveredRatings)) if (!existing.__ratings[k]) existing.__ratings[k] = v;
            } catch (e) { console.warn('[DSS] merging discoveredProfiles into match failed', e); }
            // Attach a human-friendly category label when available.
            // Choose among multiple candidates (per-match local heading, explicit m.category, discovered page title, anchor text).
            // Prefer candidates that contain a token with a trailing number (e.g., 'GD6') because those are more specific than prefix-only tokens like 'DE'.
            const catFromSource = (m && m._source) ? (discoveredCategoryTitles[m._source] || null) : null;
            const anchorFromSource = (m && m._source) ? (discoveredCategoryAnchors[m._source] || null) : null;
            const candidates = [m && m.categoryRaw ? m.categoryRaw : null, m && m.category ? m.category : null, catFromSource, anchorFromSource].filter(Boolean);
            // Helper: prefers strings that contain token+number like 'GD6' or 'GD 6'
            const hasTokenNumber = (s) => !!(s && s.match(/\b(GD|HD|DD|DE|HE)\s*-?\s*\d+\b/i));
            let chosenRaw = null;
            // First pick any candidate that has token+number
            for (const c of candidates) { if (hasTokenNumber(c)) { chosenRaw = c; break; } }
            // Otherwise pick the first candidate that yields a compact token
            if (!chosenRaw) {
              for (const c of candidates) { if (normalizeCategoryLabel(c)) { chosenRaw = c; break; } }
            }
            // fallback to null
            const rawLabel = chosenRaw || null;
            const compact = rawLabel ? (normalizeCategoryLabel(rawLabel) || null) : null;
            try { console.log('[DSS] enhancing match: chosenRaw=', rawLabel, 'compact=', compact, 'candidates=', candidates); } catch(e){}
            return { ...m, _playerProfiles: existing, category: compact, categoryRaw: rawLabel };
          });
          // Persist both enhanced matches and the discovered profiles/ratings cache so the importer can consult them
          chrome.storage.local.set({ importedMatches: enhanced, importedProfilesCache: { profiles: discoveredProfiles, ratings: discoveredRatings } }, () => {
            console.log(`[DSS] findAllSimilarCategories: Stored ${enhanced.length} extracted matches to storage.importedMatches (${collectedMatches.length} before dedupe).`);
            const status = document.getElementById('matchStatus');
            if (status) {
              status.textContent = `Found ${enhanced.length} matches. Loading into the panel...`;
            }
            loadImportedMatches();
          });
        } catch (e) {
          console.warn('[DSS] findAllSimilarCategories: Failed to store importedMatches', e);
        }
        console.log('[DSS] findAllSimilarCategories: processed', processedProfileUrls.size, 'profiles, fetched', discoveredCategoryUrls.size, 'unique categories (categoryFetchCount=', categoryFetchCount, ').');
      } else {
        const status = document.getElementById('matchStatus');
        if (status) status.textContent = 'No similar-category matches found for players.';
      }

    } catch (e) {
      console.error('[DSS] Error in findAllSimilarCategories', e);
      alert('Error while finding similar categories (see console).');
    } finally {
      // Always clear loading UI regardless of success/failure/early returns
      try { setLoading(false); } catch (e) { console.warn('[DSS] setLoading(false) failed', e); }
      // Clear running flag
      window._dssFindAllRunning = false;
    }
  }

  function isRatingsPage() {
    return document.querySelector("table.ruler") !== null;
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
// ---- MATCH SCHEDULE PAGE ("Wedstrijden") SUPPORT ----

function parseWinnerFromMatchEl(matchEl) {
  let classWinner = null; // winner inferred from CSS classes (has-won)

  // 1) Class-based: `.match__row.has-won` marks the winning side
  try {
    const rows = matchEl.querySelectorAll('.match__row');
    if (rows.length >= 2) {
      const r1 = rows[0];
      const r2 = rows[1];
      const t1Wins = r1.classList.contains('has-won') || /\bhas-won\b|\bwinner\b/i.test(r1.className);
      const t2Wins = r2.classList.contains('has-won') || /\bhas-won\b|\bwinner\b/i.test(r2.className);
      if (t1Wins && !t2Wins) classWinner = 'team1';
      if (t2Wins && !t1Wins) classWinner = 'team2';
    }
  } catch {}

  // 2) Score-based: `<ul class="points">` with `li.points__cell--won`
  let scoreWinner = null;
  let setScores = [];
  try {
    const resultEl = matchEl.querySelector('.match__result, .match__result-score, .match__sets');
    if (resultEl) {
      const sets = Array.from(resultEl.querySelectorAll('ul.points'));

      let s1 = 0, s2 = 0; // sets won by team1 / team2

      const getNum = (el) => {
        const txt = (el.textContent || '').trim();
        const m = txt.match(/(\d{1,2})/);
        return m ? parseInt(m[1], 10) : NaN;
      };

      if (sets.length) {
        sets.forEach((ul, idx) => {
          const cells = ul.querySelectorAll('li.points__cell');
          if (cells.length >= 2) {
            const c1 = cells[0];
            const c2 = cells[1];
            const c1Won = c1.classList.contains('points__cell--won');
            const c2Won = c2.classList.contains('points__cell--won');
            const n1 = getNum(c1);
            const n2 = getNum(c2);
            const hasNums = !Number.isNaN(n1) && !Number.isNaN(n2);
            if (hasNums) setScores.push([n1, n2]);
            if (c1Won && !c2Won) s1++;
            else if (c2Won && !c1Won) s2++;
            else if (hasNums) {
              if (n1 > n2) s1++; else if (n2 > n1) s2++;
            }
            try { console.log(`[DSS] parseWinner: set #${idx+1}: n1=${n1} n2=${n2} flags c1Won=${c1Won} c2Won=${c2Won}`); } catch {}
          }
        });
      }

      // Fallback: sometimes there are no <ul.points>, parse text inside result container
      if (!setScores.length) {
        const txt = (resultEl.textContent || '').replace(/\s+/g, ' ');
        const pairs = Array.from(txt.matchAll(/(\d{1,2})\s*[-–]\s*(\d{1,2})/g)).map(m => [parseInt(m[1],10), parseInt(m[2],10)]);
        if (pairs.length) {
          pairs.forEach(([a,b], i) => { if (a>b) s1++; else if (b>a) s2++; console.log(`[DSS] parseWinner: text pair #${i+1}: ${a}-${b}`); });
          setScores = pairs.slice();
        }
      }

      if (setScores.length) {
        if (s1 > s2) scoreWinner = 'team1';
        else if (s2 > s1) scoreWinner = 'team2';
        else scoreWinner = null; // tie/ambiguous
      }
    }
  } catch (e) {
    try { console.log('[DSS] parseWinner: exception in score-based parsing', e); } catch {}
  }

  // Decide final winner preference: score > class > null
  const winner = scoreWinner || classWinner || null;
  const score = setScores.length ? setScores : null;
  // Detect special result flags like walkover (WO) or opgave (retirement)
  let resultFlag = null;
  try {
    // common variants: walkover, walk-over, w/o, w.o., wo
    const walkRegex = /\b(walk(?:[-\s]?over)?|wo|w\.o\.|w\/o)\b/i;
    const opgaveRegex = /\b(opgave|opg\.?|retir|retired|gave up|gave-up|gaveup|afzegg|afzeg)\b/i;

    // 1) Prefer explicit message badges (.match__message) which contain words like 'Walkover' or 'Opgave'
    try {
      const messageEl = matchEl.querySelector('.match__message');
      if (messageEl) {
        const mtxt = (messageEl.textContent || '').trim();
        if (mtxt && walkRegex.test(mtxt)) {
          resultFlag = 'walkover';
          console.log('[DSS] parseWinner: detected walkover via .match__message text=', mtxt);
        } else if (mtxt && opgaveRegex.test(mtxt)) {
          resultFlag = 'opgave';
          console.log('[DSS] parseWinner: detected opgave via .match__message text=', mtxt);
        }
      }
    } catch (e) {}

    // 2) Check .match__status badges (these are usually single-letter winner markers like 'W'/'V')
    //    Do NOT treat single-letter 'W'/'V' status badges as walkover/opgave. Only interpret multi-letter tokens like 'WO' or 'OPG'.
    try {
      const statusEl = matchEl.querySelector('.match__status');
      if (statusEl && !resultFlag) {
        const st = (statusEl.textContent || '').trim();
        if (st && st.length >= 2) {
          if (walkRegex.test(st)) { resultFlag = 'walkover'; console.log('[DSS] parseWinner: detected walkover via .match__status token=', st); }
          else if (opgaveRegex.test(st)) { resultFlag = 'opgave'; console.log('[DSS] parseWinner: detected opgave via .match__status token=', st); }
        }
      }
    } catch (e) {}

    // 3) Inspect the result container (.match__result/.match__sets) and nearby attributes for explicit text tokens
    try {
      const parts = [];
      const resultEl = matchEl.querySelector('.match__result, .match__result-score, .match__sets, .match__note');
      if (resultEl) parts.push(resultEl.textContent || '');

      // scan a few likely nodes that can contain status text: any element with class 'match__message' or attributes/titles
      try {
        const nodes = matchEl.querySelectorAll('.match__message, [title], [aria-label], [data-status], img[alt], img[title]');
        for (const n of nodes) {
          try { if (n.textContent) parts.push(n.textContent); } catch (e) {}
          try {
            if (n.getAttribute) {
              const t = n.getAttribute('title'); if (t) parts.push(t);
              const a = n.getAttribute('aria-label'); if (a) parts.push(a);
              const d = n.getAttribute('data-status'); if (d) parts.push(d);
            }
          } catch (e) {}
        }
      } catch (e) {}

      // include class names / dataset values as a last resort
      try { parts.push(matchEl.className || ''); } catch (e) {}
      try { for (const k of Object.keys(matchEl.dataset || {})) parts.push(String(matchEl.dataset[k] || '')); } catch (e) {}

      const combined = parts.filter(Boolean).join(' | ').trim();
      if (!resultFlag && combined) {
        // Prefer full-word matches first
        if (walkRegex.test(combined)) { resultFlag = 'walkover'; console.log('[DSS] parseWinner: detected walkover in combined text=', combined.slice(0,300)); }
        else if (opgaveRegex.test(combined)) { resultFlag = 'opgave'; console.log('[DSS] parseWinner: detected opgave in combined text=', combined.slice(0,300)); }
        else {
          // If no full-word match, check for short multi-letter tokens inside the result/text nodes (e.g., 'WO', 'OPG')
          const shortToken = (resultEl && (resultEl.textContent || '').trim()) || '';
          if (shortToken && shortToken.length >= 2 && /^(wo|opg|w\.o\.|w\/o)$/i.test(shortToken)) {
            if (/^(wo|w\.o\.|w\/o)$/i.test(shortToken)) { resultFlag = 'walkover'; console.log('[DSS] parseWinner: interpreted multi-letter shortToken as walkover=', shortToken); }
            else if (/^opg/i.test(shortToken)) { resultFlag = 'opgave'; console.log('[DSS] parseWinner: interpreted multi-letter shortToken as opgave=', shortToken); }
          }
        }
      }

      if (!resultFlag && resultEl) {
        try { console.log('[DSS] parseWinner: no special-result token found; resultEl sample=', (resultEl.textContent||'').trim().slice(0,120)); } catch (e) {}
        try { const outer = resultEl.outerHTML ? resultEl.outerHTML.slice(0,600) : '[no outerHTML]'; console.log('[DSS] parseWinner: resultEl outerHTML sample=', outer); } catch (e) {}
      }
    } catch (e) {}

    // Final fallback: if still nothing and no numeric scores, log a snippet
    try {
      if (!resultFlag && (!setScores || setScores.length === 0)) {
        const snippet = (matchEl && (matchEl.textContent || '')) ? (matchEl.textContent || '').trim().slice(0,300) : '';
        try { console.log('[DSS] parseWinner: NO result flag and NO numeric score parsed; match snippet=', snippet); } catch(e) {}
      }
    } catch (e) {}
  } catch (e) {}

  return { winner, score, result: resultFlag };
}

function extractMatchesFromDoc(doc) {
  const matches = [];
  const matchEls = doc.querySelectorAll('.match-group .match');
  console.log(`[DSS] [auto] Found ${matchEls.length} match elements in fetched group page.`);
  matchEls.forEach(matchEl => {
    const rows = matchEl.querySelectorAll('.match__row-title');
    if (rows.length !== 2) return;

  // Collect profile links for players when available
  const profileMap = {};
  const profileRatings = {};
    const extractTeam = row => {
      const nodes = Array.from(row.querySelectorAll('.match__row-title-value .nav-link__value'))
        .filter(Boolean);
      const names = nodes.map(el => el.textContent.replace(/\[\d+\]/g, '').trim()).filter(Boolean);
      nodes.forEach(el => {
        try {
          const name = el.textContent.replace(/\[\d+\]/g, '').trim();
          const nn = normalizeName(name);
          const a = el.closest && el.closest('a[href]');
          if (a) {
            const href = a.getAttribute('href');
            const abs = toAbsUrl(href);
            if (abs) profileMap[nn] = abs;
          }
          // Try to find a nearby rating cell (e.g., in a sibling .match__row-rating or within the same row)
          try {
            const ratingEl = el.closest('.match__row')?.querySelector('.match__row-rating .nav-link__value') || el.closest('tr')?.querySelector('td:nth-child(4)');
            if (ratingEl) {
              const raw = (ratingEl.textContent || '').trim().replace(/\s+/g, '').replace(',', '.');
              const v = parseFloat(raw.replace(/[^0-9\.-]/g, ''));
              if (!isNaN(v)) profileRatings[nn] = v;
            }
          } catch (e) {}
        } catch (e) {}
      });
      return names;
    };

    const team1 = extractTeam(rows[0]);
    const team2 = extractTeam(rows[1]);
    if (!team1.length || !team2.length) return;

    let matchDate = null;
    let node = matchEl;
    while ((node = node.previousElementSibling)) {
      const dateNode = node.querySelector?.('.nav-link__value');
      if (dateNode && /\d{1,2}-\d{1,2}-\d{4}/.test(dateNode.textContent)) {
        matchDate = dateNode.textContent.match(/\d{1,2}-\d{1,2}-\d{4}/)[0];
        break;
      }
    }

    // Try to read full date+time from the match footer (e.g., "za 2-8-2025 18:30")
    let matchDateTime = null;
    try {
      const footerDates = Array.from(matchEl.querySelectorAll('.match__footer .nav-link__value'))
        .map(el => (el.textContent || '').trim());
      const dt = footerDates.find(t => /\d{1,2}-\d{1,2}-\d{4}\s+\d{1,2}:\d{2}/.test(t));
      if (dt) {
        const m = dt.match(/\d{1,2}-\d{1,2}-\d{4}\s+\d{1,2}:\d{2}/);
        if (m) matchDateTime = m[0];
      }
    } catch {}

  const parsed = parseWinnerFromMatchEl(matchEl);
  const winner = parsed.winner;
  const score = parsed.score;
  const resultFlag = parsed.result || null;
    console.log('[DSS] [auto] Parsed score array:', score);
  // Attempt to infer a nearby category/title for this individual match element
  let localCategoryRaw = null;
  try {
    const grp = matchEl.closest('.match-group, .module, .matches');
    if (grp) {
      const titleNode = grp.querySelector('.module__title, .match-group__title, .module__heading, .media__title .nav-link__value, .media__title');
      if (titleNode && (titleNode.textContent || '').trim()) localCategoryRaw = titleNode.textContent.trim();
    }
    // Fallback: scan previous siblings for a nav-link__value or heading
    if (!localCategoryRaw) {
      let sib = matchEl.previousElementSibling;
      let tries = 0;
      while (sib && tries++ < 8 && !localCategoryRaw) {
        try {
          const nav = sib.querySelector && (sib.querySelector('.nav-link__value') || sib.querySelector('.module__title') || sib.querySelector('.media__title'));
          if (nav && (nav.textContent || '').trim()) { localCategoryRaw = nav.textContent.trim(); break; }
          const t = (sib.textContent || '').trim();
          if (t && categoryTokenFromText(t)) { localCategoryRaw = t; break; }
        } catch (e) {}
        sib = sib.previousElementSibling;
      }
    }
  } catch (e) { localCategoryRaw = null; }

    const matchObj = { date: matchDate, dateTime: matchDateTime, team1, team2, winner, score, result: resultFlag };
  if (localCategoryRaw) matchObj.categoryRaw = matchObj.categoryRaw || localCategoryRaw;
    if (Object.keys(profileMap).length || Object.keys(profileRatings).length) {
      matchObj._playerProfiles = { ...profileMap };
      if (Object.keys(profileRatings).length) matchObj._playerProfiles.__ratings = { ...profileRatings };
    }
    try { console.log('[DSS] extractMatchesFromDoc: match', { team1, team2, localCategoryRaw, profileMap: Object.keys(profileMap).length ? Object.fromEntries(Object.entries(profileMap).slice(0,6)) : {}, profileRatings: Object.keys(profileRatings).length ? profileRatings : {} }); } catch(e){}
    matches.push(matchObj);
    if (resultFlag) {
      try { console.log('[DSS] extractMatchesFromDoc: pushing match with special result', resultFlag, 'Team1=', team1.join(', '), 'Team2=', team2.join(', ')); } catch(e){}
    }
  });
  return matches;
}

// Scan an event/overview page (table.ruler etc.) for player profile URLs and ratings.
// Returns { profiles: { normName: url }, ratings: { normName: number } }
function extractRatingsFromEventDoc(doc) {
  const profiles = {};
  const ratings = {};
  try {
    // Look for registration tables like table.ruler and parse rows
    const tables = doc.querySelectorAll('table.ruler');
    for (const table of tables) {
      const rows = table.querySelectorAll('tbody tr');
      for (const row of rows) {
        try {
          const playerCell = row.cells && row.cells[1];
          const ratingCell = row.cells && row.cells[3];
          if (!playerCell) continue;
          const links = Array.from(playerCell.querySelectorAll('a')).filter(a => (a.textContent||'').trim());
          const names = links.map(a => (a.textContent||'').trim()).filter(Boolean);
          const urls = links.map(a => a.getAttribute('href'));
          // Parse ratings: there may be multiple <p> or plain text
          let parsedRatings = [];
          if (ratingCell) {
            parsedRatings = Array.from(ratingCell.querySelectorAll('p')).map(p => parseFloat((p.textContent||'').trim().replace(',', '.'))).filter(v => !isNaN(v));
            if (!parsedRatings.length) {
              const txt = (ratingCell.textContent||'').trim().replace(',', '.');
              const splits = txt.split(/[^0-9\.-]+/).filter(s => s.trim() !== '');
              parsedRatings = splits.map(s => parseFloat(s)).filter(v => !isNaN(v));
            }
          }
          for (let i = 0; i < names.length; i++) {
            const name = names[i];
            const url = urls[i] || urls[0] || null;
            const nn = normalizeName(name);
            if (url) {
              const abs = toAbsUrl(url);
              if (abs) profiles[nn] = abs;
            }
            if (parsedRatings[i] !== undefined && !isNaN(parsedRatings[i])) {
              ratings[nn] = parsedRatings[i];
            } else if (parsedRatings.length === names.length && parsedRatings[i] !== undefined) {
              ratings[nn] = parsedRatings[i];
            }
          }
        } catch (e) { /* ignore per-row errors */ }
      }
    }

    // Also try a doc-wide scan for '.tag-duo__value' containers that sometimes appear on event pages
    try {
      doc.querySelectorAll('.tag-duo__value').forEach(valueEl => {
        const container = valueEl.closest('span.tag-duo[data-original-title], span.tag-duo[title]');
        if (!container) return;
        // container may be next to a player name anchor
        const nameAnchor = container.closest('tr')?.querySelector('a') || container.parentElement?.querySelector('a');
        if (nameAnchor) {
          const name = (nameAnchor.textContent||'').trim();
          const nn = normalizeName(name);
          const val = parseFloat((valueEl.textContent||'').trim().replace(/[^0-9\.-]/g, '').replace(',', '.'));
          if (!isNaN(val)) ratings[nn] = val;
          const href = nameAnchor.getAttribute && nameAnchor.getAttribute('href');
          if (href) {
            const abs = toAbsUrl(href);
            if (abs) profiles[nn] = abs;
          }
        }
      });
    } catch (e) {}
  } catch (e) {
    console.warn('[DSS] extractRatingsFromEventDoc failed', e);
  }
  return { profiles, ratings };
}

function isMatchSchedulePage() {
  return document.querySelector('#draw-matches') !== null;
}

// Helper to wait for scores to render
// Async importer that waits for scores to render

function normalizeEventTitle(txt) {
  return (txt || '')
    .replace(/\s*\(.*?\)\s*/g, ' ')   // remove rating range like (5.4002 - 5.8713)
    .replace(/\s*-\s*Groep.*$/i, '')    // remove trailing " - Groep X"
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

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
  // Helper to fetch a URL and return a parsed document, or null
  async function fetchDoc(url) {
    try {
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) return null;
      const t = await r.text();
      return new DOMParser().parseFromString(t, 'text/html');
    } catch (e) { return null; }
  }

  // First, attempt to find an Onderdelen link on the CURRENT page using familiar selectors
  const navCandidates = Array.from(document.querySelectorAll('a.page-nav__link, .page-nav a, nav a, a[role="tab"], a'))
    .filter(a => a.getAttribute && a.getAttribute('href'));
  const textMatch = navCandidates.find(a => /onderdeel/i.test(a.textContent || '')) || navCandidates.find(a => /onderdelen/i.test(a.textContent || ''));
  let onderdelenHref = textMatch ? toAbsUrl(textMatch.getAttribute('href')) : null;

  // If not found on the current page, try following the tournament/master link at the top of the page
  if (!onderdelenHref) {
    // Allow caller to force which tournament page to consult
    const forcedTourHref = (override && override.tournamentHref) ? toAbsUrl(override.tournamentHref) : null;
    const topTournamentAnchor = forcedTourHref ? null : document.querySelector('.page-subhead .media__title a[href], .module__title a[href], a.tournament__link, a[href*="/tournament"], a[href*="tournament.aspx"]');
    const tourCandidate = forcedTourHref || (topTournamentAnchor ? toAbsUrl(topTournamentAnchor.getAttribute('href')) : null);
    if (tourCandidate) {
      try {
        console.log('[DSS] goToOverview: fetching tournament page to locate Onderdelen', tourCandidate);
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

  // If still not found, try scanning document-wide anchors as a final heuristic
  if (!onderdelenHref) {
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

    // Candidate links inside the components list (often in table.ruler)
    const candidates = Array.from(doc.querySelectorAll('table.ruler a.nav-link, table.ruler a, .module__content a, .components-list a'));

    // Build token variants to match the category more robustly (e.g., 'GD5' -> 'gd5','gd 5','gd-5')
    const tokenVariants = new Set();
    const raw = (eventType || rawTitle || '').toString();
    try {
      const m = raw.match(/\b(GD|HD|DD|DE|HE)\s*-?\s*(\d+)\b/i);
      if (m) {
        const base = (m[1] || '').toLowerCase();
        const num = (m[2] || '').toLowerCase();
        if (base && num) {
          tokenVariants.add((base + num).toLowerCase());
          tokenVariants.add((base + ' ' + num).toLowerCase());
          tokenVariants.add((base + '-' + num).toLowerCase());
        }
      }
    } catch (e) {}
    // If no explicit token found, fallback to entire rawTitle lowered
    if (!tokenVariants.size && rawTitle) tokenVariants.add(rawTitle.toLowerCase());

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
        // prefer anchors that lead to event.aspx or have an explicit href fragment indicating a component
        const href = a.getAttribute('href') || '';
        if (/event\.aspx/i.test(href)) score += 20;
        if (/onderdeel|onderdelen/i.test(href)) score += 30;
        // small boost for links inside table.ruler rows / components lists
        if (a.closest && a.closest('table.ruler, .components-list, .module__list')) score += 6;
        if (score > bestScore) { bestScore = score; best = a; }
      } catch (e) { /* ignore per-anchor errors */ }
    }

    if (!best) {
      alert(`Kon het onderdeel voor "${rawTitle || eventType}" niet vinden op de Onderdelen-pagina.`);
      return;
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

// Add a Go to overview button into the main upcoming-match banner when present
function addGoToOverviewMainBanner() {
  try {
    // Look for the main 'Volgende wedstrijd' comparison block
    const banner = document.querySelector('.comparison-block--inversed');
    if (!banner) return;
    // Avoid adding twice
    if (document.getElementById('dss-go-overview-main')) return;

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
        // Derive rawTitle and eventType from the banner where possible
        const titleNode = banner.querySelector('.comparison-heading__title .nav-link__value') || banner.querySelector('.comparison-heading__title') || banner.querySelector('.comparison-heading__time');
        const subtitleItems = Array.from(banner.querySelectorAll('.comparison-heading__subtitle .comparison-heading__subtitle-item, .comparison-heading__subtitle .list__item, .comparison-heading__subtitle-item'))
          .map(n => (n.textContent || '').trim()).filter(Boolean);
        // Heuristic: combine title + first subtitle token if that looks like a category (e.g., 'Tennis GD5' or 'Tennis GD6 17+')
        let rawTitle = '';
        if (titleNode) rawTitle = (titleNode.textContent || '').trim();
        let eventType = '';
        if (subtitleItems && subtitleItems.length) {
          // pick the first non-empty subtitle which often contains the category token like 'Tennis GD5' or 'Tennis GD6 17+'
          const cand = subtitleItems[0];
          // If it contains both sport and token, use it; otherwise append sport name if available
          eventType = cand;
        }
        // Fallback: if eventType empty, try to infer from rawTitle by searching for GD/HD/DD/DE/HE etc.
        if (!eventType) {
          const inferred = (rawTitle || '').match(/\b(GD|HD|DD|DE|HE)\b(?:\s*\d+)?/i);
          if (inferred) eventType = inferred[0];
        }
        // Also capture tournament link in the banner (e.g., 'Peelland toernooi 2025') so we can fetch its page
        let tournamentHref = null;
        try {
          // find an anchor in banner title that points to the tournament page
          const tourA = banner.querySelector('.comparison-heading__title a[href], .comparison-heading__title .nav-link a[href], a.tournament__link, a[href*="/tournament"], a[href*="tournament.aspx"]');
          if (tourA) tournamentHref = tourA.getAttribute('href');
        } catch (ex) {}
        // Call the navigation helper with the detected values and optional tournamentHref
        goToOverviewForCurrentEvent({ rawTitle, eventType, tournamentHref });
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

if (isMatchSchedulePage()) {
  console.log('[DSS] Match schedule page detected');
  addGoToOverviewButton();
}

})(); 