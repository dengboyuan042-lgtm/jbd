import { env } from '@/lib/env';
import { embeddingProvider } from './embeddings';
import { AnthropicProvider } from './providers/anthropic';
import { GoogleProvider } from './providers/google';
import { LocalAIProvider } from './providers/local';
import { OpenAIProvider } from './providers/openai';
import type {
  AIProvider,
  ContextDocument,
  GenerateRequest,
  GenerateResult,
  StreamChunk,
  TaskHint,
} from './types';

export * from './types';
export { embeddingProvider, cosineSimilarity } from './embeddings';

let provider: AIProvider | null = null;

/** Resolve the configured provider, falling back to the offline engine. */
export function aiProvider(): AIProvider {
  if (provider) return provider;
  const e = env();
  switch (e.AI_DRIVER) {
    case 'openai':
    case 'openai-compatible':
      provider = e.OPENAI_API_KEY
        ? new OpenAIProvider({
            apiKey: e.OPENAI_API_KEY,
            baseUrl: e.OPENAI_BASE_URL,
            defaultModel: e.AI_CHAT_MODEL || 'gpt-4o-mini',
            id: e.AI_DRIVER,
            label: e.AI_DRIVER === 'openai' ? 'OpenAI' : 'OpenAI-compatible',
          })
        : new LocalAIProvider();
      break;
    case 'anthropic':
      provider = e.ANTHROPIC_API_KEY
        ? new AnthropicProvider({
            apiKey: e.ANTHROPIC_API_KEY,
            baseUrl: e.ANTHROPIC_BASE_URL,
            defaultModel: e.AI_CHAT_MODEL || 'claude-3-5-sonnet-latest',
          })
        : new LocalAIProvider();
      break;
    case 'google':
      provider = e.GOOGLE_API_KEY
        ? new GoogleProvider({
            apiKey: e.GOOGLE_API_KEY,
            baseUrl: e.GOOGLE_BASE_URL,
            defaultModel: e.AI_CHAT_MODEL || 'gemini-2.0-flash',
          })
        : new LocalAIProvider();
      break;
    default:
      provider = new LocalAIProvider();
  }
  return provider;
}

/**
 * The single entry point every feature uses. Nothing else in the codebase
 * constructs a provider or writes provider-specific prompt text.
 */
type TaskOptions = {
  context?: ContextDocument[];
  input?: string;
  system?: string;
  model?: string;
  signal?: AbortSignal;
};

async function runTask(
  task: TaskHint,
  options: TaskOptions = {},
): Promise<GenerateResult> {
  const wantsJson = ['flashcards', 'quiz', 'mind-map', 'classify', 'extract'].includes(
    task.kind,
  );
  return aiProvider().generate({
    task,
    context: options.context,
    system: options.system,
    model: options.model,
    signal: options.signal,
    responseFormat: wantsJson ? 'json' : 'text',
    messages: [
      {
        role: 'user',
        content:
          options.input ?? defaultInstructionFor(task, options.context?.length ?? 0),
      },
    ],
  });
}

async function runJson<T>(task: TaskHint, options: TaskOptions = {}): Promise<T> {
  const result = await runTask(task, options);
  return parseJsonLoose<T>(result.text);
}

export const ai = {
  info() {
    const p = aiProvider();
    const embed = embeddingProvider();
    return {
      provider: p.id,
      label: p.label,
      hosted: p.hosted,
      models: p.models(),
      embedding: { provider: embed.id, model: embed.model, dimensions: embed.dimensions },
    };
  },

  generate(request: GenerateRequest): Promise<GenerateResult> {
    return aiProvider().generate(request);
  },

  stream(request: GenerateRequest): AsyncIterable<StreamChunk> {
    return aiProvider().stream(request);
  },

  embed(texts: string[]): Promise<number[][]> {
    return embeddingProvider().embed(texts);
  },

  task: runTask,

  json: runJson,

  async summarize(text: string, style: 'brief' | 'detailed' | 'bullets' = 'brief') {
    const result = await runTask(
      { kind: 'summary', style },
      {
        context: [
          {
            id: 'inline',
            title: 'Input',
            content: text,
            citation: { sourceId: 'inline', title: 'Input', kind: 'note' },
          },
        ],
      },
    );
    return result.text;
  },

  async title(text: string): Promise<string> {
    const result = await runTask({ kind: 'title' }, { input: text.slice(0, 4000) });
    return result.text.replace(/^["'#\s]+|["'\s]+$/g, '').slice(0, 80) || 'Untitled';
  },

  async classify(text: string, labels: string[]) {
    return runJson<{ label: string; scores: { label: string; score: number }[] }>(
      { kind: 'classify', labels },
      { input: text },
    );
  },
};

function defaultInstructionFor(task: TaskHint, contextCount: number): string {
  const scope = contextCount
    ? `the ${contextCount} source${contextCount === 1 ? '' : 's'} in context`
    : 'the material provided';
  const map: Record<string, string> = {
    summary: `Summarise ${scope}.`,
    'key-points': `List the key points from ${scope}.`,
    'action-items': `Extract every action item from ${scope}.`,
    decisions: `List the decisions made in ${scope}.`,
    questions: `List unresolved questions in ${scope}.`,
    topics: `List the topics covered in ${scope}.`,
    'meeting-notes': `Write meeting notes from ${scope}.`,
    'study-guide': `Write a study guide from ${scope}.`,
    'research-report': `Write a research report from ${scope}.`,
    'presentation-outline': `Draft a presentation outline from ${scope}.`,
    timeline: `Build a timeline of events from ${scope}.`,
    faq: `Write an FAQ from ${scope}.`,
    glossary: `Build a glossary from ${scope}.`,
    flashcards: `Create flashcards from ${scope}.`,
    quiz: `Create a quiz from ${scope}.`,
    'mind-map': `Build a mind map from ${scope}.`,
  };
  return map[task.kind] ?? `Process ${scope}.`;
}

export function parseJsonLoose<T>(text: string): T {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    const start = candidate.search(/[[{]/);
    const end = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'));
    if (start !== -1 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1)) as T;
    }
    throw new Error('Model did not return valid JSON.');
  }
}
