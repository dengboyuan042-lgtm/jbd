import { newId } from '@/lib/id';
import { renderContext, systemPromptFor } from '../prompts';
import type {
  AIProvider,
  GenerateRequest,
  GenerateResult,
  ModelInfo,
  StreamChunk,
} from '../types';
import { sseLines } from './sse';

type Options = { apiKey: string; baseUrl: string; defaultModel: string };

export class GoogleProvider implements AIProvider {
  readonly id = 'google';
  readonly label = 'Google AI';
  readonly hosted = true;

  constructor(private readonly options: Options) {}

  models(): ModelInfo[] {
    return [
      {
        id: this.options.defaultModel,
        label: this.options.defaultModel,
        contextWindow: 1_000_000,
        supportsTools: true,
        supportsVision: true,
      },
    ];
  }

  private body(request: GenerateRequest) {
    const system = [
      systemPromptFor(request.task),
      request.system,
      renderContext(request.context ?? []),
    ]
      .filter(Boolean)
      .join('\n\n');

    return {
      systemInstruction: { parts: [{ text: system }] },
      contents: request.messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
      generationConfig: {
        temperature: request.temperature ?? 0.3,
        maxOutputTokens: request.maxTokens ?? 2048,
        ...(request.responseFormat === 'json'
          ? { responseMimeType: 'application/json' }
          : {}),
      },
      ...(request.tools?.length
        ? {
            tools: [
              {
                functionDeclarations: request.tools.map((t) => ({
                  name: t.name,
                  description: t.description,
                  parameters: t.parameters,
                })),
              },
            ],
          }
        : {}),
    };
  }

  private url(model: string, method: string) {
    return `${this.options.baseUrl}/models/${model}:${method}?key=${this.options.apiKey}${
      method === 'streamGenerateContent' ? '&alt=sse' : ''
    }`;
  }

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    const model = request.model || this.options.defaultModel;
    const res = await fetch(this.url(model, 'generateContent'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(this.body(request)),
      signal: request.signal,
    });
    if (!res.ok) throw new Error(`Google AI: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as any;
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    return {
      text: parts.filter((p: any) => p.text).map((p: any) => p.text).join(''),
      toolCalls: parts
        .filter((p: any) => p.functionCall)
        .map((p: any) => ({
          id: newId('call'),
          name: p.functionCall.name,
          arguments: p.functionCall.args ?? {},
        })),
      model,
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount,
        outputTokens: data.usageMetadata?.candidatesTokenCount,
      },
      finishReason: 'stop',
    };
  }

  async *stream(request: GenerateRequest): AsyncIterable<StreamChunk> {
    const model = request.model || this.options.defaultModel;
    const res = await fetch(this.url(model, 'streamGenerateContent'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(this.body(request)),
      signal: request.signal,
    });
    if (!res.ok || !res.body) {
      yield { type: 'error', value: `Google AI: ${res.status} ${await res.text()}` };
      return;
    }
    for await (const line of sseLines(res.body)) {
      let payload: any;
      try {
        payload = JSON.parse(line);
      } catch {
        continue;
      }
      for (const part of payload.candidates?.[0]?.content?.parts ?? []) {
        if (part.text) yield { type: 'text', value: part.text };
        if (part.functionCall) {
          yield {
            type: 'tool-call',
            value: {
              id: newId('call'),
              name: part.functionCall.name,
              arguments: part.functionCall.args ?? {},
            },
          };
        }
      }
    }
    yield { type: 'done', value: { model } };
  }
}
