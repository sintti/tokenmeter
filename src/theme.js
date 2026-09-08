// Synthwave / Miami Vice palette
export const theme = {
  bg: '#0f0c29',        // deep space purple
  panel: '#1a1035',     // panel background
  border: '#b967ff',    // electric purple
  text: '#fffb96',      // neon yellow
  dim: '#8a7fb8',       // muted lavender
  remaining: '#05ffa1', // neon mint (credits left)
  spent: '#ff2e97',     // hot magenta (credits used)
  accent: '#01cdfe',    // electric cyan
  alert: '#ff4949',     // alert red
  warn: '#ffb347'       // caution orange
};

export function boxStyle(extra = {}) {
  return {
    tags: true,
    border: { type: 'line', fg: theme.border },
    style: {
      bg: theme.panel,
      border: { fg: theme.border },
      label: { fg: theme.text, bg: theme.panel },
      ...extra
    }
  };
}

// drawille canvas (donut chart) only understands RGB arrays, not hex strings
const hexToRgb = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16)
];

export const rgb = {
  remaining: hexToRgb(theme.remaining),
  spent: hexToRgb(theme.spent),
  alert: hexToRgb(theme.alert),
  dim: hexToRgb(theme.dim),
  text: hexToRgb(theme.text)
};
