import { customAlphabet } from 'nanoid';

const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
const generate = customAlphabet(alphabet, 20);

/** Prefixed, URL-safe, sortable-enough identifiers: `doc_k3f9…` */
export function newId(prefix?: string): string {
  const raw = generate();
  return prefix ? `${prefix}_${raw}` : raw;
}

export const ids = {
  user: () => newId('usr'),
  session: () => newId('ses'),
  project: () => newId('prj'),
  source: () => newId('src'),
  file: () => newId('fil'),
  document: () => newId('doc'),
  chunk: () => newId('chk'),
  embedding: () => newId('emb'),
  recording: () => newId('rec'),
  transcript: () => newId('trs'),
  segment: () => newId('seg'),
  speaker: () => newId('spk'),
  note: () => newId('not'),
  chat: () => newId('cht'),
  message: () => newId('msg'),
  flashcard: () => newId('fcd'),
  deck: () => newId('dck'),
  quiz: () => newId('quz'),
  question: () => newId('qst'),
  attempt: () => newId('att'),
  mindMap: () => newId('map'),
  task: () => newId('tsk'),
  memory: () => newId('mem'),
  job: () => newId('job'),
  activity: () => newId('act'),
  tag: () => newId('tag'),
};
