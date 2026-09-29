import type { Participant } from '../participant';
import type { ScoringContext, ScoringStrategy } from '../scoring/scoringStrategy';
import { FairnessCalculator } from './fairnessCalculator';
import { TieBreaker } from './tieBreaker';
import type { Grouping, MatchingAlgorithm, TeamCandidate } from './matchingAlgorithm';

/** Exhaustive matcher: tries every possible partition of participants into teams.
 * Used when participantCount <= EXHAUSTIVE_THRESHOLD (12).
 * Always returns a deterministic result — no randomness used. */
export class ExhaustiveMatcher implements MatchingAlgorithm {
  constructor(private tieBreaker: TieBreaker) {}

  findTopGroupings(
    people: Participant[],
    teamSize: number,
    ctx: ScoringContext,
    scoring: ScoringStrategy,
    n: number
  ): Grouping[] {
    const calculator = new FairnessCalculator(scoring);
    const allPartitions: TeamCandidate[][] = [];
    this.generatePartitions(people, teamSize, [], allPartitions);

    const scored: Grouping[] = allPartitions.map((teams) => ({
      teams,
      fairnessScore: calculator.groupingScore(teams, ctx),
    }));

    // Sort descending by score, then apply tie-breaker for equal top scores.
    scored.sort((a, b) => b.fairnessScore - a.fairnessScore);
    return this.tieBreaker.resolveTopN(scored, ctx, n);
  }

  /**
   * Recursively partitions `remaining` into fixed-size groups.
   * The final group absorbs the remainder if remaining.length is not divisible by teamSize
   * (implements the "remainder forms a smaller team" rule from Requirements §5.1).
   */
  private generatePartitions(
    remaining: Participant[],
    teamSize: number,
    current: TeamCandidate[],
    results: TeamCandidate[][]
  ): void {
    if (remaining.length === 0) {
      results.push([...current]);
      return;
    }

    // If remaining participants can't form two full teams, absorb them all as the final group.
    if (remaining.length <= teamSize) {
      results.push([...current, { members: remaining }]);
      return;
    }

    const [first, ...rest] = remaining;
    const combos = combinations(rest, teamSize - 1);
    for (const combo of combos) {
      const group: TeamCandidate = { members: [first, ...combo] };
      const nextRemaining = rest.filter((p) => !combo.includes(p));
      this.generatePartitions(nextRemaining, teamSize, [...current, group], results);
    }
  }
}

/** Returns all k-element combinations from arr. */
function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map((c) => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}
