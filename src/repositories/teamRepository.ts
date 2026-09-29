import type { Grouping } from '../domain/matching/matchingAlgorithm';
import type { TeamScoreExplainer } from '../domain/export/teamScoreExplainer';
import type { ScoringContext } from '../domain/scoring/scoringStrategy';

/** A stored team with its fairness score and score breakdown JSON. */
export interface StoredTeam {
  id: string;
  sessionId: string;
  teamNumber: number;
  fairnessScore: number;
  scoreBreakdown: import('../domain/export/resultExporter').ScoreBreakdown;
  memberIds: string[];
}

/** A stored alternative grouping (display-only, never selectable as final result). */
export interface StoredAlternativeGrouping {
  id: string;
  sessionId: string;
  rank: number; // 2 or 3
  fairnessScore: number;
  teamsSummary: AlternativeTeamSummary[];
}

/** A summary of one team within an alternative grouping (member display names/roll numbers). */
export interface AlternativeTeamSummary {
  memberDisplayNames: string[];
  fairnessScore: number;
}

/** Repository interface for Team and TeamMembership persistence. */
export interface TeamRepository {
  findBySession(sessionId: string): Promise<StoredTeam[]>;
  findAlternativesBySession(sessionId: string): Promise<StoredAlternativeGrouping[]>;
  saveWinningGrouping(
    sessionId: string,
    winner: Grouping,
    explainer: TeamScoreExplainer,
    ctx: ScoringContext
  ): Promise<void>;
  saveAlternativeGroupings(
    sessionId: string,
    alternatives: Grouping[]
  ): Promise<void>;
}
