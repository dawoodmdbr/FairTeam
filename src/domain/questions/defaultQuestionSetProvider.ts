import type { SessionMode } from '../session';
import type { QuestionSet, QuestionSetProvider } from './questionSetProvider';
import { FRIEND_MODE_QUESTIONS } from './friendModeQuestions';
import { CLASS_MODE_QUESTIONS } from './classModeQuestions';

export class DefaultQuestionSetProvider implements QuestionSetProvider {
  async getQuestionSet(mode: SessionMode): Promise<QuestionSet> {
    if (mode === 'friend') {
      return {
        mode: 'friend',
        questions: FRIEND_MODE_QUESTIONS,
      };
    } else {
      return {
        mode: 'class',
        questions: CLASS_MODE_QUESTIONS,
      };
    }
  }
}
