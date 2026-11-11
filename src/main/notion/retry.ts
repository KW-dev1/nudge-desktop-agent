// Rate limiting and retry for Notion calls. Pure logic with an injectable
// clock, so the backoff rules are unit tested without waiting.

export type RetryOptions = {
  /** Total tries, including the first. */
  maxAttempts?: number;
  /** First backoff delay. Doubles on each retry. */
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The parts of a Notion SDK error this file looks at. */
type HttpError = { status?: number; code?: string; headers?: unknown };

/** Read Retry-After (seconds) from either a Headers object or a plain record. */
function retryAfterMs(headers: unknown): number | null {
  let raw: unknown;
  if (headers && typeof (headers as Headers).get === 'function') raw = (headers as Headers).get('retry-after');
  else if (headers && typeof headers === 'object') raw = (headers as Record<string, unknown>)['retry-after'];
  const seconds = Number(raw);
  return raw != null && raw !== '' && Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
}

/**
 * Worth another try: rate limits (429), server-side trouble (5xx), and
 * timeouts. Everything else (bad token, missing page, bad request) will fail
 * the same way again, so it is thrown at once.
 */
export function isRetryable(error: unknown): boolean {
  const e = (error ?? {}) as HttpError;
  if (e.status === 429) return true;
  if (typeof e.status === 'number' && e.status >= 500) return true;
  return e.code === 'notionhq_client_request_timeout';
}

/**
 * Run `fn`, retrying on rate limits and server errors.
 * A 429 waits for the Retry-After time Notion asks for. Without that header
 * the wait doubles each time: 1 s, 2 s, 4 s, up to the cap.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { maxAttempts = 5, baseDelayMs = 1000, maxDelayMs = 30_000, sleep = realSleep } = options;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= maxAttempts || !isRetryable(error)) throw error;
      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const asked = retryAfterMs((error as HttpError).headers);
      await sleep(Math.min(maxDelayMs, asked ?? backoff));
    }
  }
}

/**
 * Returns a function that runs tasks one at a time with at least `gapMs`
 * between starts. This keeps the app under Notion's rate limit instead of
 * relying on 429 responses to slow it down.
 */
export function createThrottle(
  gapMs: number,
  now: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = realSleep,
): <T>(task: () => Promise<T>) => Promise<T> {
  let queue: Promise<unknown> = Promise.resolve();
  let lastStart = -Infinity;

  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(async () => {
      const wait = lastStart + gapMs - now();
      if (wait > 0) await sleep(wait);
      lastStart = now();
      return task();
    });
    // The queue moves on whether the task worked or not.
    queue = run.catch(() => {});
    return run;
  };
}
