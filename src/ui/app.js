import blessed from 'blessed';
import contrib from 'blessed-contrib';
import { theme, boxStyle, rgb } from '../theme.js';
import { todayStats, last7 } from '../meter.js';
import { fmtMoney, fmtTokens, fmtPct, clamp } from '../util.js';

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
    const headerRight = blessed.box({
      parent: header,
      right: 0,
      top: 0,
      shrink: true,
      tags: true,
      style: { bg: theme.bg }
    });

    // ── pie chart: single ring, spent = magenta ring, remaining = mint arc ──
    const donut = grid.set(1, 0, 23, 7, contrib.donut, {
      label: ' ⚡ CREDITS LEFT ',
      radius: 36,
      arcWidth: 30,
      remainColor: rgb.spent,
      fill: rgb.text,
      spacing: 1,
      yPadding: 2,
      style: { bg: theme.panel },
      border: { type: 'line', fg: theme.border }
    });

    // ── big remaining number ───────────────────────────────────────────────
    const credits = grid.set(1, 7, 11, 5, blessed.box, {
      ...boxStyle(),
      label: ' BALANCE ',
      valign: 'center',
      padding: { top: 1, left: 1 }
    });

    // ── today / all-time stats ─────────────────────────────────────────────
    const stats = grid.set(12, 7, 12, 5, blessed.box, {
      ...boxStyle(),
      label: ' USAGE ',
      valign: 'center',
      padding: { top: 1, left: 1 }
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

    function renderHeader() {
      header.setContent(
        ` {bold}{${theme.text}-fg}⚡ TOKENMETER{/} ` +
        `{${theme.spent}-fg}▞▞▞{/}{${theme.accent}-fg}▞▞▞{/} ` +
        `{${theme.dim}-fg}OPENROUTER RADAR{/}`
      );
      headerRight.setContent(`{${theme.dim}-fg}[r] refresh  [q] quit {/}`);
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
      if (typeof r.total !== 'number' || r.total <= 0) {
        credits.setContent(
          `\n{center}{${theme.warn}-fg}set a budget!{/}\n\n` +
          `{center}usage so far {bold}${fmtMoney(r.usage)}{/}\n` +
          `{center}{${theme.dim}-fg}edit ~/.tokenmeter/config.json{/}`
        );
        return;
      }
      const rem = Math.max(0, r.total - r.usage);
      const pctRem = (rem / r.total) * 100;
      const low = pctRem < cfg.lowCreditPct;
      const remColor = low ? theme.alert : theme.remaining;
      const spentPct = ((r.usage / r.total) * 100).toFixed(1);
      credits.setContent(
        `\n` +
        `{center}{bold}{${remColor}-fg}${fmtMoney(rem)}{/}  {${theme.dim}-fg}REMAINING{/}\n\n` +
        ` {${theme.spent}-fg}spent ${fmtMoney(r.usage)}{/} {${theme.dim}-fg}(${spentPct}%){/}\n` +
        ` {${theme.accent}-fg}total ${fmtMoney(r.total)}{/} {${theme.dim}-fg}(${r.source}){/}\n` +
        (low ? ` {bold}{${theme.alert}-fg}⚠ low credits!{/}\n` : '')
      );
    }

    function renderStats() {
      const t = todayStats(history);
      const o = history.overall;
      stats.setContent(
        `{${theme.accent}-fg}TODAY{/}       {${theme.dim}-fg}│{/}  {${theme.border}-fg}ALL TIME{/}\n` +
        `${fmtMoney(t.spend).padEnd(14)}{${theme.dim}-fg}│{/}  ${fmtMoney(o.spend)}\n` +
        `{${theme.dim}-fg}≈{/}${fmtTokens(t.tokensEst).padEnd(13)}{${theme.dim}-fg}│{/}  {${theme.dim}-fg}≈{/}${fmtTokens(o.tokensEst)} tokens\n`
      );
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
      let left;
      if (offline) {
        left = `{${theme.alert}-fg}✗ OFFLINE: ${errMsg}{/} {${theme.dim}-fg}· retry in ${nextIn}s{/}`;
      } else if (lastSync) {
        left = `{${theme.remaining}-fg}● SYNCED{/} {${theme.dim}-fg}${lastSync.toTimeString().slice(0, 8)}{/} ` +
          `{${theme.dim}-fg}· next poll in ${nextIn}s{/}`;
      } else {
        left = `{${theme.warn}-fg}◌ connecting...{/}`;
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
        timer = setTimeout(tick, delay);
      }
    }

    // 1s ticker for the countdown in the status bar
    const ticker = setInterval(() => {
      if (nextIn > 0) nextIn -= 1;
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

    screen.on('resize', renderAll);
    renderAll();
    tick();
  });
}
