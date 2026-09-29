import type { Session, SessionStatus } from '../session';

/** Valid state transitions for the session lifecycle.
 * draft → open → revealed → locked (terminal)
 * open → expired (terminal, via inactivity timeout) */
const TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  draft: ['open'],
  open: ['revealed', 'expired'],
  revealed: ['locked'],
  locked: [],
  expired: [],
};

/**
 * SessionLifecycleManager — single source of truth for which actions are legal in which state.
 * No other class needs to know the full state transition table (SRP).
 *
 * This class's canEdit() check is what actually enforces Requirements §6.1 (the
 * participant-editing window) — not scattered UI guards.
 */
export class SessionLifecycleManager {
  /** Returns true if the given state transition is valid. */
  canTransition(from: SessionStatus, to: SessionStatus): boolean {
    return TRANSITIONS[from]?.includes(to) ?? false;
  }

  /** Participant add/edit/remove is only allowed before the session locks. */
  canEdit(session: Session): boolean {
    return session.status === 'draft' || session.status === 'open';
  }

  /** Returns true if an open session has passed its expiry date. */
  isExpired(session: Session, now: Date = new Date()): boolean {
    return session.status === 'open' && now > new Date(session.expiresAt);
  }
}
