import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const client = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const sessionId = url.searchParams.get('sessionId');

    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: { code: 'bad_request', message: 'Missing sessionId query param' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: session } = await client.from('sessions').select('*').eq('id', sessionId).single();
    if (!session) {
      return new Response(
        JSON.stringify({ error: { code: 'not_found', message: 'Session not found' } }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: teams } = await client
      .from('teams')
      .select('*, team_memberships(participant_id, participants(name, roll_number))')
      .eq('session_id', sessionId)
      .order('team_number');

    const rows: string[][] = [['Team', 'Participant Name', 'Roll Number', 'Team Fairness Score']];
    (teams ?? []).forEach((t: any) => {
      const memberships = t.team_memberships ?? [];
      memberships.forEach((m: any) => {
        const p = m.participants;
        rows.push([
          `Team ${t.team_number}`,
          p?.name ?? '',
          p?.roll_number ?? '',
          String(Number(t.fairness_score).toFixed(2)),
        ]);
      });
    });

    const csvContent = rows.map((r) => r.map(escapeCsvField).join(',')).join('\n');

    return new Response(csvContent, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="fairteam-session-${sessionId}.csv"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: { code: 'server_error', message } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
