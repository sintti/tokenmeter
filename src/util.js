import { Transform } from 'node:stream';

export function round4(n) {
  return Math.round(n * 10000) / 10000;
}

export function fmtMoney(n) {
  if (!Number.isFinite(n)) return '--';
  return '$' + n.toFixed(2);
}

export function fmtTokens(n) {
  if (!Number.isFinite(n)) return '--';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(Math.round(n));
}

export function fmtPct(n) {
  if (!Number.isFinite(n)) return '--';
  return n.toFixed(1) + '%';
}

export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

// Stream wrapper for terminal input that strips bracketed-paste markers
// (ESC[200~ ... ESC[201~) so blessed only sees the pasted text. Handles
// markers split across chunks; a partial marker at a chunk end is held
// briefly (64ms) so lone Escape keystrokes are not swallowed.
// setRawMode/isRaw are delegated so blessed can control the real stdin.

const WRAPS = ['\x1b[200~', '\x1b[201~'];
const HOLD_MS = 64;

function partialWrapLen(s) {
  for (let len = Math.min(s.length, WRAPS[0].length - 1); len >= 1; len--) {
    const tail = s.slice(s.length - len);
    if (WRAPS.some((w) => w.startsWith(tail))) return len;
  }
  return 0;
}

export function unwrapPaste(source) {
  const t = new Transform({
    transform(chunk, enc, cb) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      let s = (this._hold || '') + buf.toString('latin1');
      this._hold = '';
      let out = '';
      for (let i = 0; i < s.length; i++) {
        const w = WRAPS.find((x) => s.startsWith(x, i));
        if (w) { i += w.length - 1; continue; }
        out += s[i];
      }
      const hold = partialWrapLen(out);
      if (hold) {
        this._hold = out.slice(out.length - hold);
        out = out.slice(0, out.length - hold);
        clearTimeout(this._timer);
        this._timer = setTimeout(() => {
          if (this._hold) { this.push(Buffer.from(this._hold, 'latin1')); this._hold = ''; }
        }, HOLD_MS);
      }
      if (out) this.push(Buffer.from(out, 'latin1'));
      cb();
    },
    flush(cb) {
      clearTimeout(this._timer);
      if (this._hold) { this.push(Buffer.from(this._hold, 'latin1')); this._hold = ''; }
      cb();
    }
  });
  t.setRawMode = (mode) => (source.setRawMode ? source.setRawMode(mode) : t);
  Object.defineProperty(t, 'isRaw', {
    get: () => (source.isRaw ?? false)
  });
  source.pipe(t);
  return t;
}
