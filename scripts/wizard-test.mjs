// Regression test for the setup wizard: tab must move between fields,
// tab chars must never leak into field values, blank key keeps current
// key on --setup re-runs, esc cancels from inside a field.
import { PassThrough } from 'node:stream';
import { runWizard } from '../src/ui/wizard.js';

const COLS = 90;
const ROWS = 24;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fakeTty() {
  const out = new PassThrough();
  out.isTTY = true;
  out.columns = COLS;
  out.rows = ROWS;
  out.getWindowSize = () => [COLS, ROWS];
  out.on('data', () => {});
  const inp = new PassThrough();
  inp.isTTY = true;
  inp.setRawMode = () => inp;
  return { inp, out };
}

let failures = 0;
function check(name, cond) {
  if (cond) console.log('ok:', name);
  else {
    console.error('FAIL:', name);
    failures++;
  }
}

// 1) tab navigates key -> budget -> poll; values land in the right fields
{
  const { inp, out } = fakeTty();
  const done = runWizard({}, { input: inp, output: out });
  await sleep(250);
  inp.write('sk-or-v1-test123');
  await sleep(80);
  inp.write('\t');
  await sleep(80);
  inp.write('\x7f\x7f75');
  await sleep(80);
  inp.write('\t');
  await sleep(80);
  inp.write('\x7f\x7f15');
  await sleep(80);
  inp.write('\r');
  const a = await done;
  check('tab moved to budget field (budget=75)', a && a.budget === 75);
  check('tab moved to poll field (poll=15)', a && a.pollIntervalSeconds === 15);
  check('api key intact, no tab pollution', a && a.apiKey === 'sk-or-v1-test123');
}

// 2) --setup re-run: blank key keeps current key, prefills pass through
{
  const { inp, out } = fakeTty();
  const done = runWizard(
    { apiKey: 'old-key', budget: 40, pollIntervalSeconds: 20, provisioningKey: 'mg-old' },
    { input: inp, output: out }
  );
  await sleep(250);
  inp.write('\t');
  await sleep(80);
  inp.write('\t');
  await sleep(80);
  inp.write('\r');
  const a = await done;
  check('blank key keeps current key', a && a.apiKey === 'old-key');
  check('prefilled budget kept (40)', a && a.budget === 40);
  check('prefilled poll kept (20)', a && a.pollIntervalSeconds === 20);
  check('blank mgmt key keeps current (mg-old)', a && a.provisioningKey === 'mg-old');
}

// 3) empty key submit shows error, then saving works after typing one
{
  const { inp, out } = fakeTty();
  const done = runWizard({}, { input: inp, output: out });
  await sleep(250);
  inp.write('\r');
  await sleep(150);
  inp.write('sk-or-v1-x');
  await sleep(80);
  inp.write('\r');
  const a = await done;
  check('validation error path then save works', a && a.apiKey === 'sk-or-v1-x');
}

// 4) esc cancels from inside a field
{
  const { inp, out } = fakeTty();
  const done = runWizard({}, { input: inp, output: out });
  await sleep(250);
  inp.write('abc');
  await sleep(80);
  inp.write('\x1b');
  const a = await done;
  check('esc cancels from inside a field', a === null);
}

// 5) management key field: tab through optional fields and set it
{
  const { inp, out } = fakeTty();
  const done = runWizard({}, { input: inp, output: out });
  await sleep(250);
  inp.write('sk-or-v1-k');
  await sleep(80);
  inp.write('\t');
  await sleep(80);
  inp.write('\t');
  await sleep(80);
  inp.write('\t');
  await sleep(80);
  inp.write('sk-or-mgmt-xyz');
  await sleep(80);
  inp.write('\r');
  const a = await done;
  check('mgmt key saved (tab reached 4th field)', a && a.provisioningKey === 'sk-or-mgmt-xyz');
  check('defaults kept when skipped (budget 50)', a && a.budget === 50);
  check('defaults kept when skipped (poll 30)', a && a.pollIntervalSeconds === 30);
}

// 6) bracketed paste lands intact (no wrapper garbage, no spurious esc)
{
  const { inp, out } = fakeTty();
  const done = runWizard({}, { input: inp, output: out });
  await sleep(250);
  inp.write('\x1b[200~sk-or-v1-pasted\x1b[201~');
  await sleep(150);
  inp.write('\r');
  const a = await done;
  check('bracketed paste captured cleanly', a && a.apiKey === 'sk-or-v1-pasted');
}

// 7) paste wrapper split across chunks still stripped
{
  const { inp, out } = fakeTty();
  const done = runWizard({}, { input: inp, output: out });
  await sleep(250);
  inp.write('\x1b[2');
  await sleep(5);
  inp.write('00~sk-or-v1-spl\x1b[201~');
  await sleep(150);
  inp.write('\r');
  const a = await done;
  check('split paste wrapper stripped', a && a.apiKey === 'sk-or-v1-spl');
}

if (failures) {
  console.error(failures + ' wizard check(s) failed');
  process.exit(1);
}
console.log('WIZARD OK');
