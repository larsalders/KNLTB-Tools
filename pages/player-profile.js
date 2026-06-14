(function () {
  if (!window.location.href.includes("/player-profile/")) return;

  let allSeasonMatches = {
    singles: [],
    doubles: [],
    padel: []
  };

  let chartVisible = false;
  let tableVisible = false;
  let statsVisible = false;
  let _chartBtn = null;
  let _tableBtn = null;
  let _statsBtn = null;
  let _panel = null;
  let _contentWrap = null;
  let dateFilter = { start: null, end: null };
  let _dateFilterRow = null;
  let _importBtn = null;
  let _importAllBtn = null;
  let _progressBar = null;
  let _progressFill = null;
  let _progressLabel = null;
  let _sliderMinTs = 0;
  let _sliderMaxTs = 0;
  let _sliderStartTs = 0;
  let _sliderEndTs = 0;
  let _snapDates = []; // sorted ISO date strings of all imported matches
  let _activeTableCat = null; // remembers which tab was open in the matches table
  let _activeStatsCat = null; // remembers which tab was open in the stats panel

  function setStatus(message, kind = "info") {
    const el = document.getElementById("knltbStatus");
    if (!el) return;
    el.innerHTML = message;
    el.style.color = kind === "error" ? "#b00020" : "#222";
  }

  function updateProgress(pct, label) {
    if (!_progressBar) return;
    if (pct === null) {
      _progressBar.style.display = 'none';
      return;
    }
    _progressBar.style.display = '';
    if (_progressFill) _progressFill.style.width = pct + '%';
    if (_progressLabel) _progressLabel.textContent = label || '';
  }

  function getFilteredMatches(cat) {
    return allSeasonMatches[cat].filter(m => {
      if (dateFilter.start && m.date < dateFilter.start) return false;
      if (dateFilter.end && m.date > dateFilter.end) return false;
      return true;
    });
  }

  function updateFilterCount() {
    const countEl = document.getElementById('knltbDateFilterCount');
    if (!countEl) return;
    const total = ["singles", "doubles", "padel"].reduce((s, cat) => s + allSeasonMatches[cat].length, 0);
    const filtered = ["singles", "doubles", "padel"].reduce((s, cat) => s + getFilteredMatches(cat).length, 0);
    countEl.textContent = (dateFilter.start || dateFilter.end) ? `${filtered}/${total} matches` : `${total} matches`;
  }

  function buildSliderUI() {
    if (!_dateFilterRow) return;
    _dateFilterRow.innerHTML = '';

    function tsToIso(ts) {
      const d = new Date(ts);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    function tsToLabel(ts) {
      return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    }
    function tsToFrac(ts) {
      if (_sliderMaxTs === _sliderMinTs) return 0;
      return (ts - _sliderMinTs) / (_sliderMaxTs - _sliderMinTs);
    }
    function fracToTs(f) {
      return _sliderMinTs + Math.max(0, Math.min(1, f)) * (_sliderMaxTs - _sliderMinTs);
    }
    // Snap raw timestamp to the nearest actual match date.
    const _snapTs = _snapDates.map(iso => new Date(iso).getTime());
    function snapToNearest(rawTs) {
      if (!_snapTs.length) return rawTs;
      return _snapTs.reduce((best, ts) =>
        Math.abs(ts - rawTs) < Math.abs(best - rawTs) ? ts : best
      );
    }

    // Header row: label + count + clear button
    const hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex; align-items:center; gap:6px; margin-bottom:5px;';

    const lbl = document.createElement('span');
    lbl.textContent = 'Filter:';
    lbl.style.cssText = 'font-size:11px; color:#555; white-space:nowrap; font-weight:600;';

    const countSpan = document.createElement('span');
    countSpan.id = 'knltbDateFilterCount';
    countSpan.style.cssText = 'font-size:10px; color:#888;';

    const clearBtn = document.createElement('button');
    clearBtn.textContent = '✕';
    clearBtn.title = 'Reset date filter';
    clearBtn.style.cssText = 'font-size:10px; padding:0 5px; line-height:16px; border:1px solid #ccc; border-radius:4px; cursor:pointer; background:#fff; color:#888; margin-left:auto;';

    hdr.appendChild(lbl);
    hdr.appendChild(countSpan);
    hdr.appendChild(clearBtn);
    _dateFilterRow.appendChild(hdr);

    // Slider track area
    const sliderWrap = document.createElement('div');
    sliderWrap.style.cssText = 'position:relative; height:32px; margin:0 7px; user-select:none; touch-action:none;';

    const track = document.createElement('div');
    track.style.cssText = 'position:absolute; left:0; right:0; top:50%; height:4px; margin-top:-2px; background:#e0e0e0; border-radius:2px;';

    const fill = document.createElement('div');
    fill.style.cssText = 'position:absolute; top:50%; height:4px; margin-top:-2px; background:#193291; border-radius:2px;';

    function mkThumb() {
      const t = document.createElement('div');
      t.style.cssText = 'position:absolute; top:50%; width:26px; height:26px; margin-top:-13px; background:#193291; border:2px solid #fff; border-radius:50%; cursor:grab; transform:translateX(-50%); box-shadow:0 1px 4px rgba(0,0,0,.3); z-index:2;';
      return t;
    }
    const startThumb = mkThumb();
    const endThumb = mkThumb();

    sliderWrap.appendChild(track);
    sliderWrap.appendChild(fill);

    // One dot per match date, colored by result, with a hover tooltip.
    function showSliderTooltip(anchor, matches, iso) {
      let el = document.getElementById('knltbSliderTooltip');
      if (!el) {
        el = document.createElement('div');
        el.id = 'knltbSliderTooltip';
        el.style.cssText = 'position:fixed; z-index:10002; background:#fff; border:1px solid #ddd; border-radius:8px; box-shadow:0 6px 18px rgba(0,0,0,.12); padding:8px 10px; font:12px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif; color:#222; pointer-events:none; max-width:300px;';
        document.body.appendChild(el);
      }
      const dateStr = new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      const rows = matches.map((m, idx) => {
        const catLabel = m.cat.charAt(0).toUpperCase() + m.cat.slice(1);
        const myTeam  = (m.meta.myTeam  || []).join(' / ') || '—';
        const oppTeam = (m.meta.oppTeam || []).join(' / ') || '—';
        const ratingStr = m.rating !== null ? m.rating.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : '—';
        const impactNum = typeof m.meta.impact === 'number' ? m.meta.impact : null;
        const impactStr = impactNum !== null ? (impactNum >= 0 ? `+${impactNum.toLocaleString(undefined, { maximumFractionDigits: 4 })}` : impactNum.toLocaleString(undefined, { maximumFractionDigits: 4 })) : null;
        const impactColor = impactNum === null ? '#666' : (impactNum < 0 ? '#0a7f2e' : '#b00020');
        const resultColor = m.meta.result === 'W' ? '#22a84a' : m.meta.result === 'L' ? '#d93025' : '#888';
        const sep = idx > 0 ? '<div style="border-top:1px solid #f0f0f0;margin:5px 0;"></div>' : '';
        return `${sep}
          <div style="display:flex;gap:6px;align-items:baseline;flex-wrap:wrap;margin-bottom:2px;">
            <span style="font-weight:600;">${catLabel}</span>
            ${m.meta.result ? `<span style="font-weight:600;color:${resultColor};">${m.meta.result === 'W' ? 'Won' : 'Lost'}</span>` : ''}
            ${m.meta.tournament ? `<span style="opacity:.65;font-size:11px;">${m.meta.tournament}${m.meta.round ? ` – ${m.meta.round}` : ''}</span>` : ''}
          </div>
          <div style="opacity:.7;font-size:11px;margin-bottom:3px;">${myTeam} vs ${oppTeam}</div>
          <div style="display:flex;gap:10px;align-items:baseline;">
            <span><span style="opacity:.7;">Rating</span> <strong>${ratingStr}</strong></span>
            ${impactStr !== null ? `<span style="font-weight:600;color:${impactColor};">${impactStr}</span>` : ''}
          </div>`;
      }).join('');
      el.innerHTML = `<div style="font-weight:600;margin-bottom:5px;">${dateStr}</div>${rows}`;
      const wasVisible = el.style.display === 'block';
      if (!wasVisible) { el.style.visibility = 'hidden'; el.style.display = 'block'; }
      const ttH = el.offsetHeight, ttW = el.offsetWidth;
      const rect = anchor.getBoundingClientRect();
      let left = rect.left + rect.width / 2 - ttW / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - ttW - 8));
      el.style.left = left + 'px';
      el.style.top = (rect.top - ttH - 8) + 'px';
      if (!wasVisible) el.style.visibility = '';
    }

    _snapDates.forEach(iso => {
      const ts = new Date(iso).getTime();
      const frac = tsToFrac(ts);
      const matchesOnDate = ['singles', 'doubles', 'padel'].flatMap(cat =>
        allSeasonMatches[cat].filter(m => m.date === iso).map(m => ({ ...m, cat }))
      );
      let color = '#bbb';
      if (matchesOnDate.some(m => m.meta.result === 'L')) color = '#d93025';
      else if (matchesOnDate.some(m => m.meta.result === 'W')) color = '#22a84a';
      const dot = document.createElement('div');
      dot.style.cssText = `position:absolute;left:${frac * 100}%;top:50%;width:10px;height:10px;margin-top:-5px;background:${color};border:2px solid rgba(255,255,255,0.9);border-radius:50%;transform:translateX(-50%);z-index:1;cursor:default;box-shadow:0 1px 3px rgba(0,0,0,.2);`;
      dot.addEventListener('mouseenter', () => showSliderTooltip(dot, matchesOnDate, iso));
      dot.addEventListener('mouseleave', () => {
        const tt = document.getElementById('knltbSliderTooltip');
        if (tt) tt.style.display = 'none';
      });
      sliderWrap.appendChild(dot);
    });

    sliderWrap.appendChild(startThumb);
    sliderWrap.appendChild(endThumb);
    _dateFilterRow.appendChild(sliderWrap);

    // Date labels below slider
    const dlRow = document.createElement('div');
    dlRow.style.cssText = 'display:flex; justify-content:space-between; font-size:10px; color:#888; margin:3px 7px 0;';
    const dlStart = document.createElement('span');
    const dlEnd = document.createElement('span');
    dlRow.appendChild(dlStart);
    dlRow.appendChild(dlEnd);
    _dateFilterRow.appendChild(dlRow);

    function updateUI() {
      const sf = tsToFrac(_sliderStartTs);
      const ef = tsToFrac(_sliderEndTs);
      startThumb.style.left = (sf * 100) + '%';
      endThumb.style.left = (ef * 100) + '%';
      fill.style.left = (sf * 100) + '%';
      fill.style.right = ((1 - ef) * 100) + '%';
      dlStart.textContent = tsToLabel(_sliderStartTs);
      dlEnd.textContent = tsToLabel(_sliderEndTs);
    }

    function applyFilter() {
      dateFilter.start = _sliderStartTs <= _sliderMinTs ? null : tsToIso(_sliderStartTs);
      dateFilter.end = _sliderEndTs >= _sliderMaxTs ? null : tsToIso(_sliderEndTs);
      updateFilterCount();
    }

    function makeDraggable(thumb, isStart) {
      function startDrag(startClientX) {
        thumb.style.cursor = 'grabbing';
        function onMove(clientX) {
          const rect = sliderWrap.getBoundingClientRect();
          const snapped = snapToNearest(fracToTs((clientX - rect.left) / rect.width));
          if (isStart) {
            _sliderStartTs = Math.min(snapped, _sliderEndTs);
          } else {
            _sliderEndTs = Math.max(snapped, _sliderStartTs);
          }
          updateUI();
          applyFilter();
          const iso = tsToIso(snapped);
          const matchesOnDate = ['singles', 'doubles', 'padel'].flatMap(cat =>
            allSeasonMatches[cat].filter(m => m.date === iso).map(m => ({ ...m, cat }))
          );
          if (matchesOnDate.length > 0) {
            showSliderTooltip(thumb, matchesOnDate, iso);
          } else {
            const tt = document.getElementById('knltbSliderTooltip');
            if (tt) tt.style.display = 'none';
          }
        }
        function onMouseMove(e) { onMove(e.clientX); }
        function onTouchMove(e) { e.preventDefault(); onMove(e.touches[0].clientX); }
        function onUp() {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onUp);
          document.removeEventListener('touchmove', onTouchMove);
          document.removeEventListener('touchend', onTouchEnd);
          thumb.style.cursor = 'grab';
          const tt = document.getElementById('knltbSliderTooltip');
          if (tt) tt.style.display = 'none';
          refreshViews();
        }
        function onTouchEnd() { onUp(); }
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchmove', onTouchMove, { passive: false });
        document.addEventListener('touchend', onTouchEnd);
        onMove(startClientX);
      }
      thumb.addEventListener('mousedown', e => {
        e.preventDefault();
        startDrag(e.clientX);
      });
      thumb.addEventListener('touchstart', e => {
        e.preventDefault();
        startDrag(e.touches[0].clientX);
      }, { passive: false });
    }
    makeDraggable(startThumb, true);
    makeDraggable(endThumb, false);

    clearBtn.onclick = () => {
      _sliderStartTs = _sliderMinTs;
      _sliderEndTs = _sliderMaxTs;
      dateFilter.start = null;
      dateFilter.end = null;
      updateUI();
      updateFilterCount();
      refreshViews();
    };

    updateUI();
  }

  function updateDateFilterBounds() {
    const allDates = ["singles", "doubles", "padel"]
      .flatMap(cat => allSeasonMatches[cat].map(m => m.date))
      .filter(Boolean);
    _snapDates = [...new Set(allDates)].sort();
    if (_snapDates.length === 0 || !_dateFilterRow) return;
    _sliderMinTs = new Date(_snapDates[0]).getTime();
    _sliderMaxTs = new Date(_snapDates[_snapDates.length - 1]).getTime();
    _sliderStartTs = _sliderMinTs;
    _sliderEndTs = _sliderMaxTs;
    dateFilter.start = null;
    dateFilter.end = null;
    buildSliderUI();
    _dateFilterRow.style.display = 'block';
    updateFilterCount();
  }

  function refreshViews() {
    if (chartVisible) {
      processMatches({ inPlace: true });
    }
    if (tableVisible) {
      const existing = document.getElementById("knltbMatchTable");
      if (existing) existing.remove();
      tableVisible = false;
      showMatchesTable();
    }
    if (statsVisible) {
      const existing = document.getElementById("knltbStatsPanel");
      if (existing) existing.remove();
      statsVisible = false;
      showSeasonStats();
    }
  }

  function getProfilePlayerName() {
    const titleEl = document.querySelector("h2.media__title--large");
    if (titleEl) {
      const valueEl = titleEl.querySelector(".nav-link__value");
      if (valueEl && valueEl.textContent) {
        const name = valueEl.textContent.trim();
        console.log("👤 Detected player name (title-scoped):", name);
        return name;
      }
    }

    const direct = document.querySelector(".media__title .nav-link__value, .media__title--large .nav-link__value");
    if (direct && direct.textContent) {
      const name = direct.textContent.trim();
      console.log("👤 Detected player name (direct selector):", name);
      return name;
    }

    const headings = [...document.querySelectorAll("h1, h2, h3")]
      .map(el => el.textContent.trim())
      .filter(text => text && !text.includes("MijnKNLTB") && !text.includes("KNLTB"));

    const nameLike = headings.find(text => /\p{L}[\p{L}'\-]+(?:\s+[\p{L}'\-]+){1,}/u.test(text));
    if (nameLike) {
      const cleaned = nameLike.replace(/\s*\(\d+\)$/, "").trim();
      console.log("👤 Detected player name (fallback regex):", cleaned);
      return cleaned;
    }

    console.warn("⚠️ Could not detect player name via selectors or headings.");
    return null;
  }

  function getProfileMemberId() {
    const titleEl = document.querySelector("h2.media__title--large");
    if (titleEl) {
      const aside = titleEl.querySelector(".media__title-aside");
      if (aside) {
        const m = aside.textContent.trim().match(/\((\d+)\)/);
        if (m) return m[1];
      }
    }

    const asideGlobal = document.querySelector(".media__title-aside");
    if (asideGlobal) {
      const m = asideGlobal.textContent.trim().match(/\((\d+)\)/);
      if (m) return m[1];
    }

    try {
      const url = new URL(window.location.href);
      const byParam = url.searchParams.get("player");
      if (byParam && /^\d+$/.test(byParam)) return byParam;
      const pathM = url.pathname.match(/\/(?:player|member)\/(\d+)/i);
      if (pathM) return pathM[1];
    } catch (_) {}
    return null;
  }

  // Wait until the DOM has been quiet for `quietMs` with a hard `maxMs` cap.
  function waitForDomStable(container, quietMs, maxMs, callback) {
    let done = false;
    let quietTimer = null;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(hardTimer);
      obs.disconnect();
      callback();
    };
    const obs = new MutationObserver(() => {
      clearTimeout(quietTimer);
      quietTimer = setTimeout(finish, quietMs);
    });
    obs.observe(container, { childList: true, subtree: true });
    quietTimer = setTimeout(finish, quietMs); // fires immediately if already stable
    const hardTimer = setTimeout(finish, maxMs);
  }

  // Deduplicate allSeasonMatches in-place using date+teams+score as the key.
  // Guards against accumulating duplicate matches when a season's content is
  // re-parsed because the DOM accumulated nodes from a previous season.
  function deduplicateAllMatches() {
    ['singles', 'doubles', 'padel'].forEach(cat => {
      const seen = new Set();
      allSeasonMatches[cat] = allSeasonMatches[cat].filter(m => {
        const key = [
          m.date,
          (m.meta.myTeam  || []).join('|'),
          (m.meta.oppTeam || []).join('|'),
          (m.meta.sets    || []).map(([a, b]) => `${a}-${b}`).join(',')
        ].join('::');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });
  }

  function showSeasonSlider() {
    const existing = document.getElementById('knltbSeasonSlider');
    if (existing) { existing.remove(); return; }

    const tabstrips = [...document.querySelectorAll('ul.js-tabstrip[data-tabcontentid]')];
    const groups = tabstrips
      .map(ts => [...ts.querySelectorAll('a.js-tab.page-nav__link')])
      .filter(tabs => tabs.length > 0);

    if (groups.length === 0) {
      setStatus("❌ Could not find season tabs. Are you on a player profile page?", "error");
      return;
    }

    const maxRounds = Math.max(...groups.map(g => g.length));
    // seasons[0] = oldest (page index maxRounds-1), seasons[n-1] = newest (page index 0)
    const seasons = Array.from({ length: maxRounds }, (_, i) => {
      const pageIdx = maxRounds - 1 - i;
      const full = groups.filter(g => pageIdx < g.length).map(g => g[pageIdx].textContent.trim()).join(' / ');
      const m = full.match(/\b(\d{4})[\/\-](\d{4})\b/);
      const short = m ? m[1].slice(2) + '/' + m[2].slice(2) : full.replace(/seizoen\s*/i, '').trim().slice(0, 8);
      return { pageIdx, full, short };
    });

    let selStart = 0;
    let selEnd = seasons.length - 1;

    const wrap = document.createElement('div');
    wrap.id = 'knltbSeasonSlider';
    wrap.style.cssText = 'margin-top:6px;';

    const hdr = document.createElement('div');
    hdr.style.cssText = 'font-size:11px; font-weight:600; color:#555; margin-bottom:4px;';
    hdr.textContent = 'Season range:';
    wrap.appendChild(hdr);

    const sliderWrap = document.createElement('div');
    sliderWrap.style.cssText = 'position:relative; height:32px; margin:0 7px; user-select:none; touch-action:none;';

    const track = document.createElement('div');
    track.style.cssText = 'position:absolute; left:0; right:0; top:50%; height:4px; margin-top:-2px; background:#e0e0e0; border-radius:2px;';
    const fill = document.createElement('div');
    fill.style.cssText = 'position:absolute; top:50%; height:4px; margin-top:-2px; background:#193291; border-radius:2px;';
    sliderWrap.appendChild(track);
    sliderWrap.appendChild(fill);

    seasons.forEach((_, i) => {
      const frac = seasons.length === 1 ? 0.5 : i / (seasons.length - 1);
      const dot = document.createElement('div');
      dot.style.cssText = `position:absolute; left:${frac*100}%; top:50%; width:8px; height:8px; margin-top:-4px; background:#bbb; border:2px solid rgba(255,255,255,0.9); border-radius:50%; transform:translateX(-50%); z-index:1;`;
      sliderWrap.appendChild(dot);
    });

    function mkThumb() {
      const t = document.createElement('div');
      t.style.cssText = 'position:absolute; top:50%; width:26px; height:26px; margin-top:-13px; background:#193291; border:2px solid #fff; border-radius:50%; cursor:grab; transform:translateX(-50%); box-shadow:0 1px 4px rgba(0,0,0,.3); z-index:2;';
      return t;
    }
    const startThumb = mkThumb();
    const endThumb = mkThumb();
    sliderWrap.appendChild(startThumb);
    sliderWrap.appendChild(endThumb);
    wrap.appendChild(sliderWrap);

    // Season labels positioned under each dot
    const labelRow = document.createElement('div');
    labelRow.style.cssText = 'position:relative; height:14px; margin:3px 7px 0;';
    seasons.forEach(({ short }, i) => {
      const frac = seasons.length === 1 ? 0.5 : i / (seasons.length - 1);
      const lbl = document.createElement('div');
      lbl.style.cssText = `position:absolute; left:${frac*100}%; transform:translateX(-50%); font-size:9px; color:#aaa; white-space:nowrap;`;
      lbl.textContent = short;
      labelRow.appendChild(lbl);
    });
    wrap.appendChild(labelRow);

    const summary = document.createElement('div');
    summary.style.cssText = 'font-size:11px; color:#193291; font-weight:600; text-align:center; margin-top:6px;';
    wrap.appendChild(summary);

    const importRangeBtn = window.KNLTBPanel.createButton('📥 Import', 'Import selected season range', {
      background: '#193291', color: '#fff'
    });
    importRangeBtn.style.width = '100%';
    importRangeBtn.style.marginTop = '8px';
    importRangeBtn.style.padding = '7px 4px';
    importRangeBtn.addEventListener('click', () => {
      const selected = seasons.slice(selStart, selEnd + 1).map(s => s.pageIdx);
      wrap.remove();
      importAllSeasons(selected);
    });
    wrap.appendChild(importRangeBtn);

    function fracToIdx(f) {
      return Math.round(Math.max(0, Math.min(1, f)) * (seasons.length - 1));
    }

    function updateUI() {
      const n = seasons.length;
      const sf = n === 1 ? 0.5 : selStart / (n - 1);
      const ef = n === 1 ? 0.5 : selEnd / (n - 1);
      startThumb.style.left = (sf * 100) + '%';
      endThumb.style.left = (ef * 100) + '%';
      fill.style.left = (sf * 100) + '%';
      fill.style.right = ((1 - ef) * 100) + '%';
      const count = selEnd - selStart + 1;
      summary.textContent = `${seasons[selStart].short} – ${seasons[selEnd].short}  (${count} season${count !== 1 ? 's' : ''})`;
    }

    function makeDraggable(thumb, isStart) {
      function startDrag(clientX) {
        thumb.style.cursor = 'grabbing';
        function onMove(clientX) {
          const rect = sliderWrap.getBoundingClientRect();
          const idx = fracToIdx((clientX - rect.left) / rect.width);
          if (isStart) { selStart = Math.min(idx, selEnd); }
          else { selEnd = Math.max(idx, selStart); }
          updateUI();
        }
        function onMouseMove(e) { onMove(e.clientX); }
        function onTouchMove(e) { e.preventDefault(); onMove(e.touches[0].clientX); }
        function onUp() {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onUp);
          document.removeEventListener('touchmove', onTouchMove);
          document.removeEventListener('touchend', onTouchEnd);
          thumb.style.cursor = 'grab';
        }
        function onTouchEnd() { onUp(); }
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchmove', onTouchMove, { passive: false });
        document.addEventListener('touchend', onTouchEnd);
        onMove(clientX);
      }
      thumb.addEventListener('mousedown', e => { e.preventDefault(); startDrag(e.clientX); });
      thumb.addEventListener('touchstart', e => { e.preventDefault(); startDrag(e.touches[0].clientX); }, { passive: false });
    }

    makeDraggable(startThumb, true);
    makeDraggable(endThumb, false);
    updateUI();

    const statusEl = document.getElementById('knltbStatus');
    if (statusEl && statusEl.parentElement) {
      statusEl.parentElement.insertBefore(wrap, statusEl);
    } else {
      _contentWrap.appendChild(wrap);
    }

    requestAnimationFrame(fitPanelToContent);
  }

  function importAllSeasons(selectedRounds) {
    const tabstrips = [...document.querySelectorAll('ul.js-tabstrip[data-tabcontentid]')];
    const groups = tabstrips
      .map(ts => [...ts.querySelectorAll('a.js-tab.page-nav__link')])
      .filter(tabs => tabs.length > 0);

    if (groups.length === 0) {
      setStatus("❌ Could not find season tabs. Are you on a player profile page?", "error");
      return;
    }

    const maxRounds = Math.max(...groups.map(g => g.length));
    const roundsToProcess = selectedRounds || Array.from({ length: maxRounds }, (_, i) => i);

    console.log(`🗓️ Found ${groups.length} sport sections, processing ${roundsToProcess.length} season(s)`);
    groups.forEach((g, i) => console.log(`  Section ${i + 1}:`, g.map(t => t.textContent.trim())));

    allSeasonMatches = { singles: [], doubles: [], padel: [] };
    dateFilter = { start: null, end: null };
    if (_dateFilterRow) _dateFilterRow.style.display = 'none';

    if (_importBtn) _importBtn.disabled = true;
    if (_importAllBtn) _importAllBtn.disabled = true;

    let step = 0;

    function processNextRound() {
      if (step >= roundsToProcess.length) {
        deduplicateAllMatches();
        const counts = Object.entries(allSeasonMatches)
          .map(([cat, arr]) => `${cat}: <strong>${arr.length}</strong>`)
          .join(", ");
        setStatus(`✅ Imported ${roundsToProcess.length} season(s) — ${counts}`);
        updateProgress(null);
        if (_importBtn) _importBtn.disabled = false;
        if (_importAllBtn) _importAllBtn.disabled = false;
        updateDateFilterBounds();
        refreshViews();
        requestAnimationFrame(fitPanelToContent);
        return;
      }

      const round = roundsToProcess[step];
      const tabsThisRound = groups
        .filter(g => round < g.length)
        .map(g => g[round]);

      const seasonLabel = tabsThisRound.map(t => t.textContent.trim()).join(' / ');
      const basePct = Math.round((step / roundsToProcess.length) * 100);
      const nextPct = Math.round(((step + 1) / roundsToProcess.length) * 100);

      setStatus(`⏳ ${step + 1}/${roundsToProcess.length}: ${seasonLabel}`);
      updateProgress(basePct, `Loading ${seasonLabel}…`);
      tabsThisRound.forEach(t => t.click());
      step++;

      // Both sections load independently — one stability window covers both.
      waitForDomStable(document.body, 700, 8000, () => {
        updateProgress(basePct + Math.round((nextPct - basePct) * 0.35), `Expanding details for ${seasonLabel}…`);
        expandAllDetails(() => {
          updateProgress(basePct + Math.round((nextPct - basePct) * 0.5), `Parsing ${seasonLabel}…`);
          parseSeasonMatchesAsync(
            (matchNum, total, info) => {
              const pct = basePct + Math.round((nextPct - basePct) * (0.5 + 0.5 * matchNum / total));
              const icon = info.result === 'W' ? '✅' : info.result === 'L' ? '❌' : info.skipped ? '·' : '—';
              updateProgress(pct, `${matchNum}/${total} · ${info.date || '?'} · ${info.category || ''} ${icon}`);
            },
            processNextRound
          );
        });
      });
    }

    processNextRound();
  }

  function expandAllDetails(callback) {
    const buttons = [...document.querySelectorAll(".btn--more-details")].filter(btn => {
      const panel = btn.closest('.accordion');
      if (!panel) return true;
      for (const titleEl of panel.querySelectorAll('.accordion__header .stats__title')) {
        if (titleEl.textContent.trim() === 'Wedstrijden') {
          const valueEl = titleEl.nextElementSibling;
          if (valueEl && valueEl.textContent.trim() === '0') return false;
        }
      }
      return true;
    });
    if (buttons.length === 0) return callback();

    let index = 0;
    function clickNext() {
      if (index >= buttons.length) {
        // All accordion buttons clicked.  The per-match AJAX calls replace the
        // form contents (not the element itself), so we can't watch for element
        // removal.  Instead use DOM stability: when the DOM has been quiet for
        // 1 s all responses have arrived.
        waitForDomStable(document.body, 1000, 20000, callback);
        return;
      }
      buttons[index++].click();
      setTimeout(clickNext, 300);
    }
    clickNext();
  }

  const normalizeName = (name) => {
    if (window.KNLTBUtils && typeof window.KNLTBUtils.normalizeName === 'function') {
      return window.KNLTBUtils.normalizeName(name);
    }
    if (typeof name !== 'string') return '';
    return name.toLowerCase().replace(/\s+/g, " ").trim();
  };

  function detectSportCategory(matchItem) {
    let cursor = matchItem;
    while (cursor) {
      if (cursor === document.body || cursor === document.documentElement) break;
      if (cursor.querySelector) {
        const titleEl = cursor.querySelector(".module__title-main");
        if (titleEl && titleEl.textContent) {
          const t = titleEl.textContent.trim().toLowerCase();
          if (t.includes("padel")) return "padel";
        }
      }
      cursor = cursor.parentElement;
    }
    return detectCategory(matchItem);
  }

  function detectCategory(matchItem) {
    const playerRows = matchItem.querySelectorAll(".match__row");
    if (playerRows.length !== 2) return "singles";

    const playersPerTeam = Array.from(playerRows).map(row => {
      return row.querySelectorAll(".match__row-title-value").length;
    });

    if (playersPerTeam.every(count => count === 1)) return "singles";
    if (playersPerTeam.every(count => count === 2)) return "doubles";
    return "padel";
  }

  function parseSeasonMatchesAsync(onProgress, onDone) {
    const profileName = getProfilePlayerName();
    if (!profileName) {
      setStatus("❌ Could not determine player name.", "error");
      onDone && onDone();
      return;
    }
    const normalizedProfileName = normalizeName(profileName);
    const profileMemberId = getProfileMemberId();
    console.log("👤 Detected player (from header when available):", { name: profileName, id: profileMemberId });

    const matchItems = [...document.querySelectorAll("li.match-group__item")];
    const total = matchItems.length;
    console.log(`🔍 Found ${total} match items`);

    let i = 0;
    function processNext() {
      if (i >= total) {
        onDone && onDone();
        return;
      }
      const matchItem = matchItems[i];
      const matchNum = i + 1;
      i++;

      let tickerInfo = { date: null, category: null, result: null, tournament: null, skipped: true };

      const body = matchItem.querySelector(".match__body");
      if (!body) { console.log(`Match ${matchNum}: No .match__body element found`); setTimeout(processNext, 0); return; }

      const playerRows = body.querySelectorAll(".match__row");
      if (playerRows.length !== 2) { console.log(`Match ${matchNum}: Expected 2 player rows, found ${playerRows.length}`); setTimeout(processNext, 0); return; }

      const rowPlayerData = [0, 1].map(rowIdx => {
        const row = playerRows[rowIdx];
        return Array.from(row.querySelectorAll(".match__row-title-value")).map(playerDiv => {
          const nameSpan = playerDiv.querySelector(".nav-link__value");
          const ratingSpan = playerDiv.querySelector(".match__row-title-aside");
          if (!nameSpan) return null;
          const rawName = nameSpan.textContent.trim();
          const name = rawName.replace(/\s*\(.*\)$/, "").trim();
          const normalizedName = normalizeName(name);
          const ratingSpanText = ratingSpan ? ratingSpan.textContent.trim() : "";
          const ratingMatch = ratingSpanText.match(/(\d+(?:[.,]\d+)?)/);
          const ratingStr = ratingMatch ? ratingMatch[1] : null;
          const parsedRating = ratingStr ? parseFloat(ratingStr.replace(",", ".")) : null;
          const playerRating = (parsedRating !== null && !isNaN(parsedRating)) ? parsedRating : null;
          let playerMemberId = null;
          const anchor = playerDiv.querySelector("a.nav-link[href]");
          if (anchor && anchor.getAttribute("href")) {
            const href = anchor.getAttribute("href");
            const idMatch = href.match(/player=([0-9]+)/i) || href.match(/member(?:id)?=([0-9]+)/i) || href.match(/\/player\/([0-9]+)/i);
            if (idMatch) playerMemberId = idMatch[1];
          }
          return { name, normalizedName, playerMemberId, rating: playerRating };
        }).filter(Boolean);
      });

      let rating = null, foundPlayer = false, userRowIdx = null, userPlayerIdx = 0;
      rowPlayerData.forEach((players, rowIdx) => {
        players.forEach((p, pIdx) => {
          const isNameMatch = p.normalizedName === normalizedProfileName;
          const isIdMatch = !!(profileMemberId && p.playerMemberId && p.playerMemberId === profileMemberId);
          console.log(`Match ${matchNum}: Checking player '${p.name}' (norm: '${p.normalizedName}', id: '${p.playerMemberId || "?"}') vs profile {name: '${profileName}', norm: '${normalizedProfileName}', id: '${profileMemberId || "?"}'} , rating: '${p.rating}'`);
          if (isNameMatch || isIdMatch) {
            foundPlayer = true; userRowIdx = rowIdx; userPlayerIdx = pIdx; rating = p.rating;
            console.log(`✅ Match ${matchNum}: Found rating ${rating} for ${p.name}${isIdMatch ? " (matched by ID)" : " (matched by name)"}`);
          }
        });
      });

      const myRowData = (userRowIdx !== null) ? rowPlayerData[userRowIdx] : [];
      const oppRowData = (userRowIdx !== null) ? rowPlayerData[1 - userRowIdx] : [];
      const myTeam = myRowData.map(p => p.name);
      const oppTeam = oppRowData.map(p => p.name);
      const myTeamRatings = myRowData.map(p => p.rating);
      const oppTeamRatings = oppRowData.map(p => p.rating);

      let tournament = null, round = null;
      const header = matchItem.querySelector(".match__header");
      if (header) {
        const navLinks = header.querySelectorAll(".match__header-title-item .nav-link__value");
        if (navLinks.length > 0) {
          tournament = navLinks[0].textContent.trim();
          round = navLinks.length > 1 ? navLinks[navLinks.length - 1].textContent.trim() : null;
        }
      }

      let sets = [];
      const setUls = matchItem.querySelectorAll(".match__result ul.points");
      setUls.forEach(ul => {
        const cells = ul.querySelectorAll(".points__cell");
        if (cells.length >= 2) {
          const a = parseInt(cells[0].textContent.trim(), 10);
          const b = parseInt(cells[1].textContent.trim(), 10);
          if (!Number.isNaN(a) && !Number.isNaN(b)) sets.push([a, b]);
        }
      });
      if (userRowIdx === 1) sets = sets.map(([a, b]) => [b, a]);

      const wonSets = sets.filter(([a, b]) => a > b).length;
      const lostSets = sets.filter(([a, b]) => a < b).length;
      const resultWL = wonSets > lostSets ? "W" : (wonSets < lostSets ? "L" : "");

      let impact = null;
      const impactCandidates = matchItem.querySelectorAll(".match__header-aside .tag:not(.tag--placeholder) span");
      for (const sp of impactCandidates) {
        const txt = sp.textContent.trim();
        const m = txt.match(/-?\d+[.,]\d+/);
        if (m) { impact = parseFloat(m[0].replace(",", ".")); break; }
      }

      const footer = matchItem.querySelector(".match__footer");
      let date = null;
      if (footer) {
        const dateSpan = footer.querySelector(".match__footer-list-item .nav-link__value");
        if (dateSpan) {
          let rawDate = dateSpan.textContent.trim();
          rawDate = rawDate.replace(/^[a-z]{2}\s+/i, "");
          const dateParts = rawDate.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
          if (dateParts) {
            const [_, dd, mm, yyyy] = dateParts;
            rawDate = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
          }
          const parsedDate = new Date(rawDate);
          if (!isNaN(parsedDate)) {
            date = parsedDate.toISOString().split("T")[0];
          } else {
            console.warn(`⚠️ Could not parse date string: "${dateSpan.textContent.trim()}", using raw value`);
            date = rawDate;
          }
          console.log(`Match ${matchNum}: Date found - '${date}'`);
        } else { console.log(`Match ${matchNum}: No date span found in footer`); }
      } else { console.log(`Match ${matchNum}: No .match__footer element found`); }

      if (foundPlayer && rating !== null && date) {
        if (date < '2021-11-01') {
          console.log(`Match ${matchNum}: Skipping — pre-2021/22 season (${date})`);
        } else {
          const category = detectSportCategory(matchItem);
          allSeasonMatches[category].push({
            date, rating, detectIndex: matchNum - 1,
            meta: { myTeam, oppTeam, myTeamRatings, oppTeamRatings, profilePlayerIdx: userPlayerIdx, sets, impact, result: resultWL, tournament, round }
          });
          tickerInfo = { date, category, result: resultWL, tournament, skipped: false };
        }
      } else {
        console.log(`Match ${matchNum}: Skipping because player not found, or rating or date is missing`);
      }

      onProgress && onProgress(matchNum, total, tickerInfo);
      setTimeout(processNext, 0);
    }

    processNext();
  }

  function pointColor(result) {
    if (result === 'W') return '#22a84a';
    if (result === 'L') return '#d93025';
    return '#888888';
  }

  function detectManualChanges(sorted) {
    const changes = [];
    for (let i = 0; i + 1 < sorted.length; i++) {
      const curr = sorted[i];
      const next = sorted[i + 1];
      if (curr.meta.impact === null || curr.meta.impact === undefined) continue;
      if (curr.rating === null || next.rating === null) continue;
      const expected = Math.round((curr.rating + curr.meta.impact) * 10000) / 10000;
      const diff = Math.round((next.rating - expected) * 10000) / 10000;
      if (Math.abs(diff) > 0.5) {
        changes.push({ date: next.date, fromRating: expected, toRating: next.rating, diff });
      }
    }
    return changes;
  }

  function processMatches({ inPlace = false } = {}) {
    const categories = ["singles", "doubles", "padel"];

    if (categories.every(cat => allSeasonMatches[cat].length === 0)) {
      alert("No matches imported yet.");
      return;
    }

    const colors = ["blue", "green", "orange"];
    const sortedArrays = categories.map(cat =>
      getFilteredMatches(cat).slice().sort((a, b) => {
        const da = new Date(a.date);
        const db = new Date(b.date);
        if (da < db) return -1;
        if (da > db) return 1;
        return (b.detectIndex ?? 0) - (a.detectIndex ?? 0);
      })
    );

    const allManualChanges = sortedArrays.map(detectManualChanges);

    const manualColor = '#9c27b0';

    const baseDatasets = sortedArrays.map((sorted, i) => {
      const manualIndices = new Set(
        allManualChanges[i].map(c => sorted.findIndex(m => m.date === c.date))
      );
      return {
        label: categories[i].charAt(0).toUpperCase() + categories[i].slice(1),
        data: sorted.map(m => ({ x: m.date, y: m.rating, meta: m.meta })),
        borderColor: colors[i],
        pointBackgroundColor: sorted.map(m => pointColor(m.meta.result)),
        pointBorderColor: sorted.map(m => pointColor(m.meta.result)),
        pointBorderWidth: 1,
        fill: false,
        tension: 0,
        borderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
        showLine: true,
        segment: {
          borderColor: ctx => manualIndices.has(ctx.p1DataIndex) ? manualColor : undefined,
          borderDash: ctx => manualIndices.has(ctx.p1DataIndex) ? [5, 5] : undefined,
          borderWidth: ctx => manualIndices.has(ctx.p1DataIndex) ? 2.5 : undefined,
        }
      };
    });

    function computeLinearTrendXY(points) {
      const n = points.length;
      if (n < 2) return null;
      let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
      for (let i = 0; i < n; i++) {
        sumX += points[i].x; sumY += points[i].y;
        sumXY += points[i].x * points[i].y; sumXX += points[i].x * points[i].x;
      }
      const denom = n * sumXX - sumX * sumX;
      if (denom === 0) return null;
      const slope = (n * sumXY - sumX * sumY) / denom;
      const intercept = (sumY - slope * sumX) / n;
      const x0 = points[0].x, x1 = points[n - 1].x;
      return { x0, y0: slope * x0 + intercept, x1, y1: slope * x1 + intercept };
    }

    const trendDatasets = baseDatasets.map((ds) => {
      const xy = ds.data
        .filter(p => Number.isFinite(p.y) && p.x)
        .map(p => ({ x: new Date(p.x).getTime(), y: Number(p.y) }))
        .filter(p => !Number.isNaN(p.x) && Number.isFinite(p.y));

      const trend = computeLinearTrendXY(xy);
      if (!trend) return null;

      const fmt = (ms) => {
        const d = new Date(ms);
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      };

      return {
        label: ds.label + " trend",
        data: [{ x: fmt(trend.x0), y: trend.y0 }, { x: fmt(trend.x1), y: trend.y1 }],
        borderColor: ds.borderColor,
        borderDash: [6, 6],
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        tension: 0,
        showLine: true,
        hidden: true
      };
    }).filter(Boolean);

    const todayStr = new Date().toISOString().split('T')[0];
    const projectionDatasets = sortedArrays.map((sorted, i) => {
      if (!sorted.length) return null;
      const last = sorted[sorted.length - 1];
      if (last.meta.impact === null || last.meta.impact === undefined || last.rating === null) return null;
      const currentRating = last.rating + last.meta.impact;
      const projData = last.date >= todayStr
        ? [{ x: last.date, y: currentRating, meta: { _isCurrent: true } }]
        : [
            { x: last.date, y: last.rating, meta: { _projStart: true } },
            { x: todayStr, y: currentRating, meta: { _isCurrent: true } }
          ];
      const endIdx = projData.length - 1;
      return {
        label: categories[i].charAt(0).toUpperCase() + categories[i].slice(1) + ' current',
        _baseLabel: categories[i].charAt(0).toUpperCase() + categories[i].slice(1),
        data: projData,
        borderColor: colors[i],
        borderDash: [5, 5],
        borderWidth: 2,
        pointRadius: projData.map((_, j) => j === endIdx ? 6 : 0),
        pointHoverRadius: projData.map((_, j) => j === endIdx ? 8 : 0),
        pointBackgroundColor: projData.map((_, j) => j === endIdx ? 'white' : 'transparent'),
        pointBorderColor: projData.map(() => colors[i]),
        pointBorderWidth: projData.map((_, j) => j === endIdx ? 2 : 0),
        fill: false,
        tension: 0,
        showLine: true
      };
    }).filter(Boolean);

    const manualHoverDatasets = sortedArrays.flatMap((sorted, i) => {
      const catLabel = categories[i].charAt(0).toUpperCase() + categories[i].slice(1);
      return allManualChanges[i].map(change => {
        const nextIdx = sorted.findIndex(m => m.date === change.date);
        if (nextIdx <= 0) return null;
        const prev = sorted[nextIdx - 1];
        const next = sorted[nextIdx];
        const t1 = new Date(prev.date).getTime();
        const t2 = new Date(next.date).getTime();
        const N = 20;
        const pts = [];
        for (let k = 1; k <= N; k++) {
          const frac = k / (N + 1);
          const d = new Date(t1 + (t2 - t1) * frac);
          const xStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
          pts.push({ x: xStr, y: prev.rating + (next.rating - prev.rating) * frac,
            meta: { _isManualChange: true, targetDate: next.date, diff: change.diff, fromRating: change.fromRating, toRating: change.toRating } });
        }
        return {
          label: catLabel + ' manual change',
          _baseLabel: catLabel,
          data: pts,
          showLine: false,
          borderWidth: 0,
          pointRadius: 0,
          pointHoverRadius: 0,
          pointHitRadius: 12,
          fill: false,
        };
      }).filter(Boolean);
    });

    const datasets = [...baseDatasets, ...trendDatasets, ...projectionDatasets, ...manualHoverDatasets];

    const margin = 0.2;
    function computeYRangeFromVisible(chartLike) {
      let ys = [];
      if (chartLike && chartLike.data) {
        ys = chartLike.data.datasets
          .flatMap((ds, i) => chartLike.isDatasetVisible(i) ? ds.data.map(p => p.y) : []);
      } else {
        ys = datasets.flatMap(ds => ds.data.map(p => p.y));
      }
      if (!ys.length) return { yMin: 0, yMax: 9 };
      return {
        yMin: Math.floor((Math.min(...ys) - margin) * 10) / 10,
        yMax: Math.ceil((Math.max(...ys) + margin) * 10) / 10
      };
    }

    // When refreshing from the filter slider, update the existing chart in-place
    // so the panel layout stays intact (no maximized-mode disruption) and Chart.js
    // doesn't replay its entry animation.
    if (inPlace && window._ratingChart) {
      window._ratingChart.data.datasets = datasets;
      const range = computeYRangeFromVisible(window._ratingChart);
      window._ratingChart.options.scales.y.min = range.yMin;
      window._ratingChart.options.scales.y.max = range.yMax;
      window._ratingChart.update('none');
      return;
    }

    if (window._ratingChart && typeof window._ratingChart.destroy === "function") {
      try { window._ratingChart.destroy(); } catch (_) {}
      window._ratingChart = null;
    }

    const panel = document.getElementById("ratingPanel") || document.body;
    if (panel && panel.id === "ratingPanel") {
      panel.style.flex = "1 1 auto";
      panel.style.minHeight = "200px";
    }

    const existingCanvas = document.getElementById("ratingChart");
    if (existingCanvas) existingCanvas.remove();

    const canvas = document.createElement("canvas");
    canvas.id = "ratingChart";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    panel.appendChild(canvas);
    panel.style.position = panel.style.position || "relative";

    const initialRange = computeYRangeFromVisible();

    window._ratingChart = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        parsing: { xAxisKey: "x", yAxisKey: "y" },
        scales: {
          x: {
            type: "time",
            time: { tooltipFormat: "PPP", unit: "day", displayFormats: { day: "MMM d" } },
            title: { display: true, text: "Date" }
          },
          y: {
            title: { display: true, text: "Rating" },
            min: initialRange.yMin,
            max: initialRange.yMax,
            ticks: {
              stepSize: 0.1,
              callback: value => {
                try { return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 }); }
                catch (e) { return value; }
              }
            }
          }
        },
        plugins: {
          legend: {
            display: true,
            position: "top",
            labels: {
              filter: (legendItem) => !legendItem.text.endsWith(' current') && !legendItem.text.endsWith(' manual change')
            },
            onClick: (e, legendItem, legend) => {
              const ci = legend.chart;
              const newVis = !ci.isDatasetVisible(legendItem.datasetIndex);
              ci.setDatasetVisibility(legendItem.datasetIndex, newVis);
              const clickedLabel = ci.data.datasets[legendItem.datasetIndex].label;
              ci.data.datasets.forEach((ds, idx) => {
                if (ds._baseLabel === clickedLabel) ci.setDatasetVisibility(idx, newVis);
              });
              const range = computeYRangeFromVisible(ci);
              ci.options.scales.y.min = range.yMin;
              ci.options.scales.y.max = range.yMax;
              ci.update();
            }
          },
          tooltip: {
            enabled: false,
            mode: "nearest",
            intersect: false,
            external: (ctx) => {
              const { chart, tooltip } = ctx;
              let el = document.getElementById("ratingChartTooltip");
              if (!el) {
                el = document.createElement("div");
                el.id = "ratingChartTooltip";
                el.style.position = "absolute";
                el.style.pointerEvents = "none";
                el.style.background = "#fff";
                el.style.border = "1px solid #ddd";
                el.style.borderRadius = "8px";
                el.style.boxShadow = "0 6px 18px rgba(0,0,0,0.12)";
                el.style.padding = "8px 10px";
                el.style.font = "12px/1.35 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";
                el.style.color = "#222";
                el.style.zIndex = 10001;
                document.body.appendChild(el);
              }

              if (tooltip.opacity === 0) { el.style.opacity = 0; return; }

              const dataPoint = tooltip.dataPoints && tooltip.dataPoints[0];
              if (!dataPoint) return;

              const raw = dataPoint.raw || {};
              const meta = raw.meta || {};
              if (meta._projStart) { el.style.opacity = 0; return; }

              const dsLabel = dataPoint.dataset && dataPoint.dataset.label ? dataPoint.dataset.label : "";
              const date = new Date(meta.targetDate || raw.x);
              const dateStr = !isNaN(date) ? date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : String(raw.x);
              const ratingVal = Number(raw.y);
              const ratingStr = Number.isFinite(ratingVal) ? ratingVal.toLocaleString(undefined, { maximumFractionDigits: 4 }) : String(raw.y);

              const isManualChange = !!(meta._isManualChange);
              const isCurrent = !!(meta._isCurrent);
              const isTrend = /\btrend\b/i.test(dsLabel) && (!meta || Object.keys(meta).length === 0);
              if (isManualChange) {
                const fmtR = v => Number(v).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
                const diff = meta.diff;
                const diffStr = (diff >= 0 ? '+' : '') + fmtR(diff);
                const diffColor = diff < 0 ? '#0a7f2e' : '#b00020';
                el.innerHTML = `
                  <div style="margin-bottom:6px; display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;">
                    <div style="font-weight:600; font-size:12px; color:#9c27b0;">Manual rating adjustment</div>
                    <div style="opacity:.7;">${dateStr}</div>
                  </div>
                  <div style="display:flex; gap:8px; align-items:center;">
                    <span style="opacity:.7;">${fmtR(meta.fromRating)} → ${fmtR(meta.toRating)}</span>
                    <strong style="color:${diffColor};">${diffStr}</strong>
                  </div>
                `;
              } else if (isCurrent) {
                el.innerHTML = `
                  <div style="margin-bottom:6px; display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;">
                    <div style="font-weight:600; font-size:12px;">${dsLabel.replace(' current', '')} — current rating</div>
                  </div>
                  <div style="display:flex; gap:12px;">
                    <div><span style="opacity:.7;">As of</span> <strong>${dateStr}</strong></div>
                    <div><span style="opacity:.7;">Rating</span> <strong>${ratingStr}</strong></div>
                  </div>
                `;
              } else if (isTrend) {
                el.innerHTML = `
                  <div style="margin-bottom:6px; display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;">
                    <div style="font-weight:600; font-size:12px;">${dateStr}</div>
                    <div style="opacity:.7;">${dsLabel}</div>
                  </div>
                  <div><span style="opacity:.7;">Estimated rating</span> <strong>${ratingStr}</strong></div>
                `;
              } else {
                const myRtgs  = meta.myTeamRatings  || [];
                const oppRtgs = meta.oppTeamRatings || [];
                const teamA = (meta.myTeam  || []).map((n, j) => nameWithRating(n, myRtgs[j])).join(" & ");
                const teamB = (meta.oppTeam || []).map((n, j) => nameWithRating(n, oppRtgs[j])).join(" & ");
                const myGames  = (meta.sets || []).map(([a]) => a);
                const oppGames = (meta.sets || []).map(([,b]) => b);

                const baseChip = 'display:inline-block; padding:0 6px; border-radius:6px; background:#f1f3f5; margin-left:6px; font-size:11px; line-height:18px; min-width:18px; text-align:center;';
                const winnerIsMe = meta.result === 'W';
                const myChip  = winnerIsMe ? baseChip + ' font-weight:600;' : baseChip;
                const oppChip = (!winnerIsMe && meta.result === 'L') ? baseChip + ' font-weight:600;' : baseChip;

                const setsCount = Math.max(myGames.length, oppGames.length);
                const gridCols  = setsCount > 0 ? `auto ${Array(setsCount).fill('max-content').join(' ')}` : 'auto';
                const myCells  = myGames.map(n => `<div><span style="${myChip}">${n}</span></div>`).join('');
                const oppCells = oppGames.map(n => `<div><span style="${oppChip}">${n}</span></div>`).join('');

                const impactNum = typeof meta.impact === 'number' ? meta.impact : null;
                const impactStr = impactNum !== null ? (impactNum >= 0 ? `+${impactNum.toLocaleString(undefined, { maximumFractionDigits: 4 })}` : impactNum.toLocaleString(undefined, { maximumFractionDigits: 4 })) : null;
                const impactColor = impactNum === null ? '#666' : (impactNum < 0 ? '#0a7f2e' : '#b00020');

                const isDoubles = myRtgs.length > 1 || oppRtgs.length > 1;
                const myAvgR  = fmtRtg(avgRating(myRtgs));
                const oppAvgR = fmtRtg(avgRating(oppRtgs));

                // Win probability + hypothetical opposite impact
                const K_RTG = 0.275, Q_RTG = 2.012;
                const avgMeNum  = avgRating(myRtgs);
                const avgOppNum = avgRating(oppRtgs);
                let winProbSpan = '', hypSpan = '';
                if (avgMeNum !== null && avgOppNum !== null) {
                  const winProb = 1 / (1 + Math.exp(Q_RTG * (avgMeNum - avgOppNum)));
                  winProbSpan = `<span style="opacity:.8;">Win% <strong>${(winProb * 100).toFixed(1)}%</strong></span>`;
                  if (impactNum !== null && meta.result) {
                    const hypImpact = meta.result === 'W' ? K_RTG * winProb : K_RTG * (winProb - 1);
                    const sign = hypImpact >= 0 ? '+' : '';
                    const hypStr = sign + hypImpact.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
                    const hypColor = hypImpact < 0 ? '#0a7f2e' : '#b00020';
                    const hypLabel = meta.result === 'W' ? 'If lost' : 'If won';
                    hypSpan = `<span style="opacity:.8;">${hypLabel}: <strong style="color:${hypColor};">${hypStr}</strong></span>`;
                  }
                }

                const statsRow = (isDoubles && (myAvgR || oppAvgR)) || winProbSpan
                  ? `<div style="display:flex; gap:16px; margin-bottom:6px; font-size:11px; opacity:.85; flex-wrap:wrap;">
                      ${isDoubles && myAvgR  ? `<span>My avg <strong>${myAvgR}</strong></span>`  : ''}
                      ${isDoubles && oppAvgR ? `<span>Opp avg <strong>${oppAvgR}</strong></span>` : ''}
                      ${winProbSpan}
                      ${hypSpan}
                    </div>`
                  : '';

                el.innerHTML = `
                  <div style="margin-bottom:6px; display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;">
                    <div style="font-weight:600; font-size:12px;">${dateStr}</div>
                    <div style="opacity:.7;">${dsLabel}</div>
                    ${(meta.tournament || meta.round) ? `<div style="opacity:.6; font-size:11px;">• ${meta.tournament || ''}${meta.round ? ' – ' + meta.round : ''}</div>` : ''}
                  </div>
                  <div style="display:grid; grid-template-columns:${gridCols}; gap:4px 6px; margin-bottom:6px; align-items:center;">
                    <div style="${winnerIsMe ? 'font-weight:600;' : ''}">${teamA}</div>${myCells}
                    <div style="${(!winnerIsMe && meta.result === 'L') ? 'font-weight:600;' : ''}">${teamB}</div>${oppCells}
                  </div>
                  ${statsRow}
                  <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
                    <div><span style="opacity:.7;">Rating</span> <strong>${ratingStr}</strong></div>
                    ${impactStr !== null ? `<div style="font-weight:600; color:${impactColor};">${impactStr}</div>` : ''}
                  </div>
                `;
              }

              const rect = chart.canvas.getBoundingClientRect();
              const vm = 8;
              let left = rect.left + window.scrollX + tooltip.caretX + 10;
              let top  = rect.top  + window.scrollY + tooltip.caretY + 10;
              el.style.opacity = 1;
              const ttW = el.offsetWidth || 220, ttH = el.offsetHeight || 80;
              if (left + ttW > window.scrollX + window.innerWidth - vm) left = rect.left + window.scrollX + tooltip.caretX - ttW - 10;
              if (left < window.scrollX + vm) left = window.scrollX + vm;
              if (top + ttH > window.scrollY + window.innerHeight - vm) top = window.scrollY + window.innerHeight - vm - ttH;
              if (top < window.scrollY + vm) top = window.scrollY + vm;
              el.style.left = left + "px";
              el.style.top  = top + "px";
            }
          }
        }
      }
    });

    if (window._ratingChart && typeof ResizeObserver !== "undefined") {
      if (window._ratingChart._panelObserver) {
        try { window._ratingChart._panelObserver.disconnect(); } catch (_) {}
      }
      const ro = new ResizeObserver(() => { try { window._ratingChart.resize(); } catch (_) {} });
      ro.observe(panel);
      window._ratingChart._panelObserver = ro;
    }

    (function() {
      const ci = window._ratingChart;
      if (!ci) return;
      const range = computeYRangeFromVisible(ci);
      ci.options.scales.y.min = range.yMin;
      ci.options.scales.y.max = range.yMax;
      ci.update();
    })();

    chartVisible = true;
    if (_chartBtn) _chartBtn.textContent = '📊 Hide Chart';
  }

  function hideChart() {
    const existingCanvas = document.getElementById("ratingChart");
    if (existingCanvas) existingCanvas.remove();
    if (window._ratingChart) {
      if (window._ratingChart._panelObserver) {
        try { window._ratingChart._panelObserver.disconnect(); } catch (_) {}
      }
      try { window._ratingChart.destroy(); } catch (_) {}
      window._ratingChart = null;
    }
    const panel = document.getElementById("ratingPanel");
    if (panel) { panel.style.flex = "0 0 auto"; panel.style.minHeight = "20px"; }
    chartVisible = false;
    if (_chartBtn) _chartBtn.textContent = '📊 Chart';
    fitPanelToContent();
  }

  function fitPanelToContent() {
    if (!_panel || !_contentWrap) return;
    const tableEl = _contentWrap.querySelector('table');
    if (tableEl) {
      const wrapperEl = tableEl.parentElement;
      const prevTableW = tableEl.style.width;
      const prevWrapW = wrapperEl ? wrapperEl.style.width : null;
      const prevWrapO = wrapperEl ? wrapperEl.style.overflowX : null;
      tableEl.style.width = 'max-content';
      if (wrapperEl) { wrapperEl.style.width = 'max-content'; wrapperEl.style.overflowX = 'visible'; }
      _panel.style.width = 'max-content';
      const natural = Math.min(Math.max(420, _panel.offsetWidth), Math.floor(window.innerWidth * 0.92));
      _panel.style.width = natural + 'px';
      tableEl.style.width = prevTableW || '100%';
      if (wrapperEl) { wrapperEl.style.width = prevWrapW || '100%'; wrapperEl.style.overflowX = prevWrapO || 'auto'; }
    } else {
      _panel.style.width = '420px';
    }
  }

  function fmtRtg(r) {
    return (r !== null && r !== undefined && !isNaN(r))
      ? Number(r).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })
      : null;
  }

  function avgRating(ratings) {
    const valid = (ratings || []).filter(r => r !== null && r !== undefined && !isNaN(r));
    if (!valid.length) return null;
    return valid.reduce((s, r) => s + r, 0) / valid.length;
  }

  // Format a player name with their rating appended: "Name (7.1234)"
  function nameWithRating(name, rating) {
    const r = fmtRtg(rating);
    return r !== null ? `${name} (${r})` : name;
  }

  function showMatchesTable() {
    const categories = ["singles", "doubles", "padel"];

    if (categories.every(cat => allSeasonMatches[cat].length === 0)) {
      alert("No matches imported yet.");
      return;
    }

    const existing = document.getElementById("knltbMatchTable");
    if (tableVisible && existing) {
      existing.remove();
      tableVisible = false;
      if (_tableBtn) _tableBtn.textContent = '📋 Matches';
      fitPanelToContent();
      return;
    }

    tableVisible = true;
    if (_tableBtn) _tableBtn.textContent = '📋 Hide Matches';

    const container = document.createElement("div");
    container.id = "knltbMatchTable";
    container.style.marginTop = "10px";
    container.style.paddingTop = "6px";
    container.style.borderTop = "1px solid #eee";
    container.style.width = "100%";

    let currentCat = (_activeTableCat && allSeasonMatches[_activeTableCat].length > 0)
      ? _activeTableCat
      : (categories.find(cat => allSeasonMatches[cat].length > 0) || "singles");
    let sortKey = "detectIndex";
    let sortAsc = true;

    function fmtDate(isoDate) {
      const p = isoDate.split("-");
      return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : isoDate;
    }

    function fmtImpact(imp) {
      if (imp === null || imp === undefined) return { text: "—", color: "#aaa" };
      const str = imp >= 0
        ? `+${imp.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`
        : imp.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
      // Lower rating = better in KNLTB: negative impact is good (green), positive is bad (red)
      return { text: str, color: imp < 0 ? '#0a7f2e' : '#b00020' };
    }

    function renderTable() {
      container.innerHTML = "";

      // Category tabs
      const tabRow = document.createElement("div");
      tabRow.style.cssText = "display:flex; gap:4px; margin-bottom:8px; flex-wrap:wrap;";
      categories.forEach(cat => {
        const count = getFilteredMatches(cat).length;
        const active = cat === currentCat;
        const tab = document.createElement("button");
        tab.textContent = `${cat.charAt(0).toUpperCase() + cat.slice(1)} (${count})`;
        tab.style.cssText = `
          padding:3px 10px; border-radius:4px; cursor:pointer; font-size:11px;
          border:${active ? "2px solid #193291" : "1px solid #ccc"};
          background:${active ? "#193291" : "#fff"};
          color:${active ? "#fff" : "#333"};
          font-weight:${active ? "600" : "400"};
        `;
        tab.onclick = () => { currentCat = cat; _activeTableCat = cat; sortKey = "detectIndex"; sortAsc = true; renderTable(); };
        tabRow.appendChild(tab);
      });
      container.appendChild(tabRow);

      const matches = getFilteredMatches(currentCat).slice().sort((a, b) => {
        let va, vb;
        if (sortKey === "detectIndex") { va = a.detectIndex ?? 0; vb = b.detectIndex ?? 0; }
        else if (sortKey === "impact")  { va = a.meta.impact ?? 0; vb = b.meta.impact ?? 0; }
        else if (sortKey === "date")    { va = a.date; vb = b.date; }
        else if (sortKey === "myRating") { va = a.rating ?? 0; vb = b.rating ?? 0; }
        else if (sortKey === "partnerRating") {
          const piA = a.meta.profilePlayerIdx ?? 0, piB = b.meta.profilePlayerIdx ?? 0;
          va = (a.meta.myTeamRatings || [])[piA === 0 ? 1 : 0] ?? 0;
          vb = (b.meta.myTeamRatings || [])[piB === 0 ? 1 : 0] ?? 0;
        }
        else if (sortKey === "oppRating") { va = avgRating(a.meta.oppTeamRatings) ?? 0; vb = avgRating(b.meta.oppTeamRatings) ?? 0; }
        else if (sortKey === "myAvg")     { va = avgRating(a.meta.myTeamRatings)  ?? 0; vb = avgRating(b.meta.myTeamRatings)  ?? 0; }
        else if (sortKey === "oppAvg")    { va = avgRating(a.meta.oppTeamRatings) ?? 0; vb = avgRating(b.meta.oppTeamRatings) ?? 0; }
        if (va < vb) return sortAsc ? -1 : 1;
        if (va > vb) return sortAsc ? 1 : -1;
        return 0;
      });

      const isDoubles = matches.some(m =>
        (m.meta.myTeamRatings || []).length > 1 || (m.meta.oppTeamRatings || []).length > 1
      );

      // Column definitions
      const columns = [
        { key: "detectIndex", label: "#",      title: "Processing order (submission order)", align: "right" },
        { key: "date",        label: "Date",   align: "left" },
      ];

      if (isDoubles) {
        columns.push({ key: "partnerRating", label: "Partner",    align: "left",  title: "Sort by partner rating" });
      }

      columns.push({ key: isDoubles ? "oppRating" : null, label: "Opponent(s)", align: "left", title: isDoubles ? "Sort by opponent rating" : undefined });
      columns.push({ key: null,         label: "Score",       align: "left" });
      columns.push({ key: null,         label: "W/L",         align: "center" });
      columns.push({ key: "myRating",   label: "My Rtg",      align: "right", title: "Start → end rating — click to sort" });

      if (!isDoubles) {
        columns.push({ key: "oppRating", label: "Opp Rtg", align: "right", title: "Opponent rating — click to sort" });
      }

      if (isDoubles) {
        columns.push({ key: "myAvg",  label: "My Avg",  align: "right", title: "Average rating of your team" });
        columns.push({ key: "oppAvg", label: "Opp Avg", align: "right", title: "Average rating of opponent team" });
      }

      columns.push({ key: "impact", label: "Impact", align: "right", title: "Rating change — click to sort" });

      const wrapper = document.createElement("div");
      wrapper.style.cssText = "overflow-x:auto; width:100%;";

      const table = document.createElement("table");
      table.style.cssText = "width:100%; border-collapse:collapse; font-size:11px;";

      // Header
      const thead = document.createElement("thead");
      const headerRow = document.createElement("tr");
      columns.forEach(col => {
        const th = document.createElement("th");
        let label = col.label;
        if (col.key && sortKey === col.key) label += sortAsc ? " ↑" : " ↓";
        th.textContent = label;
        th.style.cssText = `
          padding:4px 6px; text-align:${col.align || "left"}; white-space:nowrap;
          border-bottom:2px solid #193291; color:#193291; font-size:11px;
          ${col.key ? "cursor:pointer; user-select:none;" : ""}
        `;
        if (col.title) th.title = col.title;
        if (col.key) {
          th.onclick = () => {
            if (sortKey === col.key) { sortAsc = !sortAsc; }
            else { sortKey = col.key; sortAsc = col.key !== "impact"; }
            renderTable();
          };
        }
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);

      // Body
      const tbody = document.createElement("tbody");
      matches.forEach((m, idx) => {
        const tr = document.createElement("tr");
        const rowBg = m.meta.result === 'W' ? '#edfaef' : (m.meta.result === 'L' ? '#fdecea' : (idx % 2 === 0 ? '#f9f9f9' : '#fff'));
        tr.style.background = rowBg;

        function cell(text, extraStyle = "") {
          const td = document.createElement("td");
          td.textContent = text;
          td.style.cssText = `padding:3px 6px; white-space:nowrap; ${extraStyle}`;
          return td;
        }

        const myRtgs  = m.meta.myTeamRatings  || [];
        const oppRtgs = m.meta.oppTeamRatings  || [];
        const profIdx = m.meta.profilePlayerIdx ?? 0;
        const myAvg   = fmtRtg(avgRating(myRtgs));
        const oppAvg  = fmtRtg(avgRating(oppRtgs));

        // My rating: start → end
        const myStartRtg = fmtRtg(m.rating);
        const myEndRtg   = (m.meta.impact !== null && m.meta.impact !== undefined && m.rating !== null)
          ? fmtRtg(m.rating + m.meta.impact)
          : null;
        const myRtgText  = (myStartRtg !== null && myEndRtg !== null)
          ? `${myStartRtg} → ${myEndRtg}`
          : (myStartRtg ?? "—");

        const partnerIdx  = profIdx === 0 ? 1 : 0;
        const partnerName = (m.meta.myTeam || [])[partnerIdx];
        const partnerText = partnerName
          ? nameWithRating(partnerName, myRtgs[partnerIdx])
          : "—";

        // Doubles: name+rating inline. Singles: name only (rating gets its own column).
        const oppText = (m.meta.oppTeam || [])
          .map((name, j) => isDoubles ? nameWithRating(name, oppRtgs[j]) : name)
          .join(" & ") || "—";

        const { text: impText, color: impColor } = fmtImpact(m.meta.impact);
        const resultColor = m.meta.result === 'W' ? '#22a84a' : (m.meta.result === 'L' ? '#d93025' : '#aaa');

        tr.appendChild(cell(String(m.detectIndex + 1), "color:#aaa; text-align:right;"));
        tr.appendChild(cell(fmtDate(m.date)));

        if (isDoubles) {
          tr.appendChild(cell(partnerText));
        }

        tr.appendChild(cell(oppText, "max-width:200px; overflow:hidden; text-overflow:ellipsis;"));
        tr.appendChild(cell((m.meta.sets || []).map(([a, b]) => `${a}-${b}`).join(", ") || "—"));
        tr.appendChild(cell(m.meta.result || "—", `font-weight:700; text-align:center; color:${resultColor};`));
        tr.appendChild(cell(myRtgText, "text-align:right; font-variant-numeric:tabular-nums;"));

        if (!isDoubles) {
          tr.appendChild(cell(fmtRtg(oppRtgs[0]) ?? "—", "text-align:right; font-variant-numeric:tabular-nums;"));
        }

        if (isDoubles) {
          tr.appendChild(cell(myAvg  ?? "—", "text-align:right; font-variant-numeric:tabular-nums; font-style:italic; color:#555;"));
          tr.appendChild(cell(oppAvg ?? "—", "text-align:right; font-variant-numeric:tabular-nums; font-style:italic; color:#555;"));
        }

        tr.appendChild(cell(impText, `text-align:right; font-weight:600; color:${impColor}; font-variant-numeric:tabular-nums;`));

        tbody.appendChild(tr);
      });

      if (matches.length === 0) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = columns.length;
        td.textContent = "No matches in this category.";
        td.style.cssText = "padding:8px 6px; color:#aaa; text-align:center;";
        tr.appendChild(td);
        tbody.appendChild(tr);
      }

      table.appendChild(tbody);
      wrapper.appendChild(table);
      container.appendChild(wrapper);
      requestAnimationFrame(fitPanelToContent);
    }

    renderTable();

    const ratingPanel = document.getElementById("ratingPanel");
    const contentWrap = ratingPanel ? ratingPanel.parentElement : document.getElementById("knltb-tools-panel");
    if (contentWrap) contentWrap.appendChild(container);
  }

  function showSeasonStats() {
    const categories = ["singles", "doubles", "padel"];

    if (categories.every(cat => allSeasonMatches[cat].length === 0)) {
      alert("No matches imported yet.");
      return;
    }

    const existing = document.getElementById("knltbStatsPanel");
    if (statsVisible && existing) {
      existing.remove();
      statsVisible = false;
      if (_statsBtn) _statsBtn.textContent = '📈 Stats';
      fitPanelToContent();
      return;
    }

    statsVisible = true;
    if (_statsBtn) _statsBtn.textContent = '📈 Hide Stats';

    const container = document.createElement("div");
    container.id = "knltbStatsPanel";
    container.style.cssText = "margin-top:10px; padding-top:6px; border-top:1px solid #eee; width:100%; display:flex; flex-direction:column; flex:1; min-height:0;";

    let currentCat = (_activeStatsCat && allSeasonMatches[_activeStatsCat].length > 0)
      ? _activeStatsCat
      : (categories.find(cat => allSeasonMatches[cat].length > 0) || "singles");
    let selectedPartner = '';

    function pct(num, denom) {
      return denom > 0 ? (num / denom) * 100 : null;
    }

    function computeStats(matches) {
      if (!matches.length) return null;
      const n = matches.length;
      const wins = matches.filter(m => m.meta.result === 'W').length;

      function setStats(idx) {
        const withSet = matches.filter(m => (m.meta.sets || []).length > idx);
        const sw = withSet.filter(m => m.meta.sets[idx][0] > m.meta.sets[idx][1]).length;
        return { pct: pct(sw, withSet.length), n: withSet.length, wins: sw };
      }

      let gWon = 0, gTotal = 0;
      matches.forEach(m => (m.meta.sets || []).forEach(([a, b]) => { gWon += a; gTotal += a + b; }));

      const lostSet1 = matches.filter(m => (m.meta.sets || []).length > 0 && m.meta.sets[0][0] < m.meta.sets[0][1]);
      const comebackWins = lostSet1.filter(m => m.meta.result === 'W').length;

      // Win % vs higher/lower rated (lower value = better in KNLTB)
      const vsHigher = matches.filter(m => {
        const oppAvg = avgRating(m.meta.oppTeamRatings);
        return oppAvg !== null && m.rating !== null && oppAvg < m.rating;
      });
      const vsHigherWins = vsHigher.filter(m => m.meta.result === 'W').length;

      const vsLower = matches.filter(m => {
        const oppAvg = avgRating(m.meta.oppTeamRatings);
        return oppAvg !== null && m.rating !== null && oppAvg > m.rating;
      });
      const vsLowerWins = vsLower.filter(m => m.meta.result === 'W').length;

      // Longest win streak (chronological)
      const byDate = matches.slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
      let longestStreak = 0, streak = 0;
      byDate.forEach(m => {
        if (m.meta.result === 'W') { streak++; longestStreak = Math.max(longestStreak, streak); }
        else streak = 0;
      });

      // 3-set match rate
      const withSetsData = matches.filter(m => (m.meta.sets || []).length > 0);
      const threeSetCount = withSetsData.filter(m => m.meta.sets.length >= 3).length;

      // Match win conversion after winning 1st or 2nd set
      const wonSet1 = matches.filter(m => (m.meta.sets || []).length > 0 && m.meta.sets[0][0] > m.meta.sets[0][1]);
      const wonSet1ThenMatch = wonSet1.filter(m => m.meta.result === 'W').length;
      const wonSet2 = matches.filter(m => (m.meta.sets || []).length > 1 && m.meta.sets[1][0] > m.meta.sets[1][1]);
      const wonSet2ThenMatch = wonSet2.filter(m => m.meta.result === 'W').length;

      // Best rating reached (lowest value = best in KNLTB)
      const afterRatings = matches
        .filter(m => m.rating !== null && m.meta.impact !== null && m.meta.impact !== undefined)
        .map(m => m.rating + m.meta.impact);
      const bestRating = afterRatings.length ? Math.min(...afterRatings) : null;

      return {
        n, wins,
        matchWin: { pct: pct(wins, n), n, wins },
        set1: setStats(0),
        set2: setStats(1),
        set3: setStats(2),
        games: { pct: pct(gWon, gTotal), won: gWon, lost: gTotal - gWon },
        comeback: { pct: pct(comebackWins, lostSet1.length), n: lostSet1.length, wins: comebackWins },
        vsHigher: { pct: pct(vsHigherWins, vsHigher.length), n: vsHigher.length, wins: vsHigherWins },
        vsLower: { pct: pct(vsLowerWins, vsLower.length), n: vsLower.length, wins: vsLowerWins },
        longestStreak,
        threeSet: { pct: pct(threeSetCount, withSetsData.length), n: withSetsData.length, count: threeSetCount },
        set1Conv: { pct: pct(wonSet1ThenMatch, wonSet1.length), n: wonSet1.length, wins: wonSet1ThenMatch },
        set2Conv: { pct: pct(wonSet2ThenMatch, wonSet2.length), n: wonSet2.length, wins: wonSet2ThenMatch },
        bestRating
      };
    }

    function arcColor(p) {
      if (p === null || !Number.isFinite(p)) return '#ddd';
      if (p >= 55) return '#22a84a';
      if (p >= 45) return '#f5a623';
      return '#d93025';
    }

    function donut(p, label, sub) {
      const r = 28, circ = 2 * Math.PI * r;
      const safe = (p !== null && Number.isFinite(p)) ? Math.max(0, Math.min(100, p)) : 0;
      const dash = (safe / 100) * circ;
      const color = arcColor(p);
      const txt = p !== null && Number.isFinite(p) ? p.toFixed(0) + '%' : '—';
      const arc = safe > 0
        ? `<circle cx="36" cy="36" r="${r}" fill="none" stroke="${color}" stroke-width="7"
             stroke-dasharray="${dash.toFixed(2)} ${circ.toFixed(2)}" stroke-linecap="round"
             transform="rotate(-90 36 36)"/>`
        : '';
      return `
        <div style="display:flex; flex-direction:column; align-items:center; gap:3px; min-height:0; padding:4px 0;">
          <svg viewBox="0 0 72 72" style="flex:1; min-height:0; width:auto; max-width:100%; display:block;">
            <circle cx="36" cy="36" r="${r}" fill="none" stroke="#f0f0f0" stroke-width="7"/>
            ${arc}
            <text x="36" y="40" text-anchor="middle" font-size="13" font-weight="bold" fill="#222">${txt}</text>
          </svg>
          <div style="font-size:11px; text-align:center; color:#333; font-weight:600; line-height:1.3; flex-shrink:0;">${label}</div>
          ${sub ? `<div style="font-size:10px; text-align:center; color:#999; line-height:1.2; flex-shrink:0;">${sub}</div>` : ''}
        </div>`;
    }

    function renderStats() {
      container.innerHTML = '';

      const tabRow = document.createElement("div");
      tabRow.style.cssText = "flex-shrink:0; display:flex; gap:4px; margin-bottom:10px; flex-wrap:wrap;";
      categories.forEach(cat => {
        const count = getFilteredMatches(cat).length;
        const active = cat === currentCat;
        const tab = document.createElement("button");
        tab.textContent = `${cat.charAt(0).toUpperCase() + cat.slice(1)} (${count})`;
        tab.style.cssText = `padding:3px 10px; border-radius:4px; cursor:pointer; font-size:11px;
          border:${active ? "2px solid #193291" : "1px solid #ccc"};
          background:${active ? "#193291" : "#fff"};
          color:${active ? "#fff" : "#333"};
          font-weight:${active ? "600" : "400"};`;
        tab.onclick = () => { currentCat = cat; _activeStatsCat = cat; renderStats(); };
        tabRow.appendChild(tab);
      });
      container.appendChild(tabRow);

      // Partner filter — doubles only
      if (currentCat === 'doubles') {
        const doublesMatches = getFilteredMatches('doubles');
        const partnerSet = new Set();
        doublesMatches.forEach(m => {
          const profIdx = m.meta.profilePlayerIdx ?? 0;
          const name = (m.meta.myTeam || [])[profIdx === 0 ? 1 : 0];
          if (name) partnerSet.add(name);
        });
        const partners = [...partnerSet].sort();

        if (partners.length > 1) {
          const filterRow = document.createElement('div');
          filterRow.style.cssText = 'flex-shrink:0; display:flex; align-items:center; gap:8px; margin-bottom:8px;';
          const lbl = document.createElement('label');
          lbl.textContent = 'Partner:';
          lbl.style.cssText = 'font-size:11px; color:#555; white-space:nowrap;';
          const sel = document.createElement('select');
          sel.style.cssText = 'font-size:11px; padding:2px 6px; border:1px solid #ccc; border-radius:4px; cursor:pointer; flex:1;';
          const allOpt = document.createElement('option');
          allOpt.value = '';
          allOpt.textContent = 'All partners';
          sel.appendChild(allOpt);
          partners.forEach(p => {
            const count = doublesMatches.filter(m => {
              const profIdx = m.meta.profilePlayerIdx ?? 0;
              return (m.meta.myTeam || [])[profIdx === 0 ? 1 : 0] === p;
            }).length;
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = `${p} (${count})`;
            if (p === selectedPartner) opt.selected = true;
            sel.appendChild(opt);
          });
          sel.onchange = () => { selectedPartner = sel.value; renderStats(); };
          filterRow.appendChild(lbl);
          filterRow.appendChild(sel);
          container.appendChild(filterRow);
        }
      } else {
        selectedPartner = '';
      }

      // Filter matches by partner when applicable
      let matchesToUse = getFilteredMatches(currentCat);
      if (currentCat === 'doubles' && selectedPartner) {
        matchesToUse = matchesToUse.filter(m => {
          const profIdx = m.meta.profilePlayerIdx ?? 0;
          return (m.meta.myTeam || [])[profIdx === 0 ? 1 : 0] === selectedPartner;
        });
      }

      const stats = computeStats(matchesToUse);

      if (!stats) {
        const msg = document.createElement("div");
        msg.textContent = "No matches in this category.";
        msg.style.cssText = "padding:8px 6px; color:#aaa; font-size:12px;";
        container.appendChild(msg);
        requestAnimationFrame(fitPanelToContent);
        return;
      }

      const grid = document.createElement("div");
      grid.style.cssText = "display:grid; grid-template-columns:repeat(3, 1fr); grid-auto-rows:minmax(80px, 1fr); flex:1; min-height:0; gap:14px 8px; padding:4px 0 8px;";
      grid.innerHTML = [
        donut(stats.matchWin.pct, 'Match Win %',   `${stats.matchWin.wins}/${stats.matchWin.n} matches`),
        donut(stats.games.pct,    'Games Won %',   `${stats.games.won}–${stats.games.lost} games`),
        donut(stats.set1.pct,     '1st Set Win %', stats.set1.n ? `${stats.set1.wins}/${stats.set1.n}` : null),
        donut(stats.set2.pct,     '2nd Set Win %', stats.set2.n ? `${stats.set2.wins}/${stats.set2.n}` : null),
        donut(stats.set3.pct,     '3rd Set Win %', stats.set3.n ? `${stats.set3.wins}/${stats.set3.n} deciders` : 'no deciders'),
        donut(stats.comeback.pct, 'Comeback Rate', stats.comeback.n ? `${stats.comeback.wins}/${stats.comeback.n} after losing 1st` : 'n/a'),
        donut(stats.vsHigher.pct,  'vs Higher Rtd',      stats.vsHigher.n  ? `${stats.vsHigher.wins}/${stats.vsHigher.n} matches`  : 'no data'),
        donut(stats.vsLower.pct,   'vs Lower Rtd',       stats.vsLower.n   ? `${stats.vsLower.wins}/${stats.vsLower.n} matches`   : 'no data'),
        donut(stats.threeSet.pct,  '3-Set Rate',         stats.threeSet.n  ? `${stats.threeSet.count}/${stats.threeSet.n} matches` : null),
        donut(stats.set1Conv.pct,  'Win After S1 Win',   stats.set1Conv.n  ? `${stats.set1Conv.wins}/${stats.set1Conv.n} converted` : 'n/a'),
        donut(stats.set2Conv.pct,  'Win After S2 Win',   stats.set2Conv.n  ? `${stats.set2Conv.wins}/${stats.set2Conv.n} converted` : 'n/a'),
      ].join('');
      container.appendChild(grid);

      function statCard(label, value, sub) {
        return `<div style="background:#f7f8fc; border-radius:6px; padding:8px 10px; text-align:center;">
          <div style="font-size:10px; color:#777; margin-bottom:3px;">${label}</div>
          <div style="font-size:16px; font-weight:700; color:#222; line-height:1;">${value}</div>
          ${sub ? `<div style="font-size:10px; color:#aaa; margin-top:3px;">${sub}</div>` : ''}
        </div>`;
      }

      const highlights = document.createElement("div");
      highlights.style.cssText = "flex-shrink:0; display:grid; grid-template-columns:1fr 1fr; gap:8px; padding:4px 0 8px; border-top:1px solid #f0f0f0; margin-top:4px;";
      highlights.innerHTML = [
        statCard('Best Rating', stats.bestRating !== null ? stats.bestRating.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : '—', 'season low'),
        statCard('Longest Win Streak', stats.longestStreak > 0 ? `${stats.longestStreak} in a row` : '—', null),
      ].join('');
      container.appendChild(highlights);
      requestAnimationFrame(fitPanelToContent);
    }

    renderStats();

    const ratingPanel = document.getElementById("ratingPanel");
    const contentWrap = ratingPanel ? ratingPanel.parentElement : document.getElementById("knltb-tools-panel");
    if (contentWrap) contentWrap.appendChild(container);
  }

  function injectButtons() {
    const { panel, contentWrap } = window.KNLTBPanel.createStandardPanel('KNLTB Tools - Player Profile', {
      id: 'knltb-tools-panel',
      top: '80px',
      left: '20px',
      width: '420px'
    });
    _panel = panel;
    _contentWrap = contentWrap;

    // Row 1: import buttons
    const importRow = document.createElement('div');
    importRow.style.cssText = 'display:flex; gap:4px;';

    _importBtn = window.KNLTBPanel.createButton('📥 Current', 'Import matches from this season', {
      background: '#193291', color: '#fff'
    });
    _importBtn.onclick = () => {
      allSeasonMatches = { singles: [], doubles: [], padel: [] };
      setStatus("⏳ Importing season…");
      updateProgress(20, 'Expanding match details…');
      _importBtn.disabled = true;
      expandAllDetails(() => {
        updateProgress(40, 'Parsing matches…');
        parseSeasonMatchesAsync(
          (matchNum, total, info) => {
            const pct = 40 + Math.round(58 * matchNum / total);
            const icon = info.result === 'W' ? '✅' : info.result === 'L' ? '❌' : info.skipped ? '·' : '—';
            updateProgress(pct, `${matchNum}/${total} · ${info.date || '?'} · ${info.category || ''} ${icon}`);
          },
          () => {
            updateProgress(null);
            const counts = Object.entries(allSeasonMatches)
              .map(([cat, arr]) => `${cat}: <strong>${arr.length}</strong>`).join(', ');
            setStatus(`✅ Imported — ${counts}`);
            updateDateFilterBounds();
            refreshViews();
            _importBtn.disabled = false;
            requestAnimationFrame(fitPanelToContent);
          }
        );
      });
    };

    const importLast3Btn = window.KNLTBPanel.createButton('📥 Last 3', 'Import matches from the last 3 seasons', {
      background: '#193291', color: '#fff'
    });
    importLast3Btn.onclick = () => {
      const tabstrips = [...document.querySelectorAll('ul.js-tabstrip[data-tabcontentid]')];
      const groups = tabstrips
        .map(ts => [...ts.querySelectorAll('a.js-tab.page-nav__link')])
        .filter(tabs => tabs.length > 0);
      if (groups.length === 0) {
        setStatus("❌ Could not find season tabs. Are you on a player profile page?", "error");
        return;
      }
      const n = Math.min(3, Math.max(...groups.map(g => g.length)));
      importAllSeasons(Array.from({ length: n }, (_, i) => i));
    };

    _importAllBtn = window.KNLTBPanel.createButton('📥 All', 'Select season range and import', {
      background: '#193291', color: '#fff'
    });
    _importAllBtn.onclick = showSeasonSlider;

    [_importBtn, importLast3Btn, _importAllBtn].forEach(btn => {
      btn.style.flex = '1';
      btn.style.minWidth = '0';
      btn.style.padding = '4px 4px';
      btn.style.textAlign = 'center';
    });
    importRow.appendChild(_importBtn);
    importRow.appendChild(importLast3Btn);
    importRow.appendChild(_importAllBtn);
    contentWrap.appendChild(importRow);

    // Row 2: view buttons
    const viewRow = document.createElement('div');
    viewRow.style.cssText = 'display:flex; gap:4px; margin-top:4px;';

    const processBtn = window.KNLTBPanel.createButton('📊 Chart', 'Toggle rating chart');
    _chartBtn = processBtn;
    processBtn.onclick = () => { chartVisible ? hideChart() : processMatches(); };

    const tableBtn = window.KNLTBPanel.createButton('📋 Matches', 'Toggle matches table');
    _tableBtn = tableBtn;
    tableBtn.onclick = showMatchesTable;

    const statsBtn = window.KNLTBPanel.createButton('📈 Stats', 'Toggle season stats');
    _statsBtn = statsBtn;
    statsBtn.onclick = showSeasonStats;

    [processBtn, tableBtn, statsBtn].forEach(btn => {
      btn.style.flex = '1';
      btn.style.minWidth = '0';
      btn.style.padding = '4px 4px';
      btn.style.textAlign = 'center';
    });
    viewRow.appendChild(processBtn);
    viewRow.appendChild(tableBtn);
    viewRow.appendChild(statsBtn);
    contentWrap.appendChild(viewRow);

    const status = document.createElement("div");
    status.id = "knltbStatus";
    status.style.marginTop = "8px";
    status.style.fontSize = "12px";
    status.style.opacity = "0.9";
    contentWrap.appendChild(status);

    const progressWrap = document.createElement('div');
    progressWrap.style.cssText = 'display:none; margin-top:6px;';
    _progressBar = progressWrap;
    const progressTrack = document.createElement('div');
    progressTrack.style.cssText = 'background:#e0e0e0; border-radius:4px; height:5px; overflow:hidden;';
    const progressFill = document.createElement('div');
    progressFill.style.cssText = 'background:#193291; height:100%; border-radius:4px; transition:width 0.3s ease; width:0%;';
    _progressFill = progressFill;
    progressTrack.appendChild(progressFill);
    const progressLbl = document.createElement('div');
    progressLbl.style.cssText = 'font-size:11px; color:#888; margin-top:3px;';
    _progressLabel = progressLbl;
    progressWrap.appendChild(progressTrack);
    progressWrap.appendChild(progressLbl);
    contentWrap.appendChild(progressWrap);

    _dateFilterRow = document.createElement('div');
    _dateFilterRow.style.cssText = 'display:none; margin-top:6px;';
    contentWrap.appendChild(_dateFilterRow);

    const ratingPanel = document.createElement("div");
    ratingPanel.id = "ratingPanel";
    ratingPanel.style.marginTop = "10px";
    ratingPanel.style.paddingTop = "6px";
    ratingPanel.style.borderTop = "1px solid #eee";
    ratingPanel.style.width = "100%";
    ratingPanel.style.maxWidth = "100%";
    ratingPanel.style.flex = "0 0 auto";
    ratingPanel.style.height = "auto";
    ratingPanel.style.maxHeight = "none";
    ratingPanel.style.minHeight = "20px";
    ratingPanel.style.overflow = "hidden";
    contentWrap.appendChild(ratingPanel);

    document.body.appendChild(panel);
  }

  injectButtons();
})();
