const BASE = 'https://openrouter.ai/api/v1';

async function get(endpoint, key) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(BASE + endpoint, {
      headers: {
        Authorization: `Bearer ${key}`,
        'X-Title': 'tokenmeter'
      },
      signal: ctrl.signal
    });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      try {
        const body = await res.json();
        err.detail = body?.error?.message;
      } catch { /* non-json body */ }
      throw err;
    }
    return (await res.json()).data;
  } finally {
    clearTimeout(timer);
  }
}

// GET /auth/key -> { label, usage, limit, limit_remaining, is_free_tier, ... }
export function fetchKeyInfo(apiKey) {
  return get('/auth/key', apiKey);
}

// GET /credits -> { total_credits, total_usage } (requires provisioning key)
export function fetchCredits(provisioningKey) {
  return get('/credits', provisioningKey);
}
