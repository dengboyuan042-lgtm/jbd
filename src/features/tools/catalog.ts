/**
 * Client-side mirror of the server tool registry.
 *
 * The server remains the source of truth for behaviour; this carries only the
 * presentation metadata so the tool grid renders without a round trip.
 */
export type ToolMeta = {
  id: string;
  label: string;
  description: string;
  icon: string;
  group: 'understand' | 'study' | 'produce';
  output: 'note' | 'flashcards' | 'quiz' | 'mind-map' | 'tasks';
};

export const TOOL_CATALOG: ToolMeta[] = [
  {
    id: 'summary',
    label: 'Summary',
    description: 'Structured overview of the material.',
    icon: 'AlignLeft',
    group: 'understand',
    output: 'note',
  },
  {
    id: 'key-points',
    label: 'Key points',
    description: 'The essential takeaways.',
    icon: 'List',
    group: 'understand',
    output: 'note',
  },
  {
    id: 'action-items',
    label: 'Action items',
    description: 'Commitments, owners and deadlines.',
    icon: 'CheckSquare',
    group: 'understand',
    output: 'tasks',
  },
  {
    id: 'timeline',
    label: 'Timeline',
    description: 'Dated events in order.',
    icon: 'CalendarRange',
    group: 'understand',
    output: 'note',
  },
  {
    id: 'glossary',
    label: 'Glossary',
    description: 'Domain terms with definitions.',
    icon: 'BookA',
    group: 'understand',
    output: 'note',
  },
  {
    id: 'faq',
    label: 'FAQ',
    description: 'Questions this material answers.',
    icon: 'MessagesSquare',
    group: 'understand',
    output: 'note',
  },
  {
    id: 'flashcards',
    label: 'Flashcards',
    description: 'Reviewable deck with spaced repetition.',
    icon: 'Layers',
    group: 'study',
    output: 'flashcards',
  },
  {
    id: 'quiz',
    label: 'Quiz',
    description: 'Mixed questions with explanations.',
    icon: 'CircleHelp',
    group: 'study',
    output: 'quiz',
  },
  {
    id: 'study-guide',
    label: 'Study guide',
    description: 'Sections, terms and self-checks.',
    icon: 'GraduationCap',
    group: 'study',
    output: 'note',
  },
  {
    id: 'mind-map',
    label: 'Mind map',
    description: 'Navigable map of concepts.',
    icon: 'Network',
    group: 'study',
    output: 'mind-map',
  },
  {
    id: 'meeting-notes',
    label: 'Meeting notes',
    description: 'Decisions, actions and questions.',
    icon: 'NotepadText',
    group: 'produce',
    output: 'note',
  },
  {
    id: 'research-report',
    label: 'Research report',
    description: 'Findings with sources.',
    icon: 'FileText',
    group: 'produce',
    output: 'note',
  },
  {
    id: 'presentation-outline',
    label: 'Presentation outline',
    description: 'Slide-by-slide narrative.',
    icon: 'Presentation',
    group: 'produce',
    output: 'note',
  },
];
