import { describe, it, expect } from 'vitest';
import { RollNumberMapper } from './rollNumberMapper';
import { CampusDomainRegistry } from './campusDomainRegistry';

describe('RollNumberMapper & CampusDomainRegistry', () => {
  const registry = new CampusDomainRegistry();
  const mapper = new RollNumberMapper(registry);

  it('AUTH-1: maps valid roll number to correct NU university email', () => {
    expect(mapper.toEmail('24F-3053')).toBe('f243053@cfd.nu.edu.pk');
    expect(mapper.toEmail('22L-1234')).toBe('l221234@lhr.nu.edu.pk');
    expect(mapper.toEmail('23I-9999')).toBe('i239999@isb.nu.edu.pk');
  });

  it('AUTH-1: reverse maps email back to roll number correctly', () => {
    expect(mapper.toRollNumber('f243053@cfd.nu.edu.pk')).toBe('24F-3053');
    expect(mapper.toRollNumber('l221234@lhr.nu.edu.pk')).toBe('22L-1234');
    expect(mapper.toRollNumber('i239999@isb.nu.edu.pk')).toBe('23I-9999');
  });

  it('AUTH-3: rejects email if campus letter does not match domain', () => {
    // Letter says 'f' but domain says 'lhr.nu.edu.pk'
    expect(mapper.toRollNumber('f243053@lhr.nu.edu.pk')).toBeNull();
  });

  it('AUTH-4: rejects non-NU email', () => {
    expect(mapper.toRollNumber('student123@gmail.com')).toBeNull();
    expect(mapper.toRollNumber('f243053@hotmail.com')).toBeNull();
  });

  it('AUTH-5: rejects unsupported NU campuses (e.g. Karachi or Peshawar)', () => {
    expect(mapper.toRollNumber('k243053@khi.nu.edu.pk')).toBeNull();
    expect(mapper.toRollNumber('p243053@pwr.nu.edu.pk')).toBeNull();
  });

  it('AUTH-8: rejects malformed roll numbers', () => {
    expect(mapper.toEmail('24F-305')).toBeNull(); // 3 digits
    expect(mapper.toEmail('24F-30531')).toBeNull(); // 5 digits
    expect(mapper.toEmail('2F-3053')).toBeNull(); // 1 digit batch
    expect(mapper.toEmail('24X-3053')).toBeNull(); // unsupported campus letter 'X'
  });
});
