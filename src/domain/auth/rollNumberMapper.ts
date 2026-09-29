import type { CampusDomainRegistry } from './campusDomainRegistry';

/** Roll number format: 24F-3053 (2-digit batch, campus letter, 4-digit roll). */
const ROLL_NUMBER_PATTERN = /^(\d{2})([A-Za-z])-(\d{4})$/;

/** Email format: f243053@cfd.nu.edu.pk (campus letter lowercase, batch, roll, @domain). */
const EMAIL_PATTERN = /^([a-z])(\d{2})(\d{4})@([a-z.]+)$/;

/**
 * RollNumberMapper — converts between roll number format and NU university email format.
 * Example: '24F-3053' ↔ 'f243053@cfd.nu.edu.pk'
 *
 * This is the sole authority on the roll-number ↔ email mapping rule.
 * Isolates a fiddly string-format rule from all other code (SRP).
 */
export class RollNumberMapper {
  constructor(private registry: CampusDomainRegistry) {}

  /** Converts '24F-3053' → 'f243053@cfd.nu.edu.pk', or null if malformed/unsupported campus. */
  toEmail(rollNumber: string): string | null {
    const match = ROLL_NUMBER_PATTERN.exec(rollNumber);
    if (!match) return null;
    const [, batch, letter, roll] = match;
    const domain = this.registry.domainFor(letter);
    if (!domain) return null;
    return `${letter.toLowerCase()}${batch}${roll}@${domain}`;
  }

  /** Converts 'f243053@cfd.nu.edu.pk' → '24F-3053', or null if malformed/unsupported domain. */
  toRollNumber(email: string): string | null {
    const match = EMAIL_PATTERN.exec(email.toLowerCase());
    if (!match) return null;
    const [, letter, batch, roll, domain] = match;
    const mappedLetter = this.registry.letterForDomain(domain);
    // Verify: the campus letter in the email must match the letter for that domain.
    if (!mappedLetter || mappedLetter.toLowerCase() !== letter) return null;
    return `${batch}${mappedLetter}-${roll}`;
  }
}
