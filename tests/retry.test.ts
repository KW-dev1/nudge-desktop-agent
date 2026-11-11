import { describe, expect, it, vi } from 'vitest';
import { createThrottle, isRetryable, withRetry } from '../src/main/notion/retry';

/** A sleep that returns at once and records how long it was asked to wait. */
function fakeSleep() {
  const waits: number[] = [];
  return { waits, sleep: async (ms: number) => void waits.push(ms) };
}

const rateLimited = (retryAfter?: string) =>
  Object.assign(new Error('rate limited'), { status: 429, headers: retryAfter ? { 'retry-after': retryAfter } : {} });

describe('retry on 429 (section 4.4)', () => {
  it('waits for Retry-After and then succeeds', async () => {
    const { waits, sleep } = fakeSleep();
    const fn = vi.fn().mockRejectedValueOnce(rateLimited('2')).mockResolvedValue('ok');
    await expect(withRetry(fn, { sleep })).resolves.toBe('ok');
    expect(waits).toEqual([2000]);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('reads Retry-After from a Headers object too', async () => {
    const { waits, sleep } = fakeSleep();
    const error = Object.assign(new Error('x'), { status: 429, headers: new Headers({ 'Retry-After': '3' }) });
    const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('ok');
    await withRetry(fn, { sleep });
    expect(waits).toEqual([3000]);
  });

  it('backs off exponentially when there is no Retry-After', async () => {
    const { waits, sleep } = fakeSleep();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(rateLimited())
      .mockRejectedValueOnce(rateLimited())
      .mockRejectedValueOnce(rateLimited())
      .mockResolvedValue('ok');
    await withRetry(fn, { sleep });
    expect(waits).toEqual([1000, 2000, 4000]);
  });

  it('gives up after the maximum number of attempts', async () => {
    const { sleep } = fakeSleep();
    const fn = vi.fn().mockRejectedValue(rateLimited());
    await expect(withRetry(fn, { sleep, maxAttempts: 3 })).rejects.toThrow('rate limited');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('caps the wait', async () => {
    const { waits, sleep } = fakeSleep();
    const fn = vi.fn().mockRejectedValueOnce(rateLimited('600')).mockResolvedValue('ok');
    await withRetry(fn, { sleep, maxDelayMs: 30_000 });
    expect(waits).toEqual([30_000]);
  });

  it('retries server errors but not client errors', async () => {
    expect(isRetryable({ status: 503 })).toBe(true);
    expect(isRetryable({ status: 429 })).toBe(true);
    expect(isRetryable({ status: 401 })).toBe(false);
    expect(isRetryable({ status: 404 })).toBe(false);

    const { sleep } = fakeSleep();
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error('unauthorized'), { status: 401 }));
    await expect(withRetry(fn, { sleep })).rejects.toThrow('unauthorized');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('rate limiter', () => {
  it('spaces request starts by the minimum gap and keeps their order', async () => {
    let clock = 0;
    const starts: number[] = [];
    const throttle = createThrottle(
      350,
      () => clock,
      async (ms) => void (clock += ms),
    );
    const results = await Promise.all(
      [1, 2, 3, 4].map((n) =>
        throttle(async () => {
          starts.push(clock);
          return n;
        }),
      ),
    );
    expect(results).toEqual([1, 2, 3, 4]);
    expect(starts).toEqual([0, 350, 700, 1050]);
  });

  it('keeps going after a task fails', async () => {
    const throttle = createThrottle(0);
    await expect(throttle(async () => Promise.reject(new Error('nope')))).rejects.toThrow('nope');
    await expect(throttle(async () => 'next')).resolves.toBe('next');
  });
});
