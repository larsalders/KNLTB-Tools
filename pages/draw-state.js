const DEBUG = false;
const _log = DEBUG ? console.log.bind(console) : () => {};

const _ku = window.KNLTBUtils || {
  normalizeName: name => typeof name === 'string' ? name.toLowerCase().trim().replace(/\s+/g, ' ') : '',
  toAbsUrl: url => {
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('/')) return window.location.origin + url;
    try { return new URL(url, window.location.href).href; } catch (e) { return null; }
  },
  matchSignature: m => { try { return JSON.stringify(m); } catch (e) { return String(m); } },
  getMatchTimestamp: match => {
    try {
      let raw = String((match && (match.dateTime || match.date || '')) || '').trim();
      if (!raw) return null;
      raw = raw.replace(/^\s*(ma|di|wo|do|vr|za|zo|mon|tue|wed|thu|fri|sat|sun)\b\.?\,?\s*/i, '');
      const dtMatch = raw.match(/(\d{1,2}[\.\-/]\d{1,2}[\.\-/]\d{4}(?:\s+\d{1,2}:\d{2})?)/);
      if (dtMatch) {
        const dmy = dtMatch[1].match(/(\d{1,2})[\.\-/](\d{1,2})[\.\-/](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
        if (dmy) return new Date(parseInt(dmy[3],10), parseInt(dmy[2],10)-1, parseInt(dmy[1],10), dmy[4]?parseInt(dmy[4],10):0, dmy[5]?parseInt(dmy[5],10):0).getTime();
      }
      const iso = Date.parse(raw);
      if (!Number.isNaN(iso)) return iso;
    } catch (e) {}
    return null;
  },
  categoryTokenFromText: () => null,
};

const normalizeName = (name) => _ku.normalizeName(name);

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

const teams = [];
const playerRatings = {};
const playerBaselineRatings = {};
const matchQueue = [];
const playerUrls = {};

let dssLastChangedPlayers = new Set();
let dssPanel = null;
let lastImportSource = null;

// Draw simulator display filter. { type: 'all' | 'player' | 'team', key: string }
// key is a normalized player name (player) or a team key (team). Display-only:
// ratings are always simulated over the full matchQueue so results stay correct.
let dssFilter = { type: 'all', key: '' };
let dssFilterSig = '';

// Lightweight timing for the import phases. Always on and independent of DEBUG:
// one summary table per run is cheap and it is the only way to tell which phase
// is actually slow instead of guessing. Use dssTiming.phase() around a phase and
// dssTiming.count()/add() for per-item tallies inside one.
const dssTiming = {
  _phases: [],
  _counters: {},
  reset() { this._phases = []; this._counters = {}; },
  now() { return performance.now(); },
  // Record a phase that started at t0 (from dssTiming.now())
  mark(name, t0) { this._phases.push({ phase: name, ms: Math.round(performance.now() - t0) }); },
  count(name, n = 1) { this._counters[name] = (this._counters[name] || 0) + n; },
  // Time one awaited call and attribute it to a named bucket
  async track(name, fn) {
    const t0 = performance.now();
    try {
      return await fn();
    } finally {
      this.count(name + ' calls');
      this.count(name + ' ms', Math.round(performance.now() - t0));
    }
  },
  report(label) {
    try {
      // Phases nest (TOTAL spans the others), so never sum them — read the TOTAL mark.
      const totalPhase = this._phases.find(p => p.phase === 'TOTAL');
      const total = totalPhase ? totalPhase.ms : this._phases.reduce((s, p) => s + p.ms, 0);
      console.info(`[DSS] ${label} — ${(total / 1000).toFixed(1)}s total`);
      console.table(this._phases.map(p => ({
        phase: p.phase,
        seconds: (p.ms / 1000).toFixed(2),
        '% of total': total ? Math.round((p.ms / total) * 100) + '%' : '—'
      })));
      // Per-call tallies. "ms" here is summed across concurrent workers, so it can
      // exceed wall-clock — that is the point: it shows where the work went.
      const calls = Object.keys(this._counters)
        .filter(k => k.endsWith(' calls'))
        .map(k => {
          const name = k.slice(0, -' calls'.length);
          return { call: name, count: this._counters[k], 'total ms (all workers)': this._counters[name + ' ms'] ?? '—' };
        });
      const flags = Object.entries(this._counters)
        .filter(([k]) => !k.endsWith(' calls') && !k.endsWith(' ms'))
        .map(([call, count]) => ({ call, count, 'total ms (all workers)': '—' }));
      if (calls.length || flags.length) console.table(calls.concat(flags));
    } catch (e) {}
  }
};

// How many plain page fetches may be in flight at once.
// Measured, not guessed: raising this to 12 left the 15-profile phase at 5.9s (vs 5.5s
// at 6) while making everything it ran alongside slower. The browser caps connections
// per host at about 6, so extra workers just queue and steal lanes from the iframe
// loads. 6 matches the real ceiling; going higher is counterproductive, not neutral.
const DSS_FETCH_CONCURRENCY = 6;

// Concurrency for phases that may fall back to loading a page in a hidden iframe.
// Deliberately lower than DSS_FETCH_CONCURRENCY: an iframe is a full page render, and
// running many at once trades network wait for CPU contention and UI jank.
const DSS_IFRAME_CONCURRENCY = 5;

// Map over items with limited concurrency, PRESERVING input order: each result is
// stored at its source item's index, never pushed in completion order. Callers can
// therefore parallelize fetches without any run-to-run variation in the output —
// same input list, same output list, every time.
// mapper receives (item, index). shouldContinue is polled before starting each item
// so callers can cancel mid-run; results already collected are returned as-is.
async function mapWithConcurrency(items, mapper, concurrency = DSS_FETCH_CONCURRENCY, shouldContinue = () => true) {
  const arr = Array.isArray(items) ? items : Array.from(items);
  const results = new Array(arr.length);
  let idx = 0;    // next index to start
  let active = 0;
  return new Promise((resolve) => {
    const next = () => {
      if (!shouldContinue()) return resolve(results);
      if (idx >= arr.length) {
        if (active === 0) resolve(results);
        return;
      }
      const currentIndex = idx++;
      active++;
      (async () => {
        try {
          results[currentIndex] = await mapper(arr[currentIndex], currentIndex);
        } catch (e) {
          results[currentIndex] = null;
        } finally {
          active--;
          next();
        }
      })();
    };
    if (!arr.length) return resolve(results);
    const starters = Math.min(Math.max(1, concurrency), arr.length);
    for (let i = 0; i < starters; i++) next();
  });
}

const toAbsUrl = (url) => {
  if (_ku) return _ku.toAbsUrl(url);
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return window.location.origin + url;
  try { return new URL(url, window.location.href).href; } catch (e) { return null; }
};
