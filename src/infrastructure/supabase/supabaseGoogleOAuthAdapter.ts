import type { SupabaseClient } from '@supabase/supabase-js';

export class SupabaseGoogleOAuthAdapter {
  constructor(private client: SupabaseClient) {}

  async signInWithGoogle(redirectTo?: string): Promise<{ url?: string; error?: string }> {
    const { data, error } = await this.client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo ?? window.location.href,
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account',
        },
      },
    });

    if (error) {
      return { error: error.message };
    }
    return { url: data.url ?? undefined };
  }

  async getAuthenticatedGoogleEmail(): Promise<string | null> {
    const { data: { user } } = await this.client.auth.getUser();
    return user?.email ?? null;
  }
}
