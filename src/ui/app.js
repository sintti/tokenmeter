import blessed from 'blessed';
import contrib from 'blessed-contrib';
import { theme, boxStyle, rgb } from '../theme.js';
import { todayStats, last7 } from '../meter.js';
import { fmtMoney, fmtTokens, fmtPct, clamp } from '../util.js';
import { bigLines, FONT } from './bigfont.js';

const BLOCKS = '▁▂▃▄▅▆▇█';

// Column width when `count` bars (separated by single spaces) stretch to
// fill `innerWidth`.
function barColWidth(innerWidth, count) {
  return Math.max(2, Math.floor((innerWidth - (count - 1)) / count));
}

function padCenter(s, w) {
  const left = Math.max(0, Math.floor((w - s.length) / 2));
  const right = Math.max(0, w - s.length - left);
  return ' '.repeat(left) + s + ' '.repeat(right);
}

// One horizontally centred, colour-tagged line.
function line(s, w, tag = '') {
  return tag ? `${tag}${padCenter(s, w)}{/}` : padCenter(s, w);
}

// Pads `lines` with blank rows so the block sits in the middle of a box
// `h` rows tall (blessed's own valign does not apply to tagged content).
function vCenter(lines, h) {
  const top = Math.max(0, Math.floor((h - lines.length) / 2));
  return new Array(top).fill('').concat(lines);
}

// Block-glyph rows for `text`, or null when they would not fit `w`. One
// column is left free: blessed wraps a line whose visible width exactly
// equals the box width (its wrap loop then backs up to the previous
// space), which would drop the last glyph onto its own row.
function bigMoney(text, w) {
  const rows = bigLines(text);
  return rows && rows[0].length <= w - 1 ? rows : null;
}

// Bars stretch to fill `innerWidth` (default keeps the compact 2-char look).
export function sparkBars(values, innerWidth = 21) {
  const barW = barColWidth(innerWidth, values.length);
  const max = Math.max(...values, 0.01);
  return values
    .map((v) => BLOCKS[clamp(Math.round((v / max) * (BLOCKS.length - 1)), 0, BLOCKS.length - 1)])
    .map((c) => c.repeat(barW))
    .join(' ');
}

// Full-screen dashboard. Owns the poll loop (with exponential backoff),
// rendering and key bindings. Resolves when the user quits.
// `input`/`output` streams are optional (defaults to stdin/stdout).
export function startDashboard({ cfg, poll, history, saveHistory, meter, input, output }) {
  return new Promise((resolve) => {
    const screen = blessed.screen({
      smartCSR: true,
      title: 'tokenmeter',
      dockBorders: true,
      input,
      output,
      style: { bg: theme.bg }
    });

    const grid = new contrib.grid({ rows: 30, cols: 12, screen, hideBorder: true });

    // ── header ──────────────────────────────────────────────────────────────
    const header = grid.set(0, 0, 1, 12, blessed.box, {
      tags: true,
      style: { bg: theme.bg }
    });
    // Hotkey row. Both the box and the pause label are sized to the longer
    // of the two pause states: a shrink-to-fit box anchored right resizes and
    // shifts when '[p] pause' becomes '[p] resume', and blessed leaves stale
    // glyphs behind when it does.
    const PAUSE_LABELS = { running: '[p] pause', paused: '[p] resume' };
    const PAUSE_W = Math.max(...Object.values(PAUSE_LABELS).map((k) => k.length));
    const headerRight = blessed.box({
      parent: header,
      right: 0,
      top: 0,
      width: `[r] refresh  ${' '.repeat(PAUSE_W)}  [q] quit `.length,
      tags: true,
      style: { bg: theme.bg }
    });

    // ── pie chart: single ring, spent = magenta ring, remaining = mint arc ──
    // No '⚡' in the label: terminals with emoji presentation render it two
    // columns wide while blessed counts one, shifting the border right until
    // it overwrites this panel's corner and the neighbour's.
    const donut = grid.set(1, 0, 23, 7, contrib.donut, {
      label: ' CREDITS LEFT ',
      radius: 36,
      arcWidth: 30,
      remainColor: rgb.spent,
      fill: rgb.text,
      spacing: 1,
      yPadding: 2,
      style: { bg: theme.panel, label: { fg: theme.text, bg: theme.panel } },
      border: { type: 'line', fg: theme.border }
    });

    // ── big remaining number ───────────────────────────────────────────────
    const credits = grid.set(1, 7, 11, 5, blessed.box, {
      ...boxStyle(),
      label: ' BALANCE ',
      valign: 'center'
    });

    // ── today / all-time stats ─────────────────────────────────────────────
    const stats = grid.set(12, 7, 12, 5, blessed.box, {
      ...boxStyle(),
      label: ' USAGE ',
      valign: 'center'
    });

    // ── 7-day trend ────────────────────────────────────────────────────────
    const trend = grid.set(24, 0, 5, 12, blessed.box, {
      ...boxStyle(),
      label: ' 7-DAY SPEND $ ',
      padding: { left: 1 },
      valign: 'bottom'
    });

    // ── status bar ─────────────────────────────────────────────────────────
    const status = grid.set(29, 0, 1, 12, blessed.box, {
      tags: true,
      style: { bg: theme.bg }
    });

    // Drop the three upper panels one row below the header. The gap row is
    // left uncovered, so it keeps the terminal's own background instead of
    // extending the header bar. Donut and USAGE give up one row of height
    // (BALANCE keeps its full height) so the bottom sections stay anchored.
    // The grid resolves percentage positions into row/column numbers, so a
    // plain +1 shifts exactly one row.
    for (const [el, shrink] of [[donut, true], [credits, false], [stats, true]]) {
      el.top += 1;
      if (shrink) el.height -= 1;
    }

    // ── state ──────────────────────────────────────────────────────────────
    const baseDelay = Math.max(10, cfg.pollIntervalSeconds) * 1000;
    let delay = baseDelay;
    let nextIn = Math.round(baseDelay / 1000);
    let timer = null;
    let offline = false;
    let errMsg = '';
    let lastSync = null;
    let lastState = null;
    let busy = false;
    let paused = false;

    function renderHeader() {
      header.setContent(
        ` {bold}{${theme.text}-fg}⚡ TOKENMETER{/} ` +
        `{${theme.spent}-fg}▞▞▞{/}{${theme.accent}-fg}▞▞▞{/} ` +
        `{${theme.dim}-fg}OPENROUTER RADAR{/}`
      );
      const label = (paused ? PAUSE_LABELS.paused : PAUSE_LABELS.running).padEnd(PAUSE_W);
      const pause = paused
        ? `{bold}{${theme.warn}-fg}${label}{/}`
        : `{${theme.dim}-fg}${label}{/}`;
      headerRight.setContent(
        `{${theme.dim}-fg}[r] refresh{/}  ${pause}  {${theme.dim}-fg}[q] quit {/}`
      );
    }

    // ring size that fits the actual canvas (canvas: w*2-5, h*4-12 px).
    // Vertical slack (-4) keeps the in-chart label visible under the ring.
    // The arc reaches in until only a small dark hole (r=6) is left around
    // the centered percentage.
    function fitDonut() {
      if (!donut.canvasSize) return;
      const r = Math.max(
        4,
        Math.min(
          Math.floor(donut.canvasSize.height / 2 - 4),
          Math.floor(donut.canvasSize.width / 2 - 2),
          39
        )
      );
      donut.options.radius = r;
      donut.options.arcWidth = Math.max(2, r - 6);
    }

    function renderDonut(r) {
      fitDonut();
      if (typeof r.total !== 'number' || r.total <= 0) {
        donut.setData([{ percent: 0, label: 'set a budget!', color: rgb.dim }]);
        return;
      }
      const rem = Math.max(0, r.total - r.usage);
      const pctRem = clamp((rem / r.total) * 100, 0, 100);
      const low = pctRem < cfg.lowCreditPct;
      donut.setData([
        {
          percent: pctRem,
          label: `credits left ${fmtMoney(rem)}`,
          color: low ? rgb.alert : rgb.remaining
        }
      ]);
    }

    function renderCredits(r) {
      const w = Math.max(12, credits.width - 2);
      const h = Math.max(1, credits.height - 2);
      if (typeof r.total !== 'number' || r.total <= 0) {
        credits.setContent(vCenter([
          line('set a budget!', w, `{bold}{${theme.warn}-fg}`),
          '',
          line(`usage so far ${fmtMoney(r.usage)}`, w, '{bold}'),
          line('edit ~/.tokenmeter/config.json', w, `{${theme.dim}-fg}`)
        ], h).join('\n'));
        return;
      }
      const rem = Math.max(0, r.total - r.usage);
      const pctRem = (rem / r.total) * 100;
      const low = pctRem < cfg.lowCreditPct;
      const remColor = low ? theme.alert : theme.remaining;
      const remText = fmtMoney(rem);
      const spentPct = ((r.usage / r.total) * 100).toFixed(1);
      // REMAINING, spent, total and (when low) the warning sit under the
      // figure. In a short panel the spacer above them goes first, so the
      // figure keeps its block glyphs for as long as possible.
      const tail = low ? 4 : 3;
      const head = (FONT.rows + tail <= h && bigMoney(remText, w)) || [remText];
      const spacer = head.length + tail + 1 <= h ? [''] : [];
      const out = [
        ...head.map((s) => line(s, w, `{bold}{${remColor}-fg}`)),
        line('REMAINING', w, `{${theme.dim}-fg}`),
        ...spacer,
        line(`spent ${fmtMoney(r.usage)} (${spentPct}%)`, w, `{${theme.spent}-fg}`),
        line(`total ${fmtMoney(r.total)} (${r.source})`, w, `{${theme.accent}-fg}`)
      ];
      if (low) out.push(line('⚠ low credits!', w, `{bold}{${theme.alert}-fg}`));
      credits.setContent(vCenter(out, h).join('\n'));
    }

    // Two centred columns (today | all time) split by a 1-char divider. Both
    // sides pick the same glyph size, so one wide figure drops both to plain
    // text rather than leaving the panel half-drawn.
    function renderStats() {
      const t = todayStats(history);
      const o = history.overall;
      const w = Math.max(20, stats.width - 2);
      const h = Math.max(1, stats.height - 2);
      const colW = Math.floor((w - 1) / 2);
      const sep = `{${theme.dim}-fg}│{/}`;
      const row = (l, r) => l + sep + r;

      const todayText = fmtMoney(t.spend);
      const allText = fmtMoney(o.spend);
      // the header, the spacer and the token counts take 3 rows of their own
      const big =
        FONT.rows + 3 <= h && bigMoney(todayText, colW) && bigMoney(allText, colW);
      const todayRows = big ? bigMoney(todayText, colW) : [todayText];
      const allRows = big ? bigMoney(allText, colW) : [allText];

      const out = [
        row(
          line('TODAY', colW, `{${theme.accent}-fg}`),
          line('ALL TIME', colW, `{${theme.border}-fg}`)
        ),
        ''
      ];
      for (let i = 0; i < todayRows.length; i++) {
        out.push(
          row(
            line(todayRows[i], colW, `{bold}{${theme.accent}-fg}`),
            line(allRows[i], colW, `{bold}{${theme.border}-fg}`)
          )
        );
      }
      out.push(
        row(
          line(`≈${fmtTokens(t.tokensEst)} tokens`, colW, `{${theme.dim}-fg}`),
          line(`≈${fmtTokens(o.tokensEst)} tokens`, colW, `{${theme.dim}-fg}`)
        )
      );
      stats.setContent(vCenter(out, h).join('\n'));
    }

    function renderTrend() {
      const days = last7(history);
      // usable content width: outer box minus line borders (2) minus left padding (1)
      const inner = Math.max(21, trend.width - 3);
      const barW = barColWidth(inner, days.length);
      const used = days.length * barW + (days.length - 1);
      const pad = ' '.repeat(Math.max(0, Math.floor((inner - used) / 2)));
      // per-day spend above each bar; days without spend stay blank
      const amounts = days
        .map((d) => (d.spend > 0 ? fmtMoney(d.spend) : ''))
        .map((s) => padCenter(s === '$0.00' ? '' : s, barW))
        .join(' ');
      const bars = pad + sparkBars(days.map((d) => d.spend), inner);
      const labels = pad + days.map((d) => padCenter(d.label, barW)).join(' ');
      trend.setContent(
        `{${theme.text}-fg}${pad}${amounts}{/}\n` +
        `{${theme.accent}-fg}${bars}{/}\n` +
        `{${theme.dim}-fg}${labels}{/}`
      );
    }

    function renderStatus() {
      // while paused the countdown is replaced by the pause marker
      // Plain, unbolded ASCII: blessed's cell buffer is right either way, but
      // a bold or non-ASCII run here renders a column wider than blessed
      // counts in some terminals, and its next absolutely-positioned run then
      // lands on top of the last letter.
      const cadence = paused ? `{${theme.warn}-fg}|| PAUSED{/}` : null;
      let left;
      if (offline) {
        left = `{${theme.alert}-fg}✗ OFFLINE: ${errMsg}{/} ` +
          (cadence || `{${theme.dim}-fg}· retry in ${nextIn}s{/}`);
      } else if (lastSync) {
        left = `{${theme.remaining}-fg}● SYNCED{/} {${theme.dim}-fg}${lastSync.toTimeString().slice(0, 8)}{/} ` +
          (cadence || `{${theme.dim}-fg}· next poll in ${nextIn}s{/}`);
      } else {
        left = cadence || `{${theme.warn}-fg}◌ connecting...{/}`;
      }
      let low = '';
      if (lastState && typeof lastState.total === 'number' && lastState.total > 0) {
        const pctRem = ((lastState.total - lastState.usage) / lastState.total) * 100;
        if (pctRem < cfg.lowCreditPct) {
          low = ` {bold}{${theme.alert}-fg}⚠ LOW CREDITS ${fmtPct(pctRem)}{/}`;
        }
      }
      const noBudget =
        lastState && !lastState.total ? ` {${theme.warn}-fg}⚠ no budget configured{/}` : '';
      const keyTag = lastState?.label
        ? `{${theme.dim}-fg}· "${lastState.label}" ${lastState.source || ''}{/}`
        : '';
      status.setContent(` ${left} ${keyTag}${low}${noBudget}`);
    }

    function renderAll() {
      renderHeader();
      if (lastState) {
        renderDonut(lastState);
        renderCredits(lastState);
      }
      renderStats();
      renderTrend();
      renderStatus();
      screen.render();
    }

    // ── polling with exponential backoff ───────────────────────────────────
    async function tick() {
      clearTimeout(timer);
      if (busy) return;
      busy = true;
      try {
        const r = await poll();
        if (r.error) {
          offline = true;
          errMsg = r.error;
          delay = Math.min(Math.round(delay * 1.5), 300000);
        } else {
          offline = false;
          lastSync = new Date();
          lastState = r;
          delay = baseDelay;
          if (Number.isFinite(r.usage)) {
            meter.tick(r.usage);
            saveHistory(history);
          }
        }
      } finally {
        busy = false;
        nextIn = Math.round(delay / 1000);
        renderAll();
        // a manual [r] refresh while paused polls once and stays paused
        if (!paused) timer = setTimeout(tick, delay);
      }
    }

    // 1s ticker for the countdown in the status bar
    const ticker = setInterval(() => {
      if (!paused && nextIn > 0) nextIn -= 1;
      renderStatus();
      screen.render();
    }, 1000);

    // ── keys ───────────────────────────────────────────────────────────────
    function quit() {
      clearTimeout(timer);
      clearInterval(ticker);
      screen.destroy();
      resolve();
    }
    screen.key(['q', 'Q', 'escape', 'C-c'], quit);
    screen.key(['r', 'R'], () => {
      delay = baseDelay;
      nextIn = 0;
      tick();
    });
    // [p] suspends the poll loop; resuming polls straight away rather than
    // waiting out an interval on stale data
    screen.key(['p', 'P'], () => {
      paused = !paused;
      if (paused) {
        clearTimeout(timer);
        renderAll();
      } else {
        delay = baseDelay;
        nextIn = 0;
        tick();
      }
    });

    screen.on('resize', renderAll);
    renderAll();
    tick();
  });
}
