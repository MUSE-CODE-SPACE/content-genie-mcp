/**
 * Tests for the runScraper helper — the central reliability primitive.
 *
 * Covers the three target outcomes:
 *   - status: 'ok'         (fresh data)
 *   - status: 'stale'      (cache fallback when fetcher fails)
 *   - status: 'unavailable' (no cache + circuit open)
 *
 * Also exercises the cache-hit path explicitly.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { runScraper, getScraperCache } from '../scrapers/shared.js';
import { resetAllBreakers, getBreaker } from '../core/circuitBreaker.js';

beforeEach(() => {
  resetAllBreakers();
  getScraperCache().clear();
});

describe('runScraper', () => {
  it('returns status=ok and caches on first successful fetch', async () => {
    const result = await runScraper('test_ok', async () => [
      { keyword: 'fresh', platform: 'test_ok', rank: 1, source: 'test' },
    ]);
    expect(result.status).toBe('ok');
    expect(result.data[0].keyword).toBe('fresh');
    // Cache populated
    const cached = getScraperCache().get('test_ok');
    expect(cached?.[0].keyword).toBe('fresh');
  });

  it('serves cache hit without invoking fetcher again', async () => {
    const fetcher = jest.fn(async () => [
      { keyword: 'cached', platform: 'test_cache', rank: 1, source: 'test' },
    ]);
    await runScraper('test_cache', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Second call should hit the cache
    const result = await runScraper('test_cache', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1); // still 1
    expect(result.status).toBe('ok');
    expect(result.data[0].keyword).toBe('cached');
  });

  it('returns status=stale with cached data when fetcher fails after cache populated', async () => {
    // Seed the shared cache directly with a "previously good" entry.
    const cache = getScraperCache();
    cache.set('test_stale', [
      { keyword: 'pre_seeded', platform: 'test_stale', rank: 1, source: 'pre' },
    ]);

    // Age the entry beyond TTL by mutating storedAt via re-set with a
    // back-dated storedAt. Easiest way: use a fresh LRU with tiny TTL
    // wouldn't work since runScraper uses the singleton. Instead use fake
    // timers around the runScraper call so Date.now() returns a future
    // time that's past the 15-min TTL.
    jest.useFakeTimers({ doNotFake: ['setTimeout', 'setImmediate', 'nextTick'] });
    try {
      jest.setSystemTime(Date.now() + 20 * 60_000);

      const result = await runScraper('test_stale', async () => {
        throw new Error('upstream broken');
      });

      expect(result.status).toBe('stale');
      expect(result.data[0].keyword).toBe('pre_seeded');
      expect(result.error).toBe('upstream broken');
      expect(result.cachedAt).toBeDefined();
    } finally {
      jest.useRealTimers();
    }
  });

  it('returns status=unavailable when no cache and fetcher fails', async () => {
    const result = await runScraper('test_down', async () => {
      throw new Error('site offline');
    });
    expect(result.status).toBe('unavailable');
    expect(result.data).toEqual([]);
    expect(result.error).toContain('site offline');
  });

  it('opens circuit after 3 failures and short-circuits subsequent calls', async () => {
    const fetcher = jest.fn(async () => {
      throw new Error('broken');
    });

    // 3 failures opens the breaker
    for (let i = 0; i < 3; i++) {
      await runScraper('test_circuit', fetcher);
    }
    expect(fetcher).toHaveBeenCalledTimes(3);
    const breaker = getBreaker('test_circuit');
    expect(breaker.getState()).toBe('open');

    // 4th call: runScraper still returns gracefully, but the fetcher is
    // NOT invoked because the breaker short-circuits.
    const result = await runScraper('test_circuit', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(3); // unchanged
    expect(result.status).toBe('unavailable');
    expect(result.error).toMatch(/Circuit open/);
  });
});
