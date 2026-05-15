(function () {
  const utils = window.KNLTBUtils || {};

  function normalizeName(name) {
    if (typeof name !== 'string') return '';
    return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[-'.,]/g, '');
  }

  function toAbsUrl(url) {
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('/')) return window.location.origin + url;
    try {
      return new URL(url, window.location.href).href;
    } catch (e) {
      return null;
    }
  }

  function parseLocaleFloat(text) {
    if (text === undefined || text === null) return NaN;
    const normalized = String(text).replace(',', '.').replace(/[^0-9.\-]/g, '');
    return parseFloat(normalized);
  }

  function formatRating(newR, oldR) {
    const diff = Number(newR) - Number(oldR);
    const sign = diff > 0 ? '+' : '';
    return `${Number(newR).toFixed(4)} (${sign}${diff.toFixed(4)})`;
  }

  function categoryTokenFromText(txt) {
    if (!txt) return null;
    const s = String(txt).toUpperCase();
    const m = s.match(/\b(GD|HD|DD|HE|DE)(?:\s*[-]?\s*\d+)?\b/);
    if (m) return m[1];
    if (/\b(dubbel|doubles|double)\b/i.test(txt)) return 'D';
    if (/\b(single|singles|enkel)\b/i.test(txt)) return 'S';
    return null;
  }

  function getMatchTimestamp(match) {
    try {
      let raw = String((match && (match.dateTime || match.date || '')) || '').trim();
      if (!raw) return null;
      raw = raw.replace(/^\s*(ma|di|wo|do|vr|za|zo|mon|tue|wed|thu|fri|sat|sun)\b\.?\,?\s*/i, '');
      const dtMatch = raw.match(/(\d{1,2}[\.\-/]\d{1,2}[\.\-/]\d{4}(?:\s+\d{1,2}:\d{2})?)/);
      if (dtMatch) {
        const token = dtMatch[1];
        const dmy = token.match(/(\d{1,2})[\.\-/](\d{1,2})[\.\-/](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
        if (dmy) {
          const dd = parseInt(dmy[1], 10);
          const mm = parseInt(dmy[2], 10) - 1;
          const yyyy = parseInt(dmy[3], 10);
          const hh = dmy[4] ? parseInt(dmy[4], 10) : 0;
          const mi = dmy[5] ? parseInt(dmy[5], 10) : 0;
          return new Date(yyyy, mm, dd, hh, mi, 0).getTime();
        }
      }
      const iso = Date.parse(raw);
      if (!Number.isNaN(iso)) return iso;
      const ymd = raw.match(/(\d{4})[\.\-/](\d{1,2})[\.\-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{2}))?/);
      if (ymd) {
        const yyyy = parseInt(ymd[1], 10);
        const mm = parseInt(ymd[2], 10) - 1;
        const dd = parseInt(ymd[3], 10);
        const hh = ymd[4] ? parseInt(ymd[4], 10) : 0;
        const mi = ymd[5] ? parseInt(ymd[5], 10) : 0;
        return new Date(yyyy, mm, dd, hh, mi, 0).getTime();
      }
    } catch (e) {
      console.warn('[KNLTBUtils] getMatchTimestamp parse error', e, match);
    }
    return null;
  }

  function matchSignature(m) {
    try {
      const teamToArray = (team) => {
        if (Array.isArray(team)) return team;
        if (team && Array.isArray(team.players)) return team.players;
        return [];
      };
      const norm = (arr) => (arr || []).map(s => normalizeName(String(s || ''))).filter(Boolean).sort().join('|');
      const t1 = norm(teamToArray(m.team1));
      const t2 = norm(teamToArray(m.team2));
      const teamsSorted = [t1, t2].sort().join('||');
      let dateSig = '';
      const rawDate = String((m.dateTime || m.date || '') || '').trim();
      const dmatch = rawDate.match(/(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/);
      if (dmatch) {
        const dd = dmatch[1].padStart(2, '0');
        const mm = dmatch[2].padStart(2, '0');
        const yyyy = dmatch[3];
        dateSig = `${yyyy}-${mm}-${dd}`;
      } else if (rawDate) {
        dateSig = rawDate.slice(0, 32);
      }
      const score = Array.isArray(m.score) ? JSON.stringify(m.score) : '';
      return `${teamsSorted}::${dateSig}::${score}`;
    } catch (e) {
      return JSON.stringify(m);
    }
  }

  function safeText(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  window.KNLTBUtils = Object.assign(utils, {
    normalizeName,
    toAbsUrl,
    parseLocaleFloat,
    formatRating,
    categoryTokenFromText,
    getMatchTimestamp,
    matchSignature,
    safeText
  });
})();
