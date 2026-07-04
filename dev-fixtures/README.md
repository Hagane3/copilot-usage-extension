# Dev fixtures (local only)

Synthetic Copilot debug logs for development without a Copilot subscription.

**This folder's generated data is gitignored** — run locally:

```bash
npm run dev:fixtures
```

Fixtures auto-enable in **Extension Development Host (F5)** when present. Persisted dev events go to `dev-fixtures/store/` (also gitignored).

All data is 100% synthetic — see `scripts/generateDevFixtures.js`.
