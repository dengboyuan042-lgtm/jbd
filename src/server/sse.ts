/** Server-sent events helper with a uniform JSON envelope. */
export type SseEvent = { type: string; [key: string]: unknown };

export function sseStream(
  producer: (emit: (event: SseEvent) => void, signal: AbortSignal) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const controllerRef: { aborted: boolean } = { aborted: false };
  const abort = new AbortController();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: SseEvent) => {
        if (controllerRef.aborted) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        await producer(emit, abort.signal);
      } catch (error) {
        emit({
          type: 'error',
          message: error instanceof Error ? error.message : 'Stream failed.',
        });
      } finally {
        if (!controllerRef.aborted) {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      }
    },
    cancel() {
      controllerRef.aborted = true;
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}
