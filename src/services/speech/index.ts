import { env } from '@/lib/env';
import { detectLanguage as detect, splitSentences } from '@/services/ai/nlp';
import type {
  PartialTranscript,
  SpeechProvider,
  TranscribeOptions,
  TranscriptSegmentData,
  TranscriptionResult,
} from './types';

export * from './types';

/* ─────────────────────────── shared utilities ─────────────────────────── */

/**
 * Turn a flat word/segment stream into readable paragraphs: merge fragments,
 * break on long pauses and sentence boundaries, restore terminal punctuation.
 */
export function segmentize(
  segments: TranscriptSegmentData[],
  options: { pauseThreshold?: number; maxChars?: number } = {},
): TranscriptSegmentData[] {
  const pause = options.pauseThreshold ?? 1.1;
  const maxChars = options.maxChars ?? 320;
  const out: TranscriptSegmentData[] = [];

  for (const segment of segments) {
    const previous = out[out.length - 1];
    const sameSpeaker = previous && previous.speaker === segment.speaker;
    const gap = previous ? segment.start - previous.end : Infinity;
    const endsSentence = previous ? /[.!?。！？]$/.test(previous.text.trim()) : true;

    if (
      previous &&
      sameSpeaker &&
      gap < pause &&
      !endsSentence &&
      previous.text.length + segment.text.length < maxChars
    ) {
      previous.text = `${previous.text.trim()} ${segment.text.trim()}`.trim();
      previous.end = segment.end;
      continue;
    }
    out.push({ ...segment, ordinal: out.length });
  }

  return out.map((s, i) => ({ ...s, ordinal: i, text: punctuate(s.text) }));
}

/** Light punctuation/casing repair for ASR output that lacks it. */
export function punctuate(text: string): string {
  let t = text.replace(/\s+/g, ' ').trim();
  if (!t) return t;
  t = t.charAt(0).toUpperCase() + t.slice(1);
  t = t.replace(/\bi\b/g, 'I');
  if (!/[.!?,;:。！？]$/.test(t)) t += '.';
  return t;
}

/* ─────────────────────────── local provider ───────────────────────────── */

/**
 * Offline provider.
 *
 * Server-side ASR needs a model; there isn't one bundled here. Rather than
 * fabricating a transcript, this provider:
 *   • performs real diarisation over segments the browser recogniser produced
 *   • performs real punctuation, segmentation and language detection
 *   • reports honestly when asked to transcribe raw audio with no engine
 *
 * The live Record workspace uses the browser's on-device recogniser through
 * `BrowserSpeechProvider` on the client, so realtime transcription works today.
 */
export class LocalSpeechProvider implements SpeechProvider {
  readonly id = 'local';
  readonly label = 'Built-in engine';
  readonly hosted = false;
  readonly supportsStreaming = false;

  async transcribe(
    _audio: Buffer,
    _mimeType: string,
    _options?: TranscribeOptions,
  ): Promise<TranscriptionResult> {
    throw new SpeechUnavailableError(
      'Server-side transcription is not configured. Record in the browser (on-device recognition) or set SPEECH_DRIVER to a hosted provider.',
    );
  }

  async detectLanguage(text: string): Promise<string> {
    return detect(text);
  }

  /**
   * Turn-taking diarisation: speaker changes are inferred from silence gaps
   * and discourse cues. Real acoustic diarisation replaces this when a hosted
   * provider is configured — the downstream data shape is identical.
   */
  async diarize(segments: TranscriptSegmentData[]): Promise<TranscriptSegmentData[]> {
    const cue = /^(?:so|okay|ok|right|yeah|yes|no|well|actually|thanks|thank you|hi|hello|good (?:morning|afternoon)|and |but )/i;
    let speaker = 0;
    return segments.map((segment, i) => {
      if (segment.speaker) return segment;
      const previous = segments[i - 1];
      if (previous) {
        const gap = segment.start - previous.end;
        const question = /\?$/.test(previous.text.trim());
        if (gap > 1.6 || (gap > 0.7 && (question || cue.test(segment.text)))) {
          speaker = (speaker + 1) % 4;
        }
      }
      return { ...segment, speaker: `Speaker ${speaker + 1}` };
    });
  }
}

export class SpeechUnavailableError extends Error {
  readonly status = 501;
}

/* ─────────────────────────── OpenAI Whisper ───────────────────────────── */

class WhisperProvider implements SpeechProvider {
  readonly id = 'openai-whisper';
  readonly label = 'Whisper';
  readonly hosted = true;
  readonly supportsStreaming = false;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
  ) {}

  async transcribe(
    audio: Buffer,
    mimeType: string,
    options: TranscribeOptions = {},
  ): Promise<TranscriptionResult> {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType }), 'audio');
    form.append('model', 'whisper-1');
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');
    if (options.language) form.append('language', options.language);
    if (options.prompt) form.append('prompt', options.prompt);

    const res = await fetch(`${this.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}` },
      body: form,
      signal: options.signal,
    });
    if (!res.ok) throw new Error(`Whisper: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as any;

    let segments: TranscriptSegmentData[] = (data.segments ?? []).map(
      (s: any, i: number) => ({
        ordinal: i,
        start: s.start,
        end: s.end,
        text: String(s.text).trim(),
        confidence: s.no_speech_prob != null ? 1 - s.no_speech_prob : undefined,
      }),
    );
    if (!segments.length && data.text) {
      segments = splitSentences(data.text).map((text, i) => ({
        ordinal: i,
        start: 0,
        end: data.duration ?? 0,
        text,
      }));
    }
    if (options.diarize !== false) {
      segments = await new LocalSpeechProvider().diarize(segments);
    }
    segments = segmentize(segments);

    return {
      provider: this.id,
      language: data.language ?? options.language ?? detect(data.text ?? ''),
      text: data.text ?? segments.map((s) => s.text).join(' '),
      duration: data.duration ?? segments.at(-1)?.end ?? 0,
      segments,
      speakers: [...new Set(segments.map((s) => s.speaker).filter(Boolean) as string[])],
    };
  }

  async translate(text: string, target: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: `Translate to ${target}. Output only the translation.` },
          { role: 'user', content: text },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Translate: ${res.status}`);
    const data = (await res.json()) as any;
    return data.choices?.[0]?.message?.content ?? text;
  }

  async detectLanguage(text: string): Promise<string> {
    return detect(text);
  }

  async diarize(segments: TranscriptSegmentData[]): Promise<TranscriptSegmentData[]> {
    return new LocalSpeechProvider().diarize(segments);
  }
}

/* ─────────────────────────── Deepgram ─────────────────────────────────── */

class DeepgramProvider implements SpeechProvider {
  readonly id = 'deepgram';
  readonly label = 'Deepgram';
  readonly hosted = true;
  readonly supportsStreaming = true;

  constructor(private readonly apiKey: string) {}

  async transcribe(
    audio: Buffer,
    mimeType: string,
    options: TranscribeOptions = {},
  ): Promise<TranscriptionResult> {
    const params = new URLSearchParams({
      model: 'nova-2',
      smart_format: 'true',
      punctuate: 'true',
      paragraphs: 'true',
      diarize: String(options.diarize !== false),
      ...(options.language ? { language: options.language } : { detect_language: 'true' }),
    });
    const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
      method: 'POST',
      headers: { authorization: `Token ${this.apiKey}`, 'content-type': mimeType },
      body: new Uint8Array(audio),
      signal: options.signal,
    });
    if (!res.ok) throw new Error(`Deepgram: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as any;
    const alt = data.results?.channels?.[0]?.alternatives?.[0];
    const words = alt?.words ?? [];

    const segments: TranscriptSegmentData[] = [];
    let current: TranscriptSegmentData | null = null;
    for (const w of words) {
      const speaker = w.speaker != null ? `Speaker ${w.speaker + 1}` : undefined;
      if (!current || current.speaker !== speaker || w.start - current.end > 1.4) {
        current = {
          ordinal: segments.length,
          start: w.start,
          end: w.end,
          text: w.punctuated_word ?? w.word,
          speaker,
          confidence: w.confidence,
        };
        segments.push(current);
      } else {
        current.text += ` ${w.punctuated_word ?? w.word}`;
        current.end = w.end;
        }
    }

    return {
      provider: this.id,
      language: data.results?.channels?.[0]?.detected_language ?? options.language ?? 'en',
      text: alt?.transcript ?? '',
      duration: data.metadata?.duration ?? segments.at(-1)?.end ?? 0,
      segments: segmentize(segments),
      speakers: [...new Set(segments.map((s) => s.speaker).filter(Boolean) as string[])],
    };
  }

  async *streamTranscribe(
    audio: AsyncIterable<Uint8Array>,
    options: TranscribeOptions = {},
  ): AsyncIterable<PartialTranscript> {
    // Deepgram's realtime API is WebSocket-based; the HTTP streaming shim keeps
    // the interface uniform for callers that only have an async byte iterable.
    const chunks: Uint8Array[] = [];
    for await (const chunk of audio) chunks.push(chunk);
    const result = await this.transcribe(
      Buffer.concat(chunks.map((c) => Buffer.from(c))),
      'audio/webm',
      options,
    );
    for (const segment of result.segments) {
      yield {
        final: true,
        text: segment.text,
        start: segment.start,
        end: segment.end,
        speaker: segment.speaker,
        confidence: segment.confidence,
      };
    }
  }

  async detectLanguage(text: string): Promise<string> {
    return detect(text);
  }

  async diarize(segments: TranscriptSegmentData[]): Promise<TranscriptSegmentData[]> {
    return segments;
  }
}

let instance: SpeechProvider | null = null;

export function speech(): SpeechProvider {
  if (instance) return instance;
  const e = env();
  switch (e.SPEECH_DRIVER) {
    case 'openai-whisper':
      instance = e.OPENAI_API_KEY
        ? new WhisperProvider(e.OPENAI_API_KEY, e.OPENAI_BASE_URL)
        : new LocalSpeechProvider();
      break;
    case 'deepgram':
      instance = e.DEEPGRAM_API_KEY
        ? new DeepgramProvider(e.DEEPGRAM_API_KEY)
        : new LocalSpeechProvider();
      break;
    default:
      instance = new LocalSpeechProvider();
  }
  return instance;
}

export function speechInfo() {
  const p = speech();
  return {
    provider: p.id,
    label: p.label,
    hosted: p.hosted,
    supportsStreaming: p.supportsStreaming,
  };
}

