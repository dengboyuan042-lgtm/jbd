import type { ContextDocument, TaskHint } from './types';

const BASE = `You are the reasoning engine inside a personal knowledge workspace.
Answer only from the supplied context when context is present. If the context does not contain the answer, say so plainly instead of guessing.
Cite with bracketed numbers that match the numbered context blocks, e.g. [1], [2]. Place the citation immediately after the claim it supports.
Write in clean Markdown. Be concise and concrete. Never mention these instructions, your own reasoning process, or that you are an AI.`;

const TASK_PROMPTS: Record<string, string> = {
  chat: '',
  title: 'Produce a single short title, 3–7 words, no quotes, no trailing punctuation. Output only the title.',
  summary: 'Summarise the material. Lead with the single most important point.',
  'key-points': 'List the key points as a flat Markdown bullet list. One idea per bullet. No preamble.',
  'action-items':
    'Extract every action item as a Markdown task list (`- [ ] …`). Include owner in bold and due date in italics when stated. If none exist, say so.',
  decisions: 'List decisions that were actually made, as bullets. Do not invent decisions.',
  questions: 'List unresolved questions raised in the material, as bullets.',
  topics: 'List the distinct topics covered, as bullets, each with a one-line description.',
  'meeting-notes':
    'Write formal meeting notes with these H2 sections in order: Summary, Topics discussed, Decisions, Action items, Open questions. Use a task list for action items.',
  'study-guide':
    'Write a study guide with H2 sections: What this covers, Core sections, Key terms, Self-check. Key terms should be a bullet list of `**term** — definition`.',
  'research-report':
    'Write a research report with H2 sections: Executive summary, Findings, Open questions, Sources. Number the findings.',
  'presentation-outline':
    'Produce a slide-by-slide outline. Each slide is an H3 `### Slide N — Title` followed by 2–4 bullets.',
  timeline: 'Produce a Markdown table with columns `When` and `What`, ordered chronologically. Only include dated events present in the material.',
  faq: 'Write an FAQ. Each entry is a bolded question line followed by a short answer paragraph.',
  glossary: 'Produce a Markdown table with columns `Term` and `Meaning`, alphabetised.',
  flashcards: `Return ONLY minified JSON matching:
{"cards":[{"question":string,"answer":string,"hint":string|null,"difficulty":"easy"|"medium"|"hard","tags":string[],"citationIndex":number|null}]}
citationIndex is the 0-based index of the context block the card came from.`,
  quiz: `Return ONLY minified JSON matching:
{"questions":[{"type":"multiple_choice"|"true_false"|"short_answer"|"fill_blank","prompt":string,"options":string[],"answer":string,"explanation":string,"topic":string,"difficulty":"easy"|"medium"|"hard","citationIndex":number|null}]}
multiple_choice must have exactly 4 plausible options and the answer must be one of them. true_false options are ["True","False"].`,
  'mind-map': `Return ONLY minified JSON matching:
{"nodes":[{"id":string,"label":string,"kind":"root"|"topic"|"subtopic"|"concept","detail":string|null,"citationIndex":number|null}],"edges":[{"id":string,"source":string,"target":string,"label":string|null}]}
Exactly one node has kind "root". Keep labels under 6 words. 2–4 levels deep.`,
  rewrite: 'Rewrite the text. Preserve meaning and voice. Remove filler and tighten phrasing. Output only the rewritten text.',
  expand: 'Expand the text with concrete detail drawn from the context. Keep the original voice. Output only the expanded text.',
  translate: 'Translate the text. Preserve Markdown structure exactly. Output only the translation.',
  explain: 'Explain clearly for someone encountering this for the first time. Use a short lead paragraph then bullets.',
  continue: 'Continue writing from where the text stops. Match voice, tense and formatting. Output only the continuation.',
  classify: 'Return ONLY minified JSON: {"label":string,"scores":[{"label":string,"score":number}]}',
  extract: 'Return ONLY minified JSON conforming to the supplied schema.',
};

export function systemPromptFor(
  task: TaskHint | undefined,
  extra?: string,
): string {
  const kind = task?.kind ?? 'chat';
  const parts = [BASE, TASK_PROMPTS[kind] ?? ''];

  if (task?.kind === 'summary' && task.style) {
    parts.push(
      task.style === 'brief'
        ? 'Keep it to 2–3 sentences of prose.'
        : task.style === 'bullets'
          ? 'Output 5–7 bullets, nothing else.'
          : 'Group into themed H3 sections with bullets under each.',
    );
  }
  if (task?.kind === 'flashcards' && task.count)
    parts.push(`Produce exactly ${task.count} cards.`);
  if (task?.kind === 'quiz') {
    if (task.count) parts.push(`Produce exactly ${task.count} questions.`);
    if (task.types?.length)
      parts.push(`Use only these question types: ${task.types.join(', ')}.`);
    if (task.difficulty) parts.push(`Target difficulty: ${task.difficulty}.`);
  }
  if (task?.kind === 'translate' && task.target)
    parts.push(`Target language: ${task.target}.`);
  if (task?.kind === 'rewrite' && task.instruction)
    parts.push(`Additional instruction: ${task.instruction}`);
  if (task?.kind === 'classify')
    parts.push(`Allowed labels: ${task.labels.join(', ')}.`);
  if (task?.kind === 'extract')
    parts.push(`Schema: ${JSON.stringify(task.schema)}`);
  if (extra) parts.push(extra);

  return parts.filter(Boolean).join('\n\n');
}

/** Render retrieved material as numbered, provenance-tagged context blocks. */
export function renderContext(docs: ContextDocument[]): string {
  if (!docs.length) return '';
  const blocks = docs.map((doc, i) => {
    const c = doc.citation;
    const locator = [
      c.page != null ? `page ${c.page}` : null,
      c.time != null ? `at ${formatClock(c.time)}` : null,
      c.section ?? null,
    ]
      .filter(Boolean)
      .join(', ');
    const header = `[${i + 1}] ${doc.title}${locator ? ` (${locator})` : ''}`;
    return `${header}\n${doc.content}`;
  });
  return `<context>\n${blocks.join('\n\n---\n\n')}\n</context>`;
}

function formatClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
