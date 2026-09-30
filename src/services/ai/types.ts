import type { Citation } from '@/server/db/schema';

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export type ChatMessage = {
  role: ChatRole;
  content: string;
  /** present on tool result messages */
  toolCallId?: string;
  name?: string;
};

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
};

export type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

/**
 * Optional structured hint describing *what* the caller wants. Hosted models
 * use it to select a prompt template; the offline provider uses it to select
 * an algorithm. Passing it keeps provider-specific prompt text out of the app.
 */
export type TaskHint =
  | { kind: 'chat' }
  | { kind: 'title' }
  | { kind: 'summary'; style?: 'brief' | 'detailed' | 'bullets' }
  | { kind: 'key-points' }
  | { kind: 'action-items' }
  | { kind: 'decisions' }
  | { kind: 'questions' }
  | { kind: 'topics' }
  | { kind: 'meeting-notes' }
  | { kind: 'study-guide' }
  | { kind: 'research-report' }
  | { kind: 'presentation-outline' }
  | { kind: 'timeline' }
  | { kind: 'faq' }
  | { kind: 'glossary' }
  | { kind: 'flashcards'; count?: number }
  | { kind: 'quiz'; count?: number; types?: string[]; difficulty?: string }
  | { kind: 'mind-map' }
  | { kind: 'rewrite'; instruction?: string }
  | { kind: 'expand' }
  | { kind: 'translate'; target?: string }
  | { kind: 'explain' }
  | { kind: 'continue' }
  | { kind: 'classify'; labels: string[] }
  | { kind: 'extract'; schema: Record<string, unknown> };

export type GenerateRequest = {
  messages: ChatMessage[];
  system?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
  /** Grounding material with provenance, injected as context. */
  context?: ContextDocument[];
  task?: TaskHint;
  signal?: AbortSignal;
  responseFormat?: 'text' | 'json';
};

export type ContextDocument = {
  id: string;
  title: string;
  content: string;
  citation: Citation;
};

export type GenerateResult = {
  text: string;
  toolCalls?: ToolCall[];
  citations?: Citation[];
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'error';
};

export type StreamChunk =
  | { type: 'text'; value: string }
  | { type: 'citations'; value: Citation[] }
  | { type: 'tool-call'; value: ToolCall }
  | { type: 'step'; value: { id: string; label: string; status: 'running' | 'done' | 'error'; detail?: string } }
  | { type: 'error'; value: string }
  | { type: 'done'; value: { model: string; usage?: GenerateResult['usage'] } };

export type ModelInfo = {
  id: string;
  label: string;
  contextWindow: number;
  supportsTools: boolean;
  supportsVision: boolean;
};

export interface AIProvider {
  readonly id: string;
  readonly label: string;
  /** false when the provider is a local stand-in rather than a hosted model */
  readonly hosted: boolean;
  models(): ModelInfo[];
  generate(request: GenerateRequest): Promise<GenerateResult>;
  stream(request: GenerateRequest): AsyncIterable<StreamChunk>;
}

export interface EmbeddingProvider {
  readonly id: string;
  readonly dimensions: number;
  readonly model: string;
  embed(texts: string[]): Promise<number[][]>;
}
