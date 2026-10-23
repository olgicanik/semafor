import { describe, expect, it, vi } from 'vitest';
import { MOCK_SERVERS, mockCreateServer } from '../utils/mockData.js';
import { serverHealth, STATUS, countByStatus } from '../utils/statusCalculator.js';

describe('mockData shape & semaphore coverage', () => {
  it('every job status is a valid green|orange|red', () => {
    for (const srv of MOCK_SERVERS) {
      for (const job of srv.jobs) {
        expect([STATUS.GREEN, STATUS.ORANGE, STATUS.RED]).toContain(job.status);
      }
    }
  });

  it('exercises every §5 branch: green-only, mixed-orange and red servers', () => {
    const healths = MOCK_SERVERS.map((s) => serverHealth(s.jobs));
    expect(healths).toContain(STATUS.GREEN);
    expect(healths).toContain(STATUS.ORANGE);
    expect(healths).toContain(STATUS.RED);
    // at least one server is 100% green
    expect(MOCK_SERVERS.some((s) => countByStatus(s.jobs).critical === 0
      && countByStatus(s.jobs).warning === 0 && s.jobs.length > 0)).toBe(true);
  });

  it('every job has a name and project', () => {
    for (const srv of MOCK_SERVERS) {
      for (const job of srv.jobs) {
        expect(job.name).toBeTruthy();
        expect(job.project).toBeTruthy();
      }
    }
  });

  it('server ids are IP-like (exercise the monospace address + search-on-IP)', () => {
    for (const srv of MOCK_SERVERS) {
      expect(srv.id).toMatch(/^\d{1,3}(\.\d{1,3}){3}$/);
    }
  });

  it('covers all three environments', () => {
    const envs = new Set(MOCK_SERVERS.map((s) => s.environment));
    expect(envs).toEqual(new Set(['dev', 'qa', 'prod']));
  });
});

describe('mockData determinism + mutability', () => {
  it('re-importing the module yields identical job ids (no Math.random for ids)', async () => {
    const idsA = MOCK_SERVERS.flatMap((s) => s.jobs.map((j) => j.id));
    vi.resetModules();
    const fresh = await import('../utils/mockData.js');
    const idsB = fresh.MOCK_SERVERS.flatMap((s) => s.jobs.map((j) => j.id));
    expect(idsB).toHaveLength(idsA.length);
    expect(idsB).toEqual(idsA);
  });

  it('mockCreateServer appends a server to the live array (is_pinned false, empty jobs)', () => {
    const before = MOCK_SERVERS.length;
    const created = mockCreateServer({ name: 'New Box', environment: 'qa' });
    expect(MOCK_SERVERS).toHaveLength(before + 1);
    expect(MOCK_SERVERS).toContain(created);
    expect(created.is_pinned).toBe(false);
    expect(created.jobs).toEqual([]);
    expect(created.id).toMatch(/^mock-srv-\d+$/);
  });
});
