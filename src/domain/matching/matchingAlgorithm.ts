import type { Participant } from '../participant';

/** A single candidate team within a grouping. */
export interface TeamCandidate {
  members: Participant[];
}

/** A complete partition of participants into teams, with its computed fairness score. */
export interface Grouping {
  teams: TeamCandidate[];
  /** MIN(TeamScore) across all teams — see FairnessCalculator. */
  fairnessScore: number;
}

/** Strategy interface for finding the best groupings of participants.
 * Implementations: ExhaustiveMatcher (≤12 participants) and ApproximateMatcher (>12). */
export interface MatchingAlgorithm {
  findTopGroupings(
    people: Participant[],
    teamSize: number,
    ctx: import('../scoring/scoringStrategy').ScoringContext,
    scoring: import('../scoring/scoringStrategy').ScoringStrategy,
    n: number
  ): Grouping[]; // [0] = winner, [1..n-1] = alternatives, ordered best to worst
}
