import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthGate } from '../../repositories/authGate';

export class SupabaseAuthGate implements AuthGate {
  constructor(private client: SupabaseClient) {}

  async isAuthenticated(): Promise<boolean> {
    const { data: { session } } = await this.client.auth.getSession();
    return !!session;
  }

  async getOrganizerId(): Promise<string | null> {
    const { data: { user } } = await this.client.auth.getUser();
    return user ? user.id : null;
  }
}
