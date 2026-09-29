import type { Session } from '../session';
import type { SessionRepository } from '../../repositories/sessionRepository';

/** Input for creating a duplicate session configuration. */
export interface DuplicateSessionInput {
  sourceSessionId: string;
  createdBy: string;
  expiresInDays?: number;
}

/**
 * SessionCloneService — duplicates a past session's configuration only.
 * Copies: mode, team_size, question_set reference.
 * Does NOT copy: participants, responses, results, or alternative groupings.
 *
 * Exists purely to save setup time for recurring use cases (e.g. a TA running
 * the same format every semester) — not to clone actual student/friend data.
 */
export class SessionCloneService {
  constructor(private sessionRepo: SessionRepository) {}

  async duplicateConfig(input: DuplicateSessionInput): Promise<Session> {
    const source = await this.sessionRepo.findById(input.sourceSessionId);
    const expiryDays = input.expiresInDays ?? 14;
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();

    return this.sessionRepo.create({
      mode: source.mode,
      teamSize: source.teamSize,
      status: 'draft',
      createdBy: input.createdBy,
      expiresAt,
    });
  }
}
