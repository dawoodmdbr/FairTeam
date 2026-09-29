import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ResponseRepository,
  SessionResponses,
  SubmitResponseInput,
} from '../../repositories/responseRepository';
import type { QuestionAnswer } from '../../domain/scoring/scoringStrategy';

export class SupabaseResponseRepository implements ResponseRepository {
  constructor(private client: SupabaseClient) {}

  async findAllBySession(sessionId: string): Promise<SessionResponses> {
    // 1. Get all participants in session
    const { data: participants, error: pErr } = await this.client
      .from('participants')
      .select('id')
      .eq('session_id', sessionId);

    if (pErr) throw pErr;
    const participantIds = (participants ?? []).map((p) => p.id);

    if (participantIds.length === 0) {
      return { rankings: [], avoids: [], answers: [] };
    }

    // 2. Fetch answers
    const { data: answersData, error: aErr } = await this.client
      .from('question_responses')
      .select('*')
      .in('participant_id', participantIds);

    if (aErr) throw aErr;

    // 3. Fetch rankings
    const { data: rankingsData, error: rErr } = await this.client
      .from('ranking_responses')
      .select('*')
      .in('participant_id', participantIds);

    if (rErr) throw rErr;

    // 4. Fetch avoids
    const { data: avoidsData, error: avErr } = await this.client
      .from('avoid_responses')
      .select('*')
      .in('participant_id', participantIds);

    if (avErr) throw avErr;

    return {
      answers: (answersData ?? []).map((a) => ({
        participantId: a.participant_id,
        questionId: a.question_id,
        value: a.value,
      })),
      rankings: (rankingsData ?? []).map((r) => ({
        participantId: r.participant_id,
        rankedParticipantId: r.ranked_participant_id,
        position: r.position,
      })),
      avoids: (avoidsData ?? []).map((av) => ({
        participantId: av.participant_id,
        avoidedParticipantId: av.avoided_participant_id,
      })),
    };
  }

  async findAnswersByParticipant(participantId: string): Promise<QuestionAnswer[]> {
    const { data, error } = await this.client
      .from('question_responses')
      .select('*')
      .eq('participant_id', participantId);

    if (error) throw error;

    return (data ?? []).map((a) => ({
      participantId: a.participant_id,
      questionId: a.question_id,
      value: a.value,
    }));
  }

  async hasSubmitted(participantId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from('participants')
      .select('has_submitted')
      .eq('id', participantId)
      .single();

    if (error || !data) return false;
    return data.has_submitted;
  }

  async submitAll(input: SubmitResponseInput): Promise<void> {
    // Invoke edge function submit-response to preserve server-trust boundary and RLS
    const { error } = await this.client.functions.invoke('submit-response', {
      body: {
        sessionId: input.sessionId,
        participantId: input.participantId,
        answers: input.answers,
        rankings: input.rankings ?? [],
        avoids: input.avoids ?? [],
      },
    });

    if (error) {
      throw new Error(`Submission failed: ${error.message}`);
    }
  }
}
