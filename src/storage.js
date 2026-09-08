import fs from 'node:fs';
import { CONFIG_DIR, HISTORY_PATH } from './config.js';

export function freshHistory() {
  return {
    version: 1,
    days: {},
    overall: { spend: 0, tokensEst: 0 },
    lastPoll: null
  };
}

export function loadHistory() {
  try {
    const h = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
    if (h && h.version === 1 && typeof h.overall?.spend === 'number') {
      h.days = h.days || {};
      h.lastPoll = h.lastPoll || null;
      return h;
    }
  } catch {
    // missing or corrupt -> start fresh
  }
  return freshHistory();
}

export function saveHistory(h) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const tmp = HISTORY_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(h, null, 2) + '\n');
  fs.renameSync(tmp, HISTORY_PATH);
}
