import type { Participant } from '../domain/participant';

/** Input for creating a new participant. */
export interface CreateParticipantInput {
  sessionId: string;
  name?: string;
  rollNumber?: string;
}

/** Repository interface for Participant persistence. */
export interface ParticipantRepository {
  findById(id: string): Promise<Participant>;
  findBySession(sessionId: string): Promise<Participant[]>;
  findSubmittedBySession(sessionId: string): Promise<Participant[]>;
  findBySessionAndName(sessionId: string, name: string): Promise<Participant | null>;
  findBySessionAndRollNumber(
    sessionId: string,
    rollNumber: string
  ): Promise<Participant | null>;
  create(input: CreateParticipantInput): Promise<Participant>;
  update(id: string, updates: Partial<Pick<Participant, 'name' | 'rollNumber'>>): Promise<Participant>;
  markSubmitted(id: string): Promise<void>;
  deleteById(id: string): Promise<void>;
}
