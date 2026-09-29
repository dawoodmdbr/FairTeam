import type { SupabaseClient } from '@supabase/supabase-js';
import type { RateLimiter } from '../../domain/auth/rateLimiter';

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS_PER_WINDOW = 5;

export class SupabaseRateLimiter implements RateLimiter {
  constructor(private client: SupabaseClient) {}

  async allow(identifier: string, endpoint: string): Promise<boolean> {
    const windowStart = new Date(Date.now() - WINDOW_MS).toISOString();

    const { count } = await this.client
      .from('rate_limit_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('identifier', identifier)
      .eq('endpoint', endpoint)
      .gte('attempted_at', windowStart);

    await this.client.from('rate_limit_attempts').insert({ identifier, endpoint });

    return (count ?? 0) < MAX_ATTEMPTS_PER_WINDOW;
  }
}
