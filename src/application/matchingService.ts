import type { Session, SessionMode } from '../domain/session';
import type { Participant } from '../domain/participant';
import { FriendModeScoring } from '../domain/scoring/friendModeScoring';
import { ClassModeScoring } from '../domain/scoring/classModeScoring';
import type { ScoringContext } from '../domain/scoring/scoringStrategy';
import { MatcherSelector } from '../domain/matching/matcherSelector';
import { TieBreaker } from '../domain/matching/tieBreaker';
import { SessionLifecycleManager } from '../domain/session/sessionLifecycleManager';
import { SessionCloneService } from '../domain/session/sessionCloneService';
import { TeamScoreExplainer } from '../domain/export/teamScoreExplainer';
import type { SessionRepository, CreateSessionInput } from '../repositories/sessionRepository';
import type { ParticipantRepository, CreateParticipantInput } from '../repositories/participantRepository';
import type { ResponseRepository, SubmitResponseInput } from '../repositories/responseRepository';
import type { TeamRepository } from '../repositories/teamRepository';
import type { QuestionSetProvider } from '../domain/questions/questionSetProvider';

/**
 * MatchingService — the only class the UI and Edge Functions call for session management.
 * Orchestrates the full flow: create session, add participants, reveal results.
 * Does not compute scores itself (delegates to domain layer). (SRP, Facade, Controller)
 */
export class MatchingService {
  private readonly tieBreaker = new TieBreaker();
  private readonly matcherSelector = new MatcherSelector();
  private readonly lifecycleManager = new SessionLifecycleManager();
  private readonly explainer = new TeamScoreExplainer();

  constructor(
    private sessionRepo: SessionRepository,
    private participantRepo: ParticipantRepository,
    private responseRepo: ResponseRepository,
    private teamRepo: TeamRepository,
    private questionSetProvider: QuestionSetProvider
  ) {}

  /** Create a new session in draft state. */
  async createSession(input: CreateSessionInput): Promise<Session> {
    return this.sessionRepo.create(input);
  }

  /** Transition a session from draft to open (sharing the link). */
  async openSession(sessionId: string): Promise<void> {
    const session = await this.sessionRepo.findById(sessionId);
    if (!this.lifecycleManager.canTransition(session.status, 'open')) {
      throw new Error(`Cannot open session in status '${session.status}'`);
    }
    await this.sessionRepo.updateStatus(sessionId, 'open');
  }

  /** Add a participant to a draft or open session. */
  async addParticipant(input: CreateParticipantInput): Promise<Participant> {
    const session = await this.sessionRepo.findById(input.sessionId);
    if (!this.lifecycleManager.canEdit(session)) {
      throw new Error('Cannot add participants to a locked or expired session');
    }
    return this.participantRepo.create(input);
  }

  /** Edit an existing participant (name or roll number). */
  async editParticipant(
    participantId: string,
    updates: Partial<Pick<Participant, 'name' | 'rollNumber'>>
  ): Promise<Participant> {
    const participant = await this.participantRepo.findById(participantId);
    const session = await this.sessionRepo.findById(participant.sessionId);
    if (!this.lifecycleManager.canEdit(session)) {
      throw new Error('Cannot edit participants in a locked or expired session');
    }
    return this.participantRepo.update(participantId, updates);
  }

  /** Remove a participant from a draft or open session. */
  async removeParticipant(participantId: string): Promise<void> {
    const participant = await this.participantRepo.findById(participantId);
    const session = await this.sessionRepo.findById(participant.sessionId);
    if (!this.lifecycleManager.canEdit(session)) {
      throw new Error('Cannot remove participants from a locked or expired session');
    }
    await this.participantRepo.deleteById(participantId);
  }

  /** Submit a participant's responses. Blocks double-submission. */
  async submitResponses(input: SubmitResponseInput): Promise<void> {
    const participant = await this.participantRepo.findById(input.participantId);
    if (participant.hasSubmitted) {
      throw new Error('Participant has already submitted');
    }
    const session = await this.sessionRepo.findById(input.sessionId);
    if (session.status !== 'open') {
      throw new Error(`Cannot submit to a session in status '${session.status}'`);
    }

    await this.responseRepo.submitAll(input);
    await this.participantRepo.markSubmitted(input.participantId);
  }

  /**
   * Reveal results: runs the matching algorithm, saves teams and alternatives,
   * then transitions the session to revealed → locked.
   * This is a one-way, non-repeatable action.
   */
  async revealResults(sessionId: string): Promise<void> {
    const session = await this.sessionRepo.findById(sessionId);
    if (!this.lifecycleManager.canTransition(session.status, 'revealed')) {
      throw new Error(`Cannot reveal session in status '${session.status}'`);
    }

    const participants = await this.participantRepo.findSubmittedBySession(sessionId);
    const { rankings, avoids, answers } = await this.responseRepo.findAllBySession(sessionId);
    const questionSet = await this.questionSetProvider.getQuestionSet(session.mode);

    const scoring = session.mode === 'friend'
      ? new FriendModeScoring()
      : new ClassModeScoring();

    const ctx: ScoringContext = { rankings, avoids, answers, questionSet };

    const matcher = this.matcherSelector.choose(participants.length, this.tieBreaker);
    const groupings = matcher.findTopGroupings(participants, session.teamSize, ctx, scoring, 3);

    const [winner, ...alternatives] = groupings;

    // Save the winning grouping as actual Team + TeamMembership rows.
    await this.teamRepo.saveWinningGrouping(sessionId, winner, this.explainer, ctx);

    // Save alternatives as AlternativeGrouping rows — display-only, never selectable as real result.
    await this.teamRepo.saveAlternativeGroupings(sessionId, alternatives);

    // Transition: revealed → locked (both in same operation to avoid partial state).
    await this.sessionRepo.updateStatus(sessionId, 'revealed');
    await this.sessionRepo.updateStatus(sessionId, 'locked');
  }

  /** Expire sessions that have passed their expiry date without being revealed. */
  async expireStaleSession(sessionId: string): Promise<void> {
    const session = await this.sessionRepo.findById(sessionId);
    const mgr = this.lifecycleManager;
    if (mgr.isExpired(session)) {
      await this.sessionRepo.updateStatus(sessionId, 'expired');
    }
  }

  /** Duplicate a session's configuration (mode, team size) into a new draft session. */
  async duplicateSession(sourceSessionId: string, createdBy: string): Promise<Session> {
    const cloneService = new SessionCloneService(this.sessionRepo);
    return cloneService.duplicateConfig({ sourceSessionId, createdBy });
  }

  /** Get all sessions for an organizer. */
  async getSessionsByOrganizer(organizerId: string): Promise<Session[]> {
    return this.sessionRepo.findAllByOrganizer(organizerId);
  }

  /** Get all participants for a session. */
  async getParticipants(sessionId: string): Promise<Participant[]> {
    return this.participantRepo.findBySession(sessionId);
  }

  /** Get questions for a given mode. */
  async getQuestions(mode: SessionMode) {
    return this.questionSetProvider.getQuestionSet(mode);
  }
}
