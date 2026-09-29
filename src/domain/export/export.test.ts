import { describe, it, expect } from 'vitest';
import { CsvResultExporter } from './csvResultExporter';
import { TeamScoreExplainer } from './teamScoreExplainer';
import type { Session } from '../session';
import type { ExportableTeam } from './resultExporter';
import type { ScoringContext } from '../scoring/scoringStrategy';

describe('Result Exporters & Explainer', () => {
  const session: Session = {
    id: 's-exp',
    mode: 'friend',
    teamSize: 2,
    status: 'locked',
    createdBy: 'org-1',
    createdAt: new Date().toISOString(),
    expiresAt: new Date().toISOString(),
  };

  it('FEAT-5: CsvResultExporter properly escapes fields with commas and quotes', () => {
    const exporter = new CsvResultExporter();
    const teams: ExportableTeam[] = [
      {
        teamNumber: 1,
        fairnessScore: 8.5,
        scoreBreakdown: { mutualPickCount: 1, avgQuestionSimilarity: 8.5, avoidPenaltyApplied: false },
        members: [
          { id: '1', sessionId: 's-exp', name: 'Smith, John', hasSubmitted: true },
          { id: '2', sessionId: 's-exp', name: 'Alice "The Boss" Wonder', hasSubmitted: true },
        ],
      },
    ];

    const csv = exporter.export(session, teams);
    expect(csv).toContain('"Smith, John"');
    expect(csv).toContain('"Alice ""The Boss"" Wonder"');
  });

  it('FEAT-9: TeamScoreExplainer computes accurate mutual picks and avg similarity', () => {
    const explainer = new TeamScoreExplainer();
    const team = {
      members: [
        { id: 'p1', sessionId: 's', name: 'A', hasSubmitted: true },
        { id: 'p2', sessionId: 's', name: 'B', hasSubmitted: true },
      ],
    };

    const ctx: ScoringContext = {
      rankings: [
        { participantId: 'p1', rankedParticipantId: 'p2', position: 1 },
        { participantId: 'p2', rankedParticipantId: 'p1', position: 1 },
      ],
      avoids: [],
      answers: [
        { participantId: 'p1', questionId: 'q1', value: 'Web' },
        { participantId: 'p2', questionId: 'q1', value: 'Web' },
      ],
      questionSet: {
        mode: 'friend',
        questions: [{ id: 'q1', mode: 'friend', text: 'Topic', type: 'single_choice', sortOrder: 1 }],
      },
    };

    const breakdown = explainer.explain(team, ctx);
    expect(breakdown.mutualPickCount).toBe(1);
    expect(breakdown.avgQuestionSimilarity).toBe(10);
    expect(breakdown.avoidPenaltyApplied).toBe(false);

    const explanation = explainer.explainText(team, ctx, breakdown);
    expect(explanation).toContain('1 mutual teammate pick');
    expect(explanation).toContain('10.0/10');
  });
});
