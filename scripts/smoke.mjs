// Headless smoke test: builds a fake TTY screen, renders the dashboard
// widgets once with demo data, and asserts nothing throws.
import { PassThrough } from 'node:stream';
import blessed from 'blessed';
import contrib from 'blessed-contrib';
import { theme, rgb } from '../src/theme.js';
import { createMeter, todayStats, last7 } from '../src/meter.js';
import { buildDemoStack } from '../src/demo.js';
import { buildPoll } from '../src/poll.js';
import { parseFlags } from '../src/index.js';
import { sparkBars } from '../src/ui/app.js';
import { fmtMoney, fmtTokens } from '../src/util.js';

const cfg = {
  apiKey: 'demo',
  budget: 50,
  pollIntervalSeconds: 30,
  tokensPerDollar: 1000000,
  lowCreditPct: 20
};

const demo = buildDemoStack(cfg);
const meter = createMeter(demo.history, cfg);

// exercise metering engine
const r1 = await demo.poll();
const d1 = meter.tick(r1.usage);
const r2 = await demo.poll();
const d2 = meter.tick(r2.usage);
if (!(d1 === 0 && d2 > 0)) throw new Error('meter deltas wrong');
console.log('meter ok: baseline delta=0, second delta=', d2);

// exercise helpers
console.log('today:', fmtMoney(todayStats(demo.history).spend), '≈', fmtTokens(todayStats(demo.history).tokensEst));
console.log('last7:', last7(demo.history).map((d) => d.label + '=' + d.spend.toFixed(2)).join(' '));
console.log('spark:', sparkBars(last7(demo.history).map((d) => d.spend)));

// exercise flags
if (parseFlags(['--demo', '--once']).once !== true) throw new Error('flags broken');
console.log('flags ok');

// build the real dashboard layout against a fake screen
const out = new PassThrough();
out.isTTY = true;
out.columns = 100;
out.rows = 30;
out.getWindowSize = () => [100, 30];
const inp = new PassThrough();
inp.isTTY = true;
inp.setRawMode = () => inp;

const screen = blessed.screen({
  input: inp,
  output: out,
  smartCSR: false,
  style: { bg: theme.bg }
});
const grid = new contrib.grid({ rows: 16, cols: 12, screen });
const donut = grid.set(1, 0, 10, 7, contrib.donut, {
  label: ' TEST ', radius: 8, arcWidth: 3,
  remainColor: rgb.spent, fill: rgb.text, spacing: 1, yPadding: 2
});
donut.setData([{ percent: 43.8, label: 'credits left $21.89', color: rgb.remaining }]);
const trend = grid.set(11, 0, 4, 12, blessed.box, { tags: true });
const days = last7(demo.history);
trend.setContent(
  `{#${theme.accent}-fg}${sparkBars(days.map((d) => d.spend))}{/}\n` +
  `{#${theme.dim}-fg}${days.map((d) => d.label.padEnd(2, ' ')).join(' ')}{/}`
);
screen.render();
screen.destroy();

// exercise the real poll builder error path (bad key -> 401 mapping)
const poll = buildPoll({ apiKey: 'sk-or-v1-invalid', budget: 50 });
const pr = await poll();
console.log('poll error path:', pr.error || 'unexpected success');

console.log('SMOKE OK');
