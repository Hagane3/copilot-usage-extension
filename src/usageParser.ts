import * as fs from 'fs';
import * as readline from 'readline';

export interface UsageEvent {
  /** Unix timestamp in milliseconds */
  ts: number;
  /** Raw value from copilotUsageNanoAiu field */
  nanoAiu: number;
  /** Model identifier, e.g. "gpt-4o", "claude-3.5-sonnet" */
  model: string;
  /** Session ID (UUID) — used for grouping requests into conversations */
  sid?: string;
  /** True when this request was triggered by the agent (has a parentSpanId),
   *  i.e. the user did not explicitly send this prompt themselves. */
  isAgent?: boolean;
  /** Request round-trip duration in milliseconds (from the `dur` log field). */
  dur?: number;
}

/**
 * Parses a single raw JSONL line and returns a UsageEvent if the line
 * represents an `llm_request` event with a valid nanoAiu value.
 *
 * Returns null for:
 *  - empty lines
 *  - malformed JSON
 *  - events that are not llm_request
 *  - records missing a numeric timestamp
 *  - records missing a numeric copilotUsageNanoAiu
 *
 * Exported for unit testing.
 */
export function parseLine(line: string): UsageEvent | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  let record: unknown;
  try {
    record = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (!isObject(record)) {
    return null;
  }

  if (!isLlmRequestEvent(record)) {
    return null;
  }

  const ts = extractTimestamp(record);
  if (ts === null) {
    return null;
  }

  const nanoAiu = extractNanoAiu(record);
  if (nanoAiu === null) {
    return null;
  }

  const model   = extractModel(record);
  const sid     = extractSid(record);
  const isAgent = extractIsAgent(record);
  const dur     = extractDur(record);

  return {
    ts, nanoAiu, model,
    ...(sid     ? { sid }     : {}),
    ...(isAgent ? { isAgent } : {}),
    ...(dur !== null ? { dur } : {}),
  };
}

/**
 * Reads a JSONL file line by line and returns all valid UsageEvents.
 * Errors in individual lines are silently skipped.
 */
export async function parseLogFile(filePath: string): Promise<UsageEvent[]> {
  const events: UsageEvent[] = [];

  let fileStream: fs.ReadStream;
  try {
    fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
  } catch {
    return events;
  }

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  try {
    for await (const line of rl) {
      const event = parseLine(line);
      if (event !== null) {
        events.push(event);
      }
    }
  } catch {
    // Partial read is acceptable — return whatever was collected
  } finally {
    rl.close();
  }

  return events;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Checks multiple field names that different Copilot Chat versions may use
 * to indicate an llm_request event.
 */
function isLlmRequestEvent(record: Record<string, unknown>): boolean {
  const candidates = [record['event'], record['name'], record['type']];
  return candidates.some((v) => v === 'llm_request');
}

/**
 * Extracts a numeric Unix timestamp (ms) from a record.
 * Accepts `ts`, `timestamp`, and `time` fields.
 */
function extractTimestamp(record: Record<string, unknown>): number | null {
  for (const key of ['ts', 'timestamp', 'time']) {
    const val = record[key];
    if (typeof val === 'number' && Number.isFinite(val)) {
      return val;
    }
  }
  return null;
}

/**
 * Extracts the model identifier from a record.
 * Tries attrs.modelId, attrs.model, top-level modelId and model fields.
 * Falls back to "unknown" when no recognisable field is present.
 */
function extractModel(record: Record<string, unknown>): string {
  const attrs = record['attrs'];
  if (isObject(attrs)) {
    for (const key of ['modelId', 'model_id', 'model']) {
      const val = attrs[key];
      if (typeof val === 'string' && val.trim()) {
        return val.trim();
      }
    }
  }

  for (const key of ['modelId', 'model_id', 'model']) {
    const val = record[key];
    if (typeof val === 'string' && val.trim()) {
      return val.trim();
    }
  }

  return 'unknown';
}

/**
 * Extracts the session ID from top-level `sid` or `sessionId` fields.
 */
function extractSid(record: Record<string, unknown>): string | null {
  for (const key of ['sid', 'sessionId', 'session_id']) {
    const val = record[key];
    if (typeof val === 'string' && val.trim()) {
      return val.trim();
    }
  }
  return null;
}

/**
 * Returns true when the event has a non-trivial parentSpanId, meaning
 * it was triggered autonomously by an agent step rather than by a direct
 * user prompt.
 */
function extractIsAgent(record: Record<string, unknown>): boolean {
  const v = record['parentSpanId'];
  return (
    typeof v === 'string' &&
    v.trim() !== '' &&
    v !== '0000000000000000' &&
    v !== '0000000000000001'
  );
}

/**
 * Extracts the request duration in milliseconds from the `dur` field.
 */
function extractDur(record: Record<string, unknown>): number | null {
  const v = record['dur'];
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  return null;
}

/**
 * Extracts the nanoAiu value.
 * Checks both `attrs.copilotUsageNanoAiu` (nested) and a top-level
 * `copilotUsageNanoAiu` field for resilience.
 */
function extractNanoAiu(record: Record<string, unknown>): number | null {
  const attrs = record['attrs'];
  if (isObject(attrs)) {
    const nested = attrs['copilotUsageNanoAiu'];
    if (typeof nested === 'number' && Number.isFinite(nested)) {
      return nested;
    }
  }

  const topLevel = record['copilotUsageNanoAiu'];
  if (typeof topLevel === 'number' && Number.isFinite(topLevel)) {
    return topLevel;
  }

  return null;
}
