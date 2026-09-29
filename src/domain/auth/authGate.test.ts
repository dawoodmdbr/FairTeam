import { describe, it, expect, vi } from 'vitest';
import { NameSelectAuthGate } from './nameSelectAuthGate';
import { GoogleRollNumberAuthGate } from './googleRollNumberAuthGate';
import { RollNumberMapper } from './rollNumberMapper';
import { CampusDomainRegistry } from './campusDomainRegistry';
import type { RateLimiter } from './rateLimiter';
import type { ParticipantRepository } from '../../repositories/participantRepository';
import type { Participant } from '../participant';

describe('Auth Gates', () => {
  const dummyRateLimiter: RateLimiter = {
    allow: vi.fn().mockResolvedValue(true),
  };

  const participants: Participant[] = [
    { id: 'p1', sessionId: 's1', name: 'Alice', hasSubmitted: false },
    { id: 'p2', sessionId: 's1', name: 'Bob', hasSubmitted: true },
    { id: 'p3', sessionId: 's2', rollNumber: '24F-3053', hasSubmitted: false },
    { id: 'p4', sessionId: 's2', rollNumber: '22L-1234', hasSubmitted: true },
  ];

  const dummyRepo: Partial<ParticipantRepository> = {
    findBySessionAndName: vi.fn(async (sId, name) => {
      return participants.find((p) => p.sessionId === sId && p.name === name) ?? null;
    }),
    findBySessionAndRollNumber: vi.fn(async (sId, roll) => {
      return participants.find((p) => p.sessionId === sId && p.rollNumber === roll) ?? null;
    }),
  };

  describe('NameSelectAuthGate (Friend Mode)', () => {
    const gate = new NameSelectAuthGate(dummyRateLimiter, dummyRepo as ParticipantRepository);

    it('identifies registered unsubmitted participant', async () => {
      const res = await gate.authenticate('s1', 'Alice', '127.0.0.1');
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.participant.name).toBe('Alice');
      }
    });

    it('rejects unregistered name', async () => {
      const res = await gate.authenticate('s1', 'Charlie', '127.0.0.1');
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toBe('name_not_registered');
      }
    });

    it('rejects already submitted participant', async () => {
      const res = await gate.authenticate('s1', 'Bob', '127.0.0.1');
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toBe('already_submitted');
      }
    });
  });

  describe('GoogleRollNumberAuthGate (Class Mode)', () => {
    const registry = new CampusDomainRegistry();
    const mapper = new RollNumberMapper(registry);
    const gate = new GoogleRollNumberAuthGate(
      mapper,
      dummyRateLimiter,
      dummyRepo as ParticipantRepository
    );

    it('AUTH-1: identifies registered student from Google email via derive-then-check', async () => {
      const res = await gate.authenticate('s2', 'f243053@cfd.nu.edu.pk', '127.0.0.1');
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.participant.rollNumber).toBe('24F-3053');
      }
    });

    it('AUTH-2: rejects student whose derived roll number is not in the list', async () => {
      const res = await gate.authenticate('s2', 'f249999@cfd.nu.edu.pk', '127.0.0.1');
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toBe('roll_number_not_registered');
      }
    });

    it('AUTH-4: rejects non-NU email', async () => {
      const res = await gate.authenticate('s2', 'alice@gmail.com', '127.0.0.1');
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toBe('unsupported_domain');
      }
    });

    it('AUTH-6: rejects already submitted student', async () => {
      const res = await gate.authenticate('s2', 'l221234@lhr.nu.edu.pk', '127.0.0.1');
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toBe('already_submitted');
      }
    });
  });
});
