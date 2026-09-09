// A terminal has exactly one font size, so "bigger text" means drawing the
// headline figures out of block glyphs. Each glyph is 3 rows tall and built
// from quadrant blocks, which pack a legible digit into two columns -- the
// USAGE panel splits its width across two columns, so half-width glyphs are
// what make a block figure fit there at all.
//
// The '$' is three columns wide: its stem runs the full height with a serif
// bar top and bottom, so both tips stay visible instead of looking clipped.
//
// Glyph widths differ ('.' is a single column), so `bigLines()` is
// best-effort: it returns null for any character the font does not carry
// and the caller falls back to plain text.

export const FONT = {
  rows: 3,
  gap: 1,
  glyphs: {
    '0': ['▛▜', '▌▐', '▙▟'],
    '1': ['▝▌', ' ▌', '▗▙'],
    '2': ['▀▜', '▄▟', '▙▄'],
    '3': ['▀▜', '▀▜', '▄▟'],
    '4': ['▌▐', '▙▟', ' ▐'],
    '5': ['▛▀', '▀▜', '▄▟'],
    '6': ['▛▀', '▛▜', '▙▟'],
    '7': ['▀▜', ' ▐', ' ▐'],
    '8': ['▛▜', '▛▜', '▙▟'],
    '9': ['▛▜', '▀▜', '▄▟'],
    '$': ['▄█▄', '▀█▄', '▀█▀'],
    '.': [' ', ' ', '▖'],
    ',': [' ', ' ', '▖'],
    '-': ['  ', '▄▄', '  '],
    ' ': ['  ', '  ', '  ']
  }
};

// Renders `text` as `FONT.rows` lines of block glyphs, or null if any
// character is missing from the font.
export function bigLines(text) {
  const picked = [];
  for (const ch of text) {
    const glyph = FONT.glyphs[ch];
    if (!glyph) return null;
    picked.push(glyph);
  }
  if (!picked.length) return null;
  const gap = ' '.repeat(FONT.gap);
  return Array.from({ length: FONT.rows }, (_, r) => picked.map((g) => g[r]).join(gap));
}
