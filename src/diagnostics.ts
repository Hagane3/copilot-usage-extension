import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import * as vscode from 'vscode';
import { findLogFiles, getVsCodeDataDir } from './logScanner';
import { getStoreStats } from './eventStore';

interface RawEvent {
  filePath: string;
  lineNumber: number;
  raw: Record<string, unknown>;
}

/**
 * Reads the last `limit` llm_request lines across all log files (newest files first).
 * Returns the raw parsed JSON objects so we can inspect every field.
 */
async function collectRawEvents(limit: number, extraRoots: string[]): Promise<RawEvent[]> {
  const logFiles = await findLogFiles(extraRoots);
  if (logFiles.length === 0) {
    return [];
  }

  // Sort newest first by mtime so we surface recent events fast
  const withMtime = await Promise.all(
    logFiles.map(async (f) => {
      try {
        const stat = await fs.promises.stat(f);
        return { path: f, mtime: stat.mtimeMs };
      } catch {
        return { path: f, mtime: 0 };
      }
    })
  );
  withMtime.sort((a, b) => b.mtime - a.mtime);

  const results: RawEvent[] = [];

  outer: for (const { path: filePath } of withMtime) {
    const lines: string[] = [];
    let lineNumber = 0;

    let stream: fs.ReadStream;
    try {
      stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    } catch {
      continue;
    }

    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    try {
      for await (const line of rl) {
        lineNumber++;
        const trimmed = line.trim();
        if (trimmed) {
          lines.push(`${lineNumber}:${trimmed}`);
        }
      }
    } catch {
      // partial read is fine
    } finally {
      rl.close();
    }

    // Walk backward through the file to find recent llm_request events
    for (let i = lines.length - 1; i >= 0; i--) {
      const colonIdx = lines[i].indexOf(':');
      const lnum = Number(lines[i].slice(0, colonIdx));
      const raw = lines[i].slice(colonIdx + 1);

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }

      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        continue;
      }

      const rec = parsed as Record<string, unknown>;
      const candidates = [rec['event'], rec['name'], rec['type']];
      if (!candidates.some((v) => v === 'llm_request')) {
        continue;
      }

      results.push({ filePath, lineNumber: lnum, raw: rec });
      if (results.length >= limit) {
        break outer;
      }
    }
  }

  return results;
}

// ── Redaction ────────────────────────────────────────────────────────────────

/**
 * Fields whose string/array values are shown as-is.
 * Everything NOT in this set (and not a transparent container) is redacted.
 */
const SAFE_FIELDS = new Set([
  // event identity
  'event', 'name', 'type', 'level', 'severity', 'category',
  // timestamps / durations
  'ts', 'timestamp', 'time', 'date', 'duration', 'dur', 'latency', 'elapsed',
  // request / session identifiers (opaque IDs — no user content)
  'requestId', 'completionId', 'messageId', 'sessionId',
  'conversationId', 'telemetryId', 'traceId', 'spanId', 'parentSpanId',
  'sid', 'cid',
  // model metadata
  'modelId', 'model', 'modelVersion', 'modelFamily',
  // usage metrics
  'copilotUsageNanoAiu', 'nanoAiu', 'promptTokens', 'completionTokens',
  'totalTokens', 'numTokens', 'tokenCount',
  // status / result codes
  'status', 'statusCode', 'errorCode', 'finishReason', 'stopReason',
  // source labels / mode flags (short enum-like strings, not user text)
  'source', 'sourceType', 'intent', 'intentType', 'agentId', 'agentMode',
]);

/**
 * Keys whose values are plain objects that should be recursed into rather than
 * redacted wholesale.  The individual leaf fields inside them are still
 * checked against SAFE_FIELDS.
 */
const TRANSPARENT_CONTAINERS = new Set([
  'attrs', 'attributes', 'meta', 'metadata', 'tags', 'properties',
]);

/**
 * Recursively walks a parsed JSON object and replaces values whose keys are
 * not in SAFE_FIELDS (or a transparent container) with shape-preserving
 * placeholders.  Numbers and booleans are always kept — they cannot contain
 * free-form user text.
 */
function redact(value: unknown, key?: string): unknown {
  if (value === null) return null;
  // Numbers and booleans cannot contain PII — always keep them.
  if (typeof value === 'number' || typeof value === 'boolean') return value;

  const isRoot      = key === undefined;
  const isSafe      = isRoot || SAFE_FIELDS.has(key!);
  const isContainer = isRoot || TRANSPARENT_CONTAINERS.has(key!);

  if (typeof value === 'string') {
    return isSafe ? value : `[redacted string (${value.length} chars)]`;
  }

  if (Array.isArray(value)) {
    if (isSafe || isContainer) {
      return (value as unknown[]).map((item) => redact(item));
    }
    return `[redacted array (${value.length} items)]`;
  }

  if (typeof value === 'object') {
    if (isSafe || isContainer) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = redact(v, k);
      }
      return out;
    }
    return '[redacted object]';
  }

  return isSafe ? value : '[redacted]';
}

function formatValue(v: unknown, indent = 0): string {
  if (v === null) return 'null';
  if (typeof v !== 'object') return String(v);
  if (Array.isArray(v)) return `[${(v as unknown[]).map((x) => formatValue(x)).join(', ')}]`;

  const pad = '  '.repeat(indent + 1);
  const entries = Object.entries(v as Record<string, unknown>)
    .map(([k, val]) => `${pad}${k}: ${formatValue(val, indent + 1)}`)
    .join('\n');
  return `{\n${entries}\n${'  '.repeat(indent)}}`;
}

export function registerDiagnosticsCommand(
  context: vscode.ExtensionContext,
  storageDir: string,
  extraRoots: string[] = []
): void {
  const channel = vscode.window.createOutputChannel('Copilot Credits — Diagnostics');
  context.subscriptions.push(channel);

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'copilotCredits.showDiagnostics',
      async () => {
        channel.clear();
        channel.show(true);
        channel.appendLine('Copilot Credits — Diagnostics');
        channel.appendLine('='.repeat(60));
        channel.appendLine(
          'ℹ  Sensitive fields (prompts, messages, code, file trees, tool calls)'
        );
        channel.appendLine(
          '   are automatically redacted and replaced with [redacted ...].'
        );
        channel.appendLine('='.repeat(60));

        // ── Persistent store summary ──────────────────────────
        const storeStats = await getStoreStats(storageDir);
        channel.appendLine('');
        channel.appendLine('PERSISTENT EVENT STORE');
        channel.appendLine('-'.repeat(60));
        if (storeStats.length === 0) {
          channel.appendLine('  (empty — no events persisted yet; run Refresh first)');
        } else {
          let storeTotal = 0;
          for (const s of storeStats) {
            channel.appendLine(`  ${s.month}  →  ${s.eventCount} events  (${s.filePath})`);
            storeTotal += s.eventCount;
          }
          channel.appendLine(`  Total: ${storeTotal} events across ${storeStats.length} month(s)`);
        }

        channel.appendLine('');
        channel.appendLine('='.repeat(60));

        // ── File discovery summary ────────────────────────────
        const allFiles = await findLogFiles(extraRoots);
        const editorDataDir = getVsCodeDataDir();
        const userDir = path.join(editorDataDir, 'User');

        channel.appendLine('');
        channel.appendLine(`DISCOVERED LOG FILES  (${allFiles.length} total)`);
        channel.appendLine('-'.repeat(60));

        if (allFiles.length === 0) {
          channel.appendLine('  (none found — check that Copilot Chat debug logging is enabled)');
        } else {
          // Group by profile (default vs named profiles)
          const grouped = new Map<string, string[]>();
          for (const f of allFiles) {
            let group = 'default profile';
            const profilesDir = path.join(userDir, 'profiles') + path.sep;
            if (f.startsWith(profilesDir)) {
              const rel = f.slice(profilesDir.length);
              group = 'profile: ' + rel.split(path.sep)[0];
            }
            if (!grouped.has(group)) grouped.set(group, []);
            grouped.get(group)!.push(f);
          }
          for (const [group, files] of grouped) {
            channel.appendLine(`  [${group}]  ${files.length} file(s)`);
            for (const f of files) {
              channel.appendLine(`    ${f}`);
            }
          }
        }

        channel.appendLine('');
        channel.appendLine('='.repeat(60));

        // ── Last 20 raw events ────────────────────────────────
        channel.appendLine('LAST 20 llm_request EVENTS');
        channel.appendLine('='.repeat(60));

        const events = await collectRawEvents(20, extraRoots);

        if (events.length === 0) {
          channel.appendLine('No llm_request events found in any log file.');
          return;
        }

        events.forEach((ev, idx) => {
          channel.appendLine('');
          channel.appendLine(
            `── Event #${idx + 1}  (line ${ev.lineNumber} in ${ev.filePath})`
          );
          const safe = redact(ev.raw) as Record<string, unknown>;
          for (const [key, val] of Object.entries(safe)) {
            channel.appendLine(`   ${key}: ${formatValue(val)}`);
          }
        });

        channel.appendLine('');
        channel.appendLine('='.repeat(60));
        channel.appendLine(
          'Look for: duplicate requestId/completionId, extra internal events, unexpected nanoAiu scale.'
        );
      }
    )
  );
}
