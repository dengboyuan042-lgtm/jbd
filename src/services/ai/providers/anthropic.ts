import { newId } from '@/lib/id';
import { renderContext, systemPromptFor } from '../prompts';
import type {
  AIProvider,
  GenerateRequest,
  GenerateResult,
  ModelInfo,
  StreamChunk,
} from '../types';
import { sseEvents } from './sse';

type Options = { apiKey: string; baseUrl: string; defaultModel: string };

export class AnthropicProvider implements AIProvider {
  readonly id = 'anthropic';
  readonly label = 'Anthropic';
  readonly hosted = true;

  constructor(private readonly options: Options) {}

  models(): ModelInfo[] {
    return [
      {
        id: this.options.defaultModel,
        label: this.options.defaultModel,
        contextWindow: 200_000,
        supportsTools: true,
        supportsVision: true,
      },
    ];
  }

  private headers() {
    return {
      'content-type': 'application/json',
      'x-api-key': this.options.apiKey,
      'anthropic-version': '2023-06-01',
    };
  }

  private body(request: GenerateRequest, stream: boolean) {
    const system = [
      systemPromptFor(request.task),
      request.system,
      renderContext(request.context ?? []),
    ]
      .filter(Boolean)
      .join('\n\n');

    const messages = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) =>
        m.role === 'tool'
          ? {
              role: 'user' as const,
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: m.toolCallId,
                  content: m.content,
                },
              ],
            }
          : { role: m.role as 'user' | 'assistant', content: m.content },
      );

    return {
      model: request.model || this.options.defaultModel,
      system,
      messages,
      stream,
      max_tokens: request.maxTokens ?? 2048,
      temperature: request.temperature ?? 0.3,
      ...(request.tools?.length
        ? {
            tools: request.tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.parameters,
            })),
          }
        : {}),
    };
  }

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    const res = await fetch(`${this.options.baseUrl}/messages`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(this.body(request, false)),
      signal: request.signal,
    });
    if (!res.ok) throw new Error(`Anthropic: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as any;
    const text = (data.content ?? [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');
    const toolCalls = (data.content ?? [])
      .filter((b: any) => b.type === 'tool_use')
      .map((b: any) => ({
        id: b.id ?? newId('call'),
        name: b.name,
        arguments: b.input ?? {},
      }));
    return {
      text,
      toolCalls,
      model: data.model ?? this.options.defaultModel,
      usage: {
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
      },
      finishReason: data.stop_reason === 'tool_use' ? 'tool_calls' : 'stop',
    };
  }

  async *stream(request: GenerateRequest): AsyncIterable<StreamChunk> {
    const res = await fetch(`${this.options.baseUrl}/messages`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(this.body(request, true)),
      signal: request.signal,
    });
    if (!res.ok || !res.body) {
      yield { type: 'error', value: `Anthropic: ${res.status} ${await res.text()}` };
      return;
    }

    const tools = new Map<number, { id: string; name: string; json: string }>();
    let model = this.options.defaultModel;

    for await (const { event, data } of sseEvents(res.body)) {
      if (event === 'ping') continue;
      let payload: any;
      try {
        payload = JSON.parse(data);
      } catch {
        continue;
      }
      if (event === 'message_start') model = payload.message?.model ?? model;
      if (event === 'content_block_start' && payload.content_block?.type === 'tool_use') {
        tools.set(payload.index, {
          id: payload.content_block.id ?? newId('call'),
          name: payload.content_block.name,
          json: '',
        });
      }
      if (event === 'content_block_delta') {
        if (payload.delta?.type === 'text_delta') {
          yield { type: 'text', value: payload.delta.text };
        }
        if (payload.delta?.type === 'input_json_delta') {
          const slot = tools.get(payload.index);
          if (slot) slot.json += payload.delta.partial_json ?? '';
        }
      }
      if (event === 'message_stop') break;
    }

    for (const slot of tools.values()) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(slot.json || '{}');
      } catch {
        args = {};
      }
      yield { type: 'tool-call', value: { id: slot.id, name: slot.name, arguments: args } };
    }
    yield { type: 'done', value: { model } };
  }
}
