import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  TeamRepository,
  StoredTeam,
  StoredAlternativeGrouping,
} from '../../repositories/teamRepository';
import type { Grouping } from '../../domain/matching/matchingAlgorithm';
import type { TeamScoreExplainer } from '../../domain/export/teamScoreExplainer';
import type { ScoringContext } from '../../domain/scoring/scoringStrategy';

export class SupabaseTeamRepository implements TeamRepository {
  constructor(private client: SupabaseClient) {}

  async findBySession(sessionId: string): Promise<StoredTeam[]> {
    const { data: teams, error: tErr } = await this.client
      .from('teams')
      .select('*, team_memberships(participant_id)')
      .eq('session_id', sessionId)
      .order('team_number');

    if (tErr) throw tErr;

    return (teams ?? []).map((t) => ({
      id: t.id,
      sessionId: t.session_id,
      teamNumber: t.team_number,
      fairnessScore: Number(t.fairness_score),
      scoreBreakdown: t.score_breakdown,
      memberIds: (t.team_memberships ?? []).map((m: { participant_id: string }) => m.participant_id),
    }));
  }

  async findAlternativesBySession(sessionId: string): Promise<StoredAlternativeGrouping[]> {
    const { data, error } = await this.client
      .from('alternative_groupings')
      .select('*')
      .eq('session_id', sessionId)
      .order('rank');

    if (error) throw error;

    return (data ?? []).map((alt) => ({
      id: alt.id,
      sessionId: alt.session_id,
      rank: alt.rank,
      fairnessScore: Number(alt.fairness_score),
      teamsSummary: alt.teams_summary,
    }));
  }

  async saveWinningGrouping(
    sessionId: string,
    winner: Grouping,
    explainer: TeamScoreExplainer,
    ctx: ScoringContext
  ): Promise<void> {
    for (let i = 0; i < winner.teams.length; i++) {
      const team = winner.teams[i];
      const breakdown = explainer.explain(team, ctx);

      const { data: teamRow, error: teamErr } = await this.client
        .from('teams')
        .insert({
          session_id: sessionId,
          team_number: i + 1,
          fairness_score: winner.fairnessScore,
          score_breakdown: breakdown,
        })
        .select()
        .single();

      if (teamErr) throw teamErr;

      const memberships = team.members.map((m) => ({
        team_id: teamRow.id,
        participant_id: m.id,
      }));

      const { error: memErr } = await this.client
        .from('team_memberships')
        .insert(memberships);

      if (memErr) throw memErr;
    }
  }

  async saveAlternativeGroupings(
    sessionId: string,
    alternatives: Grouping[]
  ): Promise<void> {
    for (let r = 0; r < alternatives.length; r++) {
      const alt = alternatives[r];
      const teamsSummary = alt.teams.map((t) => ({
        memberDisplayNames: t.members.map((m) => m.name ?? m.rollNumber ?? m.id),
        fairnessScore: alt.fairnessScore,
      }));

      const { error } = await this.client.from('alternative_groupings').insert({
        session_id: sessionId,
        rank: r + 2,
        fairness_score: alt.fairnessScore,
        teams_summary: teamsSummary,
      });

      if (error) throw error;
    }
  }
}
