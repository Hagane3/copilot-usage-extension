import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseLine } from '../usageParser';

describe('parseLine', () => {
  it('returns null for an empty line', () => {
    assert.equal(parseLine(''), null);
    assert.equal(parseLine('   '), null);
  });

  it('returns null for malformed JSON', () => {
    assert.equal(parseLine('{bad json}'), null);
    assert.equal(parseLine('not json at all'), null);
  });

  it('returns null when event type is not llm_request', () => {
    const line = JSON.stringify({
      event: 'some_other_event',
      ts: 1750000000000,
      attrs: { copilotUsageNanoAiu: 500_000_000 },
    });
    assert.equal(parseLine(line), null);
  });

  it('returns null when nanoAiu field is missing', () => {
    const line = JSON.stringify({
      event: 'llm_request',
      ts: 1750000000000,
      attrs: {},
    });
    assert.equal(parseLine(line), null);
  });

  it('returns null when timestamp field is missing', () => {
    const line = JSON.stringify({
      event: 'llm_request',
      attrs: { copilotUsageNanoAiu: 500_000_000 },
    });
    assert.equal(parseLine(line), null);
  });

  it('parses a valid llm_request event (event field, nested attrs)', () => {
    const line = JSON.stringify({
      event: 'llm_request',
      ts: 1750000000000,
      attrs: { copilotUsageNanoAiu: 1_500_000_000 },
    });
    const result = parseLine(line);
    assert.deepEqual(result, { ts: 1750000000000, nanoAiu: 1_500_000_000, model: 'unknown' });
  });

  it('extracts model name from attrs.modelId', () => {
    const line = JSON.stringify({
      event: 'llm_request',
      ts: 1750000000000,
      attrs: { copilotUsageNanoAiu: 1_000_000_000, modelId: 'gpt-4o' },
    });
    const result = parseLine(line);
    assert.equal(result?.model, 'gpt-4o');
  });

  it('falls back to "unknown" when no model field present', () => {
    const line = JSON.stringify({
      event: 'llm_request',
      ts: 1750000000000,
      attrs: { copilotUsageNanoAiu: 1_000_000_000 },
    });
    const result = parseLine(line);
    assert.equal(result?.model, 'unknown');
  });

  it('also parses when event name is in "name" field', () => {
    const line = JSON.stringify({
      name: 'llm_request',
      ts: 1750000000000,
      attrs: { copilotUsageNanoAiu: 2_000_000_000 },
    });
    const result = parseLine(line);
    assert.notEqual(result, null);
    assert.equal(result!.nanoAiu, 2_000_000_000);
  });

  it('also parses when event name is in "type" field', () => {
    const line = JSON.stringify({
      type: 'llm_request',
      ts: 1750000000000,
      attrs: { copilotUsageNanoAiu: 300_000_000 },
    });
    const result = parseLine(line);
    assert.notEqual(result, null);
    assert.equal(result!.nanoAiu, 300_000_000);
  });

  it('falls back to top-level copilotUsageNanoAiu when attrs is absent', () => {
    const line = JSON.stringify({
      event: 'llm_request',
      ts: 1750000000000,
      copilotUsageNanoAiu: 750_000_000,
    });
    const result = parseLine(line);
    assert.notEqual(result, null);
    assert.equal(result!.nanoAiu, 750_000_000);
  });

  it('accepts timestamp field names: timestamp and time', () => {
    for (const key of ['timestamp', 'time'] as const) {
      const line = JSON.stringify({
        event: 'llm_request',
        [key]: 1750000000000,
        attrs: { copilotUsageNanoAiu: 1_000_000_000 },
      });
      const result = parseLine(line);
      assert.notEqual(result, null, `should parse with key=${key}`);
      assert.equal(result!.ts, 1750000000000);
    }
  });
});
