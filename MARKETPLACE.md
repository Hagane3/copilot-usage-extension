# Marketplace publish — quick steps

Repo is configured for publisher **`hagane3333`**. The Publisher ID in [Marketplace Manage](https://marketplace.visualstudio.com/manage) must match exactly.

## 1. One-time setup

1. Create publisher at [marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage) → **Create publisher** → ID: `hagane3333`
2. Create a PAT at [dev.azure.com](https://dev.azure.com) → User settings → **Personal access tokens** → scope **Marketplace → Manage**
3. Install deps: `npm install`

## 2. Test package locally

```bash
npm test
npm run package
```

Creates `copilot-credits-tracker-1.0.0.vsix`. Install via **Extensions → Install from VSIX** and verify.

## 3. Publish

```bash
npx vsce login hagane3333
# paste PAT

npm run publish:marketplace
```

First publish may take a few minutes to appear.

**Listing URL:** https://marketplace.visualstudio.com/items?itemName=hagane3333.copilot-credits-tracker

## 4. After publish

- Attach the `.vsix` to the GitHub Release `v1.0.0` (optional, for manual installs)
- Update README if needed (remove “link works after publish” note)

## Troubleshooting

| Error | Fix |
|---|---|
| `Missing publisher` | Create `hagane3333` on Marketplace |
| `Access denied` | PAT scope must include Marketplace Manage |
| `Extension entrypoint not found` | Run `npm run build` first |
| Version already exists | Bump `version` in `package.json` + CHANGELOG |

Full guide: [PUBLISHING.md](./PUBLISHING.md)
