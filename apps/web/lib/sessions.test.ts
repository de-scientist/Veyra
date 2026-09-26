import { afterEach, describe, expect, it, vi } from 'vitest';

import { getSessions, type AccountSession } from './shopping-api';

const session = (overrides: Partial<AccountSession> = {}): AccountSession => ({
  id: 'session-1',
  device: 'Chrome on Windows',
  ipAddress: '127.0.0.1',
  createdAt: '2026-09-25T10:00:00.000Z',
  lastUsedAt: '2026-09-26T10:00:00.000Z',
  expiresAt: '2026-10-03T10:00:00.000Z',
  revokedAt: null,
  isCurrent: true,
  ...overrides,
});

function mockFetch(data: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ success: true, data }) })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getSessions contract normalization', () => {
  it('unwraps the backend { sessions: [] } envelope into a typed array', async () => {
    mockFetch({ sessions: [session(), session({ id: 'session-2', isCurrent: false, revokedAt: '2026-09-26T11:00:00.000Z' })] });
    const sessions = await getSessions();
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions).toHaveLength(2);
    // The previously crashing call site must work.
    expect(sessions.filter((s) => !s.revokedAt)).toHaveLength(1);
  });

  it('still accepts a bare array response', async () => {
    mockFetch([session()]);
    const sessions = await getSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions.filter((s) => !s.revokedAt)).toHaveLength(1);
  });

  it('resolves unknown shapes to an empty array instead of crashing', async () => {
    for (const shape of [null, {}, { sessions: null }, { sessions: 'nope' }]) {
      mockFetch(shape);
      const sessions = await getSessions();
      expect(sessions).toEqual([]);
      expect(() => sessions.filter((s) => !s.revokedAt)).not.toThrow();
    }
  });

  it('represents current, active, and revoked sessions distinctly', async () => {
    mockFetch({
      sessions: [
        session(),
        session({ id: 'session-2', isCurrent: false }),
        session({ id: 'session-3', isCurrent: false, revokedAt: '2026-09-26T11:00:00.000Z' }),
      ],
    });
    const sessions = await getSessions();
    expect(sessions.filter((s) => s.isCurrent)).toHaveLength(1);
    expect(sessions.filter((s) => !s.revokedAt)).toHaveLength(2);
    expect(sessions.filter((s) => s.revokedAt)).toHaveLength(1);
  });
});
