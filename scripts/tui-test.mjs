// Integration test: runs the real dashboard with a fake TTY sized like a
// real terminal, lets the poll loop tick with demo data, toggles the pause
// hotkey, presses 'q', and asserts the rendered frames contain the expected
// panels and hotkey states.
import { PassThrough } from 'node:stream';
import { startDashboard, sparkBars } from '../src/ui/app.js';
import { createMeter } from '../src/meter.js';
import { buildDemoStack } from '../src/demo.js';
import { theme } from '../src/theme.js';

const COLS = 120;
const ROWS = 30;

const chunks = [];
const out = new PassThrough();
out.isTTY = true;
out.columns = COLS;
out.rows = ROWS;
out.getWindowSize = () => [COLS, ROWS];
out.on('data', (c) => chunks.push(c));

const inp = new PassThrough();
inp.isTTY = true;
inp.setRawMode = () => inp;

const cfg = {
  apiKey: 'demo',
  budget: 50,
  pollIntervalSeconds: 30,
  tokensPerDollar: 1000000,
  lowCreditPct: 20
};

const demo = buildDemoStack(cfg);
const meter = createMeter(demo.history, cfg);

const done = startDashboard({
  cfg,
  poll: demo.poll,
  history: demo.history,
  saveHistory: demo.saveHistory,
  meter,
  input: inp,
  output: out
});

// let a poll cycle run, pause, resume, then quit
setTimeout(() => inp.write('p'), 2000);
setTimeout(() => inp.write('p'), 3000);
setTimeout(() => inp.write('q'), 4500);
await done;

const frame = Buffer.concat(chunks).toString('utf8');
// blessed diff-renders with cursor-move escapes between words, so compare
// on letters/digits only
const norm = frame.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const checks = [
  'TOKENMETER', 'CREDITSLEFT', 'BALANCE', 'USAGE', 'SPEND', 'SYNCED', 'DEMOKEY',
  'RREFRESH', 'PPAUSE', 'QQUIT',  // hotkey row, in order
  'PAUSED', 'PRESUME'             // shown while the poll loop is suspended
];
const missing = checks.filter((c) => !norm.includes(c));
if (missing.length) {
  console.error('MISSING IN RENDER:', missing.join(', '));
  process.exit(1);
}
// the hotkeys must read left to right as refresh, pause, quit
const order = ['RREFRESH', 'PPAUSE', 'QQUIT'].map((k) => norm.indexOf(k));
if (order.some((i, n) => n > 0 && i < order[n - 1])) {
  console.error('HOTKEYS OUT OF ORDER:', order.join(' '));
  process.exit(1);
}
console.log('rendered panels:', checks.join(', '));
console.log('spark sample (120-col terminal):', sparkBars([1.2, 3.4, 0.5, 2.2, 4.9, 0.1, 2.0], 114));
console.log('TUI OK (rendered + quit path works)');
