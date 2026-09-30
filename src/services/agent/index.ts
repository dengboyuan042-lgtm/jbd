import { newId } from '@/lib/id';
import { aiProvider } from '@/services/ai';
import type { ChatMessage } from '@/services/ai/types';
import { AGENT_TOOLS, toolDefinitions, type AgentContext } from './tools';

export type AgentEvent =
  | { type: 'step'; id: string; label: string; status: 'running' | 'done' | 'error'; detail?: string }
  | { type: 'delta'; value: string }
  | { type: 'artifact'; value: { kind: string; id: string; title: string; href: string } }
  | { type: 'error'; message: string };

export type RunAgentInput = {
  context: AgentContext;
  messages: ChatMessage[];
  signal?: AbortSignal;
  maxSteps?: number;
};

const SYSTEM = `You operate a personal knowledge workspace on the user's behalf.
Work in steps: find the relevant material, read what you need, then create what was asked for.
Prefer acting over asking. Only ask a clarifying question if the request cannot be acted on at all.
Call the "answer" tool exactly once as the final step, with a short Markdown summary of what you did and what you found. Reference created items by name.
Never describe your internal reasoning — the interface already shows progress.`;

/**
 * Agent loop.
 *
 * With a tool-calling model this is a standard plan/act loop. With the offline
 * engine, `planLocally` derives an explicit plan from the request and executes
 * the same tools — so the agent does real work in both configurations and the
 * UI contract never changes.
 */
export async function* runAgent(
  input: RunAgentInput,
): AsyncGenerator<AgentEvent> {
  const provider = aiProvider();
  const maxSteps = input.maxSteps ?? 8;
  const transcript: ChatMessage[] = [...input.messages];
  const lastUser = [...input.messages].reverse().find((m) => m.role === 'user');
  const request = lastUser?.content ?? '';

  const plan = provider.hosted ? null : planLocally(request, input.context);

  if (plan) {
    yield* runPlan(plan, input, request);
    return;
  }

  for (let step = 0; step < maxSteps; step++) {
    let result;
    try {
      result = await provider.generate({
        messages: transcript,
        system: SYSTEM,
        tools: toolDefinitions(),
        temperature: 0.2,
        signal: input.signal,
      });
    } catch (error) {
      yield {
        type: 'error',
        message: error instanceof Error ? error.message : 'Agent failed.',
      };
      return;
    }

    const calls = result.toolCalls ?? [];
    if (!calls.length) {
      if (result.text) yield { type: 'delta', value: result.text };
      return;
    }

    for (const call of calls) {
      const tool = AGENT_TOOLS[call.name];
      const stepId = newId('step');
      if (!tool) {
        yield { type: 'step', id: stepId, label: `Unknown tool ${call.name}`, status: 'error' };
        transcript.push({
          role: 'tool',
          toolCallId: call.id,
          name: call.name,
          content: `No such tool: ${call.name}`,
        });
        continue;
      }

      if (call.name === 'answer') {
        const text = String(call.arguments.text ?? '');
        yield { type: 'delta', value: text };
        return;
      }

      yield { type: 'step', id: stepId, label: tool.running(call.arguments), status: 'running' };
      try {
        const output = await tool.run(call.arguments, input.context);
        yield {
          type: 'step',
          id: stepId,
          label: tool.running(call.arguments),
          status: 'done',
          detail: firstLine(output.summary),
        };
        for (const artifact of output.artifacts ?? []) {
          yield { type: 'artifact', value: artifact };
        }
        transcript.push({
          role: 'tool',
          toolCallId: call.id,
          name: call.name,
          content: output.summary.slice(0, 6000),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Tool failed.';
        yield { type: 'step', id: stepId, label: tool.running(call.arguments), status: 'error', detail: message };
        transcript.push({
          role: 'tool',
          toolCallId: call.id,
          name: call.name,
          content: `Error: ${message}`,
        });
      }
    }
  }

  yield {
    type: 'delta',
    value: '_Reached the step limit for this run. Ask me to continue if there is more to do._',
  };
}

/* ─────────────────────────── offline planning ────────────────────────── */

type PlannedStep = { tool: string; args: Record<string, unknown> };

/**
 * Deterministic intent → plan mapping used when no tool-calling model is
 * configured. It covers the request shapes the product is designed around;
 * anything else falls back to retrieve-and-answer.
 */
function planLocally(request: string, context: AgentContext): PlannedStep[] {
  const text = request.toLowerCase();
  const steps: PlannedStep[] = [];

  const urlMatch = request.match(/https?:\/\/\S+/);
  if (urlMatch) steps.push({ tool: 'search_web', args: { url: urlMatch[0] } });

  const countMatch = text.match(/\b(?:last|recent|past)\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\b/);
  const words: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  };
  const count = countMatch
    ? (words[countMatch[1]] ?? Number(countMatch[1]) ?? 3)
    : undefined;

  const kind = /\b(meeting|recording|call)s?\b/.test(text)
    ? 'recording'
    : /\b(note)s?\b/.test(text)
      ? 'note'
      : /\b(pdf|document|file|slide|deck)s?\b/.test(text)
        ? 'file'
        : /\b(article|page|link)s?\b/.test(text)
          ? 'webpage'
          : /\b(video|youtube)s?\b/.test(text)
            ? 'youtube'
            : undefined;

  const wantsRecentList = Boolean(count || (kind && /\b(my|all|recent|last)\b/.test(text)));

  if (wantsRecentList) {
    steps.push({ tool: 'list_sources', args: { kind, limit: count ?? 5 } });
  } else if (!urlMatch) {
    steps.push({ tool: 'search_knowledge', args: { query: request, limit: 8 } });
  }

  const wantsFlashcards = /\bflash\s?cards?\b|\b闪卡\b/.test(text);
  const wantsQuiz = /\bquiz|test questions?|exam\b|\b测试题\b/.test(text);
  const wantsMeetingNotes = /\bmeeting notes?|minutes\b|\b会议纪要\b/.test(text);
  const wantsActions = /\baction items?|to-?dos?|follow[- ]ups?|deadlines?\b|\b行动事项\b/.test(text);
  const wantsReport = /\breport|research\b|\b报告\b/.test(text);
  const wantsStudyGuide = /\bstudy guide|revision\b/.test(text);
  const wantsOutline = /\bpresentation|slides? outline|deck outline\b/.test(text);
  const wantsSummary = /\bsummar(y|ise|ize)|overview|digest|organi[sz]e|tidy|整理|总结\b/.test(text);
  const wantsProject = /\b(create|make|set up|start)\b.*\bproject\b|\b研究项目\b/.test(text);

  if (wantsProject) {
    const name =
      request.match(/project\s+(?:called|named)\s+["“]?([^"”\n]{2,60})["”]?/i)?.[1] ??
      'New project';
    steps.push({ tool: 'create_project', args: { name, sourceIds: '$sources' } });
  }
  if (wantsFlashcards) steps.push({ tool: 'create_flashcards', args: { sourceIds: '$sources' } });
  if (wantsQuiz) {
    const n = request.match(/(\d{1,2})\s*(?:道|questions?|items?)/i)?.[1];
    steps.push({
      tool: 'create_quiz',
      args: { sourceIds: '$sources', count: n ? Number(n) : 10 },
    });
  }
  if (wantsMeetingNotes)
    steps.push({ tool: 'create_summary', args: { tool: 'meeting-notes', sourceIds: '$sources' } });
  if (wantsActions)
    steps.push({ tool: 'create_summary', args: { tool: 'action-items', sourceIds: '$sources' } });
  if (wantsReport)
    steps.push({ tool: 'create_summary', args: { tool: 'research-report', sourceIds: '$sources' } });
  if (wantsStudyGuide)
    steps.push({ tool: 'create_summary', args: { tool: 'study-guide', sourceIds: '$sources' } });
  if (wantsOutline)
    steps.push({
      tool: 'create_summary',
      args: { tool: 'presentation-outline', sourceIds: '$sources' },
    });
  if (wantsSummary && !wantsMeetingNotes && !wantsReport && !wantsStudyGuide && !wantsOutline) {
    steps.push({ tool: 'create_summary', args: { tool: 'summary', sourceIds: '$sources' } });
  }

  if (context.focusSourceIds?.length && steps.length === 1) {
    // Nothing actionable was detected but the user is looking at something —
    // retrieve-and-answer is the right default.
    return [];
  }
  return steps.length > 1 ? steps : [];
}

async function* runPlan(
  plan: PlannedStep[],
  input: RunAgentInput,
  request: string,
): AsyncGenerator<AgentEvent> {
  let discovered: string[] = input.context.focusSourceIds ?? [];
  const notes: string[] = [];
  const created: { kind: string; title: string; href: string }[] = [];
  const found: { title: string; snippet?: string }[] = [];

  for (const step of plan) {
    const tool = AGENT_TOOLS[step.tool];
    if (!tool) continue;
    const args = { ...step.args };
    for (const [key, value] of Object.entries(args)) {
      if (value === '$sources') args[key] = discovered;
    }

    const stepId = newId('step');
    yield { type: 'step', id: stepId, label: tool.running(args), status: 'running' };
    try {
      const output = await tool.run(args, input.context);
      const discoveredIds = extractSourceIds(output.data);
      if (discoveredIds.length) {
        discovered = [...new Set([...discovered, ...discoveredIds])];
      }
      notes.push(output.summary);
      yield {
        type: 'step',
        id: stepId,
        label: tool.running(args),
        status: 'done',
        detail: firstLine(output.summary),
      };
      for (const artifact of output.artifacts ?? []) {
        created.push(artifact);
        yield { type: 'artifact', value: artifact };
      }
      found.push(...extractFound(output.data));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Step failed.';
      yield { type: 'step', id: stepId, label: tool.running(args), status: 'error', detail: message };
      notes.push(`Failed: ${message}`);
    }
  }

  const summaryId = newId('step');
  yield { type: 'step', id: summaryId, label: 'Writing the answer', status: 'running' };
  const answer = composeReport({ found, created, notes });
  yield { type: 'step', id: summaryId, label: 'Writing the answer', status: 'done' };
  yield { type: 'delta', value: answer };
}

/** Deterministic run report — what was used, what was produced, what failed. */
function composeReport(input: {
  found: { title: string; snippet?: string }[];
  created: { kind: string; title: string; href: string }[];
  notes: string[];
}): string {
  const lines: string[] = [];
  const uniqueFound = dedupe(input.found.map((f) => f.title));

  if (input.created.length) {
    lines.push(
      `Done. I worked from ${uniqueFound.length || 'your'} source${uniqueFound.length === 1 ? '' : 's'} and produced:`,
      '',
      ...input.created.map((c) => `- **${c.title}** — [open](${c.href})`),
    );
  } else if (uniqueFound.length) {
    lines.push(
      `I found ${uniqueFound.length} relevant item${uniqueFound.length === 1 ? '' : 's'}:`,
      '',
      ...input.found.slice(0, 6).map((f) => `- **${f.title}**${f.snippet ? ` — ${f.snippet}` : ''}`),
    );
  } else {
    lines.push('I could not find anything in your workspace that matches that request.');
  }

  if (uniqueFound.length && input.created.length) {
    lines.push('', `Sources used: ${uniqueFound.slice(0, 6).join(', ')}.`);
  }

  const failures = input.notes.filter((n) => n.startsWith('Failed:'));
  if (failures.length) {
    lines.push('', ...failures.map((f) => `> ${f}`));
  }
  return lines.join('\n');
}

function extractFound(data: unknown): { title: string; snippet?: string }[] {
  if (!data || typeof data !== 'object') return [];
  const record = data as Record<string, unknown>;
  const list = (record.hits ?? record.sources) as unknown;
  if (!Array.isArray(list)) return [];
  return list
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      title: String(item.title ?? 'Untitled'),
      snippet: item.snippet ? String(item.snippet).slice(0, 140) : undefined,
    }));
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function extractSourceIds(data: unknown): string[] {
  if (!data || typeof data !== 'object') return [];
  const record = data as Record<string, unknown>;
  const list = (record.hits ?? record.sources) as unknown;
  if (!Array.isArray(list)) return [];
  return list
    .map((item) =>
      item && typeof item === 'object'
        ? ((item as Record<string, unknown>).sourceId ?? (item as Record<string, unknown>).id)
        : null,
    )
    .filter((v): v is string => typeof v === 'string');
}

function firstLine(text: string): string {
  const line = text.split('\n').find((l) => l.trim());
  return line ? line.slice(0, 160) : '';
}

export { AGENT_TOOLS } from './tools';
export type { AgentContext } from './tools';
