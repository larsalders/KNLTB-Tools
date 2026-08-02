function extractTeamsFromTable() {
  const table = document.querySelectorAll("table.ruler")[1];
  if (!table) {
    _log("[DSS] No table found for teams extraction.");
    return;
  }

  const rows = table.querySelectorAll("tbody tr");
  rows.forEach((row, index) => {
    const playerCell = row.cells[1];
    const ratingCell = row.cells[3];
    if (!playerCell || !ratingCell) {
      _log(`[DSS] Skipping row ${index}: Missing player or rating cell.`);
      return;
    }

    // Singles support: allow for 1 player per team
    const playerLinks = playerCell.querySelectorAll("a");
    if (playerLinks.length === 0) {
      _log(`[DSS] Skipping row ${index}: No player links found.`);
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
          _log(`[DSS] Skipping row ${index}: Unable to parse ratings from text '${text}'.`);
          return;
        }
      }
    }

    // Validation: players.length must match ratings.length, and must not be zero
    if (players.length !== ratings.length || players.length === 0) {
      _log(`[DSS] Skipping row ${index}: Players count (${players.length}) does not match ratings count (${ratings.length}) or zero players.`);
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
    _log(`[DSS] Added team: ${players.join(" & ")} with ratings: ${ratings.join(", ")}`);
  });
  _log(`[DSS] Total teams parsed: ${teams.length}`);
  _log(`[DSS] All teams:`);
  teams.forEach(t => _log(`  - ${t.players.join(" & ")}`));
}

// Async function to refresh all player ratings from their profile URLs
async function refreshPlayerRatings() {
  _log("[DSS] Refreshing player ratings from profile URLs...");
  setLoading(true, 'Refreshing player ratings…');

  const prevRatings = { ...playerRatings };

  // Determine match type from page title and context (robust DD/GD/HD vs padel)
  const currentMatchType = detectMatchTypeFromPage();
  _log('[DSS] Using match type for rating extraction:', currentMatchType);

  const playerEntries = Object.entries(playerUrls);
  const totalPlayers = playerEntries.length;
  let playersDone = 0;
  setProgress(0, totalPlayers, '');

  // Each profile writes only its own player's key, so fetching them concurrently
  // produces exactly the same ratings — it just stops waiting for one profile
  // before requesting the next.
  await mapWithConcurrency(playerEntries, async ([normName, url]) => {
    // Resolve display name for progress
    let displayName = normName;
    for (const team of teams) {
      for (const p of team.players) {
        if (normalizeName(p) === normName) { displayName = p; break; }
      }
    }

    try {
      // If url is relative, construct absolute URL
      let absUrl = url;
      if (/^\//.test(url)) {
        absUrl = window.location.origin + url;
      }
      const resp = await fetch(absUrl, { credentials: "include" });
      if (!resp.ok) {
        console.warn(`[DSS] Failed to fetch profile for ${normName} (${url}).`);
        return;
      }
      const html = await resp.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      // Diagnostics: log fetched URL and basic markers
      _log(`[DSS] Fetched profile for ${normName}: ${absUrl}`);
      const bodyText = doc.body ? doc.body.textContent.slice(0, 200) : '';
      // Detect login/unauthorized pages heuristically
      const looksLikeLogin = /inloggen|login|wachtwoord|password/i.test(bodyText) || doc.querySelector('form[action*="login"], input[type="password"]');
      if (looksLikeLogin) {
        console.warn(`[DSS] Profile fetch appears to be a login page for ${normName}. Skipping.`);
        return;
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
      _log(`[DSS] tooltip spans found (filtered): ${tooltipSpans.length}`);
      tooltipSpans.forEach(span => {
        const typeRaw = (
          span.getAttribute('data-original-title') || span.getAttribute('title') || ''
        ).toLowerCase();
        const valueEl = span.querySelector('.tag-duo__value');
        if (!valueEl) return;
        const raw = valueEl.textContent.trim().replace(/\s+/g, '');
        const numeric = parseFloat(raw.replace(/[^\d,.\-]/g, '').replace(',', '.'));
        if (isNaN(numeric)) return;
        if (typeRaw.includes('single') || typeRaw.includes('enkel')) ratingsObj.single = numeric;
        if ((typeRaw.includes('double') || typeRaw.includes('dubbel')) && !typeRaw.includes('padel')) ratingsObj.double = numeric;
        if (typeRaw.includes('padel')) ratingsObj.padel = numeric;
      });
      _log('[DSS] ratingsObj after tooltip scan:', ratingsObj);

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
            if (type.includes('single') || type.includes('enkel')) res.single = val;
            if ((type.includes('double') || type.includes('dubbel')) && !type.includes('padel')) res.double = val;
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
          _log(`[DSS] Candidate rating list #${idx}:`, res, `score=${s}`);
          if (s > bestScore) { best = res; bestScore = s; bestIndex = idx; }
        });
        if (best) ratingsObj = best;
        _log(`[DSS] Chosen rating list #${bestIndex}:`, ratingsObj);
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
          if (type.includes('single') || type.includes('enkel')) ratingsObj.single = val;
          if ((type.includes('double') || type.includes('dubbel')) && !type.includes('padel')) ratingsObj.double = val;
          if (type.includes('padel')) ratingsObj.padel = val;
        });
        _log('[DSS] Fallback (doc-wide) rating extraction:', ratingsObj);
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
        _log(
          `[DSS] Updated ratings for ${originalName} (${normName}): ` +
            `Single=${ratingsObj.single ?? "?"}, Double=${ratingsObj.double ?? "?"}, Padel=${ratingsObj.padel ?? "?"}. ` +
            `Applied "${currentMatchType}" rating: ${appliedRating}`
        );
      } else {
        console.warn(`[DSS] Could not extract rating for ${normName} from profile page.`);
      }
    } catch (e) {
      console.warn(`[DSS] Error fetching or parsing profile for ${normName} (${url}):`, e);
    } finally {
      // Count completions so the progress bar only ever moves forward
      setProgress(++playersDone, totalPlayers, displayName);
    }
  });

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

function loadGroupPageViaIframe(url, timeoutMs = 15000, settleMs = 1200) {
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
      const docOf = () => {
        try { return iframe.contentDocument || iframe.contentWindow?.document || null; }
        catch (e) { console.warn('[DSS] [auto] Could not access iframe document for', url, e); return null; }
      };

      let tLoad = null;   // set when the iframe fires 'load'
      const finish = () => {
        if (done) return;
        done = true;
        const doc = docOf();
        // Split the cost: everything before 'load' is network, everything after is the
        // settle wait. Only the second half is ours to optimise.
        try {
          if (tLoad !== null) dssTiming.count('iframe settle ms', Math.round(performance.now() - tLoad));
          dssTiming.count('iframe matches found', doc ? doc.querySelectorAll('.match-group .match').length : 0);
        } catch (e) {}
        try { resolve(doc || null); } finally { cleanUp(); }
      };

      // The page fills its match list in client-side after load, so we wait a fixed
      // window before reading it. Do NOT replace this with "poll until the match count
      // stops changing": a test against a page whose matches arrive in bursts showed
      // that heuristic returning 4 matches when the page ended up with 15, because two
      // steady samples are not proof the page is finished. Silently importing a subset
      // is far worse than waiting. Any replacement needs a real readiness signal from
      // the page, not a stability guess.
      iframe.addEventListener('load', () => {
        tLoad = performance.now();
        setTimeout(finish, settleMs);
      });

      setTimeout(finish, timeoutMs);
    } catch (e) {
      console.error('[DSS] [auto] Iframe load error for', url, e);
      resolve(null);
    }
  });
}

function findTeamByPlayers(playerNames) {
  const normSet = new Set(playerNames.map(normalizeName));
  const foundTeam = teams.find(team => {
    const teamSet = new Set(team.players.map(normalizeName));
    const normSize = normSet.size;
    const teamSize = teamSet.size;
    const isExactMatch = normSize === teamSize && [...normSet].every(p => teamSet.has(p));
    if (isExactMatch) {
      _log(`[DSS] Exact match found: imported players [${[...normSet].join(", ")}] match team [${[...teamSet].join(", ")}]`);
      return true;
    }
    // Allow partial matches if one set is subset of the other (allow one player difference)
    const isSubset = [...normSet].every(p => teamSet.has(p));
    const isSuperset = [...teamSet].every(p => normSet.has(p));
    if ((isSubset && (teamSize - normSize) <= 1) || (isSuperset && (normSize - teamSize) <= 1)) {
      _log(`[DSS] Partial match accepted: imported players [${[...normSet].join(", ")}] partial match with team [${[...teamSet].join(", ")}]`);
      return true;
    }
    _log(`[DSS] No match: imported players [${[...normSet].join(", ")}] vs team [${[...teamSet].join(", ")}]`);
    return false;
  });
  return foundTeam;
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
    _log('[DSS] loadImportedMatches: page match type=', pageMatchType, 'requiredTeamSize=', requiredTeamSize);

    let importedCount = 0;
    // Build a set of existing match signatures to avoid pushing duplicates
    const existingSigs = new Set(matchQueue.map(mq => _ku.matchSignature(mq)));
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
            _log('[DSS] Skipping imported match due to team-size mismatch vs page type - expected', requiredTeamSize, 'got', t1len, '&', t2len, 'for imported match #', idx+1);
            continue;
          }
        } catch (e) {
          // Fall through to normal handling if something unexpected in shape
        }

        const imp = { team1, team2, winner, score, date, dateTime, _playerProfiles };
        const sig = _ku.matchSignature(imp);
        if (seenImported.has(sig)) {
          _log('[DSS] Skipping duplicate imported match (dupe in imported array) #', idx+1);
          continue;
        }
        seenImported.add(sig);
        if (existingSigs.has(sig)) {
          _log('[DSS] Skipping import because exact match already exists in queue #', idx+1);
          continue;
        }
        // relaxed signature: ignore date/time differences so we don't import duplicates that only differ by missing/variant dates
        const parts = sig.split('::');
        const relaxedSig = (parts[0] || '') + '::' + (parts[2] || '');
        if (existingRelaxed.has(relaxedSig)) {
          _log('[DSS] Skipping import because a matching teams+score entry already exists in queue #', idx+1);
          continue;
        }
        _log("===============================================");
        _log(`[DSS] Processing imported match #${idx + 1}:`);
        _log(`[DSS] Looking for Team1: [${(team1||[]).join(", ")}]`);
        _log(`[DSS] Looking for Team2: [${(team2||[]).join(", ")}]`);
        // Show normalized player names for debug
        const normTeam1 = team1.map(normalizeName);
        const normTeam2 = team2.map(normalizeName);
        _log(`[DSS] Normalized Team1 player names: [${normTeam1.join(", ")}]`);
        _log(`[DSS] Normalized Team2 player names: [${normTeam2.join(", ")}]`);
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
                    _log('[DSS] Seeded rating from candidate match data for', pn, nn, candidate.rating, 'matchedKey=', candidate.key);
                    continue;
                  }
                  if (candidate.url) {
                    const pref = preferredMatchTypeToken ? tokenToMatchType(preferredMatchTypeToken) : null;
                    const val = await fetchProfileRating(candidate.url, pref || pageMatchType);
                    if (val !== null) {
                      playerRatings[nn] = val;
                      if (playerBaselineRatings[nn] === undefined) playerBaselineRatings[nn] = val;
                      _log('[DSS] Seeded rating from profile (candidate url) for', pn, nn, val, 'matchedKey=', candidate.key);
                      continue;
                    } else {
                      _log('[DSS] fetchProfileRating returned null for candidate url', pn, nn, candidate.url);
                    }
                  }
                }
              } catch (e) { console.warn('[DSS] candidate lookup failed for', pn, e); }

              // If we reach here, nothing was found
              _log('[DSS] No profile URL or rating candidate found for', pn, nn);
              try { _log('[DSS] Imported match _playerProfiles snapshot:', JSON.parse(JSON.stringify(_playerProfiles || {}))); } catch(e){}
            } catch (e) { console.warn('[DSS] ensureRatingsForPlayers error for', pn, e); }
          }
        };

        // Pre-fetch ratings for both teams in parallel
        try {
          await Promise.all([ensureRatingsForPlayers(team1, null), ensureRatingsForPlayers(team2, null)]);
        } catch (e) { console.warn('[DSS] Pre-fetch ratings failed for imported match #', idx+1, e); }

        const matchTeam1 = findTeamByPlayers(team1);
        const matchTeam2 = findTeamByPlayers(team2);
        if (matchTeam1) {
          _log(`[DSS] Found matching team for Team1: [${matchTeam1.players.join(", ")}]`);
        } else {
          _log(`[DSS] Imported match team1 not found: [${team1.join(", ")}]`);
        }
        if (matchTeam2) {
          _log(`[DSS] Found matching team for Team2: [${matchTeam2.players.join(", ")}]`);
        } else {
          _log(`[DSS] Imported match team2 not found: [${team2.join(", ")}]`);
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
          _log('[DSS] Created synthetic Team1 for import:', finalTeam1.players.join(', '));
        }
        if (!finalTeam2) {
          finalTeam2 = { players: Array.isArray(team2) ? team2.slice() : [], teamKey: (Array.isArray(team2) ? team2.map(normalizeName).join('|') : '') };
          (finalTeam2.players || []).forEach(p => {
            try { const nn = normalizeName(p); if (playerBaselineRatings[nn] === undefined && typeof playerRatings[nn] === 'number') playerBaselineRatings[nn] = playerRatings[nn]; } catch(e){}
          });
          _log('[DSS] Created synthetic Team2 for import:', finalTeam2.players.join(', '));
        }
        if (finalTeam1 && finalTeam2) {
          const initialWinner = (winner === 'team1' || winner === 'team2') ? winner : null;
          const initialScore = Array.isArray(score) ? score : null;
          const candidate = { team1: finalTeam1, team2: finalTeam2, winner: initialWinner, score: initialScore, date: date || null, dateTime: dateTime || null, result: result || null, category: impRaw.category || null };
          const candSig = _ku.matchSignature(candidate);
          const candParts = candSig.split('::');
          const candRelaxed = (candParts[0] || '') + '::' + (candParts[2] || '');
          if (existingSigs.has(candSig)) {
            _log('[DSS] Skipping push: candidate exact match already present in queue');
          } else if (existingRelaxed.has(candRelaxed)) {
            _log('[DSS] Skipping push: candidate teams+score already present in queue (date mismatch)');
          } else {
            matchQueue.push(candidate);
            existingSigs.add(candSig);
            existingRelaxed.add(candRelaxed);
            importedCount++;
          }
          _log(`[DSS] Imported winner: ${initialWinner ?? 'none'}, score=${initialScore ? initialScore.map(p => `${p[0]}-${p[1]}`).join(' ') : 'n/a'}`);
          _log(`[DSS] Pushed imported match: Team1=[${team1.join(", ")}], Team2=[${team2.join(", ")}], date=${date || '—'}${dateTime ? ` (${dateTime})` : ''}`);
        }
      }
    })();

    // When processing completes, render the updated queue, update UI and clear stored imports
    processPromise.then(() => {
      try {
        _log('[DSS] render after import: matchQueue length=', matchQueue.length, 'sample=', matchQueue.slice(0,3));
        renderMatches();
      } catch (e) { console.warn('[DSS] renderMatches after import failed', e); }
      // Update status element to show number of imported matches
      const status = document.getElementById("matchStatus");
      if (status && importedCount > 0) {
        status.textContent = `Imported ${importedCount} match${importedCount === 1 ? "" : "es"} from schedule.`;
      }
      _log("[DSS] Imported matches added to match queue.");
      // Optionally clear them after loading
      try { chrome.storage.local.remove("importedMatches"); } catch (e) { console.warn('[DSS] Failed to remove importedMatches', e); }
    }).catch(e => {
      console.warn('[DSS] processImported failed', e);
      try { _log('[DSS] render on failure: matchQueue length=', matchQueue.length); renderMatches(); } catch (e) {}
      try { chrome.storage.local.remove("importedMatches"); } catch (e) {}
    });
  });
}

async function autoDetectGroupMatches() {
  lastImportSource = 'local';
  setLoading(true, 'Detecting group matches…');
  dssTiming.reset();
  const _tShow = dssTiming.now();
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
    _log(`[DSS] [auto] Found ${groupLinks.length} group links.`);

    const totalGroups = groupLinks.length;
    let groupsDone = 0;
    setProgress(0, totalGroups, '', 'Group');

    // Fetch the group pages concurrently. mapWithConcurrency returns results in input
    // order, so flattening below yields exactly the same match list as the previous
    // sequential loop — only the waiting is overlapped.
    const perGroup = await mapWithConcurrency(groupLinks, async (a, gi) => {
      const url = toAbsUrl(a.getAttribute('href'));
      const groupName = (a.textContent || '').trim() || `Group ${gi + 1}`;

      let extracted = null;
      try {
        if (!url) return null;
        _log(`[DSS] [auto] Fetching group page: ${url}`);
        const resp = await fetch(url, { credentials: 'include' });
        if (!resp.ok) {
          console.warn(`[DSS] [auto] Failed to fetch ${url}`);
          return null;
        }
        const html = await resp.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');

        extracted = extractMatchesFromDoc(doc);
        // Capture a human-friendly category label for this group page and attach to extracted matches
        try {
          const titleLabel = (doc.querySelector('.page-subhead .media__title .nav-link__value') || doc.querySelector('.module__title .nav-link__value') || doc.querySelector('.module__title') || doc.querySelector('.media__title'))?.textContent?.trim() || (doc.title || '').trim();
          if (extracted && extracted.length && titleLabel) {
            extracted.forEach(m => { try { if (!m.category) m.category = titleLabel; if (!m._source) m._source = url; } catch(e){} });
          }
        } catch (e) {}
        _log(`[DSS] [auto] Extracted ${extracted.length} matches from ${url}`);
        if (!extracted || extracted.length === 0) {
          _log('[DSS] [auto] No matches via fetch. Trying iframe fallback for', url);
          dssTiming.count('iframe: no matches');
          const iframeDoc = await dssTiming.track('iframe fallback', () => loadGroupPageViaIframe(url));
          if (iframeDoc) {
            extracted = extractMatchesFromDoc(iframeDoc);
            _log(`[DSS] [auto] Iframe extracted ${extracted.length} matches from ${url}`);
          } else {
            console.warn('[DSS] [auto] Iframe fallback returned no document for', url);
          }
        }
      } finally {
        // Count completions rather than start index so the progress bar stays monotonic
        setProgress(++groupsDone, totalGroups, groupName, 'Group');
      }
      return extracted || null;
    }, DSS_IFRAME_CONCURRENCY);
    dssTiming.mark(`group pages (${totalGroups})`, _tShow);

    const allMatches = [];
    for (const extracted of perGroup) {
      if (extracted) allMatches.push(...extracted);
    }

    if (allMatches.length === 0) {
      console.warn('[DSS] [auto] No matches extracted from group pages.');
      const status = document.getElementById('matchStatus');
      if (status) status.textContent = 'No matches found in group pages.';
      setLoading(false);
      return;
    }

    chrome.storage.local.set({ importedMatches: allMatches }, () => {
      _log(`[DSS] [auto] Stored ${allMatches.length} imported matches from groups.`);
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
  } finally {
    dssTiming.mark('TOTAL', _tShow);
    dssTiming.report('Show Matches');
  }
}

// Reprocess already-stored importedMatches to prefer draw/event sources over profile pages.
// Exposed as window.dssReprocessImportedMatches() for manual invocation.
async function reprocessImportedMatches(opts = {}) {
  try {
    _log('[DSS] reprocessImportedMatches: starting');
    chrome.storage.local.get(['importedMatches'], async (res) => {
      const imported = Array.isArray(res.importedMatches) ? res.importedMatches : [];
      if (!imported.length) { _log('[DSS] No importedMatches found to reprocess'); return; }
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
          _log('[DSS] reprocessImportedMatches: fetching profile', src);
          const resp = await fetch(src, { credentials: 'include' });
          if (!resp.ok) { console.warn('[DSS] profile fetch failed', src, resp.status); continue; }
          const html = await resp.text();
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const anchors = Array.from(doc.querySelectorAll('a')).filter(a => (a.textContent || '').trim());
          const candidates = [];
          for (const a of anchors) {
            try {
              const txt = (a.textContent || '').trim();
              const href = a.getAttribute('href');
              if (!href || !txt) continue;
              const token = _ku.categoryTokenFromText(txt);
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
          _log('[DSS] reprocessImportedMatches: best candidate', best.txt, normalizedTarget, 'score=', best.score);
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
                _log('[DSS] reprocessImportedMatches: updated match with category', compact, rawLabel);
              } else if (best.txt) {
                // fallback: use anchor text even if we couldn't fetch or parse target title
                const compact2 = normalizeCategoryLabel(best.txt) || null;
                if (compact2) {
                  m._source = normalizedTarget;
                  m.categoryRaw = best.txt;
                  m.category = compact2;
                  changed++;
                  _log('[DSS] reprocessImportedMatches: updated match (fallback) with category', compact2, best.txt);
                }
              }
            }
          } catch (e) { console.warn('[DSS] reprocessImportedMatches: fetch target failed', normalizedTarget, e); }
        } catch (e) { console.warn('[DSS] reprocessImportedMatches: per-match error', e); }
      }
      if (changed) {
        chrome.storage.local.set({ importedMatches: imported }, () => { _log('[DSS] reprocessImportedMatches: persisted', changed, 'updates to importedMatches'); });
      } else {
        _log('[DSS] reprocessImportedMatches: no updates made');
      }
    });
  } catch (e) { console.warn('[DSS] reprocessImportedMatches: unexpected error', e); }
}
// Expose helper for manual invocation
try { window.dssReprocessImportedMatches = reprocessImportedMatches; } catch (e) {}

// Finds all similar categories for players on the current page and extracts matches
async function findAllSimilarCategories() {
  lastImportSource = 'findAll';
  _log('[DSS] findAllSimilarCategories: triggered');
  setLoading(true, 'Finding similar categories for players…');
  dssTiming.reset();
  const _tFindAll = dssTiming.now();
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
          _log('[DSS] Skipping non-HTTP profile link:', abs);
          return;
        }
        profileMap.set(u.href, text);
      } catch (e) {
        // ignore invalid URLs
      }
    });

    _log('[DSS] findAllSimilarCategories: profiles found=', profileMap.size);
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
      _log('[DSS] findAllSimilarCategories: cancellation requested (already running).');
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

    // Order-preserving bounded-concurrency map (see draw-state.js), wired to this
    // run's cancellation flag.
    const mapConcurrent = (items, mapper, concurrency = DSS_FETCH_CONCURRENCY) =>
      mapWithConcurrency(items, mapper, concurrency, () => window._dssFindAllRunning);

    // Determine current page match type (single/double/padel) and only follow category
    // links that map to the same match type. This avoids following a profile to a
    // singles category when the current page is doubles.
    const pageMatchType = (typeof detectMatchTypeFromPage === 'function') ? detectMatchTypeFromPage() : null;
    _log('[DSS] findAllSimilarCategories: pageMatchType=', pageMatchType);

    // Phase 0: always fetch the current event's own group pages as a guaranteed baseline.
    // Profile-based discovery finds *additional* categories; this ensures the starting
    // 15 (or however many) matches from the current draw are always included.
    let baseGroupLinks = [];
    {
      const baseTables = document.querySelectorAll('table.ruler');
      for (const table of baseTables) {
        for (const row of table.querySelectorAll('tbody tr')) {
          const tds = row.querySelectorAll('td');
          if (tds.length >= 3 && /poule/i.test(tds[2].textContent || '')) {
            const a = tds[0].querySelector('a[href]');
            if (a) baseGroupLinks.push(a);
          }
        }
      }
      if (!baseGroupLinks.length) {
        baseGroupLinks = Array.from(document.querySelectorAll('table.ruler a'))
          .filter(a => /\bgroep\b/i.test((a.textContent || '').trim()));
      }
      const baseHrefSet = new Set();
      baseGroupLinks = baseGroupLinks.filter(a => {
        const href = toAbsUrl(a.getAttribute('href') || '');
        if (!href || baseHrefSet.has(href)) return false;
        baseHrefSet.add(href);
        return true;
      });
    }

    // Convert profileMap to an array for controlled parallel processing
    const profileEntries = Array.from(profileMap.entries());

    // The baseline group pages and the player profiles are independent page sets —
    // nothing in one feeds the other — so they are fetched CONCURRENTLY. Timing a real
    // run showed them costing 3.6s + 5.5s back to back; overlapped, the pair costs
    // roughly the slower of the two. Both use order-preserving maps and are merged
    // below in a fixed sequence, so the collected match order is unchanged.
    const lmEl0 = document.getElementById('dss-loading-msg');
    if (lmEl0) lmEl0.textContent = 'Fetching current event matches and player profiles…';

    // One shared counter for both phases: two phases writing to the same progress bar
    // would make it jump back and forth.
    const totalDiscoveryPages = baseGroupLinks.length + profileEntries.length;
    let discoveryDone = 0;
    const tickDiscovery = (name) => setProgress(++discoveryDone, totalDiscoveryPages, name, 'Page');
    setProgress(0, totalDiscoveryPages, '', 'Page');

    const _tDiscovery = dssTiming.now();

    const baselineTask = (async () => {
      if (!baseGroupLinks.length) return [];
      const _tBase = dssTiming.now();
      // Fetched concurrently; results come back in link order, so the matches land
      // in collectedMatches in the same sequence the serial loop produced.
      const out = await mapConcurrent(baseGroupLinks, async (a, gi) => {
        const url = toAbsUrl(a.getAttribute('href'));
        const groupName = (a.textContent || '').trim() || `Group ${gi + 1}`;
        try {
          if (!url) return null;
          processedCategoryUrls.add(url);
          discoveredCategoryUrls.add(url);
          const resp = await fetch(url, { credentials: 'include' });
          if (!resp.ok) return null;
          const html = await resp.text();
          const gdoc = new DOMParser().parseFromString(html, 'text/html');
          try {
            const tl = (gdoc.querySelector('.page-subhead .media__title .nav-link__value') || gdoc.querySelector('.module__title .nav-link__value') || gdoc.querySelector('.module__title') || gdoc.querySelector('.media__title'))?.textContent?.trim() || (gdoc.title || '').trim();
            if (tl) discoveredCategoryTitles[url] = tl;
          } catch (e) {}
          let extracted = extractMatchesFromDoc(gdoc);
          if (!extracted || !extracted.length) {
            dssTiming.count('baseline iframe: no matches');
            const iframeDoc = await dssTiming.track('iframe fallback', () => loadGroupPageViaIframe(url));
            if (iframeDoc) extracted = extractMatchesFromDoc(iframeDoc);
          }
          _log(`[DSS] findAll baseline: fetched ${extracted ? extracted.length : 0} matches from ${url}`);
          return { url, extracted: extracted || [] };
        } catch (e) {
          console.warn('[DSS] findAll baseline group fetch failed', url, e);
          return null;
        } finally {
          tickDiscovery(groupName);
        }
      }, DSS_IFRAME_CONCURRENCY);
      dssTiming.mark(`baseline groups (${baseGroupLinks.length})`, _tBase);
      return out;
    })();

    // Process profiles in parallel with moderate concurrency. Each mapper returns an array of candidate category anchors to follow.
    const profileTask = (async () => {
      const _tProfiles = dssTiming.now();
      const out = await mapConcurrent(profileEntries, async ([profileUrl, playerName]) => {
      // Early cancellation and cap checks
      if (!window._dssFindAllRunning) { tickDiscovery(playerName); return null; }
      if (categoryFetchCount >= MAX_CATEGORY_FETCHES) { tickDiscovery(playerName); return null; }
      if (processedProfileUrls.has(profileUrl)) { tickDiscovery(playerName); return null; }
      processedProfileUrls.add(profileUrl);
      try {
        _log('[DSS] Fetching profile for', playerName, profileUrl);
        const resp = await fetch(profileUrl, { credentials: 'include' });
        if (!resp.ok) { console.warn('[DSS] Profile fetch not OK', profileUrl, resp.status); return null; }
        const html = await resp.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Heuristic: find links that look like category/event pages.
        const anchors = Array.from(doc.querySelectorAll('a')).filter(a => (a.textContent || '').trim());
        // Determine the current event token roughly from page
        const currentToken = _ku.categoryTokenFromText(document.title || document.querySelector('.page-subhead .media__title .nav-link__value')?.textContent || '');

        const candidates = [];
        for (const a of anchors) {
          try {
            const txt = (a.textContent || '').trim();
            const href = a.getAttribute('href');
            if (!href || !txt) continue;
            const token = _ku.categoryTokenFromText(txt);
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
      } finally {
        tickDiscovery(playerName);
      }
      }, DSS_FETCH_CONCURRENCY);
      dssTiming.mark(`profile pages (${profileEntries.length})`, _tProfiles);
      return out;
    })();

    const [basePerGroup, profileMappers] = await Promise.all([baselineTask, profileTask]);
    dssTiming.mark('discovery (baseline ∥ profiles)', _tDiscovery);

    // Merge the baseline matches first, exactly as the sequential version did, so the
    // order of collectedMatches does not depend on which task finished first.
    for (const res of basePerGroup) {
      if (!res) continue;
      for (const m of res.extracted) {
        if (!m || !m.team1 || !m.team2) continue;
        const t1 = Array.isArray(m.team1) ? m.team1 : (m.team1.players || []);
        const t2 = Array.isArray(m.team2) ? m.team2 : (m.team2.players || []);
        if (!t1.length || !t2.length) continue;
        collectedMatches.push({ date: m.date || null, dateTime: m.dateTime || null, team1: t1, team2: t2, winner: m.winner || null, score: Array.isArray(m.score) ? m.score : null, result: m.result || null, _playerProfiles: {}, _source: res.url });
      }
    }
    _log(`[DSS] findAll baseline: collectedMatches after group phase = ${collectedMatches.length}`);

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
      try { _log('[DSS] findAllSimilarCategories: filtered category links - before=', before, 'after=', after, 'kept_sample=', kept.slice(0,10).map(x=>x.href), 'dropped_sample=', dropped.slice(0,8).map(d=>({href: d.c && d.c.href, reason: d.reason, token: d.token, mapped: d.mapped}))); } catch(e){}
    } catch (e) { console.warn('[DSS] findAllSimilarCategories: error filtering category links', e); }

    // Debug: log the candidate category links order so we can detect non-deterministic variations
    try { _log('[DSS] findAllSimilarCategories: uniqueCategoryLinks (count=', uniqueCategoryLinks.length, '):', uniqueCategoryLinks.map(c=>c.href).slice(0,60)); } catch(e){}
    // Now fetch category pages in parallel (bounded concurrency) and process extraction logic
    const categoryEntries = uniqueCategoryLinks;
    const lmEl = document.getElementById('dss-loading-msg');
    if (lmEl) lmEl.textContent = 'Scanning category pages…';
    let catsDone = 0;
    setProgress(0, categoryEntries.length, '', 'Category');
    const _tCats = dssTiming.now();
    const categoryResults = await mapConcurrent(categoryEntries, async (entry) => {
      const targetHref = entry.href;
      const txt = entry.txt;
      const token = entry.token;
      _log('[DSS] candidate category link:', txt, '->', targetHref, 'token=', token);
      discoveredCategoryAnchors[targetHref] = discoveredCategoryAnchors[targetHref] || txt;
      catsDone++;
      setProgress(catsDone, categoryEntries.length, txt || targetHref, 'Category');
      try {
        if (processedCategoryUrls.has(targetHref)) { _log('[DSS] Skipping already-processed category', targetHref); return null; }
        // Mark as processed immediately (before the first await) to prevent a race condition
        // where a concurrent worker's sub-group-following code fetches this same URL before
        // this worker's own fetch completes and adds it at the end of the mapper.
        processedCategoryUrls.add(targetHref);
        if (categoryFetchCount >= MAX_CATEGORY_FETCHES) { console.warn('[DSS] MAX_CATEGORY_FETCHES reached; skipping', targetHref); return null; }
        if (!window._dssFindAllRunning) { _log('[DSS] findAllSimilarCategories: aborted by user before fetching', targetHref); return null; }
        _log('[DSS] Fetching category page', targetHref);
        const pageResp = await dssTiming.track('category fetch', () => fetch(targetHref, { credentials: 'include' }));
        if (!pageResp.ok) { console.warn('[DSS] Category fetch not OK', targetHref, pageResp.status); processedCategoryUrls.add(targetHref); return null; }
        const pageHtml = await pageResp.text();
        const pdoc = new DOMParser().parseFromString(pageHtml, 'text/html');
        try { const titleLabel = (pdoc.querySelector('.page-subhead .media__title .nav-link__value') || pdoc.querySelector('.module__title .nav-link__value') || pdoc.querySelector('.module__title') || pdoc.querySelector('.media__title'))?.textContent?.trim() || (pdoc.title || '').trim(); if (titleLabel) discoveredCategoryTitles[targetHref] = titleLabel; } catch (e) {}
        let extracted = [];
        try { extracted = extractMatchesFromDoc(pdoc); } catch (e) { console.warn('[DSS] extractMatchesFromDoc error', e); }

        // If the fetched page looks like an event overview (0 matches but has Groep sub-links),
        // follow those sub-links one level deeper to get actual match data.
        if (!extracted || extracted.length === 0) {
          try {
            const subGroupLinks = Array.from(pdoc.querySelectorAll('table.ruler a, a[href]'))
              .filter(a => /\bgroep\b/i.test((a.textContent || '').trim()));
            const subSeen = new Set();
            for (const sga of subGroupLinks.slice(0, 8)) {
              const subUrl = toAbsUrl(sga.getAttribute('href'));
              if (!subUrl || subSeen.has(subUrl) || processedCategoryUrls.has(subUrl)) continue;
              subSeen.add(subUrl);
              processedCategoryUrls.add(subUrl);
              discoveredCategoryUrls.add(subUrl);
              try {
                const sr = await dssTiming.track('sub-group fetch (serial)', () => fetch(subUrl, { credentials: 'include' }));
                if (!sr.ok) continue;
                const sh = await sr.text();
                const sdoc = new DOMParser().parseFromString(sh, 'text/html');
                const subExtracted = extractMatchesFromDoc(sdoc);
                if (subExtracted && subExtracted.length) {
                  extracted = [...extracted, ...subExtracted];
                  _log(`[DSS] findAll sub-group: got ${subExtracted.length} matches from ${subUrl}`);
                }
              } catch (e) { /* ignore per-sub-group errors */ }
            }
          } catch (e) { console.warn('[DSS] sub-group follow failed', e); }
        }

        try {
          let ev = extractRatingsFromEventDoc(pdoc);
          if ((!ev || (!Object.keys(ev.profiles||{}).length && !Object.keys(ev.ratings||{}).length))) {
            try {
              const possibleEventAnchor = pdoc.querySelector('a[href*="event.aspx"], a[href*="/sport/event.aspx"], a[href*="event="]');
              if (possibleEventAnchor) {
                const evHref = toAbsUrl(possibleEventAnchor.getAttribute('href'));
                if (evHref && !processedCategoryUrls.has(evHref)) {
                  _log('[DSS] No event-level ratings on category page; fetching event overview', evHref);
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

        const noMatches = !extracted || extracted.length === 0;
        const someLackResult = Array.isArray(extracted) && extracted.length > 0 && extracted.some(m => !m.result);
        const needsIframeFallback = noMatches || someLackResult;
        // Separate the two triggers: "no matches at all" is the fallback's real purpose,
        // while "some match has no result yet" fires on any category with an unplayed
        // match and is the suspected cost. The counters tell us which one dominates.
        if (noMatches) dssTiming.count('iframe: no matches');
        if (someLackResult) dssTiming.count('iframe: missing result flag');
        if (needsIframeFallback) {
          _log('[DSS] fetch-extracted matches missing or lacking result flags; trying iframe for', targetHref);
          try {
            const iframeDoc = await dssTiming.track('iframe fallback', () => loadGroupPageViaIframe(targetHref));
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
              if (iframeExtracted && iframeExtracted.length) { extracted = iframeExtracted; _log('[DSS] Iframe extracted', extracted.length, 'matches from', targetHref); } else { _log('[DSS] Iframe extracted 0 matches from', targetHref); }
            }
          } catch (e) { console.warn('[DSS] iframe fallback failed for', targetHref, e); }
        } else {
          _log('[DSS] Extracted', extracted.length, 'matches from', targetHref);
        }

        // (processedCategoryUrls.add already called before first await, above)
        try { discoveredCategoryUrls.add(targetHref); } catch (e) {}
        categoryFetchCount++;
        if (categoryFetchCount % 8 === 0) {
          const status = document.getElementById('matchStatus'); if (status) status.textContent = `Processed ${categoryFetchCount} category pages...`;
          await new Promise(r => setTimeout(r, 20));
        }

        return { targetHref, extracted };
      } catch (e) { console.warn('[DSS] Failed to fetch category page', targetHref, e); try { processedCategoryUrls.add(targetHref); } catch (e) {} return null; }
    }, DSS_IFRAME_CONCURRENCY);
    dssTiming.mark(`category pages (${categoryEntries.length})`, _tCats);

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
      _log('[DSS] findAllSimilarCategories: Dropped', (collectedMatches.length - placeholderFiltered.length), 'matches containing placeholders (Groep/Bye).');
    }
    collectedMatches.length = 0;
    collectedMatches.push(...placeholderFiltered);

    if (collectedMatches.length) {
      // Deduplicate extracted matches by signature to avoid storing the same match
      const uniq = [];
      const seen = new Set();
      collectedMatches.forEach(m => {
        const sig = _ku.matchSignature(m);
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
          try { _log('[DSS] enhancing match: chosenRaw=', rawLabel, 'compact=', compact, 'candidates=', candidates); } catch(e){}
          return { ...m, _playerProfiles: existing, category: compact, categoryRaw: rawLabel };
        });
        // Persist both enhanced matches and the discovered profiles/ratings cache so the importer can consult them
        chrome.storage.local.set({ importedMatches: enhanced, importedProfilesCache: { profiles: discoveredProfiles, ratings: discoveredRatings } }, () => {
          _log(`[DSS] findAllSimilarCategories: Stored ${enhanced.length} extracted matches to storage.importedMatches (${collectedMatches.length} before dedupe).`);
          const status = document.getElementById('matchStatus');
          if (status) {
            status.textContent = `Found ${enhanced.length} matches. Loading into the panel...`;
          }
          loadImportedMatches();
        });
      } catch (e) {
        console.warn('[DSS] findAllSimilarCategories: Failed to store importedMatches', e);
      }
      _log('[DSS] findAllSimilarCategories: processed', processedProfileUrls.size, 'profiles, fetched', discoveredCategoryUrls.size, 'unique categories (categoryFetchCount=', categoryFetchCount, ').');
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
    dssTiming.mark('TOTAL', _tFindAll);
    dssTiming.report('Find all');
  }
}
