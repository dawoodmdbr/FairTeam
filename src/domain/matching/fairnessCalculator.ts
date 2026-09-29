import type { ScoringContext, ScoringStrategy } from '../scoring/scoringStrategy';
import type { TeamCandidate } from './matchingAlgorithm';

/** Computes TeamScore and FairnessScore for candidate groupings.
 * TeamScore = average(PairScore) over all pairs in the team.
 * FairnessScore = MIN(TeamScore) across all teams — maximizing the worst team. */
export class FairnessCalculator {
  constructor(private scoring: ScoringStrategy) {}

  /** Average pair score for all unique pairs within a team. */
  teamScore(team: TeamCandidate, ctx: ScoringContext): number {
    const members = team.members;
    if (members.length < 2) return 0; // a lone leftover of 1 should not occur; guard anyway
    let total = 0;
    let pairs = 0;
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        total += this.scoring.pairScore(members[i], members[j], ctx);
        pairs++;
      }
    }
    return pairs === 0 ? 0 : total / pairs;
  }

  /** FairnessScore = MIN(TeamScore) across all teams in a grouping. */
  groupingScore(teams: TeamCandidate[], ctx: ScoringContext): number {
    const scores = teams.map((t) => this.teamScore(t, ctx));
    return Math.min(...scores);
  }
}
