import type { ParticipantAuthGate, AuthResult } from './participantAuthGate';
import type { RateLimiter } from './rateLimiter';
import type { ParticipantRepository } from '../../repositories/participantRepository';

/**
 * Friend Mode participant identification: name-based selection from dropdown.
 * No password — relies on group honesty (documented trade-off, not a bug).
 */
export class NameSelectAuthGate implements ParticipantAuthGate {
  constructor(
    private rateLimiter: RateLimiter,
    private participants: ParticipantRepository
  ) {}

  async authenticate(
    sessionId: string,
    name: string,
    clientIp: string
  ): Promise<AuthResult> {
    const allowed = await this.rateLimiter.allow(clientIp, 'identify-participant');
    if (!allowed) {
      return { success: false, error: 'rate_limited' };
    }

    const participant = await this.participants.findBySessionAndName(sessionId, name);
    if (!participant) {
      return { success: false, error: 'name_not_registered' };
    }
    if (participant.hasSubmitted) {
      return { success: false, error: 'already_submitted' };
    }

    return { success: true, participant };
  }
}
