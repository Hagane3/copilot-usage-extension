#!/usr/bin/env node
/**
 * Generates synthetic Copilot Chat debug logs for local extension development.
 *
 * Output layout (mirrors real VS Code workspaceStorage):
 *   dev-fixtures/workspaceStorage/<hash>/GitHub.copilot-chat/debug-logs/<session>/*.jsonl
 *
 * Usage: node scripts/generateDevFixtures.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', 'dev-fixtures', 'workspaceStorage');

const WORKSPACES = [
  'dev00000000000000000000000000000001', // synthetic workspace A
  'dev00000000000000000000000000000002', // synthetic workspace B
];

const MODELS = [
  { id: 'gpt-5.3-codex',       weight: 0.35, aiuMin: 0.4,  aiuMax: 12.0, durMin: 800,  durMax: 38000 },
  { id: 'gpt-5.4-mini',        weight: 0.30, aiuMin: 0.15, aiuMax: 2.5,  durMin: 600,  durMax: 8000  },
  { id: 'claude-haiku-4.5',    weight: 0.20, aiuMin: 0.5,  aiuMax: 5.0,  durMin: 700,  durMax: 12000 },
  { id: 'gpt-4o-mini-2024-07-18', weight: 0.15, aiuMin: 0, aiuMax: 0,    durMin: 400,  durMax: 1200  },
];

/** Target monthly AIU totals (approximate). */
const MONTHLY_TARGETS = {
  // year-month key → total AIU
  '2026-04': 3180,
  '2026-05': 5120,
  '2026-06': 4544,
  '2026-07': 920,  // partial current month
};

function uuid() {
  return crypto.randomUUID();
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function pickModel() {
  const r = Math.random();
  let acc = 0;
  for (const m of MODELS) {
    acc += m.weight;
    if (r <= acc) return m;
  }
  return MODELS[0];
}

function spanId(n) {
  return String(n).padStart(16, '0');
}

function makeLlmEvent({ ts, sid, model, nanoAiu, dur, parentSpanId, spanNum }) {
  const name = model.id.startsWith('gpt-4o-mini') ? model.id : model.id;
  return {
    ts,
    dur: Math.round(dur),
    sid,
    type: 'llm_request',
    name: `chat:${name}`,
    spanId: spanId(spanNum ?? Math.floor(Math.random() * 80) + 1),
    ...(parentSpanId ? { parentSpanId } : {}),
    status: 'ok',
    attrs: {
      model: model.id,
      debugName: parentSpanId ? 'agentStep' : 'chatRequest',
      inputTokens: Math.floor(rand(200, 58000)),
      outputTokens: Math.floor(rand(20, 2200)),
      cachedTokens: Math.floor(rand(0, 23000)),
      copilotUsageNanoAiu: Math.round(nanoAiu * 1e9),
      maxTokens: 128000,
    },
  };
}

function sessionDir(workspaceHash, sessionId) {
  return path.join(
    ROOT,
    workspaceHash,
    'GitHub.copilot-chat',
    'debug-logs',
    sessionId
  );
}

function writeSession(workspaceHash, sessionId, lines) {
  const dir = sessionDir(workspaceHash, sessionId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'main.jsonl'), lines.join('\n') + '\n', 'utf8');
}

function writeTitleSession(workspaceHash, titleSessionId, mainSessionId, ts) {
  const dir = sessionDir(workspaceHash, mainSessionId);
  fs.mkdirSync(dir, { recursive: true });
  const titleFile = path.join(dir, `title-${titleSessionId}.jsonl`);
  const ev = makeLlmEvent({
    ts: ts - rand(200, 900),
    sid: titleSessionId,
    model: MODELS.find((m) => m.id.includes('gpt-4o-mini')),
    nanoAiu: 0,
    dur: rand(400, 900),
    spanNum: 4,
  });
  fs.writeFileSync(titleFile, JSON.stringify(ev) + '\n', 'utf8');
}

function dateTs(year, month, day, hour, minute) {
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function rmDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function generateMonth(year, month, targetAiu) {
  const now = new Date();
  const isCurrentMonth =
    year === now.getFullYear() && month === now.getMonth() + 1;
  const dim = daysInMonth(year, month);
  const lastDay = isCurrentMonth ? Math.min(dim, now.getDate()) : dim;

  let remaining = targetAiu;
  let sessionCount = 0;

  // Keep adding sessions until we reach ~95% of the monthly target
  while (remaining > targetAiu * 0.05) {
    const day = Math.max(1, Math.min(lastDay, Math.floor(rand(1, lastDay + 1))));
    const dow = new Date(year, month - 1, day).getDay();
    const isWeekend = dow === 0 || dow === 6;
    if (isWeekend && Math.random() < 0.45) continue;

    const workspace = WORKSPACES[Math.random() < 0.75 ? 0 : 1];
    const sid = uuid();
    const hour = Math.floor(rand(9, 19));
    const minute = Math.floor(rand(0, 59));
    let ts = dateTs(year, month, day, hour, minute);

    const budgetForSession = Math.min(remaining, rand(8, Math.min(120, remaining)));
    const requestsInSession = Math.floor(rand(2, 10));
    const lines = [];
    let spanCounter = 1;
    const rootSpan = spanId(1);
    let sessionAiu = 0;

    for (let r = 0; r < requestsInSession && sessionAiu < budgetForSession; r++) {
      const model = pickModel();
      const isAgent = r > 0 && Math.random() < 0.38;
      const left = budgetForSession - sessionAiu;
      const aiu =
        model.aiuMax === 0
          ? 0
          : Math.min(left, Math.max(model.aiuMin, rand(model.aiuMin, Math.min(model.aiuMax, left))));

      ts += Math.floor(rand(500, 45000));
      const ev = makeLlmEvent({
        ts,
        sid,
        model,
        nanoAiu: aiu,
        dur: rand(model.durMin, model.durMax),
        parentSpanId: isAgent ? rootSpan : undefined,
        spanNum: ++spanCounter,
      });
      lines.push(JSON.stringify(ev));
      sessionAiu += aiu;
    }

    if (lines.length === 0 || sessionAiu <= 0) continue;

    writeSession(workspace, sid, lines);
    writeTitleSession(workspace, uuid(), sid, ts);
    remaining -= sessionAiu;
    sessionCount++;
  }

  const generated = targetAiu - remaining;
  return { sessionCount, generatedAiu: Math.round(generated * 10) / 10 };
}

// ── main ──────────────────────────────────────────────────────────────────────

console.log('Generating dev fixtures →', ROOT);
rmDir(ROOT);
fs.mkdirSync(ROOT, { recursive: true });

const summary = [];
for (const [key, target] of Object.entries(MONTHLY_TARGETS)) {
  const [year, month] = key.split('-').map(Number);
  const result = generateMonth(year, month, target);
  summary.push({ month: key, target, ...result });
}

// Write a small manifest for debugging
fs.writeFileSync(
  path.join(__dirname, '..', 'dev-fixtures', 'manifest.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), summary }, null, 2) + '\n',
  'utf8'
);

console.log('\nGenerated months:');
for (const s of summary) {
  console.log(
    `  ${s.month}: ~${s.generatedAiu} AIU (${s.sessionCount} sessions, target ${s.target})`
  );
}

let fileCount = 0;
function countJsonl(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) countJsonl(p);
    else if (ent.name.endsWith('.jsonl')) fileCount++;
  }
}
countJsonl(ROOT);
console.log(`\nTotal JSONL files: ${fileCount}`);
console.log('Done. Enable copilotCredits.useDevFixtures in VS Code settings and press F5.');
