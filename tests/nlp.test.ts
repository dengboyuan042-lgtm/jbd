import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clusterTopics,
  detectLanguage,
  estimateTokens,
  extractActionItems,
  extractDecisions,
  extractDefinitions,
  extractQuestions,
  extractiveSummary,
  keywords,
  looksLikeHeading,
  splitSentences,
  stem,
} from '../src/services/ai/nlp';

const SAMPLE = `# Quarterly Planning

## Background
Atlas is the billing platform. The current release cadence is monthly.

## Decisions
We have decided to move Atlas to weekly releases starting in April.
It was agreed that the payments team owns the rollout.

## Actions
Dana will update the deployment checklist by April 3.
The team should audit the retry logic before the end of the month.

## Open questions
Who approves the rollback criteria?
`;

test('splitSentences keeps headings separate from prose', () => {
  const units = splitSentences(SAMPLE);
  assert.ok(units.includes('Background'));
  assert.ok(units.includes('Atlas is the billing platform.'));
  assert.ok(
    !units.some((u) => u.startsWith('Background Atlas')),
    'heading must not be glued to the next sentence',
  );
});

test('splitSentences survives abbreviations and decimals', () => {
  const units = splitSentences('Dr. Patel measured 3.5 units. Then she stopped.');
  assert.equal(units.length, 2);
  assert.equal(units[0], 'Dr. Patel measured 3.5 units.');
});

test('looksLikeHeading distinguishes titles from statements', () => {
  assert.equal(looksLikeHeading('Open questions'), true);
  assert.equal(looksLikeHeading('Atlas is the billing platform.'), false);
});

test('extractiveSummary prefers statements over headings', () => {
  const summary = extractiveSummary(SAMPLE, 3);
  assert.ok(summary.length > 0);
  assert.ok(summary.every((s) => !looksLikeHeading(s)));
});

test('extractActionItems finds owner and due date', () => {
  const items = extractActionItems(SAMPLE);
  const dana = items.find((i) => i.owner === 'Dana');
  assert.ok(dana, 'expected an action item owned by Dana');
  assert.match(dana!.text.toLowerCase(), /deployment checklist/);
  assert.match(dana!.due ?? '', /April 3/i);
});

test('extractDecisions returns readable statements', () => {
  const decisions = extractDecisions(SAMPLE);
  assert.ok(decisions.length >= 1);
  assert.ok(
    decisions.every((d) => !/^(that|to|on|with)\b/i.test(d.text)),
    'decisions must not start with a dangling connective',
  );
});

test('extractQuestions picks up open questions', () => {
  const questions = extractQuestions(SAMPLE);
  assert.ok(questions.some((q) => q.text.includes('rollback criteria')));
});

test('extractDefinitions captures "X is Y" and "X: Y" shapes', () => {
  const defs = extractDefinitions(
    'Atlas is the billing platform used by finance. Chunking: splitting a document into passages.',
  );
  const terms = defs.map((d) => d.term.toLowerCase());
  assert.ok(terms.includes('atlas'));
  assert.ok(terms.includes('chunking'));
});

test('keywords surface domain terms, not stopwords', () => {
  const terms = keywords(SAMPLE, 6).map((k) => k.item);
  assert.ok(terms.some((t) => t.includes('atlas')));
  assert.ok(!terms.includes('the'));
});

test('clusterTopics returns non-overlapping topics', () => {
  const topics = clusterTopics(SAMPLE, 4);
  assert.ok(topics.length > 0);
  assert.ok(topics.every((t) => t.sentences.length > 0));
});

test('stem normalises common inflections', () => {
  assert.equal(stem('risks'), stem('risk'));
  assert.equal(stem('deployments'), stem('deployment'));
  assert.equal(stem('running'), 'runn');
});

test('detectLanguage identifies scripts and latin languages', () => {
  assert.equal(detectLanguage('这是一个测试文档，用于检测语言。'), 'zh');
  assert.equal(detectLanguage('The quick brown fox and the lazy dog is here'), 'en');
});

test('estimateTokens is monotonic and non-zero', () => {
  assert.equal(estimateTokens(''), 0);
  assert.ok(estimateTokens('hello world') > 0);
  assert.ok(estimateTokens('a'.repeat(400)) > estimateTokens('a'.repeat(100)));
});
