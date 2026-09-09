# ⚡ tokenmeter

A retro 80s (synthwave) terminal dashboard for metering your **OpenRouter**
credit and token consumption — live.

<img width="974" height="661" alt="image" src="https://github.com/user-attachments/assets/6069d6cb-7adc-404d-8fe4-ef1040ad86d3" />



## Features

- **Live credit balance** — polls OpenRouter and shows remaining credits in a
  colorful donut/pie chart (neon mint = remaining, hot magenta = spent)
- **Daily metering** — usage deltas are attributed to the current day and
  remembered across restarts (`~/.tokenmeter/history.json`)
- **All-time totals** — lifetime spend and token estimates
- **7-day trend** — block sparkline of the last 7 days
- **First-run wizard** — paste your API key, set a budget, done
- **Demo mode** — `--demo` previews the dashboard with fake data
- **Retro 80s palette** — deep purple background, neon mint / magenta / cyan /
  electric purple / neon yellow accents

## Quick start

```bash
npm install
npm run demo        # preview with fake data (no key needed)
npm start           # real dashboard (launches setup wizard on first run)
```

## Setup

On first run a wizard asks for:

| Field | Meaning |
|---|---|
| **OpenRouter API key** | Create one at <https://openrouter.ai/keys> |
| **Total budget $** | Used when your key has no limit set (e.g. `50`) |
| **Poll every N seconds** | Refresh interval (default 30, min 10) |
| **Management key** | Optional — exact account credits. Create at <https://openrouter.ai/settings/management-keys> |

Saved to `~/.tokenmeter/config.json` (never logged). You can also skip the
wizard with `$OPENROUTER_API_KEY` or `--key`.

### How the credit math works

1. **Key has a spend limit set** (on openrouter.ai/keys) → remaining =
   `limit − usage` (exact)
2. **No limit** → remaining = `budget − usage` from your configured budget
3. **Optional upgrade** — set a *Management key* via the wizard (or
   `provisioningKey` in `~/.tokenmeter/config.json`) → remaining is read from
   the exact account-level `GET /api/v1/credits` endpoint

Daily/all-time numbers are metered locally (delta between polls while
tokenmeter runs). Token counts are **estimates** based on `tokensPerDollar`
(config, default 1M tokens ≈ $1) — the OpenRouter key API reports dollars, not
tokens.

## CLI

```
tokenmeter              launch the dashboard
tokenmeter --demo       dashboard with fake data (no key needed)
tokenmeter --once       print a one-shot summary and exit (cron-friendly)
tokenmeter --setup      re-run the setup wizard (edit key/budget/poll)
tokenmeter --poll N     poll interval in seconds (saved to config)
tokenmeter --budget X   total budget in $ (saved to config)
tokenmeter --key KEY    API key for this session (not saved)
```

## Config reference (`~/.tokenmeter/config.json`)

| Key | Default | Description |
|---|---|---|
| `apiKey` | — | OpenRouter API key (or env `OPENROUTER_API_KEY`) |
| `provisioningKey` | — | Optional: enables exact account credits |
| `budget` | `null` | Total budget in $ when the key has no limit |
| `pollIntervalSeconds` | `30` | Poll interval (min 10, backoff on errors) |
| `tokensPerDollar` | `1000000` | Token estimate rate (≈ tokens per $1) |
| `lowCreditPct` | `20` | Remaining % below which the LOW CREDITS warning fires |

## Keys

| Key | Action |
|---|---|
| `q` / `Esc` / `Ctrl-C` | quit |
| `r` | force refresh now |
| `p` | pause / resume polling (resuming refreshes straight away) |

## Notes

- Best viewed in **Windows Terminal** (or any 256-color+ terminal), ≥ 60 cols.
- Pasting into the setup wizard uses bracketed paste (supported by Windows
  Terminal, mintty, VS Code). If `Ctrl+V` reaches the app as a literal `^V`
  in your terminal, use `Shift+Insert` or right-click → paste instead.
- On errors (offline, 401, 429) the dashboard keeps the last known data and
  retries with exponential backoff — the status bar shows the reason.
- History file: `~/.tokenmeter/history.json`. Delete it to reset the daily /
  all-time meters (balances stay live from the API).
