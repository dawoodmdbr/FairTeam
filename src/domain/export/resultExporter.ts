import type { Session } from '../session';
import type { TeamCandidate } from '../matching/matchingAlgorithm';

/** A team with its associated data for export. */
export interface ExportableTeam extends TeamCandidate {
  teamNumber: number;
  fairnessScore: number;
  scoreBreakdown: ScoreBreakdown;
}

/** Breakdown of what drove a team's fairness score. */
export interface ScoreBreakdown {
  mutualPickCount: number;
  avgQuestionSimilarity: number;
  avoidPenaltyApplied: boolean;
}

/** Interface for result exporters (CSV, PDF). OCP: new format = new implementation. */
export interface ResultExporter {
  export(session: Session, teams: ExportableTeam[]): string | Promise<Blob>;
}
