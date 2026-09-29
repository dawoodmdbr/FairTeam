/** Rate limiter interface — implemented by SupabaseRateLimiter.
 * Used by auth gates to throttle repeated sign-in attempts per identifier. */
export interface RateLimiter {
  /**
   * Returns true if the request should be allowed, false if it should be blocked.
   * Always records the attempt regardless of the return value.
   * @param identifier IP address or roll number
   * @param endpoint The endpoint being rate-limited (e.g. 'identify-participant')
   */
  allow(identifier: string, endpoint: string): Promise<boolean>;
}
