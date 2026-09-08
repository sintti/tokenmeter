import { round4 } from './util.js';

export function localDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Consumes a fresh usage reading, attributes the delta since the previous
// poll to today's bucket, and updates lifetime totals. The very first
// reading only establishes a baseline (no fake delta).
export function createMeter(history, cfg) {
  return {
    tick(usage, now = new Date()) {
      if (!Number.isFinite(usage)) return 0;
      let delta = 0;
      if (history.lastPoll && usage >= history.lastPoll.usage) {
        delta = round4(usage - history.lastPoll.usage);
      }
      if (delta > 0) {
        const dayKey = localDateKey(now);
        const bucket = history.days[dayKey] || (history.days[dayKey] = { spend: 0, tokensEst: 0 });
        bucket.spend = round4(bucket.spend + delta);
        bucket.tokensEst = Math.round(bucket.tokensEst + delta * cfg.tokensPerDollar);
        history.overall.spend = round4(history.overall.spend + delta);
        history.overall.tokensEst = Math.round(history.overall.tokensEst + delta * cfg.tokensPerDollar);
      }
      history.lastPoll = { usage, ts: now.getTime() };
      return delta;
    }
  };
}

export function todayStats(history, now = new Date()) {
  return history.days[localDateKey(now)] || { spend: 0, tokensEst: 0 };
}

const WD = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function last7(history, now = new Date()) {
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const rec = history.days[localDateKey(d)] || { spend: 0 };
    out.push({ label: WD[d.getDay()], spend: rec.spend });
  }
  return out;
}
