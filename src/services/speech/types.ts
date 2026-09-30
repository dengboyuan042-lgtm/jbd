export type TranscriptWord = {
  text: string;
  start: number;
  end: number;
  confidence?: number;
};

export type TranscriptSegmentData = {
  ordinal: number;
  start: number;
  end: number;
  text: string;
  speaker?: string;
  confidence?: number;
  language?: string;
  words?: TranscriptWord[];
};

export type TranscriptionResult = {
  provider: string;
  language: string;
  text: string;
  duration: number;
  segments: TranscriptSegmentData[];
  speakers: string[];
};

export type TranscribeOptions = {
  language?: string;
  diarize?: boolean;
  /** best-effort punctuation/casing restoration */
  punctuate?: boolean;
  prompt?: string;
  signal?: AbortSignal;
};

export type PartialTranscript = {
  /** false while the recogniser may still revise this text */
  final: boolean;
  text: string;
  start: number;
  end: number;
  speaker?: string;
  confidence?: number;
};

export interface SpeechProvider {
  readonly id: string;
  readonly label: string;
  /** true when backed by a real hosted/offline ASR engine */
  readonly hosted: boolean;
  /** true when the provider can transcribe a live audio stream server-side */
  readonly supportsStreaming: boolean;

  transcribe(
    audio: Buffer,
    mimeType: string,
    options?: TranscribeOptions,
  ): Promise<TranscriptionResult>;

  streamTranscribe?(
    audio: AsyncIterable<Uint8Array>,
    options?: TranscribeOptions,
  ): AsyncIterable<PartialTranscript>;

  translate?(text: string, target: string): Promise<string>;

  detectLanguage(text: string): Promise<string>;

  /** Assign speaker labels to already-segmented text. */
  diarize(
    segments: TranscriptSegmentData[],
  ): Promise<TranscriptSegmentData[]>;
}
