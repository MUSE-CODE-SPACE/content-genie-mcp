/**
 * Tests for the LRU + TTL cache used by scrapers.
 */

import { LRUCache } from '../core/cache.js';

describe('LRUCache', () => {
  it('returns set value within TTL (cache hit)', () => {
    const cache = new LRUCache<string, number>({ ttlMs: 1000 });
    cache.set('foo', 42);
    expect(cache.get('foo')).toBe(42);
  });

  it('returns undefined for unknown key (cache miss)', () => {
    const cache = new LRUCache<string, number>();
    expect(cache.get('missing')).toBeUndefined();
  });

  it('expires entries after TTL', async () => {
    const cache = new LRUCache<string, number>({ ttlMs: 10 });
    cache.set('foo', 1);
    expect(cache.get('foo')).toBe(1);
    await new Promise((r) => setTimeout(r, 25));
    expect(cache.get('foo')).toBeUndefined();
  });

  it('peek() returns expired entries (used for stale fallback)', async () => {
    // get() returns undefined for expired entries but does NOT evict them,
    // so peek() can still serve stale data for the runScraper fallback path.
    const cache = new LRUCache<string, number>({ ttlMs: 10 });
    cache.set('foo', 99);
    await new Promise((r) => setTimeout(r, 25));
    expect(cache.get('foo')).toBeUndefined();
    const stale = cache.peek('foo');
    expect(stale?.value).toBe(99);
  });

  it('evicts least-recently-used entry when maxEntries exceeded', () => {
    const cache = new LRUCache<string, string>({ maxEntries: 3 });
    cache.set('a', 'A');
    cache.set('b', 'B');
    cache.set('c', 'C');

    // Touch 'a' so it's no longer the oldest
    cache.get('a');

    // Insert 'd' — should evict 'b' (oldest after touching 'a')
    cache.set('d', 'D');

    expect(cache.get('a')).toBe('A');
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe('C');
    expect(cache.get('d')).toBe('D');
  });

  it('inspect() reports entry ages and expiration', async () => {
    const cache = new LRUCache<string, number>({ ttlMs: 20 });
    cache.set('a', 1);
    await new Promise((r) => setTimeout(r, 30));
    cache.set('b', 2);
    const info = cache.inspect();
    expect(info).toHaveLength(2);
    const a = info.find((e) => e.key === 'a')!;
    const b = info.find((e) => e.key === 'b')!;
    expect(a.expired).toBe(true);
    expect(b.expired).toBe(false);
  });
});
