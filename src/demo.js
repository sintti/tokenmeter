import { round4 } from './util.js';
import { localDateKey } from './meter.js';

// In-memory fake data source so the dashboard can be previewed without a key.
// Never touches ~/.tokenmeter.
export function buildDemoStack(cfg) {
  const history = {
    version: 1,
    days: {},
    overall: { spend: 0, tokensEst: 0 },
    lastPoll: null
  };

  const now = new Date();
  let sum = 0;
  for (let i = 6; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const spend = round4(0.8 + Math.random() * 4.2);
    sum = round4(sum + spend);
    history.days[localDateKey(d)] = {
      spend,
      tokensEst: Math.round(spend * 700000)
    };
  }
  const today = { spend: round4(1.1 + Math.random() * 0.5), tokensEst: 820000 };
  history.days[localDateKey(now)] = today;
  history.overall = {
    spend: round4(sum + today.spend),
    tokensEst: Math.round((sum + today.spend) * 700000) + today.tokensEst
  };

  const total = 50;
  let usage = history.overall.spend;

  return {
    history,
    saveHistory() { /* demo only */ },
    poll: async () => {
      // climb a few cents per poll so the pie chart visibly moves
      usage = round4(usage + 0.04 + Math.random() * 0.22);
      return { usage, total, source: 'demo', label: 'DEMO KEY' };
    }
  };
}
