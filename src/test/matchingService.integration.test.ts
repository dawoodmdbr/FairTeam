import { describe, it, expect, vi } from 'vitest';
import { MatchingService } from '../application/matchingService';
import { DefaultQuestionSetProvider } from '../domain/questions/defaultQuestionSetProvider';
import type { SessionRepository, CreateSessionInput } from '../repositories/sessionRepository';
import type { ParticipantRepository, CreateParticipantInput } from '../repositories/participantRepository';
import type { ResponseRepository, SubmitResponseInput } from '../repositories/responseRepository';
import type { TeamRepository } from '../repositories/teamRepository';
import type { Session } from '../domain/session';
import type { Participant } from '../domain/participant';

describe('MatchingService Orchestration (Integration)', () => {
  const sessionStore: Record<string, Session> = {};
  const participantStore: Record<string, Participant> = {};
  let winningTeamsSaved: any[] = [];
  let alternativeGroupingsSaved: any[] = [];

  const mockSessionRepo: SessionRepository = {
    findById: vi.fn(async (id: string) => {
      const s = sessionStore[id];
      if (!s) throw new Error('Session not found');
      return s;
    }),
    findAllByOrganizer: vi.fn(async (orgId: string) => {
      return Object.values(sessionStore).filter((s) => s.createdBy === orgId);
    }),
    create: vi.fn(async (input: CreateSessionInput) => {
      const s: Session = {
        id: `sess-${crypto.randomUUID()}`,
        mode: input.mode,
        teamSize: input.teamSize,
        status: input.status,
        createdBy: input.createdBy,
        createdAt: new Date().toISOString(),
        expiresAt: input.expiresAt,
      };
      sessionStore[s.id] = s;
      return s;
    }),
    updateStatus: vi.fn(async (id: string, status) => {
      if (sessionStore[id]) {
        sessionStore[id].status = status;
      }
    }),
    deleteById: vi.fn(async (id: string) => {
      delete sessionStore[id];
    }),
  };

  const mockParticipantRepo: ParticipantRepository = {
    findById: vi.fn(async (id: string) => participantStore[id]),
    findBySession: vi.fn(async (sId: string) =>
      Object.values(participantStore).filter((p) => p.sessionId === sId)
    ),
    findSubmittedBySession: vi.fn(async (sId: string) =>
      Object.values(participantStore).filter((p) => p.sessionId === sId && p.hasSubmitted)
    ),
    findBySessionAndName: vi.fn(async (sId: string, name: string) =>
      Object.values(participantStore).find((p) => p.sessionId === sId && p.name === name) ?? null
    ),
    findBySessionAndRollNumber: vi.fn(async (sId: string, roll: string) =>
      Object.values(participantStore).find((p) => p.sessionId === sId && p.rollNumber === roll) ?? null
    ),
    create: vi.fn(async (input: CreateParticipantInput) => {
      const p: Participant = {
        id: `p-${Date.now()}-${Math.random()}`,
        sessionId: input.sessionId,
        name: input.name,
        rollNumber: input.rollNumber,
        hasSubmitted: false,
      };
      participantStore[p.id] = p;
      return p;
    }),
    update: vi.fn(async (id: string, updates) => {
      const p = participantStore[id];
      Object.assign(p, updates);
      return p;
    }),
    markSubmitted: vi.fn(async (id: string) => {
      if (participantStore[id]) {
        participantStore[id].hasSubmitted = true;
      }
    }),
    deleteById: vi.fn(async (id: string) => {
      delete participantStore[id];
    }),
  };

  const mockResponseRepo: ResponseRepository = {
    findAllBySession: vi.fn(async () => ({
      rankings: [],
      avoids: [],
      answers: [],
    })),
    findAnswersByParticipant: vi.fn(async () => []),
    hasSubmitted: vi.fn(async (id: string) => participantStore[id]?.hasSubmitted ?? false),
    submitAll: vi.fn(async (_input: SubmitResponseInput) => {}),
  };

  const mockTeamRepo: TeamRepository = {
    findBySession: vi.fn(async () => []),
    findAlternativesBySession: vi.fn(async () => []),
    saveWinningGrouping: vi.fn(async (_sId, winner) => {
      winningTeamsSaved = winner.teams;
    }),
    saveAlternativeGroupings: vi.fn(async (_sId, alternatives) => {
      alternativeGroupingsSaved = alternatives;
    }),
  };

  const questionProvider = new DefaultQuestionSetProvider();

  const service = new MatchingService(
    mockSessionRepo,
    mockParticipantRepo,
    mockResponseRepo,
    mockTeamRepo,
    questionProvider
  );

  it('orchestrates complete Friend Mode flow: create -> add -> submit -> reveal -> locked', async () => {
    // 1. Create session
    const session = await service.createSession({
      mode: 'friend',
      teamSize: 3,
      status: 'draft',
      createdBy: 'org-1',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(session.status).toBe('draft');

    // 2. Open session
    await service.openSession(session.id);
    expect(sessionStore[session.id].status).toBe('open');

    // 3. Add 6 participants
    const p1 = await service.addParticipant({ sessionId: session.id, name: 'User 1' });
    const p2 = await service.addParticipant({ sessionId: session.id, name: 'User 2' });
    const p3 = await service.addParticipant({ sessionId: session.id, name: 'User 3' });
    const p4 = await service.addParticipant({ sessionId: session.id, name: 'User 4' });
    const p5 = await service.addParticipant({ sessionId: session.id, name: 'User 5' });
    const p6 = await service.addParticipant({ sessionId: session.id, name: 'User 6' });

    // 4. Submit responses
    for (const p of [p1, p2, p3, p4, p5, p6]) {
      await service.submitResponses({
        sessionId: session.id,
        participantId: p.id,
        answers: [],
      });
    }

    // 5. Verify double-submission is blocked (FLOW-3, NFR-TEST-5)
    await expect(
      service.submitResponses({
        sessionId: session.id,
        participantId: p1.id,
        answers: [],
      })
    ).rejects.toThrow('Participant has already submitted');

    // 6. Reveal results
    await service.revealResults(session.id);

    // Verify session state is locked (terminal)
    expect(sessionStore[session.id].status).toBe('locked');
    expect(winningTeamsSaved.length).toBe(2); // 6 / 3 = 2 teams
    expect(alternativeGroupingsSaved).toBeDefined();

    // 7. Verify participant edit/remove is blocked after lock (FEAT-3)
    await expect(
      service.editParticipant(p1.id, { name: 'Renamed' })
    ).rejects.toThrow('Cannot edit participants in a locked or expired session');

    await expect(
      service.removeParticipant(p1.id)
    ).rejects.toThrow('Cannot remove participants from a locked or expired session');
  });

  it('FEAT-4: duplicateSession duplicates configuration only with zero participants carried over', async () => {
    const original = await service.createSession({
      mode: 'class',
      teamSize: 4,
      status: 'open',
      createdBy: 'prof-1',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });

    await service.addParticipant({ sessionId: original.id, rollNumber: '24F-1111' });

    const duplicated = await service.duplicateSession(original.id, 'prof-1');
    expect(duplicated.mode).toBe('class');
    expect(duplicated.teamSize).toBe(4);
    expect(duplicated.status).toBe('draft');
    expect(duplicated.id).not.toBe(original.id);

    // Verify zero participants carried over
    const participantsInDuplicate = await service.getParticipants(duplicated.id);
    expect(participantsInDuplicate.length).toBe(0);
  });
});
