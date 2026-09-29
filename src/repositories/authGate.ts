/** Organizer authentication gate interface.
 * Implementations: SupabaseAuthGate (Supabase Auth), EnvCredentialsAuthGate (fallback). */
export interface AuthGate {
  /** Returns true if the current request comes from an authenticated organizer. */
  isAuthenticated(): Promise<boolean>;
  /** Returns the organizer's user ID, or null if not authenticated. */
  getOrganizerId(): Promise<string | null>;
}
