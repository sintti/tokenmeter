import { loadConfig, saveConfig, patchConfig } from './config.js';
import { loadHistory, saveHistory } from './storage.js';
import { createMeter, todayStats } from './meter.js';
import { buildPoll } from './poll.js';
import { buildDemoStack } from './demo.js';
import { startDashboard } from './ui/app.js';
import { runWizard } from './ui/wizard.js';
import { fmtMoney, fmtTokens, fmtPct } from './util.js';

const HELP = `
 tokenmeter — retro OpenRouter usage radar

 Usage:
   tokenmeter              launch the dashboard
   tokenmeter --demo       dashboard with fake data (no key needed)
   tokenmeter --once       print a one-shot summary and exit
   tokenmeter --setup      re-run the setup wizard
   tokenmeter --poll N     poll interval in seconds (default 30, min 10)
   tokenmeter --budget X   total budget in $ (used when key has no limit)
   tokenmeter --key KEY    OpenRouter API key (else $OPENROUTER_API_KEY or config)

 Config:  ~/.tokenmeter/config.json
 History: ~/.tokenmeter/history.json

 Credits remaining is always fetched live from the OpenRouter API.
 Daily/all-time stats are metered locally while tokenmeter is running.
 Token counts are estimates (config: tokensPerDollar).
`;

export function parseFlags(argv) {
  const f = { once: false, demo: false, setup: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--once') f.once = true;
    else if (a === '--demo') f.demo = true;
    else if (a === '--setup') f.setup = true;
    else if (a === '--help' || a === '-h') f.help = true;
    else if (a === '--poll') f.poll = parseInt(argv[++i], 10);
    else if (a === '--budget') f.budget = parseFloat(argv[++i]);
    else if (a === '--key') f.key = argv[++i];
  }
  return f;
}

function printSummary(cfg, r, history) {
  const t = todayStats(history);
  console.log(' tokenmeter ─────────────────────────────');
  console.log(` Today:    ${fmtMoney(t.spend)}  (≈${fmtTokens(t.tokensEst)} tokens)`);
  console.log(` All time: ${fmtMoney(history.overall.spend)}  (≈${fmtTokens(history.overall.tokensEst)} tokens)`);
  console.log(` Usage:    ${fmtMoney(r.usage)}`);
  if (typeof r.total === 'number' && r.total > 0) {
    const rem = Math.max(0, r.total - r.usage);
    console.log(` Remaining: ${fmtMoney(rem)} of ${fmtMoney(r.total)}  (${fmtPct((rem / r.total) * 100)})`);
  } else {
    console.log(' Remaining: unknown — no key limit, set a budget:  tokenmeter --budget 50');
  }
  console.log(` Source:   ${r.source || 'n/a'} · key "${r.label || ''}"`);
}

async function runSetup(cfg) {
  const answers = await runWizard(cfg);
  if (!answers) return false;
  Object.assign(cfg, answers);
  saveConfig(cfg);
  console.log('✔ saved to ~/.tokenmeter/config.json');
  return true;
}

export async function main(argv = process.argv.slice(2)) {
  const flags = parseFlags(argv);
  if (flags.help) {
    console.log(HELP);
    return;
  }

  const cfg = loadConfig();
  if (Number.isFinite(flags.poll)) cfg.pollIntervalSeconds = flags.poll;
  if (Number.isFinite(flags.budget)) cfg.budget = flags.budget;
  if (flags.key) cfg.apiKey = flags.key;

  // demo mode: fake data, in-memory history, no config touched
  if (flags.demo) {
    cfg.pollIntervalSeconds = 2;
    const demo = buildDemoStack(cfg);
    if (flags.once) {
      const r = await demo.poll();
      demo.history.lastPoll = { usage: r.usage, ts: Date.now() };
      printSummary(cfg, r, demo.history);
      return;
    }
    await startDashboard({ cfg, poll: demo.poll, history: demo.history, saveHistory: demo.saveHistory, meter: createMeter(demo.history, cfg) });
    return;
  }

  // persist explicit --budget/--poll overrides (demo never touches config)
  if (Number.isFinite(flags.poll) || Number.isFinite(flags.budget)) {
    const patch = {};
    if (Number.isFinite(flags.budget)) patch.budget = flags.budget;
    if (Number.isFinite(flags.poll)) patch.pollIntervalSeconds = flags.poll;
    patchConfig(patch);
    console.log('✔ saved to ~/.tokenmeter/config.json');
  }

  // --setup re-runs the wizard to edit key/budget/poll
  if (flags.setup && !flags.once) {
    if (!(await runSetup(cfg))) return;
  }

  // no key yet -> wizard (unless --once, which can't be interactive)
  if (!cfg.apiKey) {
    if (flags.once) {
      console.error('No API key configured. Run `tokenmeter` to launch setup, or set $OPENROUTER_API_KEY.');
      process.exitCode = 1;
      return;
    }
    if (!(await runSetup(cfg))) return;
  }

  const history = loadHistory();
  const meter = createMeter(history, cfg);
  const poll = buildPoll(cfg);

  if (flags.once) {
    const r = await poll();
    if (r.error) {
      console.error('Error: ' + r.error);
      process.exitCode = 1;
      return;
    }
    meter.tick(r.usage);
    saveHistory(history);
    printSummary(cfg, r, history);
    return;
  }

  await startDashboard({ cfg, poll, history, saveHistory, meter });
}
