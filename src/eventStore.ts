/**
 * Persistent event store.
 *
 * Copilot Chat debug logs live inside VS Code's workspaceStorage which is
 * silently deleted for inactive workspaces.  This module mirrors every parsed
 * UsageEvent into the extension's globalStorageUri directory, which VS Code
 * never cleans up on its own (only removed when the extension is uninstalled).
 *
 * Storage layout:
 *   <globalStorageDir>/events-2026-06.jsonl
 *   <globalStorageDir>/events-2026-07.jsonl
 *   …
 *
 * Each line is a compact JSON object: { ts, nanoAiu, model }
 */

import * as fs from 'fs';
import * as path from 'path';
import { UsageEvent } from './usageParser';

/** Stable deduplication key for a parsed event. */
function eventKey(e: UsageEvent): string {
  // ts + nanoAiu + model together are practically unique for any real billing
  // event (two requests at exactly the same millisecond with identical cost and
  // model would be pathological). This avoids having to touch the log format.
  return `${e.ts}_${e.nanoAiu}_${e.model}`;
}

function monthTag(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function storeFile(storageDir: string, tag: string): string {
  return path.join(storageDir, `events-${tag}.jsonl`);
}

/** Load all keys already persisted for a given month file. */
async function loadExistingKeys(filePath: string): Promise<Set<string>> {
  const keys = new Set<string>();
  let raw: string;
  try {
    raw = await fs.promises.readFile(filePath, 'utf8');
  } catch {
    return keys; // file doesn't exist yet
  }
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      const obj = JSON.parse(t) as Partial<UsageEvent>;
      if (
        typeof obj.ts === 'number' &&
        typeof obj.nanoAiu === 'number' &&
        typeof obj.model === 'string'
      ) {
        keys.add(eventKey(obj as UsageEvent));
      }
    } catch {
      // malformed line — skip
    }
  }
  return keys;
}

/**
 * Appends any events not yet in the store to the appropriate monthly files.
 * Returns the number of newly persisted events.
 */
export async function persistNewEvents(
  events: UsageEvent[],
  storageDir: string
): Promise<number> {
  if (events.length === 0) return 0;

  await fs.promises.mkdir(storageDir, { recursive: true });

  // Group by month tag
  const byMonth = new Map<string, UsageEvent[]>();
  for (const e of events) {
    const tag = monthTag(e.ts);
    let bucket = byMonth.get(tag);
    if (!bucket) {
      bucket = [];
      byMonth.set(tag, bucket);
    }
    bucket.push(e);
  }

  let newCount = 0;

  for (const [tag, monthEvents] of byMonth) {
    const filePath = storeFile(storageDir, tag);
    const existingKeys = await loadExistingKeys(filePath);

    const newLines: string[] = [];
    for (const e of monthEvents) {
      const key = eventKey(e);
      if (!existingKeys.has(key)) {
        existingKeys.add(key); // guard against duplicates within the same batch
        newLines.push(serialiseEvent(e));
        newCount++;
      }
    }

    if (newLines.length > 0) {
      await fs.promises.appendFile(filePath, newLines.join('\n') + '\n', 'utf8');
    }
  }

  return newCount;
}

// Serialise an event to a compact JSON line
function serialiseEvent(e: UsageEvent): string {
  const obj: Record<string, unknown> = { ts: e.ts, nanoAiu: e.nanoAiu, model: e.model };
  if (e.sid)     obj['sid']     = e.sid;
  if (e.isAgent) obj['isAgent'] = true;
  if (e.dur)     obj['dur']     = e.dur;
  return JSON.stringify(obj);
}

/**
 * Loads all events from every monthly file in the store.
 * Returns an empty array if the store directory doesn't exist yet.
 */
export async function loadPersistedEvents(
  storageDir: string
): Promise<UsageEvent[]> {
  let files: string[];
  try {
    files = await fs.promises.readdir(storageDir);
  } catch {
    return [];
  }

  const events: UsageEvent[] = [];

  for (const file of files) {
    if (!file.startsWith('events-') || !file.endsWith('.jsonl')) continue;

    let raw: string;
    try {
      raw = await fs.promises.readFile(path.join(storageDir, file), 'utf8');
    } catch {
      continue;
    }

    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try {
        const obj = JSON.parse(t) as Partial<UsageEvent>;
        if (
          typeof obj.ts === 'number' &&
          typeof obj.nanoAiu === 'number' &&
          typeof obj.model === 'string'
        ) {
          const raw = obj as Record<string, unknown>;
          const e: UsageEvent = { ts: obj.ts, nanoAiu: obj.nanoAiu, model: obj.model };
          if (typeof raw['sid']     === 'string')  e.sid     = raw['sid'] as string;
          if (raw['isAgent'] === true)              e.isAgent = true;
          if (typeof raw['dur']     === 'number')  e.dur     = raw['dur'] as number;
          events.push(e);
        }
      } catch {
        // malformed line — skip
      }
    }
  }

  return events;
}

/** Returns the list of monthly store files with their event counts, sorted oldest first. */
export async function getStoreStats(
  storageDir: string
): Promise<{ month: string; eventCount: number; filePath: string }[]> {
  let files: string[];
  try {
    files = await fs.promises.readdir(storageDir);
  } catch {
    return [];
  }

  const stats: { month: string; eventCount: number; filePath: string }[] = [];

  for (const file of files) {
    if (!file.startsWith('events-') || !file.endsWith('.jsonl')) continue;
    const month = file.slice('events-'.length, -'.jsonl'.length);
    const filePath = path.join(storageDir, file);
    const keys = await loadExistingKeys(filePath);
    stats.push({ month, eventCount: keys.size, filePath });
  }

  return stats.sort((a, b) => a.month.localeCompare(b.month));
}
