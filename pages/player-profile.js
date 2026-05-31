(function () {
  if (!window.location.href.includes("/player-profile/")) return;

  let allSeasonMatches = {
    singles: [],
    doubles: [],
    padel: []
  };

  let chartVisible = false;
  let tableVisible = false;
  let _chartBtn = null;
  let _tableBtn = null;
  let _panel = null;
  let _contentWrap = null;

  function setStatus(message, kind = "info") {
    const el = document.getElementById("knltbStatus");
    if (!el) return;
    el.innerHTML = message;
    el.style.color = kind === "error" ? "#b00020" : "#222";
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

  function expandAllDetails(callback) {
    const buttons = [...document.querySelectorAll(".btn--more-details")];
    if (buttons.length === 0) return callback();

    let index = 0;
    function clickNext() {
      if (index >= buttons.length) {
        setTimeout(callback, 500);
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

  function parseSeasonMatches() {
    const profileName = getProfilePlayerName();
    if (!profileName) {
      setStatus("❌ Could not determine player name.", "error");
      return;
    }
    const normalizedProfileName = normalizeName(profileName);
    const profileMemberId = getProfileMemberId();
    console.log("👤 Detected player (from header when available):", { name: profileName, id: profileMemberId });

    const matches = document.querySelectorAll("li.match-group__item");
    console.log(`🔍 Found ${matches.length} match items`);

    matches.forEach((matchItem, i) => {
      const body = matchItem.querySelector(".match__body");
      if (!body) {
        console.log(`Match ${i + 1}: No .match__body element found`);
        return;
      }

      const playerRows = body.querySelectorAll(".match__row");
      if (playerRows.length !== 2) {
        console.log(`Match ${i + 1}: Expected 2 player rows, found ${playerRows.length}`);
        return;
      }

      // Collect all player data (name, rating, memberId) per row
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

      // Identify the profile player's row and position within it
      let rating = null;
      let foundPlayer = false;
      let userRowIdx = null;
      let userPlayerIdx = 0;

      rowPlayerData.forEach((players, rowIdx) => {
        players.forEach((p, pIdx) => {
          const isNameMatch = p.normalizedName === normalizedProfileName;
          const isIdMatch = !!(profileMemberId && p.playerMemberId && p.playerMemberId === profileMemberId);
          console.log(
            `Match ${i + 1}: Checking player '${p.name}' (norm: '${p.normalizedName}', id: '${p.playerMemberId || "?"}')` +
            ` vs profile {name: '${profileName}', norm: '${normalizedProfileName}', id: '${profileMemberId || "?"}'} , rating: '${p.rating}'`
          );
          if (isNameMatch || isIdMatch) {
            foundPlayer = true;
            userRowIdx = rowIdx;
            userPlayerIdx = pIdx;
            rating = p.rating;
            console.log(`✅ Match ${i + 1}: Found rating ${rating} for ${p.name}${isIdMatch ? " (matched by ID)" : " (matched by name)"}`);
          }
        });
      });

      // Build oriented team data
      const myRowData = (userRowIdx !== null) ? rowPlayerData[userRowIdx] : [];
      const oppRowData = (userRowIdx !== null) ? rowPlayerData[1 - userRowIdx] : [];
      const myTeam = myRowData.map(p => p.name);
      const oppTeam = oppRowData.map(p => p.name);
      const myTeamRatings = myRowData.map(p => p.rating);
      const oppTeamRatings = oppRowData.map(p => p.rating);

      // Extract tournament and round from header
      let tournament = null;
      let round = null;
      const header = matchItem.querySelector(".match__header");
      if (header) {
        const navLinks = header.querySelectorAll(".match__header-title-item .nav-link__value");
        if (navLinks.length > 0) {
          tournament = navLinks[0].textContent.trim();
          round = navLinks.length > 1 ? navLinks[navLinks.length - 1].textContent.trim() : null;
        }
      }

      // Parse set scores from the match result
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

      // Orient scores from the profile user's perspective
      if (userRowIdx === 1) {
        sets = sets.map(([a, b]) => [b, a]);
      }

      // Determine match W/L from oriented scores
      const wonSets = sets.filter(([a, b]) => a > b).length;
      const lostSets = sets.filter(([a, b]) => a < b).length;
      const resultWL = wonSets > lostSets ? "W" : (wonSets < lostSets ? "L" : "");

      // Score impact from header aside
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
          console.log(`Match ${i + 1}: Date found - '${date}'`);
        } else {
          console.log(`Match ${i + 1}: No date span found in footer`);
        }
      } else {
        console.log(`Match ${i + 1}: No .match__footer element found`);
      }

      if (foundPlayer && rating !== null && date) {
        const category = detectSportCategory(matchItem);
        allSeasonMatches[category].push({
          date,
          rating,
          detectIndex: i,
          meta: {
            myTeam,
            oppTeam,
            myTeamRatings,
            oppTeamRatings,
            profilePlayerIdx: userPlayerIdx,
            sets,
            impact,
            result: resultWL,
            tournament,
            round
          }
        });
      } else {
        console.log(`Match ${i + 1}: Skipping because player not found, or rating or date is missing`);
      }
    });

    const counts = Object.entries(allSeasonMatches)
      .map(([cat, arr]) => `${cat}: <strong>${arr.length}</strong>`)
      .join(", ");
    setStatus(`✅ Imported matches from this season — ${counts}`);
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

  function processMatches() {
    const categories = ["singles", "doubles", "padel"];

    if (categories.every(cat => allSeasonMatches[cat].length === 0)) {
      alert("No matches imported yet.");
      return;
    }

    const colors = ["blue", "green", "orange"];
    const sortedArrays = categories.map(cat =>
      allSeasonMatches[cat].slice().sort((a, b) => {
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
    if (_chartBtn) _chartBtn.textContent = '📊 Hide Rating Chart';
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
    if (_chartBtn) _chartBtn.textContent = '📊 Show Rating Chart';
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
      if (_tableBtn) _tableBtn.textContent = '📋 Show Matches';
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

    let currentCat = categories.find(cat => allSeasonMatches[cat].length > 0) || "singles";
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
        const count = allSeasonMatches[cat].length;
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
        tab.onclick = () => { currentCat = cat; sortKey = "detectIndex"; sortAsc = true; renderTable(); };
        tabRow.appendChild(tab);
      });
      container.appendChild(tabRow);

      const matches = allSeasonMatches[currentCat].slice().sort((a, b) => {
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

        // Partner: name (rating)  — the other player in my row
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

  function injectButtons() {
    const { panel, contentWrap } = window.KNLTBPanel.createStandardPanel('KNLTB Tools - Player Profile', {
      id: 'knltb-tools-panel',
      top: '80px',
      left: '20px',
      width: '420px'
    });
    _panel = panel;
    _contentWrap = contentWrap;

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '8px';
    btnRow.style.flexWrap = 'wrap';

    const importBtn = window.KNLTBPanel.createButton('📥 Import Season', 'Import matches from this season', {
      background: '#193291', color: '#fff'
    });
    importBtn.onclick = () => {
      setStatus("⏳ Importing season… this may take a few seconds.");
      expandAllDetails(parseSeasonMatches);
    };

    const processBtn = window.KNLTBPanel.createButton('📊 Show Rating Chart', 'Toggle rating chart');
    _chartBtn = processBtn;
    processBtn.onclick = () => { chartVisible ? hideChart() : processMatches(); };

    const tableBtn = window.KNLTBPanel.createButton('📋 Show Matches', 'Toggle matches table');
    _tableBtn = tableBtn;
    tableBtn.onclick = showMatchesTable;

    btnRow.appendChild(importBtn);
    btnRow.appendChild(processBtn);
    btnRow.appendChild(tableBtn);
    contentWrap.appendChild(btnRow);

    const status = document.createElement("div");
    status.id = "knltbStatus";
    status.style.marginTop = "8px";
    status.style.fontSize = "12px";
    status.style.opacity = "0.9";
    contentWrap.appendChild(status);

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
