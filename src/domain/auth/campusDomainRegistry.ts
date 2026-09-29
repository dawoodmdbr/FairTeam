/**
 * CampusDomainRegistry — lookup table mapping campus letter to NU email domain.
 * Supported campuses: F (Chiniot-Faisalabad), L (Lahore), I (Islamabad).
 *
 * To add a new campus: add one entry to CAMPUS_DOMAINS — no code logic changes needed.
 * This satisfies the Open/Closed requirement at the data/config layer.
 */

const CAMPUS_DOMAINS: Record<string, string> = {
  F: 'cfd.nu.edu.pk',
  L: 'lhr.nu.edu.pk',
  I: 'isb.nu.edu.pk',
};

export class CampusDomainRegistry {
  /** Returns the email domain for a given campus letter, or undefined if unsupported. */
  domainFor(letter: string): string | undefined {
    return CAMPUS_DOMAINS[letter.toUpperCase()];
  }

  /** Returns the campus letter for a given domain, or undefined if unsupported. */
  letterForDomain(domain: string): string | undefined {
    return Object.entries(CAMPUS_DOMAINS).find(([, d]) => d === domain)?.[0];
  }

  /** Returns all supported campus letters. */
  supportedLetters(): string[] {
    return Object.keys(CAMPUS_DOMAINS);
  }
}
