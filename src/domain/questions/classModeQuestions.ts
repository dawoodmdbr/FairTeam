import type { QuestionDefinition } from './questionSetProvider';

export const CLASS_MODE_QUESTIONS: QuestionDefinition[] = [
  {
    id: 'c-1',
    mode: 'class',
    text: 'Weekly hours available for coursework project',
    type: 'single_choice',
    options: ['0-5', '5-10', '10-15', '15+'],
    sortOrder: 1,
  },
  {
    id: 'c-2',
    mode: 'class',
    text: 'Prefers coding vs. testing vs. documentation',
    type: 'multi_select',
    options: ['Coding', 'Testing', 'Documentation'],
    sortOrder: 2,
  },
  {
    id: 'c-3',
    mode: 'class',
    text: 'Prefers leading vs. following in a group',
    type: 'scale',
    options: ['1', '5'],
    sortOrder: 3,
  },
  {
    id: 'c-4',
    mode: 'class',
    text: "Comfort level in this course's subject area",
    type: 'scale',
    options: ['1', '5'],
    sortOrder: 4,
  },
  {
    id: 'c-5',
    mode: 'class',
    text: 'Preferred meeting style',
    type: 'single_choice',
    options: ['In-person', 'Online'],
    sortOrder: 5,
  },
  {
    id: 'c-6',
    mode: 'class',
    text: 'Work rhythm: early starter vs. last-minute pusher',
    type: 'scale',
    options: ['1', '5'],
    sortOrder: 6,
  },
];
