/** Session mode: 'friend' for friend groups, 'class' for TA-managed classroom groups. */
export type SessionMode = 'friend' | 'class';

/** Session lifecycle states — transitions enforced by SessionLifecycleManager. */
export type SessionStatus = 'draft' | 'open' | 'revealed' | 'locked' | 'expired';

/** A team-formation session created by an organizer. */
export interface Session {
  id: string;
  mode: SessionMode;
  teamSize: number;
  status: SessionStatus;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
}
