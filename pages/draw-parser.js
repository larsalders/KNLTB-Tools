// Robust match type detector using page title, headings, and context
function detectMatchTypeFromPage() {
  // Prefer an explicit event title token when available (works on event and draw pages)
  let titleText = '';
  try {
    // If the helper exists (draw/overview pages), prefer it
    const ctx = typeof detectCurrentEventTitles === 'function' ? detectCurrentEventTitles() : null;
    titleText = (ctx && ctx.rawTitle) ? String(ctx.rawTitle) : '';
  } catch (e) { titleText = ''; }

  // If still empty, check header/title nodes — excluding .media__title which shows player names on draw pages
  if (!titleText) {
    const candidates = [
      '.page-subhead .media__title .nav-link__value',
      '.module__title .nav-link__value',
      '.module__title',
      '.module__subtitle',
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

  // Always incorporate document.title since it reliably ends with the event name (e.g. "... - Tennis HE6")
  const combinedText = (titleText + ' ' + document.title).toLowerCase().replace(/\s+/g, ' ').trim();

  // Category codes are the most specific signal: HE/DE = singles, HD/DD/GD = doubles.
  // Check these BEFORE any "padel" keyword so that "Open tennis en padel toernooi HE6" → single.
  const tokens = combinedText.split(/\s+/);
  if (tokens.some(t => /^(he|de)\d*$/i.test(t))) {
    _log('[DSS] Match type: single (from HE/DE category token) →', combinedText);
    return 'single';
  }
  if (tokens.some(t => /^(hd|dd|gd)\d*$/i.test(t))) {
    _log('[DSS] Match type: double (from HD/DD/GD category token) →', combinedText);
    return 'double';
  }

  // Keyword signals — padel last because it appears in navigation on any KNLTB page
  if (/\bdubbel\b/i.test(combinedText) || /\bdoubles?\b/i.test(combinedText)) {
    _log('[DSS] Match type: double (from keyword) →', combinedText);
    return 'double';
  }
  if (/\benkel\b/i.test(combinedText) || /\bsingles?\b/i.test(combinedText)) {
    _log('[DSS] Match type: single (from keyword) →', combinedText);
    return 'single';
  }
  if (/\bpadel\b/.test(combinedText)) {
    _log('[DSS] Match type: padel (from keyword) →', combinedText);
    return 'padel';
  }

  // Team-size heuristic as a reliable fallback (handles draw pages where labels are absent)
  if (Array.isArray(teams) && teams.length) {
    const allSingles = teams.every(t => (t.players || []).length === 1);
    const anyDoubles = teams.some(t => (t.players || []).length === 2);
    if (allSingles) {
      _log('[DSS] Match type: single (from team size fallback)');
      return 'single';
    }
    if (anyDoubles) {
      _log('[DSS] Match type: double (from team size fallback)');
      return 'double';
    }
  }

  // Last-chance: scan for category tokens in the visible page text
  try {
    const ambient = Array.from(document.querySelectorAll('body *'))
      .slice(0, 200)
      .map(el => (el.textContent || '').toLowerCase())
      .join(' ');
    const ambientTokens = ambient.split(/\s+/);
    if (ambientTokens.some(t => /^(he|de)\d*$/.test(t))) return 'single';
    if (ambientTokens.some(t => /^(hd|dd|gd)\d*$/.test(t))) return 'double';
    if (/\benkel\b|\bsingles?\b/.test(ambient)) return 'single';
    if (/\bdubbel\b|\bdoubles?\b/.test(ambient)) return 'double';
  } catch (e) {}

  _log('[DSS] Match type: defaulting to double (no explicit signal)');
  return 'double';
}

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

// Parsed rating tables keyed by absolute profile URL. A player's profile ratings do
// not change while the page is open, so repeat lookups — the same player reached
// under two name spellings, or a second import in the same session — reuse the first
// request instead of refetching. Stores the in-flight promise, so concurrent callers
// for one URL share a single fetch. Failures are evicted so they can be retried.
const _profileRatingsCache = new Map();

function fetchProfileRatingsObj(abs) {
  const cached = _profileRatingsCache.get(abs);
  if (cached) return cached;
  const pending = parseProfileRatings(abs).then(
    (obj) => {
      if (!obj) _profileRatingsCache.delete(abs);
      return obj;
    },
    (err) => {
      _profileRatingsCache.delete(abs);
      throw err;
    }
  );
  _profileRatingsCache.set(abs, pending);
  return pending;
}

// Fetch a player profile URL and attempt to extract a rating for the requested matchType.
// Returns a Promise resolving to a number (rating) or null on failure.
async function fetchProfileRating(profileUrl, preferredMatchType = null) {
  try {
    if (!profileUrl) return null;
    const abs = toAbsUrl(profileUrl);
    if (!abs) return null;
    const ratingsObj = await fetchProfileRatingsObj(abs);
    if (!ratingsObj) return null;

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

// Fetch and parse one profile page into { single?, double?, padel? }, or null.
async function parseProfileRatings(abs) {
  try {
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
      if (typeRaw.includes('single') || typeRaw.includes('enkel')) ratingsObj.single = numeric;
      if ((typeRaw.includes('double') || typeRaw.includes('dubbel')) && !typeRaw.includes('padel')) ratingsObj.double = numeric;
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
        if (type.includes('single') || type.includes('enkel')) ratingsObj.single = val;
        if ((type.includes('double') || type.includes('dubbel')) && !type.includes('padel')) ratingsObj.double = val;
        if (type.includes('padel')) ratingsObj.padel = val;
      });
    }

    return ratingsObj;
  } catch (e) {
    console.warn('[DSS] parseProfileRatings error for', abs, e);
    return null;
  }
}

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
            try { _log(`[DSS] parseWinner: set #${idx+1}: n1=${n1} n2=${n2} flags c1Won=${c1Won} c2Won=${c2Won}`); } catch {}
          }
        });
      }

      // Fallback: sometimes there are no <ul.points>, parse text inside result container
      if (!setScores.length) {
        const txt = (resultEl.textContent || '').replace(/\s+/g, ' ');
        const pairs = Array.from(txt.matchAll(/(\d{1,2})\s*[-–]\s*(\d{1,2})/g)).map(m => [parseInt(m[1],10), parseInt(m[2],10)]);
        if (pairs.length) {
          pairs.forEach(([a,b], i) => { if (a>b) s1++; else if (b>a) s2++; _log(`[DSS] parseWinner: text pair #${i+1}: ${a}-${b}`); });
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
    try { _log('[DSS] parseWinner: exception in score-based parsing', e); } catch {}
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
          _log('[DSS] parseWinner: detected walkover via .match__message text=', mtxt);
        } else if (mtxt && opgaveRegex.test(mtxt)) {
          resultFlag = 'opgave';
          _log('[DSS] parseWinner: detected opgave via .match__message text=', mtxt);
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
          if (walkRegex.test(st)) { resultFlag = 'walkover'; _log('[DSS] parseWinner: detected walkover via .match__status token=', st); }
          else if (opgaveRegex.test(st)) { resultFlag = 'opgave'; _log('[DSS] parseWinner: detected opgave via .match__status token=', st); }
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
        if (walkRegex.test(combined)) { resultFlag = 'walkover'; _log('[DSS] parseWinner: detected walkover in combined text=', combined.slice(0,300)); }
        else if (opgaveRegex.test(combined)) { resultFlag = 'opgave'; _log('[DSS] parseWinner: detected opgave in combined text=', combined.slice(0,300)); }
        else {
          // If no full-word match, check for short multi-letter tokens inside the result/text nodes (e.g., 'WO', 'OPG')
          const shortToken = (resultEl && (resultEl.textContent || '').trim()) || '';
          if (shortToken && shortToken.length >= 2 && /^(wo|opg|w\.o\.|w\/o)$/i.test(shortToken)) {
            if (/^(wo|w\.o\.|w\/o)$/i.test(shortToken)) { resultFlag = 'walkover'; _log('[DSS] parseWinner: interpreted multi-letter shortToken as walkover=', shortToken); }
            else if (/^opg/i.test(shortToken)) { resultFlag = 'opgave'; _log('[DSS] parseWinner: interpreted multi-letter shortToken as opgave=', shortToken); }
          }
        }
      }

      if (!resultFlag && resultEl) {
        try { _log('[DSS] parseWinner: no special-result token found; resultEl sample=', (resultEl.textContent||'').trim().slice(0,120)); } catch (e) {}
        try { const outer = resultEl.outerHTML ? resultEl.outerHTML.slice(0,600) : '[no outerHTML]'; _log('[DSS] parseWinner: resultEl outerHTML sample=', outer); } catch (e) {}
      }
    } catch (e) {}

    // Final fallback: if still nothing and no numeric scores, log a snippet
    try {
      if (!resultFlag && (!setScores || setScores.length === 0)) {
        const snippet = (matchEl && (matchEl.textContent || '')) ? (matchEl.textContent || '').trim().slice(0,300) : '';
        try { _log('[DSS] parseWinner: NO result flag and NO numeric score parsed; match snippet=', snippet); } catch(e) {}
      }
    } catch (e) {}
  } catch (e) {}

  return { winner, score, result: resultFlag };
}

function extractMatchesFromDoc(doc) {
  const matches = [];
  const matchEls = doc.querySelectorAll('.match-group .match');
  _log(`[DSS] [auto] Found ${matchEls.length} match elements in fetched group page.`);
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

    // Skip placeholder/Bye entries (e.g. team name is literally "Bye" or "Groep #1")
    const isPlaceholderTeam = (names) => names.some(n => {
      if (!n) return false;
      const nn = normalizeName(String(n));
      return /\b(bye|groep|groepa|groepb|groepc|groeppoule)\b/.test(nn) || /^groep\s*#?\d+/.test(nn);
    });
    if (isPlaceholderTeam(team1) || isPlaceholderTeam(team2)) {
      _log('[DSS] extractMatchesFromDoc: skipping placeholder match', team1, team2);
      return;
    }

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
    _log('[DSS] [auto] Parsed score array:', score);
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
            if (t && _ku.categoryTokenFromText(t)) { localCategoryRaw = t; break; }
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
    try { _log('[DSS] extractMatchesFromDoc: match', { team1, team2, localCategoryRaw, profileMap: Object.keys(profileMap).length ? Object.fromEntries(Object.entries(profileMap).slice(0,6)) : {}, profileRatings: Object.keys(profileRatings).length ? profileRatings : {} }); } catch(e){}
    matches.push(matchObj);
    if (resultFlag) {
      try { _log('[DSS] extractMatchesFromDoc: pushing match with special result', resultFlag, 'Team1=', team1.join(', '), 'Team2=', team2.join(', ')); } catch(e){}
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
