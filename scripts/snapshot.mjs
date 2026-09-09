// Captures a clean snapshot of the demo dashboard (no escapes) for docs.
import { PassThrough } from 'node:stream';
import { startDashboard } from '../src/ui/app.js';
import { createMeter } from '../src/meter.js';
import { buildDemoStack } from '../src/demo.js';

const COLS = Number(process.argv[2]) || 110;
const ROWS = Number(process.argv[3]) || 30;
const chunks = [];
const onData = (c) => chunks.push(c);
const out = new PassThrough();
out.isTTY = true;
out.columns = COLS;
out.rows = ROWS;
out.getWindowSize = () => [COLS, ROWS];
out.on('data', onData);
const inp = new PassThrough();
inp.isTTY = true;
inp.setRawMode = () => inp;

const cfg = { apiKey: 'demo', budget: 50, pollIntervalSeconds: 30, tokensPerDollar: 1e6, lowCreditPct: 20 };
const demo = buildDemoStack(cfg);
const p = startDashboard({
  cfg,
  poll: demo.poll,
  history: demo.history,
  saveHistory: demo.saveHistory,
  meter: createMeter(demo.history, cfg),
  input: inp,
  output: out
});
// stop capturing before quit so the teardown clear doesn't wipe the snapshot
setTimeout(() => {
  out.removeListener('data', onData);
  inp.write('q');
}, 4500);
await p;

const f = Buffer.concat(chunks).toString('utf8');
const rows = [];
for (const m of f.matchAll(/\x1b\[(\d+);(\d+)H/g)) {
  const row = parseInt(m[1], 10) - 1;
  rows[row] = rows[row] || [];
}
// crude reconstruct: walk the stream simulating cursor position
let r = 0, c = 0;
const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(' '));
// DEC special-graphics set: blessed draws borders with ESC(0 ... ESC(B
const DEC = {
  q: '─', x: '│', l: '┌', k: '┐', m: '└', j: '┘',
  t: '├', u: '┤', w: '┬', v: '┴', n: '┼', '`': '◆',
  a: '▒', f: '°', g: '±', '~': '·', o: '⎺', s: '⎽'
};
let g0 = 'B';
const re = /\x1b\[([0-9;?]*)([a-zA-Z])|\x1b\][^\x07]*\x07|\x1b\(([0-9A-Za-z])|(\r|\n)|([^\x1b\r\n]+)/g;
let m;
while ((m = re.exec(f))) {
  if (m[1] !== undefined) {
    const params = m[1].split(';').map((x) => parseInt(x, 10) || 0);
    switch (m[2]) {
      case 'H': r = (params[0] || 1) - 1; c = (params[1] || 1) - 1; break;
      case 'C': c += params[0] || 1; break;
      case 'G': c = (params[0] || 1) - 1; break;
      case 'J': if (params[0] === 2) grid.forEach((row) => row.fill(' ')); break;
      case 'K': for (let i = c; i < COLS; i++) grid[r][i] = ' '; break;
      case 'A': r -= params[0] || 1; break;
      case 'B': r += params[0] || 1; break;
      case 'D': c -= params[0] || 1; break;
    }
  } else if (m[3]) {
    g0 = m[3];
  } else if (m[4]) {
    if (m[4] === '\n') { r++; c = 0; } else { r = 0; c = 0; }
  } else if (m[5]) {
    for (const ch of m[5]) {
      const g = g0 === '0' ? (DEC[ch] || ch) : ch;
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) grid[r][c] = g;
      c++;
    }
  }
}

console.log(grid.map((row) => row.join('')).join('\n'));
