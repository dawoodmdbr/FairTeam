/** A person participating in a session.
 * Exactly one of `name` (Friend Mode) or `rollNumber` (Class Mode) is populated. */
export interface Participant {
  id: string;
  sessionId: string;
  /** Populated only in Friend Mode. */
  name?: string;
  /** Populated only in Class Mode. Format: '24F-3053'. */
  rollNumber?: string;
  hasSubmitted: boolean;
}
