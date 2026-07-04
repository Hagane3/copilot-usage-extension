# Copilot Credits Tracker

VS Code extension that tracks your monthly GitHub Copilot AI credit (AIU) usage by parsing local Copilot Chat debug logs. Built for **Copilot Business/Enterprise** plans where the built-in UI does not show per-user monthly usage.

> **Not affiliated with GitHub or Microsoft.** Reads local debug logs only — no API keys, no network calls.

---

## How it works

GitHub Copilot Chat writes debug logs (JSONL) to VS Code's `workspaceStorage`. Each `llm_request` event contains `attrs.copilotUsageNanoAiu` — nano-AI-Units billed for that request.

```
workspaceStorage *.jsonl  →  parse  →  persist  →  aggregate  →  Status Bar + chart
```

1. **Scans** all `*.jsonl` files across workspace storage directories and VS Code profiles (including rotated logs `main.1.jsonl`, …).
2. **Parses** each `llm_request` and extracts only metadata: timestamp, AIU, model, session ID, duration, agent flag.
3. **Persists** new events to extension `globalStorage` so history survives VS Code's cleanup of inactive workspace logs.
4. **Displays** aggregated usage in the Status Bar and an interactive chart panel.

### Data before vs after install

VS Code deletes `workspaceStorage` for workspaces not opened recently. Usage **before** the extension was installed may be lost forever. From the moment the extension runs, **all newly observed events are kept** in its own persistent store.

---

## Features

### Status bar
- Current-month **AIU** and **request count**
- Auto-updates when log files change
- **Rich tooltip:** today / this week / this month, top model, budget progress bar
- **Color warning** when budget ≥ 80% (yellow) or ≥ 100% (red)

### Interactive chart (click status bar or run command)
- **Daily bar chart** with 7-day trend line; click a day to filter model table
- **Yearly overview** — 12 monthly bars with navigation between years
- **Hour-of-day heatmap** — when you use Copilot most
- **Model table** — AIU, cost, share %, requests, AIU/req, avg response time
- **Agent vs direct** — split of user prompts vs agent sub-calls
- **Top expensive sessions** — grouped by conversation
- **Model efficiency & recommendation** — cost comparison and savings hint
- **Month comparison** — `+12% vs prev month` in summary
- **Personal budget** — set AIU/month in chart UI or settings; progress bar in chart and tooltip

### Alerts & settings
| Setting | Description |
|---|---|
| `copilotCredits.monthlyBudgetAiu` | Personal monthly AIU budget (0 = off). E.g. org pool 21 000 ÷ 9 users ≈ 2333 |
| `copilotCredits.expensiveRequestThresholdAiu` | VS Code notification when a single request exceeds N AIU |
| `copilotCredits.useDevFixtures` | Dev only — read synthetic logs from `dev-fixtures/` (default: `false`) |

### Diagnostics
Command **Copilot Credits: Show Raw Event Diagnostics** — lists log files, persistent store stats, and last 20 events with **automatic redaction** of prompts, messages, code, and tool call content.

---

## Commands

| Command | Description |
|---|---|
| `Copilot Credits: Show Monthly Usage` | Opens the interactive chart |
| `Copilot Credits: Refresh` | Re-scans logs and updates status bar |
| `Copilot Credits: Show Raw Event Diagnostics` | Output channel (redacted) |

---

## Installation

### From VS Code Marketplace

*(Not published yet — see [PUBLISHING.md](./PUBLISHING.md) for how to package and publish.)*

```
Extensions → search "Copilot Credits Tracker" → Install
```

### From a `.vsix` file (internal / company)

```
Extensions → … → Install from VSIX…
```

### Requirements

- VS Code ≥ 1.80
- GitHub Copilot Chat with **debug logging** enabled (logs must exist under `workspaceStorage`)
- Works on macOS, Windows, Linux

---

## Configuration example

```json
{
  "copilotCredits.monthlyBudgetAiu": 2333,
  "copilotCredits.expensiveRequestThresholdAiu": 5
}
```

---

## Units

| Term | Meaning |
|---|---|
| **AIU** | GitHub billing unit. ~1 AIU ≈ $0.01 |
| **nanoAIU** | Raw log value. Divide by 1 000 000 000 for AIU |
| **0 AIU requests** | e.g. chat title generation (`gpt-4o-mini`) — counted as requests, not billed |

---

## Persistent storage

| Platform | Path |
|---|---|
| macOS | `~/Library/Application Support/Code/User/globalStorage/konradslomiany.copilot-credits-tracker/` |
| Windows | `%APPDATA%\Code\User\globalStorage\konradslomiany.copilot-credits-tracker\` |
| Linux | `~/.config/Code/User/globalStorage/konradslomiany.copilot-credits-tracker/` |

Monthly files: `events-2026-06.jsonl`, `events-2026-07.jsonl`, …

Each line stores only: `{"ts", "nanoAiu", "model", "sid?", "isAgent?", "dur?"}` — **no prompts or code**.

Delete files manually to reset history.

---

## Why counts may differ from the GitHub admin panel

The admin panel sees every server-side API call. This extension reads **local logs only**:

1. **Pre-install gap** — usage before the extension was installed and before logs existed locally.
2. **Deleted workspace logs** — mitigated by persistent store going forward.
3. **Unflushed logs** — crash or force-quit before log write.

After the first week with the extension active, numbers should closely track your personal usage.

---

## Development

```bash
git clone https://github.com/konradslomiany/copilot-usage-extension.git
cd copilot-usage-extension
npm install
npm run compile
```

| Script | Purpose |
|---|---|
| `npm run compile` | TypeScript → `out/` (F5 dev) |
| `npm run build` | esbuild bundle → `dist/` (release) |
| `npm test` | Unit tests |
| `npm run dev:fixtures` | Generate 3 months of synthetic Copilot logs |
| `npm run dev:host` | Compile + open Extension Development Host (macOS) |

Press **F5** or use **Run and Debug → Run Extension**.

> **F5 does nothing on macOS?** See troubleshooting in [Development without Copilot logs](#development-without-copilot-logs) below, or run `npm run dev:host`.

### Development without Copilot logs

Synthetic fixtures — **100% fake data**, no prompts or real workspace identifiers:

```bash
npm run dev:fixtures
```

Fixtures auto-enable in **Extension Development Host (F5)** when present on disk — you can open any project in the debug window.

Persisted dev events go to `dev-fixtures/store/` (gitignored).

**Turn off for production:** `"copilotCredits.useDevFixtures": false` (default).

---

## Architecture

```
src/
  extension.ts       — activation, watcher, commands
  logScanner.ts      — discovers *.jsonl across profiles
  usageParser.ts     — JSONL → UsageEvent (metadata only)
  eventStore.ts      — persistent monthly store
  monthlyAggregator.ts
  chartView.ts       — webview charts & tables
  uiPresenter.ts     — status bar + rich tooltip
  diagnostics.ts     — redacted debug output
  devFixtures.ts     — dev-mode auto-detection
  test/
```

---

## Security & privacy

- **Parser extracts metadata only** — prompts, messages, and code from log files are never stored or displayed.
- **Persistent store** holds only ts / AIU / model / session ID / duration.
- **Webview:** CSP nonce, HTML escaping, no external resources.
- **Diagnostics:** allowlist-based redaction before output.
- **No network access** at runtime — all data stays on your machine.
- **Dev fixtures** are fully synthetic (see `scripts/generateDevFixtures.js`).

---

## Publishing

See **[PUBLISHING.md](./PUBLISHING.md)** for a complete guide:

- Private `.vsix` for your company
- VS Code Marketplace (public)
- Pre-publish checklist, `.vscodeignore`, versioning, PAT setup

---

## Push to GitHub (first time)

Repo is ready for **v1.0.0**. From the project root:

```bash
# 1. Create an empty repo on GitHub (no README/license — already in this project)
#    https://github.com/new  →  name: copilot-usage-extension

# 2. Initial commit
git add .
git commit -m "Release v1.0.0"

# 3. Tag and push
git remote add origin https://github.com/konradslomiany/copilot-usage-extension.git
git branch -M main
git push -u origin main
git tag v1.0.0
git push origin v1.0.0
```

Optional: create a GitHub Release from tag `v1.0.0` and paste the [CHANGELOG](./CHANGELOG.md) section.

> Change the remote URL if your GitHub username or repo name differs.

---

## License

[MIT](./LICENSE)
