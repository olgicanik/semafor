import { describe, expect, it } from 'vitest';
import {
  STATUS, calculateJobStatus, mapWireStatus, serverHealth, countByStatus, severityRank,
  toJobView, toServerView,
} from '../utils/statusCalculator.js';

describe('calculateJobStatus (task §5 raw-payload rules)', () => {
  it.each([
    [{ rawStatus: 'Ready to run', errorMessage: '' }, STATUS.GREEN],
    [{ rawStatus: 'Ready to run', errorMessage: 'Something failed' }, null], // green requires NO error msg
    [{ rawStatus: 'Ended with errors', errorMessage: 'Job killed by user at 10:03' }, STATUS.ORANGE],
    [{ rawStatus: 'ENDED WITH ERRORS', errorMessage: 'Timeout after 60s' }, STATUS.ORANGE], // case-insensitive
    [{ rawStatus: 'Ended with errors', errorMessage: 'Connection refused to 10.0.0.5' }, STATUS.RED],
    [{ rawStatus: 'Ended with errors', errorMessage: 'Schema mismatch on column invoice_no' }, STATUS.RED],
    [{}, null],
    [{ rawStatus: 'Planning' }, null],
    [{ rawStatus: 'Running - stage 2 of 4', errorMessage: '' }, STATUS.GREEN],
  ])('%o -> %s', (input, expected) => {
    expect(calculateJobStatus(input)).toBe(expected);
  });
});

describe('mapWireStatus', () => {
  it.each([
    ['yellow', STATUS.ORANGE],
    ['green', STATUS.GREEN],
    ['orange', STATUS.ORANGE],
    ['red', STATUS.RED],
    ['bogus', null],
    [null, null],
  ])('%s -> %s', (input, expected) => {
    expect(mapWireStatus(input)).toBe(expected);
  });
});

describe('serverHealth (server rollup)', () => {
  it('is RED when any job is red', () => {
    expect(serverHealth([{ status: 'green' }, { status: 'red' }])).toBe(STATUS.RED);
  });
  it('is ORANGE when no red but at least one orange', () => {
    expect(serverHealth([{ status: 'green' }, { status: 'orange' }])).toBe(STATUS.ORANGE);
  });
  it('is GREEN only when every known job is green', () => {
    expect(serverHealth([{ status: 'green' }, { status: 'green' }])).toBe(STATUS.GREEN);
  });
  it('is null for no jobs', () => {
    expect(serverHealth([])).toBeNull();
  });
  it('ignores unknown (null-status) jobs in the rollup', () => {
    expect(serverHealth([{ status: 'green' }, { status: null }])).toBe(STATUS.GREEN);
  });
});

describe('countByStatus', () => {
  it('counts pills across a mixed job set', () => {
    const counts = countByStatus([
      { status: 'red' }, { status: 'red' }, { status: 'orange' }, { status: 'green' },
    ]);
    expect(counts).toEqual({ total: 4, healthy: 1, warning: 1, critical: 2 });
  });
  it('returns zeros for an empty set', () => {
    expect(countByStatus([])).toEqual({ total: 0, healthy: 0, warning: 0, critical: 0 });
  });
});

describe('severityRank', () => {
  it('ranks red worst, then orange, green, and null last', () => {
    expect(severityRank('red')).toBeLessThan(severityRank('orange'));
    expect(severityRank('orange')).toBeLessThan(severityRank('green'));
    expect(severityRank('green')).toBeLessThan(severityRank(null));
    expect(severityRank(null)).toBe(3); // STATUS_ORDER.length — sorts last
  });
  it('treats unknown values like null (never worse than red)', () => {
    expect(severityRank('bogus')).toBe(3);
    expect(severityRank('yellow')).toBe(3);
    expect(severityRank(undefined)).toBe(3);
  });
});

describe('toJobView (wire adapter)', () => {
  it('maps yellow -> orange and message -> errorMessage, rawStatus null', () => {
    expect(toJobView({ status: 'yellow', message: 'Stopped...', last_run: '2026-10-22T09:00:00Z' }))
      .toMatchObject({ status: 'orange', rawStatus: null, errorMessage: 'Stopped...', lastRun: '2026-10-22T09:00:00Z' });
  });
  it('collapses unknown wire statuses to null (never passes through)', () => {
    expect(toJobView({ status: 'bogus' }).status).toBeNull();
  });
  it('passes through the frontend vocabulary idempotently', () => {
    expect(toJobView({ status: 'orange' }).status).toBe('orange');
  });
  it('defaults missing fields safely', () => {
    expect(toJobView({})).toMatchObject({ name: 'Untitled job', status: null, errorMessage: '', lastRun: null });
  });
});

describe('toServerView', () => {
  it('normalizes nested jobs and pre-computes health', () => {
    const view = toServerView({
      id: 'srv-1',
      jobs: [{ id: 'j1', status: 'yellow' }, { id: 'j2', status: 'green' }],
    });
    expect(view.jobs.map((j) => j.status)).toEqual(['orange', 'green']);
    expect(view.health).toBe(STATUS.ORANGE);
  });
});
