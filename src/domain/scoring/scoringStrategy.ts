import type { Participant } from '../participant';
import type { QuestionSet } from '../questions/questionSetProvider';

/** A single ranking entry: participantId ranked rankedParticipantId at `position`. */
export interface RankingInput {
  participantId: string;
  rankedParticipantId: string;
  /** 1 = top choice, 5 = lowest allowed choice (min 3 required). */
  position: number;
}

/** An avoid entry: participantId marked avoidedParticipantId as preferred-to-avoid. */
export interface AvoidInput {
  participantId: string;
  avoidedParticipantId: string;
}

/** A single answer to a compatibility question. */
export interface QuestionAnswer {
  participantId: string;
  questionId: string;
  /** Scale: number | single_choice: string | multi_select: string[] */
  value: string | number | string[];
}

/** All data needed to compute pair scores for a session. */
export interface ScoringContext {
  rankings: RankingInput[];
  avoids: AvoidInput[];
  answers: QuestionAnswer[];
  questionSet: QuestionSet;
}

/** Strategy for computing the pairwise compatibility score between two participants.
 * FriendModeScoring includes ranking and avoid; ClassModeScoring uses question similarity only. */
export interface ScoringStrategy {
  pairScore(a: Participant, b: Participant, ctx: ScoringContext): number;
}
