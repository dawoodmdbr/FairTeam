import { describe, it, expect } from 'vitest';
import { SessionLifecycleManager } from './sessionLifecycleManager';
import type { Session } from '../session';

describe('SessionLifecycleManager', () => {
  const manager = new SessionLifecycleManager();

  const makeSession = (status: Session['status'], expiresAt = new Date(Date.now() + 100000).toISOString()): Session => ({
    id: 'test-session',
    mode: 'friend',
    teamSize: 3,
    status,
    createdBy: 'user-1',
    createdAt: new Date().toISOString(),
    expiresAt,
  });

  it('allows legal state transitions', () => {
    expect(manager.canTransition('draft', 'open')).toBe(true);
    expect(manager.canTransition('open', 'revealed')).toBe(true);
    expect(manager.canTransition('open', 'expired')).toBe(true);
    expect(manager.canTransition('revealed', 'locked')).toBe(true);
  });

  it('rejects illegal state transitions', () => {
    expect(manager.canTransition('draft', 'revealed')).toBe(false);
    expect(manager.canTransition('locked', 'open')).toBe(false);
    expect(manager.canTransition('expired', 'open')).toBe(false);
    expect(manager.canTransition('revealed', 'open')).toBe(false);
  });

  it('FEAT-3: allows edit only in draft or open state; blocks in locked/expired/revealed', () => {
    expect(manager.canEdit(makeSession('draft'))).toBe(true);
    expect(manager.canEdit(makeSession('open'))).toBe(true);
    expect(manager.canEdit(makeSession('revealed'))).toBe(false);
    expect(manager.canEdit(makeSession('locked'))).toBe(false);
    expect(manager.canEdit(makeSession('expired'))).toBe(false);
  });

  it('FEAT-10: correctly identifies expired sessions past expiresAt', () => {
    const past = new Date(Date.now() - 5000).toISOString();
    const future = new Date(Date.now() + 100000).toISOString();

    expect(manager.isExpired(makeSession('open', past))).toBe(true);
    expect(manager.isExpired(makeSession('open', future))).toBe(false);
    // Draft or locked sessions are not automatically 'expired' by time alone
    expect(manager.isExpired(makeSession('draft', past))).toBe(false);
  });
});
