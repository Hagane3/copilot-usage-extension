# Changelog

All notable changes to this project are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] - 2026-07-04

### Added

- Status bar with monthly AIU usage, request count, and rich Markdown tooltip (today / week / month, top model, budget bar).
- Interactive usage chart: daily bars, 7-day trend, yearly monthly overview, hour-of-day heatmap.
- Model breakdown table with AIU/req, cost share, and average response time.
- Agent vs direct usage split and top expensive sessions.
- Model efficiency recommendations in the chart panel.
- Month-over-month comparison in summary.
- Personal monthly AIU budget with progress bar and status bar color warnings (80% / 100%).
- Expensive-request notification threshold setting.
- Persistent event store in extension globalStorage (survives VS Code workspace log cleanup).
- Log scanner across all VS Code profiles and rotated `*.jsonl` files.
- Diagnostics command with allowlist-based redaction.
- Dev fixtures workflow (`npm run dev:fixtures`, auto-enable in Extension Development Host).
- Unit tests for parser and monthly aggregator.

### Security

- Metadata-only parsing and storage — no prompts, messages, or code persisted.
- Webview CSP and HTML escaping; no network access at runtime.

[1.0.0]: https://github.com/konradslomiany/copilot-usage-extension/releases/tag/v1.0.0
