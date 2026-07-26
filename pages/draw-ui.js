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
    .dss-panel .btn.btn--whatsapp {
      background-color: #25D366;
      border-color: transparent;
      box-shadow: 0 1px 4px rgba(37, 211, 102, .5);
      color: #fff;
    }
    .dss-panel .btn.btn--whatsapp:hover {
      background-color: #1da851;
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
    }
    .dss-team-cell {
      cursor: pointer;
      user-select: none;
      transition: background-color 0.1s;
    }
    .dss-team-cell:hover {
      background-color: rgba(59, 130, 246, 0.08) !important;
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
  const loadingMsg = document.getElementById('dss-loading-msg');
  const autoBtn = document.getElementById('autoGroupMatchesBtn');
  const refreshBtn = document.getElementById('refreshPlayerRatingsBtn');
  const loadBtn = document.getElementById('loadImportedBtn');
  if (loader) loader.style.display = isLoading ? 'flex' : 'none';
  if (loadingMsg && message) loadingMsg.textContent = message;
  if (status && message) status.textContent = message;
  if (!isLoading) setProgress(0, 0);
  [autoBtn, refreshBtn, loadBtn].forEach(btn => { if (btn) btn.disabled = !!isLoading; });
}

function setProgress(current, total, name, label = 'Player') {
  const wrap = document.getElementById('dss-progress-wrap');
  const bar = document.getElementById('dss-progress-bar');
  const text = document.getElementById('dss-progress-text');
  if (!wrap) return;
  if (total > 0) {
    wrap.style.display = 'flex';
    const pct = Math.round((current / total) * 100);
    if (bar) bar.style.width = pct + '%';
    if (text) text.textContent = `${label} ${current} of ${total}${name ? ': ' + name : ''} (${pct}%)`;
  } else {
    wrap.style.display = 'none';
    if (bar) bar.style.width = '0%';
    if (text) text.textContent = '';
  }
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

// Stable key for a team (order-independent) used to identify teams/pairs.
function dssTeamKey(team) {
  return (team && Array.isArray(team.players) ? team.players : [])
    .map(p => normalizeName(p)).sort().join('|');
}

// Human label for a team/pair, e.g. "Alders & Jansen".
function dssTeamLabel(team) {
  return (team && Array.isArray(team.players) ? team.players : []).join(' & ');
}

// Does a single team/pair match the active filter?
function teamMatchesFilter(team) {
  if (!dssFilter || dssFilter.type === 'all') return true;
  if (!team || !Array.isArray(team.players)) return false;
  if (dssFilter.type === 'player') {
    return team.players.some(p => normalizeName(p) === dssFilter.key);
  }
  if (dssFilter.type === 'team') {
    return dssTeamKey(team) === dssFilter.key;
  }
  return true;
}

// Should a match row be shown given the active filter? (display-only)
function matchPassesFilter(match) {
  if (!dssFilter || dssFilter.type === 'all') return true;
  if (!match) return false;
  return teamMatchesFilter(match.team1) || teamMatchesFilter(match.team2);
}

// Build the player/team filter dropdown from the current match queue.
// Rebuilds only when the available options change, so an open dropdown or the
// current selection isn't disrupted on every re-render.
function populateFilterDropdown() {
  const select = document.getElementById('dss-filter-select');
  if (!select) return;

  const seenPlayers = new Set();
  const players = [];
  const seenTeams = new Set();
  const teamOpts = [];

  const addTeam = (t) => {
    if (!t || !Array.isArray(t.players) || !t.players.length) return;
    const key = dssTeamKey(t);
    if (!seenTeams.has(key)) { seenTeams.add(key); teamOpts.push({ key, label: dssTeamLabel(t) }); }
    t.players.forEach(p => {
      const norm = normalizeName(p);
      if (norm && !seenPlayers.has(norm)) { seenPlayers.add(norm); players.push({ norm, label: p }); }
    });
  };

  const source = matchQueue.length
    ? matchQueue.flatMap(m => [m && m.team1, m && m.team2])
    : (Array.isArray(teams) ? teams : []);
  source.forEach(addTeam);

  players.sort((a, b) => a.label.localeCompare(b.label));
  teamOpts.sort((a, b) => a.label.localeCompare(b.label));

  // Only rebuild when the option set actually changed.
  const sig = 'p:' + players.map(p => p.norm).join(',') + '|t:' + teamOpts.map(t => t.key).join(',');
  if (sig === dssFilterSig) return;
  dssFilterSig = sig;

  // Preserve current selection if still available.
  const prev = select.value;
  select.innerHTML = '';

  const allOpt = document.createElement('option');
  allOpt.value = 'all:';
  allOpt.textContent = 'All matches';
  select.appendChild(allOpt);

  if (players.length) {
    const pg = document.createElement('optgroup');
    pg.label = 'Players';
    players.forEach(({ norm, label }) => {
      const o = document.createElement('option');
      o.value = 'player:' + norm;
      o.textContent = label;
      pg.appendChild(o);
    });
    select.appendChild(pg);
  }

  if (teamOpts.length) {
    const tg = document.createElement('optgroup');
    tg.label = 'Teams / pairs';
    teamOpts.forEach(({ key, label }) => {
      const o = document.createElement('option');
      o.value = 'team:' + key;
      o.textContent = label;
      tg.appendChild(o);
    });
    select.appendChild(tg);
  }

  // Restore previous selection, or reset filter if it's gone.
  if (prev && select.querySelector(`option[value="${CSS.escape(prev)}"]`)) {
    select.value = prev;
  } else {
    select.value = 'all:';
    dssFilter = { type: 'all', key: '' };
  }
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

  // --- Filter + Share row ---
  const toolsRow = document.createElement('div');
  toolsRow.id = 'dss-tools-row';
  toolsRow.style.display = 'none'; // hidden until matches are loaded
  toolsRow.style.alignItems = 'center';
  toolsRow.style.gap = '8px';
  toolsRow.style.flexWrap = 'wrap';
  toolsRow.style.margin = '0 0 12px 0';

  const filterLabel = document.createElement('label');
  filterLabel.textContent = 'Filter:';
  filterLabel.htmlFor = 'dss-filter-select';
  filterLabel.style.fontSize = '12px';
  filterLabel.style.fontWeight = '600';
  toolsRow.appendChild(filterLabel);

  const filterSelect = document.createElement('select');
  filterSelect.id = 'dss-filter-select';
  filterSelect.style.fontSize = '13px';
  filterSelect.style.padding = '8px 10px';
  filterSelect.style.height = '38px';
  filterSelect.style.borderRadius = '4px';
  filterSelect.style.border = '1px solid rgba(0,0,0,0.2)';
  filterSelect.style.maxWidth = '220px';
  filterSelect.style.flex = '0 1 auto';
  filterSelect.innerHTML = '<option value="all:">All matches</option>';
  filterSelect.addEventListener('change', () => {
    const val = filterSelect.value || 'all:';
    const sep = val.indexOf(':');
    const type = val.slice(0, sep);
    const key = val.slice(sep + 1);
    dssFilter = { type: type || 'all', key: key || '' };
    renderMatches();
  });
  toolsRow.appendChild(filterSelect);

  const copyBtn = document.createElement('a');
  copyBtn.id = 'dss-copy-clipboard';
  copyBtn.href = '#';
  copyBtn.className = 'btn btn--primary';
  copyBtn.style.display = 'inline-flex';
  copyBtn.style.alignItems = 'center';
  copyBtn.title = 'Copy the current (filtered) results to the clipboard';
  copyBtn.innerHTML = `
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="margin-right:8px;">
      <path d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/>
    </svg>
    <span class="nav-link__value">Copy</span>`;
  copyBtn.onclick = function(e) { e.preventDefault(); copyResultsToClipboard(); };
  toolsRow.appendChild(copyBtn);

  const shareBtn = document.createElement('a');
  shareBtn.id = 'dss-share-whatsapp';
  shareBtn.href = '#';
  shareBtn.className = 'btn btn--whatsapp';
  shareBtn.style.display = 'inline-flex';
  shareBtn.style.alignItems = 'center';
  shareBtn.title = 'Open WhatsApp with the current (filtered) results prefilled';
  shareBtn.innerHTML = `
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="margin-right:8px;">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm5.8 14.1c-.24.68-1.42 1.32-1.96 1.36-.5.05-.5.4-3.16-.66-2.66-1.05-4.32-3.77-4.45-3.95-.13-.17-1.06-1.42-1.06-2.7 0-1.29.67-1.92.91-2.18.24-.26.53-.33.71-.33.18 0 .35 0 .5.01.16.01.38-.06.59.45.24.59.81 2.03.88 2.18.07.14.12.31.02.5-.09.18-.14.29-.28.45-.14.16-.29.36-.42.48-.14.14-.28.29-.12.57.16.28.71 1.17 1.53 1.9 1.05.94 1.94 1.23 2.22 1.37.28.14.44.12.6-.07.16-.19.69-.81.87-1.09.18-.28.36-.23.61-.14.25.09 1.6.75 1.87.89.28.14.46.21.53.32.07.12.07.66-.17 1.34z"/>
    </svg>
    <span class="nav-link__value">Share to WhatsApp</span>`;
  shareBtn.onclick = function(e) { e.preventDefault(); shareToWhatsApp(); };
  toolsRow.appendChild(shareBtn);

  const shareFeedback = document.createElement('div');
  shareFeedback.id = 'dss-share-feedback';
  shareFeedback.style.flex = '1 1 100%';
  shareFeedback.style.fontSize = '11px';
  shareFeedback.style.color = '#1a7f1a';
  shareFeedback.style.margin = '0';
  shareFeedback.style.minHeight = '0';
  toolsRow.appendChild(shareFeedback);

  contentWrap.appendChild(toolsRow);
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
  loadingRow.style.flexDirection = 'column';
  loadingRow.style.gap = '4px';
  loadingRow.style.margin = '6px 0';

  const loadingTopRow = document.createElement('div');
  loadingTopRow.style.display = 'flex';
  loadingTopRow.style.alignItems = 'center';
  loadingTopRow.style.gap = '8px';
  const spinner = document.createElement('span');
  spinner.className = 'dss-spinner';
  const loadingMsg = document.createElement('span');
  loadingMsg.id = 'dss-loading-msg';
  loadingMsg.textContent = 'Working…';
  loadingTopRow.appendChild(spinner);
  loadingTopRow.appendChild(loadingMsg);
  loadingRow.appendChild(loadingTopRow);

  const progressWrap = document.createElement('div');
  progressWrap.id = 'dss-progress-wrap';
  progressWrap.style.display = 'none';
  progressWrap.style.flexDirection = 'column';
  progressWrap.style.gap = '3px';

  const progressBarOuter = document.createElement('div');
  progressBarOuter.style.width = '100%';
  progressBarOuter.style.height = '6px';
  progressBarOuter.style.background = '#e0e0e0';
  progressBarOuter.style.borderRadius = '3px';
  progressBarOuter.style.overflow = 'hidden';
  const progressBarInner = document.createElement('div');
  progressBarInner.id = 'dss-progress-bar';
  progressBarInner.style.height = '100%';
  progressBarInner.style.width = '0%';
  progressBarInner.style.background = '#3b82f6';
  progressBarInner.style.borderRadius = '3px';
  progressBarInner.style.transition = 'width 0.25s ease';
  progressBarOuter.appendChild(progressBarInner);
  progressWrap.appendChild(progressBarOuter);

  const progressText = document.createElement('div');
  progressText.id = 'dss-progress-text';
  progressText.style.fontSize = '11px';
  progressText.style.color = '#555';
  progressWrap.appendChild(progressText);

  loadingRow.appendChild(progressWrap);
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
  <thead style="position:sticky;top:0;z-index:2;">
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
    const paired = matchQueue.map((m, i) => ({ m, i, t: _ku ? _ku.getMatchTimestamp(m) : null }));
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

  // Keep the filter dropdown in sync with the current match queue.
  populateFilterDropdown();

  // Filter + share tools only make sense once matches have been loaded.
  const toolsRow = document.getElementById('dss-tools-row');
  if (toolsRow) toolsRow.style.display = matchQueue.length ? 'flex' : 'none';

  // Column visibility
  const matchType = detectMatchTypeFromPage();
  const showAvg = matchType !== 'single';
  const showCategory = lastImportSource === 'findAll';
  const thead = table.querySelector('thead tr');
  if (thead) {
    const ths = thead.querySelectorAll('th');
    if (ths[6]) ths[6].style.display = showAvg ? '' : 'none';
    if (ths[8]) ths[8].style.display = showCategory ? '' : 'none';
  }

  if (matchQueue.length === 0) {
    const emptyRow = document.createElement('tr');
    const emptyCell = document.createElement('td');
    emptyCell.colSpan = 11 - (showAvg ? 0 : 1) - (showCategory ? 0 : 1);
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
  let visibleRowIndex = 0; // striping counter for filtered view

  matchQueue.forEach((match, index) => {
    // Defensive: skip malformed match entries that don't have expected shape
    if (!match || !match.team1 || !match.team2 || !Array.isArray(match.team1.players) || !Array.isArray(match.team2.players)) {
      try { console.warn('[DSS] Skipping malformed match entry at index', index, match); } catch (e) {}
      return; // skip this entry
    }
    // Display-only filter: ratings are still simulated for every match below so
    // the running totals stay correct; we just don't render hidden rows.
    const visible = matchPassesFilter(match);
    const tr = document.createElement("tr");

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
    if (!showAvg) tdAvg.style.display = 'none';
    // Probability calculation and styling
    const qProb = 2.012; // same q as rating function
    const expectedT1 = 1 / (1 + Math.exp(qProb * (t1Avg - t2Avg)));
    const t1Pct = (expectedT1 * 100).toFixed(1);
    const t2Pct = (100 - expectedT1 * 100).toFixed(1);
    const t1Favored = expectedT1 >= 0.5;
    tdProb.innerHTML = `<span style="color:${t1Favored ? '#1a7f1a' : '#b00020'};font-weight:${t1Favored ? '700' : '400'}">${t1Pct}%</span> | <span style="color:${!t1Favored ? '#1a7f1a' : '#b00020'};font-weight:${!t1Favored ? '700' : '400'}">${t2Pct}%</span>`;
    tdProb.style.textAlign = 'center';
    tdProb.style.whiteSpace = 'nowrap';

    // Category column
    tdCat.textContent = match.category || '—';
    tdCat.style.textAlign = 'center';
    tdCat.style.whiteSpace = 'nowrap';
    if (!showCategory) tdCat.style.display = 'none';

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
    [tdDate, td1r, td3r, tdAvg, tdProb, tdCat, tdRes, td2].forEach(td => { td.style.padding = '4px 8px'; });

    // Default: just show names (no ratings)
    td1.innerHTML = match.team1.players.map((p, i) => `<div>${p}</div>`).join("");
    td3.innerHTML = match.team2.players.map((p, i) => `<div>${p}</div>`).join("");
    td1.style.textAlign = "left";
    td1.style.padding = "4px 8px";
    td3.style.textAlign = "left";
    td3.style.padding = "4px 8px";
    tr.style.lineHeight = '1.3';

    td1.classList.add('dss-team-cell');
    td3.classList.add('dss-team-cell');
    td1.title = 'Click to set Team 1 as winner';
    td3.title = 'Click to set Team 2 as winner';
    td1.onclick = () => { match.winner = match.winner === 'team1' ? null : 'team1'; recomputeRatings(); };
    td3.onclick = () => { match.winner = match.winner === 'team2' ? null : 'team2'; recomputeRatings(); };

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

    if (visible) {
      if (visibleRowIndex % 2 === 1) tr.style.backgroundColor = "#f2f2f2";
      visibleRowIndex++;
      tbody.appendChild(tr);
    }
  });

  // If a filter is active and hides everything, show a helpful message.
  if (visibleRowIndex === 0) {
    const emptyRow = document.createElement('tr');
    const emptyCell = document.createElement('td');
    emptyCell.colSpan = 11 - (showAvg ? 0 : 1) - (showCategory ? 0 : 1);
    emptyCell.textContent = 'No matches for the selected filter.';
    emptyCell.style.padding = '12px 8px';
    emptyCell.style.textAlign = 'center';
    emptyCell.style.color = '#444';
    emptyCell.style.fontStyle = 'italic';
    emptyRow.appendChild(emptyCell);
    tbody.appendChild(emptyRow);
  }

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
        if (!teamMatchesFilter(t)) return; // respect active filter
        const k = keyForTeam(t);
        if (!seenTeams.has(k)) { seenTeams.add(k); teamList.push(t); }
      });
    });
    // Fallback: if no matches yet, show teams parsed from table
    if (teamList.length === 0 && Array.isArray(teams)) {
      teams.forEach(t => {
        if (!teamMatchesFilter(t)) return;
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

// Run the same sequential rating simulation as renderMatches, but return
// structured data instead of touching the DOM. Used by the WhatsApp share.
function computeSimulationData() {
  // Chronological order (mirror renderMatches sort so ratings match the UI).
  const paired = matchQueue
    .map((m, i) => ({ m, i, t: _ku ? _ku.getMatchTimestamp(m) : null }))
    .filter(x => x.m && x.m.team1 && x.m.team2 &&
      Array.isArray(x.m.team1.players) && Array.isArray(x.m.team2.players));
  paired.sort((A, B) => {
    if (A.t === null && B.t === null) return A.i - B.i;
    if (A.t === null) return 1;
    if (B.t === null) return -1;
    if (A.t === B.t) return A.i - B.i;
    return A.t - B.t;
  });

  const tempRatings = { ...playerRatings };
  const q = 2.012;
  const rows = [];

  paired.forEach(({ m: match }) => {
    const t1 = match.team1.players;
    const t2 = match.team2.players;
    const t1Old = t1.map(p => tempRatings[normalizeName(p)] ?? 0);
    const t2Old = t2.map(p => tempRatings[normalizeName(p)] ?? 0);
    const avg = arr => arr.length ? arr.reduce((a, b) => a + (b ?? 0), 0) / arr.length : 0;
    const t1Avg = avg(t1Old);
    const t2Avg = avg(t2Old);
    const expT1 = 1 / (1 + Math.exp(q * (t1Avg - t2Avg)));

    let resultStr = '';
    if (Array.isArray(match.score) && match.score.length) {
      resultStr = match.score.map(p => `${p[0]}-${p[1]}`).join(' ');
    } else if (match.result) {
      const r = String(match.result).toLowerCase();
      resultStr = r === 'walkover' ? 'Walkover' : (r === 'opgave' ? 'Opgave' : match.result);
    }

    // Apply winner to the running ratings, mirroring renderMatches exactly, and
    // record the per-match rating change for each player involved.
    const changes = [];
    if (match.winner) {
      const teamSize = t1.length;
      const skip = (match.result === 'walkover' && teamSize === 2);
      if (!skip) {
        const r1 = t1Old[0];
        const r2 = t1[1] ? t1Old[1] : r1;
        const r3 = t2Old[0];
        const r4 = t2[1] ? t2Old[1] : r3;
        const impact = match.winner === 'team1'
          ? calculateTeamRatingImpact(r1, r2, r3, r4)
          : calculateTeamRatingImpact(r3, r4, r1, r2);
        if (match.winner === 'team1') {
          if (t1[0]) tempRatings[normalizeName(t1[0])] = impact.newTeam1Rating1;
          if (t1[1]) tempRatings[normalizeName(t1[1])] = impact.newTeam1Rating2;
          if (t2[0]) tempRatings[normalizeName(t2[0])] = impact.newTeam2Rating1;
          if (t2[1]) tempRatings[normalizeName(t2[1])] = impact.newTeam2Rating2;
        } else {
          if (t2[0]) tempRatings[normalizeName(t2[0])] = impact.newTeam1Rating1;
          if (t2[1]) tempRatings[normalizeName(t2[1])] = impact.newTeam1Rating2;
          if (t1[0]) tempRatings[normalizeName(t1[0])] = impact.newTeam2Rating1;
          if (t1[1]) tempRatings[normalizeName(t1[1])] = impact.newTeam2Rating2;
        }
        const pushChange = (name, oldR) => {
          const nn = normalizeName(name);
          const newR = tempRatings[nn] ?? oldR;
          changes.push({ name, old: oldR, new: newR, delta: newR - oldR });
        };
        t1.forEach((p, i) => pushChange(p, t1Old[i]));
        t2.forEach((p, i) => pushChange(p, t2Old[i]));
      }
    }

    rows.push({
      team1: match.team1,
      team2: match.team2,
      date: match.dateTime || match.date || '',
      category: match.category || '',
      t1Pct: expT1 * 100,
      t2Pct: 100 - expT1 * 100,
      winner: match.winner || null,
      resultStr,
      changes
    });
  });

  // Player rating summary, grouped by team (respecting the active filter).
  const summary = [];
  const seenTeams = new Set();
  const addTeamSummary = (t) => {
    if (!t || !Array.isArray(t.players) || !teamMatchesFilter(t)) return;
    const key = dssTeamKey(t);
    if (seenTeams.has(key)) return;
    seenTeams.add(key);
    const players = t.players.map(p => {
      const nn = normalizeName(p);
      const start = playerBaselineRatings[nn] ?? playerRatings[nn] ?? 0;
      const current = tempRatings[nn] ?? playerRatings[nn] ?? start;
      return { name: p, start, current, diff: current - start };
    });
    summary.push({ label: dssTeamLabel(t), players });
  };
  const summarySource = matchQueue.length
    ? matchQueue.flatMap(m => [m && m.team1, m && m.team2])
    : (Array.isArray(teams) ? teams : []);
  summarySource.forEach(addTeamSummary);

  return { rows, summary };
}

// Suffix describing a rating change, matching the in-app convention:
// KNLTB ratings are "lower is better", so a NEGATIVE delta (rating went down)
// is good → green up-triangle; a POSITIVE delta (rating went up) is bad → red
// down-triangle. The colored circle carries the good/bad colour into WhatsApp
// (which can't colour text); it sits at the line end so it never disturbs the
// alignment of the numeric columns in a monospace block.
function dssDeltaGlyphs(delta) {
  if (delta < 0) return { arrow: '▲', circle: '🟢' }; // win → rating down → good
  if (delta > 0) return { arrow: '▼', circle: '🔴' }; // loss → rating up → bad
  return { arrow: '•', circle: '⚪' };
}

// Format one "name  old → new  ▲delta 🟢" line, padding the name for alignment.
function dssRatingLine(name, nameW, oldR, newR, delta) {
  const { arrow, circle } = dssDeltaGlyphs(delta);
  return `${String(name).padEnd(nameW)}  ${oldR.toFixed(4)} → ${newR.toFixed(4)}  ${arrow}${Math.abs(delta).toFixed(4)} ${circle}`;
}

// Build WhatsApp-friendly text for the current (filtered) results.
// Per-match rating changes are the headline content, followed by a cumulative
// per-player summary.
function buildShareText() {
  let title = 'KNLTB loting';
  try {
    if (typeof detectCurrentEventTitles === 'function') {
      const det = detectCurrentEventTitles();
      title = (det && (det.rawTitle || det.eventType)) || title;
    }
  } catch {}

  const { rows, summary } = computeSimulationData();
  const visibleRows = rows.filter(r => matchPassesFilter(r));

  const lines = [];
  lines.push(`🎾 *${title}*`);

  let scope = '';
  if (dssFilter && (dssFilter.type === 'player' || dssFilter.type === 'team')) {
    const opt = document.querySelector(
      `#dss-filter-select option[value="${CSS.escape(dssFilter.type + ':' + dssFilter.key)}"]`
    );
    scope = opt ? opt.textContent : '';
  }
  if (scope) lines.push(`_Filter: ${scope}_`);

  // --- Matches (with per-match rating changes) ---
  lines.push('');
  lines.push(`*Wedstrijden* (${visibleRows.length})`);
  if (!visibleRows.length) {
    lines.push('_Geen wedstrijden_');
  } else {
    // Name column width across all per-match change lines, for alignment.
    const nameW = Math.max(
      0,
      ...visibleRows.flatMap(r => (r.changes || []).map(c => c.name.length))
    );
    const block = [];
    visibleRows.forEach((r, i) => {
      if (i > 0) block.push('');
      if (r.date) block.push(r.date);
      const t1 = (r.winner === 'team1' ? '🏆 ' : '') + dssTeamLabel(r.team1);
      const t2 = (r.winner === 'team2' ? '🏆 ' : '') + dssTeamLabel(r.team2);
      block.push(`${t1}  vs  ${t2}`);
      const meta = [`kans ${r.t1Pct.toFixed(0)}% | ${r.t2Pct.toFixed(0)}%`];
      if (r.resultStr) meta.push(r.resultStr);
      block.push(meta.join(' · '));
      if (r.changes && r.changes.length) {
        r.changes.forEach(c => block.push(dssRatingLine(c.name, nameW, c.old, c.new, c.delta)));
      } else if (r.winner) {
        block.push('(geen rating-impact)');
      }
    });
    lines.push('```');
    lines.push(...block);
    lines.push('```');
  }

  // --- Cumulative rating changes per player ---
  if (summary.length) {
    const allPlayers = summary.flatMap(t => t.players);
    const nameW = Math.max(0, ...allPlayers.map(p => p.name.length));
    lines.push('');
    lines.push('*Rating totaal (start → nu)*');
    const block = [];
    summary.forEach((team, ti) => {
      if (ti > 0) block.push('');
      team.players.forEach(p => {
        block.push(dssRatingLine(p.name, nameW, p.start, p.current, p.diff));
      });
    });
    lines.push('```');
    lines.push(...block);
    lines.push('```');
  }

  return lines.join('\n');
}

// Copy text to the clipboard, with a legacy fallback for older contexts.
function dssCopyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error('execCommand copy failed'));
    } catch (e) { reject(e); }
  });
}

function dssShareFeedback(msg, ok = true) {
  const feedback = document.getElementById('dss-share-feedback');
  if (!feedback) return;
  feedback.textContent = msg;
  feedback.style.color = ok ? '#1a7f1a' : '#b00';
}

// Copy the current (filtered) results to the clipboard (no WhatsApp).
function copyResultsToClipboard() {
  let text;
  try {
    text = buildShareText();
  } catch (e) {
    console.warn('[DSS] Failed to build share text', e);
    dssShareFeedback('Could not build results text.', false);
    return;
  }
  dssCopyToClipboard(text)
    .then(() => dssShareFeedback('Copied to clipboard ✓'))
    .catch((e) => {
      console.warn('[DSS] Clipboard copy failed', e);
      dssShareFeedback('Could not copy to clipboard.', false);
    });
}

// Open WhatsApp with the current (filtered) results prefilled.
function shareToWhatsApp() {
  let text;
  try {
    text = buildShareText();
  } catch (e) {
    console.warn('[DSS] Failed to build share text', e);
    dssShareFeedback('Could not build results text.', false);
    return;
  }
  try {
    const url = 'https://wa.me/?text=' + encodeURIComponent(text);
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    dssShareFeedback(win ? 'Opened WhatsApp.' : 'Popup blocked — use Copy instead.', !!win);
  } catch (e) {
    console.warn('[DSS] Failed to open WhatsApp', e);
    dssShareFeedback('Could not open WhatsApp — use Copy instead.', false);
  }
}
