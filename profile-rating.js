(function () {
  if (!window.location.href.includes("/player-profile/")) return;

  let allSeasonMatches = {
    singles: [],
    doubles: [],
    padel: []
  };

  function setStatus(message, kind = "info") {
    const el = document.getElementById("knltbStatus");
    if (!el) return;
    el.innerHTML = message;
    el.style.color = kind === "error" ? "#b00020" : "#222";
  }

  function getProfilePlayerName() {
    // Prefer the exact title block used on profile pages to avoid cross-element mismatches
    const titleEl = document.querySelector("h2.media__title--large");
    if (titleEl) {
      const valueEl = titleEl.querySelector(".nav-link__value");
      if (valueEl && valueEl.textContent) {
        const name = valueEl.textContent.trim();
        console.log("👤 Detected player name (title-scoped):", name);
        return name;
      }
    }

    // Fallback: previous direct selector (if markup differs)
    const direct = document.querySelector(".media__title .nav-link__value, .media__title--large .nav-link__value");
    if (direct && direct.textContent) {
      const name = direct.textContent.trim();
      console.log("👤 Detected player name (direct selector):", name);
      return name;
    }

    // Last resort: scan headings for a multi-word name
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
    // Read ID from the same header block as the name to avoid mismatch
    const titleEl = document.querySelector("h2.media__title--large");
    if (titleEl) {
      const aside = titleEl.querySelector(".media__title-aside");
      if (aside) {
        const m = aside.textContent.trim().match(/\((\d+)\)/);
        if (m) return m[1];
      }
    }

    // Fallback to global aside (older pages)
    const asideGlobal = document.querySelector(".media__title-aside");
    if (asideGlobal) {
      const m = asideGlobal.textContent.trim().match(/\((\d+)\)/);
      if (m) return m[1];
    }

    // URL fallbacks
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

  // --- Helper functions for dock button positioning ---
  function findConsentButtonRect() {
    // Heuristic: fixed-position element ~30x30 near an edge (often bottom-right)
    const all = Array.from(document.querySelectorAll('*'));
    const candidates = [];
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      let cs;
      try { cs = window.getComputedStyle(el); } catch (_) { continue; }
      if (!cs || cs.position !== 'fixed' || cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
      const rect = el.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (w >= 26 && w <= 36 && h >= 26 && h <= 36) {
        const nearBottom = window.innerHeight - (rect.top + rect.height) <= 60;
        const nearRight  = window.innerWidth  - (rect.left + rect.width) <= 60;
        const nearLeft   = rect.left <= 60;
        const nearTop    = rect.top  <= 60;
        if (nearBottom || nearRight || nearLeft || nearTop) {
          candidates.push({ rect, score: (nearBottom?2:0) + (nearRight?2:0) + (nearLeft?1:0) + (nearTop?1:0) });
        }
      }
    }
    if (!candidates.length) return null;
    candidates.sort((a,b)=> b.score - a.score); // prefer bottom-right
    return candidates[0].rect;
  }

  function positionDockBtnNearConsent(dockBtn) {
    const rect = findConsentButtonRect();
    if (!rect) return false;

    dockBtn.style.position = 'fixed';
    const gap = 8;
    const myBox = dockBtn.getBoundingClientRect();
    const myW = myBox.width || 50;
    const myH = myBox.height || 24;
    // place our button to the LEFT of the consent button and vertically centered
    let left = rect.left - myW - gap;
    let top = rect.top + rect.height / 2 - myH / 2;
    // Clamp to viewport: 50px horizontal margin (sides), 10px vertical margin (top/bottom)
    left = Math.max(50, Math.min(window.innerWidth - myW - 50, left));
    top  = Math.max(10, Math.min(window.innerHeight - myH - 10, top));
    dockBtn.style.left = left + 'px';
    dockBtn.style.top = top + 'px';
    dockBtn.style.right = '';
    dockBtn.style.bottom = '';
    dockBtn.style.zIndex = 10000;

    const onResize = () => positionDockBtnNearConsent(dockBtn);
    window.addEventListener('resize', onResize);
    dockBtn._knltbOnResize = onResize;
    return true;
  }

  function normalizeName(name) {
    return name.toLowerCase().replace(/\s+/g, " ").trim();
  }

  function detectSportCategory(matchItem) {
    // Prefer explicit module header: e.g., "KNLTB Padel DSS"
    let cursor = matchItem;
    while (cursor) {
      if (cursor === document.body || cursor === document.documentElement) break;
      if (cursor.querySelector) {
        const titleEl = cursor.querySelector(".module__title-main");
        if (titleEl && titleEl.textContent) {
          const t = titleEl.textContent.trim().toLowerCase();
          if (t.includes("padel")) {
            return "padel";
          }
        }
      }
      cursor = cursor.parentElement;
    }
    // Fallback to existing heuristic (singles/doubles based on player counts)
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

      let rating = null;
      let foundPlayer = false;
      let userRowIdx = null;

      playerRows.forEach((row, idx) => {
        const playerDivs = row.querySelectorAll(".match__row-title-value");
        playerDivs.forEach(playerDiv => {
          const nameSpan = playerDiv.querySelector(".nav-link__value");
          const ratingSpan = playerDiv.querySelector(".match__row-title-aside");

          if (!nameSpan || !ratingSpan) {
            console.log(`Match ${i + 1}: Missing name or rating for a player in row ${idx + 1}`);
            if (nameSpan) {
              console.log(`Match ${i + 1}: Found name '${nameSpan.textContent.trim()}' but no rating span in same player block.`);
            }
            return;
          }

          const rawName = nameSpan.textContent.trim();
          const name = rawName.replace(/\s*\(.*\)$/, "").trim();
          const normalizedName = normalizeName(name);

          const ratingSpanText = ratingSpan ? ratingSpan.textContent.trim() : "";
          const ratingMatch = ratingSpanText.match(/(\d+(?:[.,]\d+)?)/);
          const ratingStr = ratingMatch ? ratingMatch[1] : null;

          // Try to extract member id from the player's anchor href
          let playerMemberId = null;
          const anchor = playerDiv.querySelector("a.nav-link[href]");
          if (anchor && anchor.getAttribute("href")) {
            const href = anchor.getAttribute("href");
            const idMatch = href.match(/player=([0-9]+)/i) || href.match(/member(?:id)?=([0-9]+)/i) || href.match(/\/player\/([0-9]+)/i);
            if (idMatch) playerMemberId = idMatch[1];
          }

          console.log(
            `Match ${i + 1}: Checking player '${name}' (norm: '${normalizedName}', id: '${playerMemberId || "?"}')` +
            ` vs profile {name: '${profileName}', norm: '${normalizedProfileName}', id: '${typeof profileMemberId !== 'undefined' && profileMemberId !== null ? profileMemberId : "?"}'} , rating: '${ratingStr}'`
          );

          const isNameMatch = normalizedName === normalizedProfileName;
          const isIdMatch = !!(profileMemberId && playerMemberId && playerMemberId === profileMemberId);

          if (isNameMatch || isIdMatch) {
            foundPlayer = true;
            userRowIdx = idx;
            rating = ratingStr ? parseFloat(ratingStr.replace(",", ".")) : null;
            if (isNaN(rating)) {
              console.log(`Match ${i + 1}: Rating is NaN for player ${name} with ratingStr='${ratingStr}'`);
              rating = null;
            } else {
              console.log(`✅ Match ${i + 1}: Found rating ${rating} for ${name}${isIdMatch ? " (matched by ID)" : " (matched by name)"}`);
            }
          }
        });
      });

      // Build team names from both rows
      const teamNames = [0,1].map(rowIdx => {
        const names = Array.from(playerRows[rowIdx].querySelectorAll(".match__row-title-value .nav-link__value"))
          .map(el => el.textContent.trim());
        return names;
      });

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
          if (!Number.isNaN(a) && !Number.isNaN(b)) {
            sets.push([a, b]);
          }
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

      // Score impact from header aside (supports negative values and any tag style)
      let impact = null;
      const impactCandidates = matchItem.querySelectorAll(".match__header-aside .tag:not(.tag--placeholder) span");
      for (const sp of impactCandidates) {
        const txt = sp.textContent.trim();
        // Match signed decimal with comma or dot (e.g., -0,0523 or 0,1305)
        const m = txt.match(/-?\d+[.,]\d+/);
        if (m) {
          impact = parseFloat(m[0].replace(",", "."));
          break;
        }
      }

      const footer = matchItem.querySelector(".match__footer");
      let date = null;
      if (footer) {
        const dateSpan = footer.querySelector(".match__footer-list-item .nav-link__value");
        if (dateSpan) {
          let rawDate = dateSpan.textContent.trim();

          // Remove day of week prefix (e.g. "wo ") if present
          rawDate = rawDate.replace(/^[a-z]{2}\s+/i, "");

          // Convert from "dd-mm-yyyy" to "yyyy-mm-dd"
          const dateParts = rawDate.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
          if (dateParts) {
            const [_, dd, mm, yyyy] = dateParts;
            // pad day and month with leading zero if needed
            const ddPadded = dd.padStart(2, "0");
            const mmPadded = mm.padStart(2, "0");
            rawDate = `${yyyy}-${mmPadded}-${ddPadded}`;
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
        const myTeam = userRowIdx === 0 ? teamNames[0] : teamNames[1];
        const oppTeam = userRowIdx === 0 ? teamNames[1] : teamNames[0];
        allSeasonMatches[category].push({
          date,
          rating,
          detectIndex: i,
          meta: {
            myTeam,
            oppTeam,
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

  function processMatches() {
    const categories = ["singles", "doubles", "padel"];

    if (categories.every(cat => allSeasonMatches[cat].length === 0)) {
      alert("No matches imported yet.");
      return;
    }

    // Build base datasets per category (sorted by date, stable ordering for same-day matches)
    const baseDatasets = categories.map((cat, i) => {
      const sorted = allSeasonMatches[cat]
        .slice()
        .sort((a, b) => {
          const da = new Date(a.date);
          const db = new Date(b.date);
          if (da < db) return -1;
          if (da > db) return 1;
          // Same day: reverse detection order so earlier detected shows later in the day
          const ia = (a.detectIndex ?? 0);
          const ib = (b.detectIndex ?? 0);
          return ib - ia;
        });

      return {
        label: cat.charAt(0).toUpperCase() + cat.slice(1),
        data: sorted.map(m => ({ x: m.date, y: m.rating, meta: m.meta })),
        borderColor: i === 0 ? "blue" : (i === 1 ? "green" : "orange"),
        fill: false,
        tension: 0.2,
        borderWidth: 2,
        pointRadius: 3,
        showLine: true
      };
    });

    // ----- Trend line helpers & datasets -----
    function computeLinearTrendXY(points) {
      // points: [{x: msSinceEpoch, y: number}, ...] ; returns {x0, y0, x1, y1} or null
      const n = points.length;
      if (n < 2) return null;
      let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
      for (let i = 0; i < n; i++) {
        const px = points[i].x;
        const py = points[i].y;
        sumX += px;
        sumY += py;
        sumXY += px * py;
        sumXX += px * px;
      }
      const denom = n * sumXX - sumX * sumX;
      if (denom === 0) return null;
      const slope = (n * sumXY - sumX * sumY) / denom;
      const intercept = (sumY - slope * sumX) / n;
      const x0 = points[0].x;
      const x1 = points[points.length - 1].x;
      const y0 = slope * x0 + intercept;
      const y1 = slope * x1 + intercept;
      return { x0, y0, x1, y1 };
    }

    const trendDatasets = baseDatasets.map((ds) => {
      // Convert ds.data date strings into numeric x for regression
      const xy = ds.data
        .filter(p => Number.isFinite(p.y) && p.x)
        .map(p => ({ x: new Date(p.x).getTime(), y: Number(p.y) }))
        .filter(p => !Number.isNaN(p.x) && Number.isFinite(p.y));

      const trend = computeLinearTrendXY(xy);
      if (!trend) return null;

      // Convert back to date strings (YYYY-MM-DD) to align with the time scale parser
      const x0Date = new Date(trend.x0);
      const x1Date = new Date(trend.x1);
      const fmt = (d) => {
        const yyyy = d.getUTCFullYear();
        const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(d.getUTCDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      };

      return {
        label: ds.label + " trend",
        data: [
          { x: fmt(x0Date), y: trend.y0 },
          { x: fmt(x1Date), y: trend.y1 }
        ],
        borderColor: ds.borderColor,
        borderDash: [6, 6],
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        tension: 0,
        showLine: true
      };
    }).filter(Boolean);

    // Combine base datasets with trend line datasets
    const datasets = [...baseDatasets, ...trendDatasets];

    const margin = 0.2; // rating axis extra room above/below visible data
    function computeYRangeFromVisible(chartLike) {
      const dsList = datasets;
      let ys = [];
      if (chartLike && chartLike.data) {
        ys = chartLike.data.datasets
          .flatMap((ds, i) => (chartLike.isDatasetVisible && chartLike.isDatasetVisible(i)) ? ds.data.map(p => p.y) : []);
      } else {
        ys = dsList.flatMap(ds => ds.data.map(p => p.y));
      }
      if (!ys.length) return { yMin: 0, yMax: 9 };
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const yMinRaw = minY - margin;
      const yMaxRaw = maxY + margin;
      // round to nearest 0.1 for cleaner ticks
      const yMin = Math.floor(yMinRaw * 10) / 10;
      const yMax = Math.ceil(yMaxRaw * 10) / 10;
      return { yMin, yMax };
    }
    const initialRange = computeYRangeFromVisible();
    let { yMin, yMax } = initialRange;

    // Destroy previous chart if present
    if (window._ratingChart && typeof window._ratingChart.destroy === "function") {
      try { window._ratingChart.destroy(); } catch (_) {}
      window._ratingChart = null;
    }

    // Mount inside the floating menu panel
    const panel = document.getElementById("ratingPanel") || document.body;

    // Expand panel now that we are rendering the chart
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

    window._ratingChart = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        parsing: {
          xAxisKey: "x",
          yAxisKey: "y"
        },
        scales: {
          x: {
            type: "time",
            time: {
              tooltipFormat: "PPP",
              unit: "day",
              displayFormats: {
                day: "MMM d"
              }
            },
            title: { display: true, text: "Date" }
          },
          y: {
            title: { display: true, text: "Rating" },
            min: yMin,
            max: yMax,
            ticks: {
              stepSize: 0.1,
              callback: value => {
                try {
                  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
                } catch (e) {
                  return value;
                }
              }
            }
          }
        },
        plugins: {
          legend: {
            display: true,
            position: "top",
            onClick: (e, legendItem, legend) => {
              const ci = legend.chart;
              const index = legendItem.datasetIndex;
              // Toggle visibility using Chart.js v3 API
              const currentlyVisible = ci.isDatasetVisible(index);
              ci.setDatasetVisibility(index, !currentlyVisible);
              // Recompute Y-axis range based on visible datasets (includes trend lines)
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

              if (tooltip.opacity === 0) {
                el.style.opacity = 0;
                return;
              }

              const dataPoint = tooltip.dataPoints && tooltip.dataPoints[0];
              if (!dataPoint) return;

              const raw = dataPoint.raw || {};
              const meta = raw.meta || {};
              const dsLabel = dataPoint.dataset && dataPoint.dataset.label ? dataPoint.dataset.label : "";
              const date = new Date(raw.x);
              const dateStr = !isNaN(date) ? date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : String(raw.x);
              const ratingVal = Number(raw.y);
              const ratingStr = Number.isFinite(ratingVal) ? ratingVal.toLocaleString(undefined, { maximumFractionDigits: 4 }) : String(raw.y);

              // If this is a trend dataset (no meta), show a compact tooltip
              const isTrend = /\btrend\b/i.test(dsLabel) && (!meta || Object.keys(meta).length === 0);
              if (isTrend) {
                el.innerHTML = `
                  <div style="margin-bottom:6px; display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;">
                    <div style="font-weight:600; font-size:12px;">${dateStr}</div>
                    <div style="opacity:.7;">${dsLabel}</div>
                  </div>
                  <div><span style="opacity:.7;">Estimated rating</span> <strong>${ratingStr}</strong></div>
                `;
              } else {
                const teamA = (meta.myTeam || []).join(" & ");
                const teamB = (meta.oppTeam || []).join(" & ");
                const myGames = (meta.sets && meta.sets.length) ? meta.sets.map(([a,b]) => a) : [];
                const oppGames = (meta.sets && meta.sets.length) ? meta.sets.map(([a,b]) => b) : [];

                const baseChipStyle = 'display:inline-block; padding:0 6px; border-radius:6px; background:#f1f3f5; margin-left:6px; font-size:11px; line-height:18px; min-width:18px; text-align:center;';
                const winnerIsMyTeam = meta.result === 'W';
                const myChipStyle = winnerIsMyTeam ? baseChipStyle + ' font-weight:600;' : baseChipStyle;
                const oppChipStyle = (!winnerIsMyTeam && meta.result === 'L') ? baseChipStyle + ' font-weight:600;' : baseChipStyle;

                const setsCount = Math.max(myGames.length, oppGames.length);
                const gridCols = setsCount > 0
                  ? `auto ${Array(setsCount).fill('max-content').join(' ')}`
                  : 'auto';

                const myCellsHtml = myGames.map(n => `<div><span style="${myChipStyle}">${n}</span></div>`).join('');
                const oppCellsHtml = oppGames.map(n => `<div><span style=\"${oppChipStyle}\">${n}</span></div>`).join('');

                const impactNum = typeof meta.impact === 'number' ? meta.impact : null;
                const impactStr = impactNum !== null ? (impactNum >= 0 ? `+${impactNum.toLocaleString(undefined, { maximumFractionDigits: 4 })}` : impactNum.toLocaleString(undefined, { maximumFractionDigits: 4 })) : null;
                const impactColor = impactNum === null ? '#666' : (impactNum < 0 ? '#0a7f2e' : '#b00020');
                const styleA = winnerIsMyTeam ? 'font-weight:600;' : '';
                const styleB = (!winnerIsMyTeam && meta.result === 'L') ? 'font-weight:600;' : '';

                el.innerHTML = `
                  <div style="margin-bottom:6px; display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;">
                    <div style="font-weight:600; font-size:12px;">${dateStr}</div>
                    <div style="opacity:.7;">${dsLabel}</div>
                    ${(meta.tournament || meta.round) ? `<div style=\"opacity:.6; font-size:11px;\">• ${(meta.tournament || '')}${meta.round ? ' – ' + meta.round : ''}</div>` : ''}
                  </div>
                  <div style="display:grid; grid-template-columns:${gridCols}; gap:4px 6px; margin-bottom:6px; align-items:center;">
                    <div style="${styleA}">${teamA}</div>
                    ${myCellsHtml}
                    <div style="${styleB}">${teamB}</div>
                    ${oppCellsHtml}
                  </div>
                  <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
                    <div><span style="opacity:.7;">Rating</span> <strong>${ratingStr}</strong></div>
                    ${impactStr !== null ? `<div style=\"font-weight:600; color:${impactColor};\">${impactStr}</div>` : ''}
                  </div>
                `;
              }

              const rect = chart.canvas.getBoundingClientRect();
              const margin = 8; // viewport margin
              let left = rect.left + window.scrollX + tooltip.caretX + 10;
              let top  = rect.top  + window.scrollY + tooltip.caretY + 10;

              el.style.opacity = 1;
              const ttW = el.offsetWidth || 220;
              const ttH = el.offsetHeight || 80;

              const maxRight = window.scrollX + window.innerWidth - margin;
              if (left + ttW > maxRight) {
                left = rect.left + window.scrollX + tooltip.caretX - ttW - 10;
              }
              const minLeft = window.scrollX + margin;
              if (left < minLeft) left = minLeft;

              const maxBottom = window.scrollY + window.innerHeight - margin;
              if (top + ttH > maxBottom) top = maxBottom - ttH;
              const minTop = window.scrollY + margin;
              if (top < minTop) top = minTop;

              el.style.left = left + "px";
              el.style.top  = top + "px";
            }
          }
        }
      }
    });

    // Ensure chart reacts to panel resizing (both width and height)
    if (window._ratingChart && typeof ResizeObserver !== "undefined") {
      if (window._ratingChart._panelObserver) {
        try { window._ratingChart._panelObserver.disconnect(); } catch (_) {}
      }
      const ro = new ResizeObserver(() => {
        try { window._ratingChart.resize(); } catch (_) {}
      });
      ro.observe(panel);
      window._ratingChart._panelObserver = ro;
    }

    // Apply initial y-range with rounding/margin (will be recomputed again after first render)
    (function() {
      const ci = window._ratingChart;
      if (!ci) return;
      const range = computeYRangeFromVisible(ci);
      ci.options.scales.y.min = range.yMin;
      ci.options.scales.y.max = range.yMax;
      ci.update();
    })();
  }

  function injectButtons() {
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.top = "80px";
    container.style.left = "20px";
    container.style.zIndex = 10000;
    container.style.background = "#fff";
    container.style.padding = "10px";
    container.style.border = "1px solid #ccc";
    container.style.borderRadius = "8px";
    container.style.boxShadow = "0 0 10px rgba(0,0,0,0.1)";
    container.style.width = "420px";
    container.style.maxWidth = "80vw";
    container.style.maxHeight = "80vh";
    container.style.resize = "both";
    container.style.overflow = "auto";
    container.style.display = "flex";
    container.style.flexDirection = "column";

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.justifyContent = "flex-start";
    header.style.cursor = "move";
    header.style.marginBottom = "8px";
    header.style.background = "#f7f7f7";
    header.style.padding = "6px 8px";
    header.style.borderRadius = "6px";
    header.style.userSelect = "none";

    const headerTitle = document.createElement("div");
    headerTitle.textContent = "KNLTB Tools";
    headerTitle.style.fontWeight = "600";
    headerTitle.style.flex = "1 1 auto";
    header.appendChild(headerTitle);

    const collapseBtn = document.createElement("button");
    collapseBtn.textContent = "▾";
    collapseBtn.title = "Collapse / Expand";
    collapseBtn.style.cursor = "pointer";
    collapseBtn.style.marginLeft = "8px";
    collapseBtn.style.padding = "0 5px"; // slightly smaller padding
    collapseBtn.style.border = "1px solid #ccc";
    collapseBtn.style.borderRadius = "4px";
    collapseBtn.style.background = "#fff";
    collapseBtn.style.fontSize = "16px"; // bigger icon glyph
    collapseBtn.style.lineHeight = "18px";
    collapseBtn.style.userSelect = "none";

    const maximizeBtn = document.createElement("button");
    maximizeBtn.textContent = "⤢"; // toggles to ⤡ when maximized
    maximizeBtn.title = "Maximize / Restore";
    maximizeBtn.style.cursor = "pointer";
    maximizeBtn.style.marginLeft = "8px";
    maximizeBtn.style.padding = "0 5px"; // keep footprint tight
    maximizeBtn.style.border = "1px solid #ccc";
    maximizeBtn.style.borderRadius = "4px";
    maximizeBtn.style.background = "#fff";
    maximizeBtn.style.fontSize = "20px"; // larger icon glyph
    maximizeBtn.style.lineHeight = "20px";
    maximizeBtn.style.userSelect = "none";

    const minimizeBtn = document.createElement("button");
    minimizeBtn.textContent = "–"; // en dash as minimize
    minimizeBtn.title = "Minimize to taskbar";
    minimizeBtn.style.cursor = "pointer";
    minimizeBtn.style.marginLeft = "8px";
    minimizeBtn.style.padding = "0 5px";
    minimizeBtn.style.border = "1px solid #ccc";
    minimizeBtn.style.borderRadius = "4px";
    minimizeBtn.style.background = "#fff";
    minimizeBtn.style.fontSize = "18px";
    minimizeBtn.style.lineHeight = "18px";
    minimizeBtn.style.userSelect = "none";

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "6px";
    controls.style.marginLeft = "auto";
    // Windows-like order: minimize, maximize/restore, collapse
    controls.appendChild(minimizeBtn);
    controls.appendChild(maximizeBtn);
    controls.appendChild(collapseBtn);
    header.appendChild(controls);

    container.appendChild(header);

    const contentWrap = document.createElement("div");
    contentWrap.id = "knltbToolsContent";
    contentWrap.style.display = "flex";
    contentWrap.style.flexDirection = "column";
    contentWrap.style.flex = "1 1 auto";
    contentWrap.style.minHeight = "0"; // allow children to shrink/grow properly
    container.appendChild(contentWrap);

    let isCollapsed = false;
    collapseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      isCollapsed = !isCollapsed;

      if (isCollapsed) {
        // Save current size so we can restore it later
        container.dataset.prevWidth = container.style.width || '';
        container.dataset.prevHeight = container.style.height || '';
        // Hide content and shrink container to header height
        contentWrap.style.display = "none";
        collapseBtn.textContent = "▸";
        container.style.resize = "none";
        // Force container height to header height + small padding
        const headerHeight = header.getBoundingClientRect().height;
        container.style.height = Math.ceil(headerHeight + 12) + "px";
        // Allow vertical scaling to reset next time we expand
      } else {
        // Show content and restore previous size if any
        contentWrap.style.display = "flex";
        collapseBtn.textContent = "▾";
        container.style.resize = "both";
        if (container.dataset.prevWidth) container.style.width = container.dataset.prevWidth;
        if (container.dataset.prevHeight) container.style.height = container.dataset.prevHeight;
        // Kick chart to recompute sizes after layout
        const kickResize = () => {
          if (window._ratingChart && typeof window._ratingChart.resize === 'function') {
            try { window._ratingChart.resize(); } catch (_) {}
          }
        };
        // Schedule twice to ensure after reflow
        requestAnimationFrame(() => {
          kickResize();
          setTimeout(kickResize, 0);
        });
      }
    });

    // Maximize/restore logic
    let isMaximized = false;
    function applyMaxSize() {
      container.style.left = "0px";
      container.style.top = "0px";
      container.style.width = window.innerWidth + "px";
      container.style.height = window.innerHeight + "px";
      container.style.maxWidth = "100vw";
      container.style.maxHeight = "100vh";
      container.style.resize = "none";
      if (window._ratingChart && typeof window._ratingChart.resize === 'function') {
        try { window._ratingChart.resize(); } catch (_) {}
      }
    }

    function handleWindowResize() {
      if (!isMaximized) return;
      applyMaxSize();
    }

    maximizeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      isMaximized = !isMaximized;
      if (isMaximized) {
        // Save current geometry for restore
        container.dataset.restoreLeft = container.style.left || '';
        container.dataset.restoreTop = container.style.top || '';
        container.dataset.restoreWidth = container.style.width || '';
        container.dataset.restoreHeight = container.style.height || '';
        container.dataset.restoreResize = container.style.resize || '';
        applyMaxSize();
        window.addEventListener('resize', handleWindowResize);
        maximizeBtn.textContent = '⤡';
      } else {
        // Restore previous geometry
        if (container.dataset.restoreLeft) container.style.left = container.dataset.restoreLeft;
        if (container.dataset.restoreTop) container.style.top = container.dataset.restoreTop;
        if (container.dataset.restoreWidth) container.style.width = container.dataset.restoreWidth;
        if (container.dataset.restoreHeight) container.style.height = container.dataset.restoreHeight;
        container.style.maxWidth = "80vw";
        container.style.maxHeight = "80vh";
        container.style.resize = container.dataset.restoreResize || 'both';
        window.removeEventListener('resize', handleWindowResize);
        maximizeBtn.textContent = '⤢';
        if (window._ratingChart && typeof window._ratingChart.resize === 'function') {
          try { window._ratingChart.resize(); } catch (_) {}
        }
      }
    });

    // Minimize to dock
    minimizeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      // Save current geometry for restore
      container.dataset.minRestoreLeft = container.style.left || '';
      container.dataset.minRestoreTop = container.style.top || '';
      container.dataset.minRestoreWidth = container.style.width || '';
      container.dataset.minRestoreHeight = container.style.height || '';
      container.dataset.minRestoreResize = container.style.resize || '';
      container.dataset.minWasMaximized = String(!!isMaximized);

      // Create a dock button (single floating button) and try to place it next to the consent button
      let dockBtn = document.getElementById("knltbDockBtn");
      if (!dockBtn) {
        dockBtn = document.createElement("button");
        dockBtn.id = "knltbDockBtn";
        dockBtn.textContent = "KNLTB Tools";
        dockBtn.title = "Restore KNLTB Tools";
        dockBtn.style.cursor = "pointer";
        dockBtn.style.padding = "4px 8px";
        dockBtn.style.border = "1px solid #bbb";
        dockBtn.style.borderRadius = "4px";
        dockBtn.style.background = "#fff";
        dockBtn.style.fontSize = "12px";
        dockBtn.style.lineHeight = "16px";
        dockBtn.style.zIndex = 10000;
        document.body.appendChild(dockBtn);
      }

      // Try to position next to consent; fallback to bottom-left if not found
      const placed = positionDockBtnNearConsent(dockBtn);
      if (!placed) {
        dockBtn.style.position = 'fixed';
        dockBtn.style.left = '10px';
        dockBtn.style.bottom = '10px';
      }

      // Hide the window
      container.style.display = "none";

      // Restore from dock on click
      dockBtn.onclick = () => {
        container.style.display = "flex";
        // Restore geometry
        if (container.dataset.minRestoreLeft) container.style.left = container.dataset.minRestoreLeft;
        if (container.dataset.minRestoreTop) container.style.top = container.dataset.minRestoreTop;
        if (container.dataset.minRestoreWidth) container.style.width = container.dataset.minRestoreWidth;
        if (container.dataset.minRestoreHeight) container.style.height = container.dataset.minRestoreHeight;
        container.style.resize = container.dataset.minRestoreResize || 'both';

        // If it was maximized before minimization, re-apply max size
        const wasMax = container.dataset.minWasMaximized === 'true';
        if (wasMax) {
          isMaximized = true;
          applyMaxSize();
        } else {
          isMaximized = false;
        }

        // Nudge chart to recalc after restore
        const kickResize = () => {
          if (window._ratingChart && typeof window._ratingChart.resize === 'function') {
            try { window._ratingChart.resize(); } catch (_) {}
          }
        };
        requestAnimationFrame(() => {
          kickResize();
          setTimeout(kickResize, 0);
        });

        // Remove the dock button and its resize listener after restoring
        if (dockBtn._knltbOnResize) {
          try { window.removeEventListener('resize', dockBtn._knltbOnResize); } catch (_) {}
          dockBtn._knltbOnResize = null;
        }
        try { dockBtn.remove(); } catch (_) {}
      };
    });

    // Drag behavior
    let isDragging = false;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;

    header.addEventListener("mousedown", (e) => {
      if (typeof isMaximized !== 'undefined' && isMaximized) return; // no dragging in maximized mode
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = container.offsetLeft;
      startTop = container.offsetTop;
      document.body.style.userSelect = "none";
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      let newLeft = startLeft + dx;
      let newTop = startTop + dy;
      // Clamp within viewport horizontally and vertically (full range)
      newLeft = Math.max(0, Math.min(window.innerWidth - container.offsetWidth, newLeft));
      newTop = Math.max(0, Math.min(window.innerHeight - container.offsetHeight, newTop));
      container.style.left = newLeft + "px";
      container.style.top = newTop + "px";
    });

    document.addEventListener("mouseup", () => {
      if (isDragging) {
        isDragging = false;
        document.body.style.userSelect = "";
      }
    });

    const importBtn = document.createElement("button");
    importBtn.textContent = "📥 Import Season";
    importBtn.onclick = () => {
      setStatus("⏳ Importing season… this may take a few seconds.");
      expandAllDetails(parseSeasonMatches);
    };

    const processBtn = document.createElement("button");
    processBtn.textContent = "📊 Show Rating Chart";
    processBtn.style.marginLeft = "10px";
    processBtn.onclick = processMatches;

    contentWrap.appendChild(importBtn);
    contentWrap.appendChild(processBtn);
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
    ratingPanel.style.flex = "0 0 auto"; // compact until chart is shown
    ratingPanel.style.height = "auto";
    ratingPanel.style.maxHeight = "none";
    ratingPanel.style.minHeight = "20px"; // small placeholder height
    ratingPanel.style.overflow = "hidden";
    contentWrap.appendChild(ratingPanel);


    document.body.appendChild(container);
  }

  injectButtons();
})();
