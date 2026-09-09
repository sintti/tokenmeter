# tokenmeter

Retro 80s terminal dashboard for OpenRouter credit & token usage (Node, blessed).

## Commands

- `npm test` — smoke, TUI and wizard tests (node >= 18; npm is at `/c/Program Files/nodejs`, not on the default bash PATH)
- `npm run demo` / `npm run once` — run the dashboard with fake data
- `node scripts/snapshot.mjs <cols> <rows>` — render a plain-text snapshot of the demo dashboard (note: its crude stream decoder can garble the status line; that artifact is pre-existing, not a regression)

## Workflow rules

- Never commit or push on your own. The user commits and pushes explicitly, on separate instruction.
