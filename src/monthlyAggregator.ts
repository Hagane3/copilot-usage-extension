import { UsageEvent } from './usageParser';

export interface MonthlyUsage {
  /** Total usage converted from nanoAIU to AIU (divide by 1e9). */
  totalAiu: number;
  /** Number of llm_request events counted this month. */
  eventCount: number;
  /** Calendar month 1–12 */
  month: number;
  /** Full calendar year, e.g. 2026 */
  year: number;
}

/**
 * Filters events to those whose timestamp falls in the current calendar month
 * (local time) and returns the aggregate.
 *
 * Conversion: 1 AIU = 1 000 000 000 nanoAIU.
 */
export function aggregateCurrentMonth(
  events: UsageEvent[],
  now: Date = new Date()
): MonthlyUsage {
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // getMonth() is 0-based

  let totalNanoAiu = 0;
  let eventCount = 0;

  for (const event of events) {
    const d = new Date(event.ts);
    if (d.getFullYear() === year && d.getMonth() + 1 === month) {
      totalNanoAiu += event.nanoAiu;
      eventCount++;
    }
  }

  return {
    totalAiu: totalNanoAiu / 1_000_000_000,
    eventCount,
    month,
    year,
  };
}

export interface DailyUsage {
  day: number; // 1–31
  aiu: number;
  count: number;
}

/**
 * Returns an entry for every calendar day of the current month (including
 * days with zero usage), so the chart always shows a full month grid.
 */
export function aggregateByDay(
  events: UsageEvent[],
  now: Date = new Date()
): DailyUsage[] {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();

  const map = new Map<number, DailyUsage>();
  for (let d = 1; d <= daysInMonth; d++) {
    map.set(d, { day: d, aiu: 0, count: 0 });
  }

  for (const event of events) {
    const d = new Date(event.ts);
    if (d.getFullYear() === year && d.getMonth() + 1 === month) {
      const day = d.getDate();
      const existing = map.get(day)!;
      existing.aiu += event.nanoAiu / 1_000_000_000;
      existing.count++;
    }
  }

  return [...map.values()];
}

export interface ModelUsage {
  aiu: number;
  count: number;
}

/**
 * Returns per-model usage for events already filtered to the current month,
 * sorted descending by AIU consumed.
 */
export function aggregateByModel(
  events: UsageEvent[],
  now: Date = new Date()
): Map<string, ModelUsage> {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const map = new Map<string, ModelUsage>();

  for (const event of events) {
    const d = new Date(event.ts);
    if (d.getFullYear() !== year || d.getMonth() + 1 !== month) {
      continue;
    }

    const existing = map.get(event.model) ?? { aiu: 0, count: 0 };
    map.set(event.model, {
      aiu: existing.aiu + event.nanoAiu / 1_000_000_000,
      count: existing.count + 1,
    });
  }

  return new Map(
    [...map.entries()].sort(([, a], [, b]) => b.aiu - a.aiu)
  );
}

/**
 * Returns a human-readable month label, e.g. "July 2026".
 */
export function formatMonthLabel(year: number, month: number): string {
  return new Date(year, month - 1).toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  });
}
