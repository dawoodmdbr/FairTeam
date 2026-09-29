import type { Session, SessionMode, SessionStatus } from '../domain/session';

/** Input for creating a new session. */
export interface CreateSessionInput {
  mode: SessionMode;
  teamSize: number;
  status: SessionStatus;
  createdBy: string;
  expiresAt: string;
}

/** Repository interface for Session persistence. Domain and application code depend only on this. */
export interface SessionRepository {
  findById(id: string): Promise<Session>;
  findAllByOrganizer(organizerId: string): Promise<Session[]>;
  create(input: CreateSessionInput): Promise<Session>;
  updateStatus(id: string, status: SessionStatus): Promise<void>;
  deleteById(id: string): Promise<void>;
}
