import { newId } from '@/lib/id';
import { renderContext, systemPromptFor } from '../prompts';
import type {
  AIProvider,
  GenerateRequest,
  GenerateResult,
  ModelInfo,
  StreamChunk,
  ToolCall,
} from '../types';
import { sseLines } from './sse';

type Options = {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  label?: string;
  id?: string;
};

/**
 * Works against the OpenAI Chat Completions API and any API-compatible
 * gateway (Azure OpenAI, Together, Groq, OpenRouter, vLLM, Ollama, LM Studio).
 */
export class OpenAIProvider implements AIProvider {
  readonly id: string;
  readonly label: string;
  readonly hosted = true;

  constructor(private readonly options: Options) {
    this.id = options.id ?? 'openai';
    this.label = options.label ?? 'OpenAI';
  }

  models(): ModelInfo[] {
    return [
      {
        id: this.options.defaultModel,
        label: this.options.defaultModel,
        contextWindow: 128_000,
        supportsTools: true,
        supportsVision: true,
      },
    ];
  }

  private body(request: GenerateRequest, stream: boolean) {
    const system = systemPromptFor(request.task);
    const context = renderContext(request.context ?? []);
    const messages = [
      { role: 'system', content: [system, request.system, context].filter(Boolean).join('\n\n') },
      ...request.messages.map((m) =>
        m.role === 'tool'
          ? { role: 'tool', content: m.content, tool_call_id: m.toolCallId }
          : { role: m.role, content: m.content },
      ),
    ];
    return {
      model: request.model || this.options.defaultModel,
      messages,
      stream,
      temperature: request.temperature ?? 0.3,
      max_tokens: request.maxTokens ?? 2048,
      ...(request.responseFormat === 'json'
        ? { response_format: { type: 'json_object' } }
        : {}),
      ...(request.tools?.length
        ? {
            tools: request.tools.map((t) => ({
              type: 'function',
              function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters,
              },
            })),
            tool_choice: 'auto',
          }
        : {}),
    };
  }

  private headers() {
    return {
      'content-type': 'application/json',
      authorization: `Bearer ${this.options.apiKey}`,
    };
  }

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    const res = await fetch(`${this.options.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(this.body(request, false)),
      signal: request.signal,
    });
    if (!res.ok) throw new Error(`${this.label}: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as any;
    const choice = data.choices?.[0];
    return {
      text: choice?.message?.content ?? '',
      toolCalls: (choice?.message?.tool_calls ?? []).map(toToolCall),
      model: data.model ?? this.options.defaultModel,
      usage: {
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
      },
      finishReason: choice?.finish_reason,
    };
  }

  async *stream(request: GenerateRequest): AsyncIterable<StreamChunk> {
    const res = await fetch(`${this.options.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(this.body(request, true)),
      signal: request.signal,
    });
    if (!res.ok || !res.body) {
      yield { type: 'error', value: `${this.label}: ${res.status} ${await res.text()}` };
      return;
    }

    const pending = new Map<number, { id: string; name: string; args: string }>();
    let model = this.options.defaultModel;

    for await (const line of sseLines(res.body)) {
      if (line === '[DONE]') break;
      let payload: any;
      try {
        payload = JSON.parse(line);
      } catch {
        continue;
      }
      model = payload.model ?? model;
      const delta = payload.choices?.[0]?.delta;
      if (!delta) continue;
      if (delta.content) yield { type: 'text', value: delta.content };
      for (const call of delta.tool_calls ?? []) {
        const slot = pending.get(call.index) ?? {
          id: call.id ?? newId('call'),
          name: '',
          args: '',
        };
        if (call.function?.name) slot.name = call.function.name;
        if (call.function?.arguments) slot.args += call.function.arguments;
        pending.set(call.index, slot);
      }
    }

    for (const slot of pending.values()) {
      yield {
        type: 'tool-call',
        value: {
          id: slot.id,
          name: slot.name,
          arguments: safeJson(slot.args),
        },
      };
    }
    yield { type: 'done', value: { model } };
  }
}

function toToolCall(raw: any): ToolCall {
  return {
    id: raw.id ?? newId('call'),
    name: raw.function?.name ?? '',
    arguments: safeJson(raw.function?.arguments ?? '{}'),
  };
}

function safeJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text || '{}');
  } catch {
    return {};
  }
}
