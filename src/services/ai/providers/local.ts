import type { Citation } from '@/server/db/schema';
import {
  clusterTopics,
  complexity,
  contentStems,
  contentWords,
  detectLanguage,
  estimateTokens,
  extractActionItems,
  extractDecisions,
  extractDefinitions,
  extractQuestions,
  extractiveSummary,
  keywords,
  looksLikeHeading,
  rankSentences,
  splitSentences,
  titleCase,
} from '../nlp';
import type {
  AIProvider,
  ContextDocument,
  GenerateRequest,
  GenerateResult,
  ModelInfo,
  StreamChunk,
} from '../types';

/**
 * Offline provider.
 *
 * It is not a language model and does not pretend to be one: every output is
 * derived from the user's own material using the analytics in `nlp.ts`. It
 * exists so the whole product — RAG, study tools, agent runs — is functional
 * and testable before any API key is supplied, and so integration seams are
 * exercised in development rather than mocked away.
 */
export class LocalAIProvider implements AIProvider {
  readonly id = 'local';
  readonly label = 'Built-in engine';
  readonly hosted = false;

  models(): ModelInfo[] {
    return [
      {
        id: 'local-extractive-v1',
        label: 'Built-in engine',
        contextWindow: 1_000_000,
        supportsTools: false,
        supportsVision: false,
      },
    ];
  }

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    const { text, citations } = this.run(request);
    return {
      text,
      citations,
      model: 'local-extractive-v1',
      finishReason: 'stop',
      usage: {
        inputTokens: estimateTokens(
          request.messages.map((m) => m.content).join(' '),
        ),
        outputTokens: estimateTokens(text),
      },
    };
  }

  async *stream(request: GenerateRequest): AsyncIterable<StreamChunk> {
    const { text, citations } = this.run(request);
    if (citations.length) yield { type: 'citations', value: citations };
    // Stream in word groups so the UI exercises the same path as a hosted model.
    const tokens = text.match(/\S+\s*/g) ?? [text];
    let buffer = '';
    for (let i = 0; i < tokens.length; i++) {
      buffer += tokens[i];
      if (buffer.length >= 12 || i === tokens.length - 1) {
        yield { type: 'text', value: buffer };
        buffer = '';
        if (request.signal?.aborted) break;
        await sleep(8);
      }
    }
    yield { type: 'done', value: { model: 'local-extractive-v1' } };
  }

  /* ─────────────────────────── task dispatch ─────────────────────────── */

  private run(request: GenerateRequest): { text: string; citations: Citation[] } {
    const task = request.task ?? { kind: 'chat' as const };
    const context = request.context ?? [];
    const corpus = context.map((c) => c.content).join('\n\n');
    const lastUser =
      [...request.messages].reverse().find((m) => m.role === 'user')?.content ?? '';

    switch (task.kind) {
      case 'title':
        return { text: this.title(lastUser || corpus), citations: [] };
      case 'summary':
        return this.summary(corpus, context, task.style ?? 'bullets');
      case 'key-points':
        return this.keyPoints(corpus, context);
      case 'action-items':
        return this.actionItems(corpus, context);
      case 'decisions':
        return this.decisions(corpus, context);
      case 'questions':
        return this.openQuestions(corpus, context);
      case 'topics':
        return this.topics(corpus, context);
      case 'meeting-notes':
        return this.meetingNotes(corpus, context);
      case 'study-guide':
        return this.studyGuide(corpus, context);
      case 'research-report':
        return this.researchReport(corpus, context);
      case 'presentation-outline':
        return this.presentationOutline(corpus, context);
      case 'timeline':
        return this.timeline(corpus, context);
      case 'faq':
        return this.faq(corpus, context);
      case 'glossary':
        return this.glossary(corpus, context);
      case 'flashcards':
        return this.flashcards(corpus, context, task.count ?? 12);
      case 'quiz':
        return this.quiz(corpus, context, task.count ?? 10, task.difficulty);
      case 'mind-map':
        return this.mindMap(corpus, context);
      case 'rewrite':
        return { text: this.rewrite(lastUser, task.instruction), citations: [] };
      case 'expand':
        return { text: this.expand(lastUser, corpus), citations: [] };
      case 'translate':
        return { text: this.translateNotice(lastUser, task.target), citations: [] };
      case 'explain':
        return this.explain(lastUser, corpus, context);
      case 'continue':
        return { text: this.continueWriting(lastUser), citations: [] };
      case 'classify':
        return { text: this.classify(lastUser || corpus, task.labels), citations: [] };
      case 'extract':
        return { text: JSON.stringify(this.extract(corpus)), citations: [] };
      case 'chat':
      default:
        return this.answer(lastUser, context);
    }
  }

  /* ─────────────────────────── grounded answer ───────────────────────── */

  private answer(
    question: string,
    context: ContextDocument[],
  ): { text: string; citations: Citation[] } {
    if (!context.length) {
      return {
        text: [
          "I don't have any material in context for this conversation yet.",
          '',
          'Attach a file, pick sources from your library, or open this chat from inside a document or project — then I can answer from your own content with page and timestamp citations.',
        ].join('\n'),
        citations: [],
      };
    }

    const queryTerms = [...new Set(contentStems(question))];
    type Hit = {
      sentence: string;
      score: number;
      doc: ContextDocument;
      order: number;
    };
    const hits: Hit[] = [];

    // Weight query terms by rarity across the context: matching "pgvector"
    // says far more about relevance than matching "plan".
    const documentFrequency = new Map<string, number>();
    for (const doc of context) {
      const seen = new Set(contentStems(doc.content));
      for (const term of queryTerms) if (seen.has(term)) {
        documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
      }
    }
    const weightOf = (term: string) =>
      Math.log(1 + context.length / (1 + (documentFrequency.get(term) ?? 0))) + 0.25;
    const totalWeight =
      queryTerms.reduce((sum, term) => sum + weightOf(term), 0) || 1;

    context.forEach((doc, docIndex) => {
      const ranked = rankSentences(doc.content);
      ranked.forEach((r, i) => {
        const sentence = r.item;
        // Table rows and boilerplate read badly as answers and skew scoring.
        if (sentence.length > 400) return;
        if ((sentence.match(/\|/g) ?? []).length > 2) return;
        if (looksLikeHeading(sentence)) return;

        const words = contentStems(sentence);
        const unique = new Set(words);
        let matched = 0;
        let matchedWeight = 0;
        for (const term of queryTerms) {
          if (!unique.has(term)) continue;
          matched++;
          matchedWeight += weightOf(term);
        }
        if (!matched) return;

        const coverage = matchedWeight / totalWeight;
        // Density rewards a short sentence that is mostly about the question.
        const density = matched / Math.max(unique.size, 1);
        const score = coverage * 5 + density * 1.5 + r.score * 0.6;

        hits.push({ sentence, score, doc, order: docIndex * 10_000 + i });
      });
    });

    hits.sort((a, b) => b.score - a.score);
    const picked = dedupeBy(hits.slice(0, 24), (h) =>
      h.sentence.toLowerCase().replace(/\W+/g, '').slice(0, 60),
    ).slice(0, 5);

    if (!picked.length) {
      // Nothing matched the wording. Rather than refusing outright, surface the
      // most salient material and say plainly that it is not a direct answer.
      const fallback = context.slice(0, 3);
      const salient = fallback.flatMap((doc) =>
        extractiveSummary(doc.content, 2).map((sentence) => ({ doc, sentence })),
      );
      if (!salient.length) {
        return {
          text: "There is no readable text in the selected material to answer from.",
          citations: fallback.map((d) => d.citation),
        };
      }
      return {
        text: [
          'Nothing in the selected material answers that directly. The closest relevant passages are:',
          '',
          ...salient
            .slice(0, 4)
            .map((s, i) => `- ${s.sentence} [${i + 1}]`),
        ].join('\n'),
        citations: salient
          .slice(0, 4)
          .map((s) => ({ ...s.doc.citation, snippet: s.sentence.slice(0, 240) })),
      };
    }

    // The strongest match leads; the rest follow in document order so the
    // answer reads as a coherent excerpt rather than a ranked list.
    const [lead, ...rest] = picked;
    rest.sort((a, b) => a.order - b.order);
    const ordered = [lead, ...rest];

    const citations: Citation[] = [];
    const indexOfDoc = new Map<string, number>();
    const lines: string[] = [];

    for (const hit of ordered) {
      let n = indexOfDoc.get(hit.doc.id);
      if (n === undefined) {
        citations.push({ ...hit.doc.citation, snippet: hit.sentence.slice(0, 240) });
        n = citations.length;
        indexOfDoc.set(hit.doc.id, n);
      }
      lines.push(`- ${hit.sentence} [${n}]`);
    }

    const headText = lead.sentence;
    const head =
      headText.length > 240 ? `${headText.slice(0, 237).trimEnd()}…` : headText;
    const supporting = lines.slice(1);

    return {
      text: [
        `${head} [${indexOfDoc.get(lead.doc.id)}]`,
        ...(supporting.length ? ['', '**Also in your sources**', ...supporting] : []),
      ].join('\n'),
      citations,
    };
  }

  /* ─────────────────────────── generators ────────────────────────────── */

  private title(text: string): string {
    const first = splitSentences(text)[0] ?? text;
    const kw = keywords(text, 4).map((k) => titleCase(k.item));
    if (first.length <= 52) return first.replace(/[.?!]$/, '');
    return kw.slice(0, 3).join(' · ') || first.slice(0, 48);
  }

  private summary(
    corpus: string,
    context: ContextDocument[],
    style: 'brief' | 'detailed' | 'bullets',
  ) {
    const count = style === 'brief' ? 3 : style === 'detailed' ? 9 : 6;
    const sentences = extractiveSummary(corpus, count);
    const citations = this.citationsFor(sentences, context);
    if (!sentences.length)
      return { text: 'There is not enough text to summarise yet.', citations: [] };

    if (style === 'brief') {
      return { text: sentences.join(' '), citations };
    }
    if (style === 'detailed') {
      const topics = clusterTopics(corpus, 4);
      const body = topics.length
        ? topics
            .map((t) => {
              const lines = t.sentences.slice(0, 3).map((s) => `- ${s.text}`);
              return `### ${t.label}\n${lines.join('\n')}`;
            })
            .join('\n\n')
        : sentences.map((s) => `- ${s}`).join('\n');
      return {
        text: `**Overview**\n\n${sentences.slice(0, 3).join(' ')}\n\n${body}`,
        citations,
      };
    }
    return {
      text: sentences.map((s) => `- ${s}`).join('\n'),
      citations,
    };
  }

  private keyPoints(corpus: string, context: ContextDocument[]) {
    const sentences = extractiveSummary(corpus, 8);
    return {
      text: sentences.map((s) => `- ${s}`).join('\n') || 'No key points found.',
      citations: this.citationsFor(sentences, context),
    };
  }

  private actionItems(corpus: string, context: ContextDocument[]) {
    const items = extractActionItems(corpus);
    if (!items.length)
      return { text: 'No explicit action items were stated.', citations: [] };
    const lines = items.map((i) => {
      const meta = [i.owner && `**${i.owner}**`, i.due && `_${i.due}_`]
        .filter(Boolean)
        .join(' · ');
      return `- [ ] ${i.text}${meta ? ` — ${meta}` : ''}`;
    });
    return {
      text: lines.join('\n'),
      citations: this.citationsFor(items.map((i) => i.sentence), context),
    };
  }

  private decisions(corpus: string, context: ContextDocument[]) {
    const items = extractDecisions(corpus);
    if (!items.length)
      return { text: 'No decisions were recorded in this material.', citations: [] };
    return {
      text: items.map((i) => `- ${i.text}`).join('\n'),
      citations: this.citationsFor(items.map((i) => i.sentence), context),
    };
  }

  private openQuestions(corpus: string, context: ContextDocument[]) {
    const items = extractQuestions(corpus);
    if (!items.length)
      return { text: 'No open questions were raised.', citations: [] };
    return {
      text: items.slice(0, 12).map((i) => `- ${i.text}`).join('\n'),
      citations: this.citationsFor(items.map((i) => i.sentence), context),
    };
  }

  private topics(corpus: string, context: ContextDocument[]) {
    const clusters = clusterTopics(corpus, 8);
    return {
      text:
        clusters
          .map((c) => `- **${c.label}** — ${c.sentences.length} mentions`)
          .join('\n') || 'No distinct topics detected.',
      citations: this.citationsFor(
        clusters.flatMap((c) => c.sentences.slice(0, 1).map((s) => s.text)),
        context,
      ),
    };
  }

  private meetingNotes(corpus: string, context: ContextDocument[]) {
    const summary = extractiveSummary(corpus, 4);
    const decisions = extractDecisions(corpus);
    const actions = extractActionItems(corpus);
    const questions = extractQuestions(corpus);
    const topics = clusterTopics(corpus, 5);

    const parts = [
      '## Summary',
      summary.join(' ') || '_Not enough content._',
      '',
      '## Topics discussed',
      topics.length
        ? topics.map((t) => `- ${t.label}`).join('\n')
        : '- _None detected_',
      '',
      '## Decisions',
      decisions.length
        ? decisions.map((d) => `- ${d.text}`).join('\n')
        : '- _None recorded_',
      '',
      '## Action items',
      actions.length
        ? actions
            .map(
              (a) =>
                `- [ ] ${a.text}${a.owner ? ` — **${a.owner}**` : ''}${a.due ? ` _(${a.due})_` : ''}`,
            )
            .join('\n')
        : '- _None recorded_',
      '',
      '## Open questions',
      questions.length
        ? questions.slice(0, 8).map((q) => `- ${q.text}`).join('\n')
        : '- _None_',
    ];
    return {
      text: parts.join('\n'),
      citations: this.citationsFor(summary, context),
    };
  }

  private studyGuide(corpus: string, context: ContextDocument[]) {
    const topics = clusterTopics(corpus, 6);
    const defs = extractDefinitions(corpus, 10);
    const summary = extractiveSummary(corpus, 3);

    const sections = topics.map((t) => {
      const points = t.sentences.slice(0, 4).map((s) => `- ${s.text}`);
      return `### ${t.label}\n${points.join('\n')}`;
    });

    return {
      text: [
        '## What this covers',
        summary.join(' '),
        '',
        '## Core sections',
        sections.join('\n\n') || '_Not enough structure detected._',
        '',
        '## Key terms',
        defs.length
          ? defs.map((d) => `- **${d.term}** — ${d.definition}`).join('\n')
          : '_No definitions detected._',
        '',
        '## Self-check',
        topics
          .slice(0, 5)
          .map((t) => `- Explain ${t.label.toLowerCase()} in your own words.`)
          .join('\n'),
      ].join('\n'),
      citations: this.citationsFor(summary, context),
    };
  }

  private researchReport(corpus: string, context: ContextDocument[]) {
    const summary = extractiveSummary(corpus, 5);
    const topics = clusterTopics(corpus, 5);
    const questions = extractQuestions(corpus);
    const sourceList = context
      .map((c, i) => `${i + 1}. ${c.title}${c.citation.url ? ` — ${c.citation.url}` : ''}`)
      .join('\n');

    return {
      text: [
        '## Executive summary',
        summary.join(' '),
        '',
        '## Findings',
        topics
          .map(
            (t, i) =>
              `### ${i + 1}. ${t.label}\n${t.sentences
                .slice(0, 3)
                .map((s) => s.text)
                .join(' ')}`,
          )
          .join('\n\n') || '_Insufficient material._',
        '',
        '## Open questions',
        questions.length
          ? questions.slice(0, 6).map((q) => `- ${q.text}`).join('\n')
          : '- _None raised in the material_',
        '',
        '## Sources',
        sourceList || '_No sources attached._',
      ].join('\n'),
      citations: context.map((c) => c.citation),
    };
  }

  private presentationOutline(corpus: string, context: ContextDocument[]) {
    const topics = clusterTopics(corpus, 6);
    const summary = extractiveSummary(corpus, 2);
    const slides = [
      `### Slide 1 — Title\n- ${this.title(corpus)}`,
      `### Slide 2 — Context\n${summary.map((s) => `- ${s}`).join('\n')}`,
      ...topics.map(
        (t, i) =>
          `### Slide ${i + 3} — ${t.label}\n${t.sentences
            .slice(0, 3)
            .map((s) => `- ${truncateSentence(s.text)}`)
            .join('\n')}`,
      ),
      `### Slide ${topics.length + 3} — Next steps\n${
        extractActionItems(corpus)
          .slice(0, 4)
          .map((a) => `- ${a.text}`)
          .join('\n') || '- Define follow-up owners'
      }`,
    ];
    return { text: slides.join('\n\n'), citations: this.citationsFor(summary, context) };
  }

  private timeline(corpus: string, context: ContextDocument[]) {
    const datePattern =
      /\b(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}(?:,? \d{4})?|\b(?:19|20)\d{2}\b|Q[1-4] ?(?:19|20)?\d{0,2})/i;
    const rows = splitSentences(corpus)
      .map((s) => ({ s, m: s.match(datePattern) }))
      .filter((r) => r.m)
      .slice(0, 20)
      .map((r) => `| ${r.m![0]} | ${truncateSentence(r.s, 150)} |`);
    if (!rows.length)
      return { text: 'No dated events were found in this material.', citations: [] };
    return {
      text: ['| When | What |', '| --- | --- |', ...rows].join('\n'),
      citations: context.slice(0, 3).map((c) => c.citation),
    };
  }

  private faq(corpus: string, context: ContextDocument[]) {
    const defs = extractDefinitions(corpus, 8);
    const topics = clusterTopics(corpus, 6);
    const entries: string[] = [];
    for (const d of defs) {
      entries.push(`**What is ${d.term}?**\n\n${d.definition}`);
    }
    for (const t of topics) {
      if (entries.length >= 10) break;
      const answer = t.sentences.slice(0, 2).map((s) => s.text).join(' ');
      if (!answer) continue;
      entries.push(`**What does the material say about ${t.label.toLowerCase()}?**\n\n${answer}`);
    }
    return {
      text: entries.join('\n\n') || 'Not enough material to build an FAQ.',
      citations: this.citationsFor(
        topics.flatMap((t) => t.sentences.slice(0, 1).map((s) => s.text)),
        context,
      ),
    };
  }

  private glossary(corpus: string, context: ContextDocument[]) {
    const defs = extractDefinitions(corpus, 24);
    const kw = keywords(corpus, 12);
    const rows = defs.map((d) => `| ${d.term} | ${truncateSentence(d.definition, 160)} |`);
    for (const k of kw) {
      if (rows.length >= 24) break;
      if (defs.some((d) => d.term.toLowerCase() === k.item)) continue;
      const sentence = splitSentences(corpus).find(
        (s) => s.toLowerCase().includes(k.item) && !looksLikeHeading(s) && s.length > 30,
      );
      if (!sentence) continue;
      rows.push(`| ${titleCase(k.item)} | ${truncateSentence(sentence, 160)} |`);
    }
    if (!rows.length) return { text: 'No glossary terms detected.', citations: [] };
    return {
      text: ['| Term | Meaning |', '| --- | --- |', ...rows].join('\n'),
      citations: this.citationsFor(defs.map((d) => d.sentence), context),
    };
  }

  private flashcards(corpus: string, context: ContextDocument[], count: number) {
    const defs = extractDefinitions(corpus, count * 2);
    const ranked = extractiveSummary(corpus, count * 2);
    const cards: Record<string, unknown>[] = [];
    const used = new Set<string>();

    for (const d of defs) {
      if (cards.length >= count) break;
      const key = d.term.toLowerCase();
      if (used.has(key)) continue;
      used.add(key);
      cards.push({
        question: `What is ${d.term}?`,
        answer: d.definition,
        hint: d.term.split(' ')[0],
        difficulty: complexity(d.definition) > 0.6 ? 'hard' : 'medium',
        tags: [d.term.toLowerCase()],
        citationIndex: this.citationIndexFor(d.sentence, context),
      });
    }

    for (const sentence of ranked) {
      if (cards.length >= count) break;
      const terms = keywords(sentence, 2).map((k) => k.item);
      const target = terms[0];
      if (!target || used.has(target)) continue;
      used.add(target);
      const cloze = sentence.replace(
        new RegExp(`\\b${escapeRegExp(target)}\\b`, 'i'),
        '______',
      );
      if (cloze === sentence) continue;
      cards.push({
        question: cloze,
        answer: titleCase(target),
        hint: `${target.length} characters`,
        difficulty: complexity(sentence) > 0.6 ? 'hard' : 'easy',
        tags: terms,
        citationIndex: this.citationIndexFor(sentence, context),
      });
    }

    return {
      text: JSON.stringify({ cards }),
      citations: context.map((c) => c.citation),
    };
  }

  private quiz(
    corpus: string,
    context: ContextDocument[],
    count: number,
    difficulty?: string,
  ) {
    const sentences = extractiveSummary(corpus, count * 3);
    const defs = extractDefinitions(corpus, count);
    const kw = keywords(corpus, count * 3).map((k) => k.item);
    const questions: Record<string, unknown>[] = [];

    const pushIf = (q: Record<string, unknown>) => {
      if (questions.length < count) questions.push(q);
    };

    defs.forEach((d, i) => {
      const distractors = defs
        .filter((o) => o.term !== d.term)
        .slice(0, 3)
        .map((o) => o.definition);
      if (distractors.length < 2) return;
      const options = shuffle([d.definition, ...distractors.slice(0, 3)], i);
      pushIf({
        type: 'multiple_choice',
        prompt: `Which statement best describes “${d.term}”?`,
        options,
        answer: d.definition,
        explanation: d.sentence,
        topic: d.term,
        difficulty: difficulty === 'mixed' ? (i % 2 ? 'hard' : 'medium') : difficulty ?? 'medium',
        citationIndex: this.citationIndexFor(d.sentence, context),
      });
    });

    sentences.forEach((sentence, i) => {
      if (questions.length >= count) return;
      const term = keywords(sentence, 1)[0]?.item;
      if (!term) return;
      if (i % 3 === 0) {
        const blank = sentence.replace(
          new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i'),
          '________',
        );
        if (blank === sentence) return;
        pushIf({
          type: 'fill_blank',
          prompt: blank,
          options: [],
          answer: term,
          explanation: sentence,
          topic: titleCase(term),
          difficulty: difficulty ?? 'medium',
          citationIndex: this.citationIndexFor(sentence, context),
        });
      } else if (i % 3 === 1) {
        const negate = i % 2 === 0;
        const altered = negate
          ? sentence.replace(
              new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i'),
              kw.find((k) => k !== term) ?? 'something else',
            )
          : sentence;
        pushIf({
          type: 'true_false',
          prompt: altered,
          options: ['True', 'False'],
          answer: negate ? 'False' : 'True',
          explanation: sentence,
          topic: titleCase(term),
          difficulty: difficulty ?? 'easy',
          citationIndex: this.citationIndexFor(sentence, context),
        });
      } else {
        pushIf({
          type: 'short_answer',
          prompt: `In one sentence, explain the role of ${titleCase(term)} in this material.`,
          options: [],
          answer: sentence,
          explanation: sentence,
          topic: titleCase(term),
          difficulty: difficulty ?? 'hard',
          citationIndex: this.citationIndexFor(sentence, context),
        });
      }
    });

    return {
      text: JSON.stringify({ questions }),
      citations: context.map((c) => c.citation),
    };
  }

  private mindMap(corpus: string, context: ContextDocument[]) {
    const topics = clusterTopics(corpus, 7);
    const rootLabel = context[0]?.title ?? this.title(corpus);
    const nodes: Record<string, unknown>[] = [
      { id: 'root', label: rootLabel, kind: 'root' },
    ];
    const edges: Record<string, unknown>[] = [];

    topics.forEach((topic, ti) => {
      const topicId = `t${ti}`;
      nodes.push({
        id: topicId,
        label: topic.label,
        kind: 'topic',
        detail: topic.sentences[0]?.text,
        citationIndex: this.citationIndexFor(
          topic.sentences[0]?.text ?? '',
          context,
        ),
      });
      edges.push({ id: `root-${topicId}`, source: 'root', target: topicId });

      topic.sentences.slice(0, 3).forEach((sentence, si) => {
        const subId = `${topicId}s${si}`;
        const kws = keywords(sentence.text, 2).map((k) => titleCase(k.item));
        nodes.push({
          id: subId,
          label: kws.join(' / ') || truncateSentence(sentence.text, 40),
          kind: 'subtopic',
          detail: sentence.text,
          citationIndex: this.citationIndexFor(sentence.text, context),
        });
        edges.push({ id: `${topicId}-${subId}`, source: topicId, target: subId });
      });
    });

    return {
      text: JSON.stringify({ nodes, edges }),
      citations: context.map((c) => c.citation),
    };
  }

  /* ─────────────────────────── writing helpers ───────────────────────── */

  private rewrite(text: string, instruction?: string): string {
    const sentences = splitSentences(text);
    const tightened = sentences.map((s) =>
      s
        .replace(/\b(?:very|really|basically|actually|just|quite|rather|in order to)\b\s*/gi, (m) =>
          m.trim().toLowerCase() === 'in order to' ? 'to ' : '',
        )
        .replace(/\bit is important to note that\b/gi, '')
        .replace(/\bdue to the fact that\b/gi, 'because')
        .replace(/\bat this point in time\b/gi, 'now')
        .replace(/\s{2,}/g, ' ')
        .trim(),
    );
    const body = tightened.filter(Boolean).join(' ');
    const note = instruction
      ? `\n\n_Applied locally: removed filler, tightened phrasing. Instruction “${instruction}” needs a hosted model for full rewriting._`
      : '';
    return (body || text) + note;
  }

  private expand(text: string, corpus: string): string {
    const points = extractiveSummary(corpus || text, 4);
    return [
      text.trim(),
      '',
      ...points.map((p) => `- ${p}`),
    ].join('\n');
  }

  private translateNotice(text: string, target?: string): string {
    return [
      `Translation to ${target ?? 'the requested language'} requires a hosted model or translation provider.`,
      '',
      `Detected source language: **${detectLanguage(text)}**.`,
      '',
      'Set `AI_DRIVER` to a hosted provider in your environment and this will translate in place.',
    ].join('\n');
  }

  private explain(question: string, corpus: string, context: ContextDocument[]) {
    const target = question.replace(/^(explain|what is|what are|define)\s+/i, '').trim();
    const sentences = splitSentences(corpus).filter((s) =>
      s.toLowerCase().includes(target.toLowerCase().slice(0, 24)),
    );
    if (!sentences.length) return this.answer(question, context);
    return {
      text: [
        sentences[0],
        '',
        ...sentences.slice(1, 4).map((s) => `- ${s}`),
      ].join('\n'),
      citations: this.citationsFor(sentences.slice(0, 4), context),
    };
  }

  private continueWriting(text: string): string {
    const sentences = splitSentences(text);
    const last = sentences[sentences.length - 1] ?? '';
    const kw = keywords(text, 3).map((k) => titleCase(k.item));
    return [
      '',
      `Continuing from “${truncateSentence(last, 60)}”:`,
      '',
      ...kw.map((k) => `- ${k}: `),
    ].join('\n');
  }

  private classify(text: string, labels: string[]): string {
    const words = new Set(contentWords(text));
    const scored = labels.map((label) => {
      const terms = contentWords(label);
      const hits = terms.filter((t) => words.has(t)).length;
      return { label, score: hits / Math.max(terms.length, 1) };
    });
    scored.sort((a, b) => b.score - a.score);
    return JSON.stringify({
      label: scored[0]?.label ?? labels[0],
      scores: scored,
    });
  }

  private extract(corpus: string) {
    return {
      summary: extractiveSummary(corpus, 3),
      keywords: keywords(corpus, 10).map((k) => k.item),
      actionItems: extractActionItems(corpus).map((a) => a.text),
      decisions: extractDecisions(corpus).map((d) => d.text),
      questions: extractQuestions(corpus).map((q) => q.text),
      language: detectLanguage(corpus),
    };
  }

  /* ─────────────────────────── citation mapping ──────────────────────── */

  private citationsFor(
    sentences: string[],
    context: ContextDocument[],
  ): Citation[] {
    const out: Citation[] = [];
    const seen = new Set<string>();
    for (const sentence of sentences) {
      const doc = context.find((c) => c.content.includes(sentence.slice(0, 60)));
      if (!doc || seen.has(doc.id)) continue;
      seen.add(doc.id);
      out.push({ ...doc.citation, snippet: sentence.slice(0, 240) });
    }
    if (!out.length) return context.slice(0, 3).map((c) => c.citation);
    return out;
  }

  private citationIndexFor(
    sentence: string,
    context: ContextDocument[],
  ): number | null {
    if (!sentence) return null;
    const i = context.findIndex((c) => c.content.includes(sentence.slice(0, 60)));
    return i === -1 ? null : i;
  }
}

/* ─────────────────────────── small helpers ───────────────────────────── */

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function truncateSentence(text: string, max = 110): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

/** Deterministic shuffle so regenerating a quiz is stable. */
function shuffle<T>(items: T[], seed: number): T[] {
  const arr = [...items];
  let s = seed + 1;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
