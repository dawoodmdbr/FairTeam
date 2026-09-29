import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const client = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { sessionId, participantId, answers, rankings, avoids } = body;

    if (!sessionId || !participantId || !Array.isArray(answers)) {
      return new Response(
        JSON.stringify({ error: { code: 'bad_request', message: 'Missing sessionId, participantId, or answers' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check session status
    const { data: session, error: sessionErr } = await client
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sessionErr || !session) {
      return new Response(
        JSON.stringify({ error: { code: 'session_not_found', message: 'Session not found' } }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (session.status !== 'open') {
      return new Response(
        JSON.stringify({
          error: {
            code: 'session_not_open',
            message: `Submissions are closed because this session is ${session.status}.`,
          },
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check participant
    const { data: participant, error: pErr } = await client
      .from('participants')
      .select('*')
      .eq('id', participantId)
      .eq('session_id', sessionId)
      .single();

    if (pErr || !participant) {
      return new Response(
        JSON.stringify({ error: { code: 'participant_not_found', message: 'Participant not found in this session' } }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (participant.has_submitted) {
      return new Response(
        JSON.stringify({ error: { code: 'already_submitted', message: 'Participant has already submitted' } }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify all mandatory questions for this mode are answered
    const { data: questions, error: qErr } = await client
      .from('question_definitions')
      .select('*')
      .eq('mode', session.mode);

    if (qErr || !questions) {
      return new Response(
        JSON.stringify({ error: { code: 'server_error', message: 'Failed to load question definitions' } }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const answeredQIds = new Set(answers.map((a: { questionId: string }) => a.questionId));
    const missingQuestions = questions.filter((q) => !answeredQIds.has(q.id));
    if (missingQuestions.length > 0) {
      return new Response(
        JSON.stringify({
          error: {
            code: 'incomplete_answers',
            message: 'All compatibility questions are mandatory. No skipping is permitted.',
          },
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If Friend Mode, validate rankings (mandatory 3-5 choices, no self ranking)
    if (session.mode === 'friend') {
      if (!Array.isArray(rankings) || rankings.length < 3 || rankings.length > 5) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'invalid_rankings',
              message: 'You must rank between 3 and 5 teammates.',
            },
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      for (const r of rankings) {
        if (r.rankedParticipantId === participantId) {
          return new Response(
            JSON.stringify({
              error: { code: 'self_ranking', message: 'You cannot rank yourself.' },
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    // Save Question Responses
    const questionInserts = answers.map((ans: { questionId: string; value: unknown }) => ({
      participant_id: participantId,
      question_id: ans.questionId,
      value: ans.value,
    }));

    const { error: insQErr } = await client
      .from('question_responses')
      .upsert(questionInserts, { onConflict: 'participant_id,question_id' });

    if (insQErr) throw insQErr;

    // Save Rankings if Friend Mode
    if (session.mode === 'friend' && Array.isArray(rankings) && rankings.length > 0) {
      const rankingInserts = rankings.map((r: { rankedParticipantId: string; position: number }) => ({
        participant_id: participantId,
        ranked_participant_id: r.rankedParticipantId,
        position: r.position,
      }));

      const { error: rankErr } = await client
        .from('ranking_responses')
        .upsert(rankingInserts, { onConflict: 'participant_id,ranked_participant_id' });

      if (rankErr) throw rankErr;
    }

    // Save Avoids if Friend Mode and provided
    if (session.mode === 'friend' && Array.isArray(avoids) && avoids.length > 0) {
      const avoidInserts = avoids
        .filter((a: { avoidedParticipantId: string }) => a.avoidedParticipantId !== participantId)
        .map((a: { avoidedParticipantId: string }) => ({
          participant_id: participantId,
          avoided_participant_id: a.avoidedParticipantId,
        }));

      if (avoidInserts.length > 0) {
        const { error: avoidErr } = await client
          .from('avoid_responses')
          .upsert(avoidInserts, { onConflict: 'participant_id,avoided_participant_id' });

        if (avoidErr) throw avoidErr;
      }
    }

    // Mark participant as submitted
    const { error: updateErr } = await client
      .from('participants')
      .update({ has_submitted: true })
      .eq('id', participantId);

    if (updateErr) throw updateErr;

    return new Response(
      JSON.stringify({ success: true, message: 'Response submitted successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: { code: 'server_error', message } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
