import type { MatchingAlgorithm } from './matchingAlgorithm';
import { ExhaustiveMatcher } from './exhaustiveMatcher';
import { ApproximateMatcher } from './approximateMatcher';
import type { TieBreaker } from './tieBreaker';

/** Participant count at or below which ExhaustiveMatcher is used.
 * Above this, ApproximateMatcher takes over automatically.
 * Set to 12: at n=12 into groups of 3, ~15,400 partitions — fast enough server-side.
 * Above this, partitions grow roughly 3× per +3 people, risking Edge Function timeouts. */
export const EXHAUSTIVE_THRESHOLD = 12;

/** Selects the appropriate matching algorithm based on participant count.
 * MatchingService never knows which concrete algorithm was chosen — LSP in practice. */
export class MatcherSelector {
  choose(participantCount: number, tieBreaker: TieBreaker): MatchingAlgorithm {
    return participantCount <= EXHAUSTIVE_THRESHOLD
      ? new ExhaustiveMatcher(tieBreaker)
      : new ApproximateMatcher(tieBreaker);
  }
}
