import { fetchCredits, fetchKeyInfo } from './api.js';

// Returns one reading of { usage, total, source, label } or { error }.
// Resolution order:
//   1. provisioning key  -> /credits  (exact account credits)
//   2. key limit set     -> /auth/key (limit - usage)
//   3. configured budget -> /auth/key (budget - usage)
export function buildPoll(cfg) {
  return async function poll() {
    try {
      if (cfg.provisioningKey) {
        const d = await fetchCredits(cfg.provisioningKey);
        return {
          usage: d.total_usage,
          total: d.total_credits,
          source: 'credits api',
          label: 'account'
        };
      }
      const d = await fetchKeyInfo(cfg.apiKey);
      const hasLimit = typeof d.limit === 'number' && d.limit > 0;
      return {
        usage: d.usage,
        total: hasLimit ? d.limit : cfg.budget,
        source: hasLimit ? 'key limit' : cfg.budget ? 'manual budget' : null,
        label: d.label || 'api key',
        isFreeTier: !!d.is_free_tier
      };
    } catch (e) {
      let msg;
      if (e.status === 401) msg = 'invalid API key (401)';
      else if (e.status === 429) msg = 'rate limited (429)';
      else if (e.status === 402) msg = 'insufficient credits (402)';
      else if (e.name === 'AbortError') msg = 'request timeout';
      else if (e.cause?.code) msg = `network error (${e.cause.code})`;
      else msg = e.message || 'network error';
      if (e.detail) msg += ` — ${e.detail}`;
      return { error: msg };
    }
  };
}
