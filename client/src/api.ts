/**
 * Client for the benchmark server's SSE endpoint.
 * Calls handlers: onStart, onLevelStart, onProgress, onLevelResult, onDone, onError.
 */
import type {
  DonePayload,
  LevelResult,
  LevelStartPayload,
  LoadTestConfig,
  LoadTestHandlers,
  ProgressPayload,
  StartPayload,
} from './types';

export async function streamLoadTest(config: LoadTestConfig, handlers: LoadTestHandlers): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/load-test/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
  } catch {
    handlers.onError?.(
      'Cannot reach the benchmark server. Start it with "npm run dev" in the project root (it listens on port 4000).'
    );
    return;
  }

  if (!res.ok || !res.body) {
    let message = `Benchmark server error (HTTP ${res.status}).`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* keep generic message */
    }
    handlers.onError?.(message);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const dispatch = (rawEvent: string) => {
    let event = 'message';
    let data = '';
    for (const line of rawEvent.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (!data) return;
    let payload: unknown;
    try {
      payload = JSON.parse(data);
    } catch {
      return;
    }
    switch (event) {
      case 'start':
        handlers.onStart?.(payload as StartPayload);
        break;
      case 'level_start':
        handlers.onLevelStart?.(payload as LevelStartPayload);
        break;
      case 'progress':
        handlers.onProgress?.(payload as ProgressPayload);
        break;
      case 'level_result':
        handlers.onLevelResult?.(payload as LevelResult);
        break;
      case 'done':
        handlers.onDone?.(payload as DonePayload);
        break;
      case 'aborted':
        handlers.onAborted?.();
        break;
      case 'error':
        handlers.onError?.((payload as { message?: string }).message || 'Benchmark failed.');
        break;
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        dispatch(rawEvent);
      }
    }
  } catch {
    if (!handlers.wasAborted()) {
      handlers.onError?.('Connection to the benchmark server was lost.');
    }
  }
}
