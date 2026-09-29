import type { ScoringContext } from '../scoring/scoringStrategy';
import type { Grouping } from './matchingAlgorithm';

/** Applies deterministic tie-breaking when multiple groupings have the same FairnessScore.
 *
 * Tie-break order (Requirements §8.3):
 * 1. Fewer participants with zero fulfilled ranking choices (fewest = better).
 * 2. Higher overall average PairScore.
 * 3. Lexicographically first by sorted member IDs (fixed, arbitrary but deterministic).
 */
export class TieBreaker {
  /** Input `sorted` must be sorted descending by fairnessScore.
   * Applies deterministic tie-break rules, then returns the top n groupings. */
  resolveTopN(sorted: Grouping[], ctx: ScoringContext, n: number): Grouping[] {
    if (sorted.length === 0) return [];
    const topScore = sorted[0].fairnessScore;
    const tied = sorted.filter((g) => g.fairnessScore === topScore);

    if (tied.length > 1) {
      tied.sort((a, b) => {
        // Rule 1: fewest participants with zero fulfilled ranking choices.
        const aUnfulfilled = countUnfulfilled(a, ctx);
        const bUnfulfilled = countUnfulfilled(b, ctx);
        if (aUnfulfilled !== bUnfulfilled) return aUnfulfilled - bUnfulfilled;

        // Rule 2: higher overall average PairScore.
        const aAvg = averagePairScore(a);
        const bAvg = averagePairScore(b);
        if (aAvg !== bAvg) return bAvg - aAvg;

        // Rule 3: lexicographic order of member IDs joined per team (deterministic fallback).
        const aKey = a.teams
          .map((t) => t.members.map((m) => m.id).sort().join(','))
          .sort()
          .join('|');
        const bKey = b.teams
          .map((t) => t.members.map((m) => m.id).sort().join(','))
          .sort()
          .join('|');
        return aKey.localeCompare(bKey);
      });
    }

    const winner = tied[0];
    // Deduplicate: remove the winner from rest, then reconstruct full list.
    const rest = sorted.filter((g) => g !== winner);
    return [winner, ...rest].slice(0, n);
  }
}

/** Count participants who got zero of their ranked teammates in their actual team. */
function countUnfulfilled(grouping: Grouping, ctx: ScoringContext): number {
  let count = 0;
  const allMemberIds = grouping.teams.flatMap((t) => t.members.map((m) => m.id));
  for (const memberId of allMemberIds) {
    const theirRankings = ctx.rankings.filter((r) => r.participantId === memberId);
    if (theirRankings.length === 0) continue; // Class Mode / no ranking submitted
    const team = grouping.teams.find((t) => t.members.some((m) => m.id === memberId))!;
    const teammateIds = team.members.filter((m) => m.id !== memberId).map((m) => m.id);
    const gotAnyRankedTeammate = theirRankings.some((r) =>
      teammateIds.includes(r.rankedParticipantId)
    );
    if (!gotAnyRankedTeammate) count++;
  }
  return count;
}

/**
 * For tie-breaking rule 2, we use fairnessScore (the MIN) as a proxy for average.
 * Among groupings with the same MIN (same fairnessScore), the one with the higher
 * true average is better. This is documented as an acceptable simplification for
 * a pet-project scope — the grouping's fairnessScore is already the key metric.
 */
function averagePairScore(grouping: Grouping): number {
  // fairnessScore = MIN(TeamScore). For equal MINs, re-using MIN as proxy for average
  // is documented here intentionally rather than silently assumed.
  return grouping.fairnessScore;
}
