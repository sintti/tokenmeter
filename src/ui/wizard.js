import blessed from 'blessed';
import { theme } from '../theme.js';
import { unwrapPaste } from '../util.js';

// Setup wizard. Pass `current` to pre-fill existing values (--setup).
// Returns { apiKey, budget, pollIntervalSeconds } or null if cancelled.
export function runWizard(current = {}, io = {}) {
  return new Promise((resolve) => {
    let done = false;
    const screen = blessed.screen({
      smartCSR: true,
      title: 'tokenmeter setup',
      input: unwrapPaste(io.input || process.stdin),
      output: io.output,
      style: { bg: theme.bg }
    });
    screen.program.write('\x1b[?2004h'); // bracketed paste on

    const finish = (val) => {
      if (done) return;
      done = true;
      screen.program.write('\x1b[?2004l'); // bracketed paste off
      screen.destroy();
      resolve(val);
    };

    const frame = blessed.box({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 66,
      height: 19,
      tags: true,
      border: { type: 'line', fg: theme.border },
      style: { bg: theme.panel, border: { fg: theme.border } },
      label: ' ⚡ TOKENMETER SETUP '
    });

    blessed.text({
      parent: frame,
      top: 1,
      left: 2,
      tags: true,
      style: { bg: theme.panel },
      content:
        `{${theme.spent}-fg}◆{/} create a key at {${theme.accent}-fg}https://openrouter.ai/keys{/}\n` +
        `{${theme.dim}-fg}  budget = the total $ you want this dashboard to track{/}`
    });

    blessed.text({
      parent: frame,
      top: 4,
      left: 2,
      style: { bg: theme.panel, fg: theme.text },
      content: 'OpenRouter API key' + (current.apiKey ? ' (blank = keep current):' : ':')
    });
    const keyInput = blessed.textbox({
      parent: frame,
      top: 5,
      left: 2,
      width: 60,
      height: 1,
      censor: true,
      style: { bg: theme.panel, fg: theme.remaining, focus: { bg: '#2a1a55' } }
    });

    blessed.text({ parent: frame, top: 7, left: 2, style: { bg: theme.panel, fg: theme.text }, content: 'Total budget in $:' });
    const budgetInput = blessed.textbox({
      parent: frame,
      top: 8,
      left: 2,
      width: 12,
      height: 1,
      value: String(Number.isFinite(current.budget) ? current.budget : 50),
      style: { bg: theme.panel, fg: theme.accent, focus: { bg: '#2a1a55' } }
    });

    blessed.text({ parent: frame, top: 10, left: 2, style: { bg: theme.panel, fg: theme.text }, content: 'Poll every N seconds:' });
    const pollInput = blessed.textbox({
      parent: frame,
      top: 11,
      left: 2,
      width: 12,
      height: 1,
      value: String(Number.isFinite(current.pollIntervalSeconds) ? current.pollIntervalSeconds : 30),
      style: { bg: theme.panel, fg: theme.accent, focus: { bg: '#2a1a55' } }
    });

    blessed.text({
      parent: frame,
      top: 13,
      left: 2,
      style: { bg: theme.panel, fg: theme.text },
      content: 'Management key' + (current.provisioningKey ? ' (blank = keep current):' : ' (optional — exact credits):')
    });
    const mgmtInput = blessed.textbox({
      parent: frame,
      top: 14,
      left: 2,
      width: 60,
      height: 1,
      censor: true,
      style: { bg: theme.panel, fg: theme.remaining, focus: { bg: '#2a1a55' } }
    });

    const errText = blessed.text({
      parent: frame,
      top: 16,
      left: 2,
      tags: true,
      style: { bg: theme.panel },
      content: `{${theme.dim}-fg}[tab] next field · [enter] on SAVE · [esc] cancel{/}`
    });

    const saveBtn = blessed.button({
      parent: frame,
      top: 16,
      left: 48,
      shrink: true,
      mouse: true,
      keys: true,
      content: ' SAVE ',
      style: { bg: theme.remaining, fg: theme.bg, bold: true, focus: { bg: theme.accent } }
    });

    saveBtn.on('press', () => submit());

    for (const box of [keyInput, budgetInput, pollInput, mgmtInput]) {
      box.on('focus', () => box.readInput());
      box.on('submit', () => submit());
      box.on('key escape', () => finish(null));
      box.on('key tab', () => {
        box.setValue(box.getValue().replace(/\t/g, ''));
        screen.focusNext();
      });
    }

    function submit() {
      const apiKey = keyInput.getValue().replace(/\t/g, '').trim();
      const budget = parseFloat(budgetInput.getValue());
      const pollSec = parseInt(pollInput.getValue(), 10);
      const mgmtKey = mgmtInput.getValue().replace(/\t/g, '').trim();
      if (!apiKey && !current.apiKey) {
        errText.setContent(`{${theme.alert}-fg}✗ API key is required{/}`);
        screen.render();
        keyInput.focus();
        return;
      }
      finish({
        apiKey: apiKey || current.apiKey,
        budget: Number.isFinite(budget) && budget > 0 ? budget : (current.budget || 50),
        pollIntervalSeconds: Number.isFinite(pollSec) && pollSec >= 10 ? pollSec : (current.pollIntervalSeconds || 30),
        provisioningKey: mgmtKey || current.provisioningKey || ''
      });
    }

    screen.key(['escape'], () => finish(null));
    screen.render();
    keyInput.focus();
    screen.render();
  });
}
