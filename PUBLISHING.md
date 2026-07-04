# Publishing guide — Copilot Credits Tracker

Step-by-step guide for packaging and distributing this VS Code extension. **No automation is included in the repo** — follow these steps manually (or add CI later).

---

## Before you start — decide how to distribute

| Option | Best for | Pros | Cons |
|---|---|---|---|
| **Private `.vsix` file** | Company internal use | No Marketplace review, full control, works offline | Manual install per machine, no auto-updates |
| **VS Code Marketplace (public)** | Open-source / anyone | Auto-updates, discoverable | Public listing, Microsoft publisher account, review |
| **Open VSX Registry** | Cursor / VSCodium users | Alternative registry | Separate publish flow |

For a **company Business plan** where only colleagues need it, start with a **`.vsix` shared on an internal drive or Slack**. Move to Marketplace only if you want public distribution.

---

## Prerequisites

1. **Node.js 18+** and `npm install` in this repo.
2. **Microsoft account** (personal or work) — required for Marketplace publishing.
3. **Publisher account** on [Visual Studio Marketplace](https://marketplace.visualstudio.com/manage).
4. **`@vscode/vsce` CLI** — the official packaging/publish tool:

   ```bash
   npm install -g @vscode/vsce
   ```

   Or run without global install:

   ```bash
   npx @vscode/vsce --version
   ```

---

## Step 1 — Create a Marketplace publisher (one-time)

1. Go to [https://marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage).
2. Sign in with Microsoft account.
3. Click **Create publisher**.
4. Choose a **Publisher ID** (lowercase, no spaces), e.g. `yourname` or `yourcompany`.
   - This ID is permanent and appears in extension URLs.
   - Example URL: `https://marketplace.visualstudio.com/items?itemName=yourname.copilot-credits-tracker`
5. Fill in display name and (optionally) link a verified domain.

---

## Step 2 — Prepare `package.json` for release

Current dev settings use `"publisher": "local"` and `"private": true`. Before publishing, update:

```json
{
  "name": "copilot-credits-tracker",
  "displayName": "Copilot Credits Tracker",
  "description": "Track monthly GitHub Copilot AI credit (AIU) usage from local debug logs",
  "version": "0.1.0",
  "publisher": "YOUR_PUBLISHER_ID",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/YOUR_ORG/copilot-usage-extension"
  },
  "bugs": {
    "url": "https://github.com/YOUR_ORG/copilot-usage-extension/issues"
  },
  "homepage": "https://github.com/YOUR_ORG/copilot-usage-extension#readme",
  "icon": "images/icon.png",
  "categories": ["Other"],
  "keywords": [
    "copilot",
    "github copilot",
    "ai credits",
    "usage",
    "billing"
  ],
  "engines": {
    "vscode": "^1.80.0"
  },
  "main": "./dist/extension.js"
}
```

Remove `"private": true` when publishing to Marketplace.

### Important: `main` entry point

| Mode | `main` field | Build command |
|---|---|---|
| **F5 development** | `./out/extension.js` | `npm run compile` (TypeScript → `out/`) |
| **Published package** | `./dist/extension.js` | `npm run build` (esbuild bundle → `dist/`) |

The `"vscode:prepublish"` script already runs `npm run build`. For release packaging, **`main` must point to `./dist/extension.js`**, otherwise the published extension will ship the wrong file.

**Practical approach:** keep `main: "./out/extension.js"` during daily dev; switch to `./dist/extension.js` only on the release branch / before `vsce package`. Or use two npm scripts (see checklist below).

### Recommended additions (Marketplace quality)

- **`LICENSE`** file in repo root (MIT is common for extensions).
- **`images/icon.png`** — 128×128 or 256×256 PNG (required for Marketplace listing).
- **`CHANGELOG.md`** — version history; `vsce` can use it for release notes.
- **`.vscodeignore`** — exclude dev files from the `.vsix` (see Step 4).

---

## Step 3 — Pre-publish checklist

Run through this list before every release:

- [ ] `npm test` passes
- [ ] `npm run build` succeeds (`dist/extension.js` exists)
- [ ] `"main": "./dist/extension.js"` in `package.json`
- [ ] `"publisher"` set to your real Publisher ID
- [ ] `"private": true` removed (Marketplace only)
- [ ] `"version"` bumped (semver: `0.1.0` → `0.1.1` patch, `0.2.0` minor)
- [ ] `CHANGELOG.md` updated
- [ ] `copilotCredits.useDevFixtures` defaults to `false` (already the case)
- [ ] No secrets, tokens, or real workspace paths in source
- [ ] README accurately describes features and limitations
- [ ] Test the **packaged** extension locally (Step 5) — not only F5

---

## Step 4 — Create `.vscodeignore`

Without this file, `vsce` packs everything including `node_modules`, `dev-fixtures`, and source maps you may not want.

Create `.vscodeignore` in the repo root:

```
.vscode/**
.vscode-test/**
src/**
scripts/**
dev-fixtures/**
out/**
node_modules/**
.gitignore
tsconfig.json
esbuild.js
**/*.ts
**/*.map
!dist/**
```

Adjust as needed. The published bundle should contain mainly `dist/extension.js`, `package.json`, `README.md`, `CHANGELOG.md`, `LICENSE`, and `images/icon.png`.

---

## Step 5 — Package locally (`.vsix`)

From the repo root, after setting `main` to `./dist/extension.js`:

```bash
npm install
npm test
npm run build
npx @vscode/vsce package
```

This creates `copilot-credits-tracker-0.1.0.vsix` in the current directory.

### Install the `.vsix` locally to verify

**VS Code:**

```bash
code --install-extension copilot-credits-tracker-0.1.0.vsix
```

Or: Extensions sidebar → `…` menu → **Install from VSIX…**

Restart VS Code. Confirm:

- Status bar shows usage (with real Copilot logs on a machine that has them).
- Chart opens and all sections render.
- Settings `copilotCredits.monthlyBudgetAiu` works.

---

## Step 6 — Publish to VS Code Marketplace

### Create a Personal Access Token (PAT)

1. Go to [Azure DevOps](https://dev.azure.com) → User settings → **Personal access tokens**.
2. Create token with scope **Marketplace → Manage**.
3. Copy the token (shown once).

### Login and publish

```bash
npx @vscode/vsce login YOUR_PUBLISHER_ID
# paste PAT when prompted

npx @vscode/vsce publish
```

Or publish an existing vsix:

```bash
npx @vscode/vsce publish --packagePath copilot-credits-tracker-0.1.0.vsix
```

First publish can take a few minutes to appear on the Marketplace. Subsequent updates usually propagate faster.

### Publish pre-release (optional)

```bash
npx @vscode/vsce publish --pre-release
```

Useful for beta testing with colleagues before marking stable.

---

## Step 7 — Internal / company distribution (no Marketplace)

If you **don't** want a public listing:

1. Run `npx @vscode/vsce package` (Steps 4–5).
2. Share `copilot-credits-tracker-X.Y.Z.vsix` via:
   - Internal file share / Confluence
   - Slack / Teams
   - Internal artifact repository (Artifactory, etc.)
3. Each developer installs manually: **Install from VSIX**.
4. Document the install steps for your team.

**Updates:** colleagues must reinstall the new `.vsix` manually — there is no auto-update outside Marketplace.

### Optional: private Marketplace (Enterprise)

Some organizations use **Azure DevOps private galleries** or MDM to push VS Code extensions company-wide. That requires IT involvement — ask your platform team if this exists.

---

## Step 8 — Versioning and releases (recommended workflow)

Use [Semantic Versioning](https://semver.org/):

| Change | Version bump | Example |
|---|---|---|
| Bug fix | PATCH | `0.1.0` → `0.1.1` |
| New feature | MINOR | `0.1.1` → `0.2.0` |
| Breaking change | MAJOR | `0.2.0` → `1.0.0` |

Suggested git workflow:

```bash
# 1. Ensure clean main, all tests pass
npm test && npm run build

# 2. Bump version in package.json (and CHANGELOG.md)
# 3. Commit
git commit -am "Release v0.2.0"

# 4. Tag
git tag v0.2.0
git push origin main --tags

# 5. Package & publish
npx @vscode/vsce publish
```

---

## Step 9 — Marketplace listing tips

When filling the extension page:

- **Short description:** one line from `package.json` `description`.
- **Detailed description:** paste/adapt from README (Features, How it works, Limitations).
- **Disclaimer:** clearly state this reads **local debug logs**, is an **estimate**, and is **not affiliated with GitHub**.
- **Q&A / Issues:** link to GitHub Issues if public repo.

Microsoft may reject extensions that:

- Use GitHub/Copilot logos without permission (use a generic icon).
- Claim to be official GitHub/Microsoft products.
- Contain misleading billing guarantees.

---

## Step 10 — Cursor / VS Code Insiders

- **VS Code Insiders:** same Marketplace, usually works without changes.
- **Cursor:** supports many VS Code extensions; install via `.vsix` or Open VSX depending on Cursor version. Test manually — not guaranteed identical to VS Code.

This extension only reads local filesystem paths under the user's VS Code data directory — it does **not** require Copilot API keys or network access at runtime.

---

## Troubleshooting `vsce`

| Error | Fix |
|---|---|
| `ERROR Missing publisher name` | Set `"publisher"` in `package.json` |
| `ERROR Extension entrypoint not found` | Set `"main": "./dist/extension.js"` and run `npm run build` |
| `ERROR Manifest missing field` | Add `license`, `repository`, or required fields |
| `EPERM` / login failed | Regenerate PAT with Marketplace Manage scope |
| Package too large | Add `.vscodeignore`, exclude `dev-fixtures` and `node_modules` |

---

## Quick reference

```bash
# Development
npm run compile          # F5 / Extension Development Host
npm run dev:fixtures     # synthetic logs (private machine)
npm run dev:host         # open EDH from terminal (macOS)

# Release
npm test
npm run build
npx @vscode/vsce package                    # → .vsix
npx @vscode/vsce publish                    # → Marketplace
code --install-extension *.vsix             # local test install
```

---

## What not to publish

- `dev-fixtures/` — synthetic dev data (gitignored, exclude via `.vscodeignore`).
- `dev-fixtures/store/` — local dev persistent store.
- Real Copilot debug logs from your machine — never commit or package these.
