import type {
  RankingInput,
  AvoidInput,
  QuestionAnswer,
} from '../domain/scoring/scoringStrategy';

/** All response data for a session, fetched together for scoring. */
export interface SessionResponses {
  rankings: RankingInput[];
  avoids: AvoidInput[];
  answers: QuestionAnswer[];
}

/** Input for saving a participant's full submission. */
export interface SubmitResponseInput {
  participantId: string;
  sessionId: string;
  rankings?: RankingInput[];
  avoids?: AvoidInput[];
  answers: QuestionAnswer[];
}

/** Repository interface for response data persistence. */
export interface ResponseRepository {
  findAllBySession(sessionId: string): Promise<SessionResponses>;
  findAnswersByParticipant(participantId: string): Promise<QuestionAnswer[]>;
  hasSubmitted(participantId: string): Promise<boolean>;
  submitAll(input: SubmitResponseInput): Promise<void>;
}
