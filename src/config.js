import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const CONFIG_DIR = path.join(os.homedir(), '.tokenmeter');
export const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
export const HISTORY_PATH = path.join(CONFIG_DIR, 'history.json');

export function defaultConfig() {
  return {
    apiKey: '',
    provisioningKey: '',
    budget: null,
    pollIntervalSeconds: 30,
    tokensPerDollar: 1000000,
    lowCreditPct: 20
  };
}

export function loadConfig() {
  let cfg = defaultConfig();
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    cfg = { ...cfg, ...raw };
  } catch {
    // no config yet, use defaults
  }
  if (process.env.OPENROUTER_API_KEY) cfg.apiKey = process.env.OPENROUTER_API_KEY;
  if (process.env.OPENROUTER_PROVISIONING_KEY) {
    cfg.provisioningKey = process.env.OPENROUTER_PROVISIONING_KEY;
  }
  return cfg;
}

export function saveConfig(cfg) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  try { fs.chmodSync(CONFIG_DIR, 0o700); } catch { /* not fatal on Windows */ }
  const tmp = CONFIG_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n');
  fs.renameSync(tmp, CONFIG_PATH);
  try { fs.chmodSync(CONFIG_PATH, 0o600); } catch { /* not fatal on Windows */ }
}

// Merge a partial update into the config file on disk, without pulling
// env-var-provided values (e.g. $OPENROUTER_API_KEY) into the file.
export function patchConfig(patch) {
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    cfg = defaultConfig();
  }
  Object.assign(cfg, patch);
  saveConfig(cfg);
  return cfg;
}
