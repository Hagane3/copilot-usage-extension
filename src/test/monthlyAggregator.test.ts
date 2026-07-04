import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateCurrentMonth, aggregateByModel } from '../monthlyAggregator';
import { UsageEvent } from '../usageParser';

const JULY_2026 = new Date(2026, 6, 3); // month index 6 = July

function ts(dateStr: string): number {
  return new Date(dateStr).getTime();
}

function ev(dateStr: string, nanoAiu: number, model = 'gpt-4o'): UsageEvent {
  return { ts: ts(dateStr), nanoAiu, model };
}

describe('aggregateCurrentMonth', () => {
  it('returns zero totals for an empty event list', () => {
    const result = aggregateCurrentMonth([], JULY_2026);
    assert.equal(result.totalAiu, 0);
    assert.equal(result.eventCount, 0);
    assert.equal(result.month, 7);
    assert.equal(result.year, 2026);
  });

  it('sums only events from the current month', () => {
    const events: UsageEvent[] = [
      ev('2026-07-01T10:00:00', 1_000_000_000), // July — include
      ev('2026-07-15T23:59:59', 2_000_000_000), // July — include
      ev('2026-06-30T23:59:59', 9_000_000_000), // June — exclude
      ev('2026-08-01T00:00:00', 9_000_000_000), // August — exclude
    ];

    const result = aggregateCurrentMonth(events, JULY_2026);
    assert.equal(result.eventCount, 2);
    assert.equal(result.totalAiu, 3.0); // (1e9 + 2e9) / 1e9
  });

  it('converts nanoAIU to AIU by dividing by 1e9', () => {
    const result = aggregateCurrentMonth(
      [ev('2026-07-10T08:00:00', 500_000_000)],
      JULY_2026
    );
    assert.equal(result.totalAiu, 0.5);
  });

  it('handles large numbers without precision loss for typical values', () => {
    const events = Array.from({ length: 100 }, () =>
      ev('2026-07-20T12:00:00', 1_000_000_000)
    );
    const result = aggregateCurrentMonth(events, JULY_2026);
    assert.equal(result.eventCount, 100);
    assert.equal(result.totalAiu, 100);
  });

  it('uses current date when "now" is not provided', () => {
    const result = aggregateCurrentMonth([]);
    const now = new Date();
    assert.equal(result.year, now.getFullYear());
    assert.equal(result.month, now.getMonth() + 1);
  });
});

describe('aggregateByModel', () => {
  it('groups events by model and sorts descending by AIU', () => {
    const events: UsageEvent[] = [
      ev('2026-07-01T10:00:00', 1_000_000_000, 'gpt-4o'),
      ev('2026-07-02T10:00:00', 3_000_000_000, 'claude-3.5-sonnet'),
      ev('2026-07-03T10:00:00', 2_000_000_000, 'gpt-4o'),
    ];
    const result = aggregateByModel(events, JULY_2026);
    const entries = [...result.entries()];

    assert.equal(entries[0][0], 'gpt-4o');
    assert.equal(entries[0][1].aiu, 3);
    assert.equal(entries[0][1].count, 2);

    assert.equal(entries[1][0], 'claude-3.5-sonnet');
    assert.equal(entries[1][1].aiu, 3);
    assert.equal(entries[1][1].count, 1);
  });

  it('excludes events outside the current month', () => {
    const events: UsageEvent[] = [
      ev('2026-07-01T10:00:00', 1_000_000_000, 'gpt-4o'),
      ev('2026-06-30T23:59:59', 9_000_000_000, 'gpt-4o'), // June — exclude
    ];
    const result = aggregateByModel(events, JULY_2026);
    assert.equal(result.get('gpt-4o')?.count, 1);
  });

  it('returns empty map for no events', () => {
    const result = aggregateByModel([], JULY_2026);
    assert.equal(result.size, 0);
  });
});
