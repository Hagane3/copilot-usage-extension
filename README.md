# Copilot Credits Tracker

Track your monthly **GitHub Copilot AI credit (AIU)** usage inside VS Code — built for **Copilot Business & Enterprise** plans where per-user monthly usage is not shown in the UI.

> **Not affiliated with GitHub or Microsoft.** Reads local Copilot Chat debug logs on your machine only. No API keys, no network calls, no data sent anywhere.

**Install:** [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=hagane3333.copilot-credits-tracker) · Requires VS Code 1.80+ and GitHub Copilot Chat

---

## Quick start

1. Install the extension and reload VS Code.
2. Use Copilot Chat as usual — the **status bar** shows this month’s AIU and request count.
3. Click the status bar (or run **Copilot Credits: Show Monthly Usage**) to open the full chart.

From the first run onward, usage is saved locally so history is not lost when VS Code cleans up old workspace logs.

---

## What you get

**Status bar** — monthly AIU, request count, rich tooltip (today / week / month, top model, budget). Turns yellow at 80% of budget, red at 100%.

**Usage chart** — daily usage with trend, yearly overview, hour-of-day heatmap, breakdown by model (cost, share, AIU per request, response time), agent vs direct split, top expensive sessions, month-over-month comparison, and optional personal budget bar.

**Alerts** — optional notification when a single request exceeds your AIU threshold.

---

## Settings

| Setting | Description |
|---|---|
| `copilotCredits.monthlyBudgetAiu` | Your personal monthly AIU budget (0 = off). Tip: divide your org pool by team size. |
| `copilotCredits.expensiveRequestThresholdAiu` | Notify when one request costs more than this many AIU (0 = off). |

Example:

```json
{
  "copilotCredits.monthlyBudgetAiu": 2333,
  "copilotCredits.expensiveRequestThresholdAiu": 5
}
```

---

## Commands

| Command | What it does |
|---|---|
| **Copilot Credits: Show Monthly Usage** | Open the usage chart |
| **Copilot Credits: Refresh** | Re-scan logs and update the status bar |
| **Copilot Credits: Show Raw Event Diagnostics** | Show log discovery and recent events (sensitive fields redacted) |

---

## AIU in brief

| Term | Meaning |
|---|---|
| **AIU** | GitHub billing unit (~$0.01 per AIU) |
| **Request** | One Copilot Chat LLM call; some calls (e.g. title generation) show 0 AIU but still count as requests |

---

## Why numbers may differ from the admin panel

The org admin panel sees every server-side call. This extension reads **local debug logs only**, so it may show less than the panel if:

- usage happened **before** you installed the extension,
- VS Code had already removed logs for workspaces you had not opened recently,
- logs were not flushed before a crash or force-quit.

After a week of normal use with the extension installed, figures should closely match your personal usage.

---

## Privacy

- Only **metadata** is kept: time, AIU, model, session id, duration — never prompts, messages, or code.
- Everything stays in VS Code’s local storage on your computer.
- The chart and diagnostics do not load external resources.

To reset stored history, remove the extension’s data folder under VS Code `globalStorage` (`hagane3333.copilot-credits-tracker`).

---

## Support

- **Issues & feedback:** [github.com/Hagane3/copilot-usage-extension/issues](https://github.com/Hagane3/copilot-usage-extension/issues)
- **License:** [MIT](./LICENSE)
