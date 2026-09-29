import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CAMPUS_DOMAINS: Record<string, string> = {
  F: 'cfd.nu.edu.pk',
  L: 'lhr.nu.edu.pk',
  I: 'isb.nu.edu.pk',
};

const EMAIL_PATTERN = /^([a-z])(\d{2})(\d{4})@([a-z.]+)$/;

function toRollNumber(email: string): string | null {
  const match = EMAIL_PATTERN.exec(email.toLowerCase().trim());
  if (!match) return null;
  const [, letter, batch, roll, domain] = match;
  const mappedLetter = Object.entries(CAMPUS_DOMAINS).find(([, d]) => d === domain)?.[0];
  if (!mappedLetter || mappedLetter.toLowerCase() !== letter) return null;
  return `${batch}${mappedLetter}-${roll}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const client = createClient(supabaseUrl, supabaseServiceKey);

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown-ip';
    const body = await req.json();
    const { sessionId, mode, name, googleEmail } = body;

    if (!sessionId || !mode) {
      return new Response(
        JSON.stringify({ error: { code: 'bad_request', message: 'Missing sessionId or mode' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rate limiting: 5 attempts per 60s window
    const windowStart = new Date(Date.now() - 60_000).toISOString();
    const { count } = await client
      .from('rate_limit_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('identifier', clientIp)
      .eq('endpoint', 'identify-participant')
      .gte('attempted_at', windowStart);

    await client.from('rate_limit_attempts').insert({
      identifier: clientIp,
      endpoint: 'identify-participant',
    });

    if ((count ?? 0) >= 5) {
      return new Response(
        JSON.stringify({
          error: {
            code: 'rate_limited',
            message: 'Too many identification attempts. Please wait 60 seconds before trying again.',
          },
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check session
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
            message: `This session is currently ${session.status} and cannot accept submissions.`,
          },
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let participant;

    if (mode === 'friend') {
      if (!name) {
        return new Response(
          JSON.stringify({ error: { code: 'bad_request', message: 'Name is required for Friend Mode' } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const { data: p, error: pErr } = await client
        .from('participants')
        .select('*')
        .eq('session_id', sessionId)
        .eq('name', name)
        .maybeSingle();

      if (pErr || !p) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'name_not_registered',
              message: 'This name is not registered in this session. Please check with your group organizer.',
            },
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      participant = p;
    } else if (mode === 'class') {
      if (!googleEmail) {
        return new Response(
          JSON.stringify({ error: { code: 'bad_request', message: 'Google email is required for Class Mode' } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const derivedRollNumber = toRollNumber(googleEmail);
      if (!derivedRollNumber) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'unsupported_domain',
              message:
                'Only @cfd.nu.edu.pk, @lhr.nu.edu.pk, and @isb.nu.edu.pk student Google accounts are accepted.',
            },
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: p, error: pErr } = await client
        .from('participants')
        .select('*')
        .eq('session_id', sessionId)
        .eq('roll_number', derivedRollNumber)
        .maybeSingle();

      if (pErr || !p) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'roll_number_not_registered',
              message: `Roll number ${derivedRollNumber} is not pre-registered for this session. Contact your TA or instructor.`,
            },
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      participant = p;
    }

    if (participant.has_submitted) {
      return new Response(
        JSON.stringify({
          error: {
            code: 'already_submitted',
            message: 'You have already submitted your responses for this session. Edits are not permitted.',
          },
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, participant }),
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
