import type { ParticipantAuthGate, AuthResult } from './participantAuthGate';
import type { RollNumberMapper } from './rollNumberMapper';
import type { RateLimiter } from './rateLimiter';
import type { ParticipantRepository } from '../../repositories/participantRepository';

/**
 * Class Mode participant authentication: Google OAuth → derive roll number → check pre-added list.
 *
 * Security model (derive-then-check):
 * The system NEVER accepts a roll number the client sends directly.
 * It only trusts the email Google returns after OAuth, then derives the expected
 * roll number from that email and checks it against the organizer's pre-added list.
 * This ordering is what makes NFR-10 enforceable rather than just a UI suggestion.
 */
export class GoogleRollNumberAuthGate implements ParticipantAuthGate {
  constructor(
    private mapper: RollNumberMapper,
    private rateLimiter: RateLimiter,
    private participants: ParticipantRepository
  ) {}

  /**
   * @param sessionId The session to authenticate against.
   * @param googleEmail The email returned by Google OAuth (trusted — not user-supplied).
   * @param clientIp The client IP for rate limiting.
   */
  async authenticate(
    sessionId: string,
    googleEmail: string,
    clientIp: string
  ): Promise<AuthResult> {
    const allowed = await this.rateLimiter.allow(clientIp, 'identify-participant');
    if (!allowed) {
      return { success: false, error: 'rate_limited' };
    }

    // Derive-then-check: convert the Google-verified email to a roll number.
    const derivedRollNumber = this.mapper.toRollNumber(googleEmail);
    if (!derivedRollNumber) {
      // Email domain not in supported campus list or format is invalid.
      return { success: false, error: 'unsupported_domain' };
    }

    const participant = await this.participants.findBySessionAndRollNumber(
      sessionId,
      derivedRollNumber
    );
    if (!participant) {
      return { success: false, error: 'roll_number_not_registered' };
    }
    if (participant.hasSubmitted) {
      return { success: false, error: 'already_submitted' };
    }

    return { success: true, participant };
  }
}
