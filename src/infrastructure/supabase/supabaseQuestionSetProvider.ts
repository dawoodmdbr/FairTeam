import type { SupabaseClient } from '@supabase/supabase-js';
import type { SessionMode } from '../../domain/session';
import type { QuestionSet, QuestionSetProvider } from '../../domain/questions/questionSetProvider';
import { DefaultQuestionSetProvider } from '../../domain/questions/defaultQuestionSetProvider';

export class SupabaseQuestionSetProvider implements QuestionSetProvider {
  private fallback = new DefaultQuestionSetProvider();

  constructor(private client: SupabaseClient) {}

  async getQuestionSet(mode: SessionMode): Promise<QuestionSet> {
    try {
      const { data, error } = await this.client
        .from('question_definitions')
        .select('*')
        .eq('mode', mode)
        .order('sort_order', { ascending: true });

      if (error || !data || data.length === 0) {
        return this.fallback.getQuestionSet(mode);
      }

      return {
        mode,
        questions: data.map((row) => ({
          id: row.id,
          mode: row.mode,
          text: row.text,
          type: row.type,
          options: Array.isArray(row.options) ? row.options : undefined,
          sortOrder: row.sort_order,
        })),
      };
    } catch {
      return this.fallback.getQuestionSet(mode);
    }
  }
}
