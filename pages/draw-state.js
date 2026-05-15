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

const toAbsUrl = (url) => {
  if (_ku) return _ku.toAbsUrl(url);
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return window.location.origin + url;
  try { return new URL(url, window.location.href).href; } catch (e) { return null; }
};
