import type { SupabaseClient } from '@supabase/supabase-js';
import type { Participant } from '../../domain/participant';
import type { ParticipantRepository, CreateParticipantInput } from '../../repositories/participantRepository';

export class SupabaseParticipantRepository implements ParticipantRepository {
  constructor(private client: SupabaseClient) {}

  async findById(id: string): Promise<Participant> {
    const { data, error } = await this.client
      .from('participants')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new Error(`Participant ${id} not found: ${error?.message}`);
    }

    return {
      id: data.id,
      sessionId: data.session_id,
      name: data.name ?? undefined,
      rollNumber: data.roll_number ?? undefined,
      hasSubmitted: data.has_submitted,
    };
  }

  async findBySession(sessionId: string): Promise<Participant[]> {
    const { data, error } = await this.client
      .from('participants')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return (data ?? []).map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      name: row.name ?? undefined,
      rollNumber: row.roll_number ?? undefined,
      hasSubmitted: row.has_submitted,
    }));
  }

  async findSubmittedBySession(sessionId: string): Promise<Participant[]> {
    const { data, error } = await this.client
      .from('participants')
      .select('*')
      .eq('session_id', sessionId)
      .eq('has_submitted', true)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return (data ?? []).map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      name: row.name ?? undefined,
      rollNumber: row.roll_number ?? undefined,
      hasSubmitted: row.has_submitted,
    }));
  }

  async findBySessionAndName(sessionId: string, name: string): Promise<Participant | null> {
    const { data, error } = await this.client
      .from('participants')
      .select('*')
      .eq('session_id', sessionId)
      .eq('name', name)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      id: data.id,
      sessionId: data.session_id,
      name: data.name ?? undefined,
      rollNumber: data.roll_number ?? undefined,
      hasSubmitted: data.has_submitted,
    };
  }

  async findBySessionAndRollNumber(
    sessionId: string,
    rollNumber: string
  ): Promise<Participant | null> {
    const { data, error } = await this.client
      .from('participants')
      .select('*')
      .eq('session_id', sessionId)
      .eq('roll_number', rollNumber)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      id: data.id,
      sessionId: data.session_id,
      name: data.name ?? undefined,
      rollNumber: data.roll_number ?? undefined,
      hasSubmitted: data.has_submitted,
    };
  }

  async create(input: CreateParticipantInput): Promise<Participant> {
    const { data, error } = await this.client
      .from('participants')
      .insert({
        session_id: input.sessionId,
        name: input.name ?? null,
        roll_number: input.rollNumber ?? null,
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to create participant: ${error?.message}`);
    }

    return {
      id: data.id,
      sessionId: data.session_id,
      name: data.name ?? undefined,
      rollNumber: data.roll_number ?? undefined,
      hasSubmitted: data.has_submitted,
    };
  }

  async update(
    id: string,
    updates: Partial<Pick<Participant, 'name' | 'rollNumber'>>
  ): Promise<Participant> {
    const { data, error } = await this.client
      .from('participants')
      .update({
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.rollNumber !== undefined ? { roll_number: updates.rollNumber } : {}),
      })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to update participant: ${error?.message}`);
    }

    return {
      id: data.id,
      sessionId: data.session_id,
      name: data.name ?? undefined,
      rollNumber: data.roll_number ?? undefined,
      hasSubmitted: data.has_submitted,
    };
  }

  async markSubmitted(id: string): Promise<void> {
    const { error } = await this.client
      .from('participants')
      .update({ has_submitted: true })
      .eq('id', id);

    if (error) throw error;
  }

  async deleteById(id: string): Promise<void> {
    const { error } = await this.client
      .from('participants')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
}
