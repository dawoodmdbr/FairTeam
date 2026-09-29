import type { SessionMode } from '../session';

/** Question display/scoring type. */
export type QuestionType = 'scale' | 'single_choice' | 'multi_select';

/** A single compatibility question, loaded from the database. */
export interface QuestionDefinition {
  id: string;
  mode: SessionMode;
  text: string;
  type: QuestionType;
  /** Options for single_choice/multi_select; scale bounds for scale type. */
  options?: string[];
  sortOrder: number;
}

/** The full set of questions for a given mode. */
export interface QuestionSet {
  mode: SessionMode;
  questions: QuestionDefinition[];
}

/** Provides the question set for a given session mode.
 * Adding a new question set = new data INSERT, no code change (Open/Closed principle). */
export interface QuestionSetProvider {
  getQuestionSet(mode: SessionMode): Promise<QuestionSet>;
}
