import type { SupabaseClient } from '@supabase/supabase-js';
import type { Session, SessionStatus } from '../../domain/session';
import type { SessionRepository, CreateSessionInput } from '../../repositories/sessionRepository';

export class SupabaseSessionRepository implements SessionRepository {
  constructor(private client: SupabaseClient) {}

  async findById(id: string): Promise<Session> {
    const { data, error } = await this.client
      .from('sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new Error(`Session ${id} not found: ${error?.message}`);
    }

    return {
      id: data.id,
      mode: data.mode,
      teamSize: data.team_size,
      status: data.status,
      createdBy: data.created_by,
      createdAt: data.created_at,
      expiresAt: data.expires_at,
    };
  }

  async findAllByOrganizer(organizerId: string): Promise<Session[]> {
    const { data, error } = await this.client
      .from('sessions')
      .select('*')
      .eq('created_by', organizerId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data ?? []).map((row) => ({
      id: row.id,
      mode: row.mode,
      teamSize: row.team_size,
      status: row.status,
      createdBy: row.created_by,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    }));
  }

  async create(input: CreateSessionInput): Promise<Session> {
    const { data, error } = await this.client
      .from('sessions')
      .insert({
        mode: input.mode,
        team_size: input.teamSize,
        status: input.status,
        created_by: input.createdBy,
        expires_at: input.expiresAt,
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to create session: ${error?.message}`);
    }

    return {
      id: data.id,
      mode: data.mode,
      teamSize: data.team_size,
      status: data.status,
      createdBy: data.created_by,
      createdAt: data.created_at,
      expiresAt: data.expires_at,
    };
  }

  async updateStatus(id: string, status: SessionStatus): Promise<void> {
    const { error } = await this.client
      .from('sessions')
      .update({ status })
      .eq('id', id);

    if (error) throw error;
  }

  async deleteById(id: string): Promise<void> {
    const { error } = await this.client
      .from('sessions')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
}
