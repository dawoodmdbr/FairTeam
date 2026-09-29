import type { Participant } from '../participant';

/** Result type for participant authentication attempts. */
export type AuthResult =
  | { success: true; participant: Participant }
  | { success: false; error: AuthError };

/** Error codes for participant authentication failures. */
export type AuthError =
  | 'rate_limited'
  | 'unsupported_domain'
  | 'roll_number_not_registered'
  | 'already_submitted'
  | 'name_not_registered'
  | 'session_not_open';

/** Strategy interface for participant identity verification.
 * Friend Mode: NameSelectAuthGate (name dropdown).
 * Class Mode: GoogleRollNumberAuthGate (Google OAuth → derive roll number → check list). */
export interface ParticipantAuthGate {
  authenticate(
    sessionId: string,
    credential: string,
    clientIp: string
  ): Promise<AuthResult>;
}
