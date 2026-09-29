import type { Session } from '../session';
import type { ExportableTeam } from './resultExporter';

/**
 * CsvResultExporter — produces a CSV string from revealed session results.
 * Format: Team, Member, Fairness Score (one row per team member).
 * Hand-rolled CSV writer — no external dependency needed for this simple tabular format.
 */
export class CsvResultExporter {
  export(session: Session, teams: ExportableTeam[]): string {
    const rows: string[][] = [['Team', 'Member', 'Roll Number', 'Fairness Score']];
    teams.forEach((team) => {
      team.members.forEach((m) => {
        rows.push([
          `Team ${team.teamNumber}`,
          m.name ?? '',
          m.rollNumber ?? '',
          String(team.fairnessScore.toFixed(4)),
        ]);
      });
    });
    void session; // session metadata could be added later; kept for interface compatibility
    return rows.map((row) => row.map(escapeCsvField).join(',')).join('\n');
  }
}

/** Escapes a CSV field by quoting it if it contains commas, quotes, or newlines. */
function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
