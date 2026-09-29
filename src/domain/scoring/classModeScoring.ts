import type { Participant } from '../participant';
import type { ScoringContext, ScoringStrategy } from './scoringStrategy';
import { questionSimilarity } from './friendModeScoring';

/** Class Mode scoring: only question similarity (no ranking, no avoid penalty).
 * RankPoints = 0 and AvoidPenalty = 0 always in Class Mode. */
export class ClassModeScoring implements ScoringStrategy {
  pairScore(a: Participant, b: Participant, ctx: ScoringContext): number {
    // RankPoints is always 0 in Class Mode; AvoidPenalty does not apply (no avoid list).
    return questionSimilarity(a, b, ctx);
  }
}
