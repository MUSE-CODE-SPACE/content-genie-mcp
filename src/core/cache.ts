/**
 * Simple Map-based LRU cache with TTL.
 *
 * Used by the scrapers (src/scrapers/*) to cache trend lookups for ~15 min
 * since real-time trend data on Naver / Daum / Google / YouTube / Zum doesn't
 * shift on a sub-15-min basis and these sources rate-limit aggressively.
 *
 * Implementation notes:
 *   - Insertion order in a Map IS the LRU order — Map.set() on an existing
 *     key keeps the original position, so we delete + reinsert on hit.
 *   - Expired entries are lazily evicted on get(); we do NOT run a timer.
 *   - Max entries = 100 by default. Suitable for ~10 sources × ~10 query
 *     variants — well within bounds.
 */

export interface CacheEntry<V> {
  value: V;
  /** Wall-clock ms timestamp when this entry was stored. */
  storedAt: number;
}

export interface LRUCacheOptions {
  /** Maximum entries before LRU eviction kicks in. Default 100. */
  maxEntries?: number;
  /** TTL in milliseconds. Default 15 * 60_000 (15 min). */
  ttlMs?: number;
}

export class LRUCache<K, V> {
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private readonly store = new Map<K, CacheEntry<V>>();

  constructor(options: LRUCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? 100;
    this.ttlMs = options.ttlMs ?? 15 * 60_000;
  }

  /**
   * Returns the value if still fresh, or `undefined` if missing/expired.
   * On hit, the entry is moved to the MRU position. Expired entries are
   * intentionally NOT evicted here — callers (specifically `runScraper`)
   * need to fall back to `peek()` to serve stale data. Eviction happens on
   * `set()` via the LRU bound, or explicitly via `delete()` / `clear()`.
   */
  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (Date.now() - entry.storedAt > this.ttlMs) {
      return undefined;
    }

    // Refresh LRU position
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  /**
   * Returns the entry (value + storedAt) without LRU promotion, even if
   * expired. Lets callers serve stale data when an upstream fetch fails.
   */
  peek(key: K): CacheEntry<V> | undefined {
    return this.store.get(key);
  }

  set(key: K, value: V): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxEntries) {
      // Evict least-recently-used (first item in insertion order)
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) {
        this.store.delete(oldest);
      }
    }

    this.store.set(key, { value, storedAt: Date.now() });
  }

  delete(key: K): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }

  /** Diagnostic — returns shallow snapshot of all keys + their age in ms. */
  inspect(): Array<{ key: K; ageMs: number; expired: boolean }> {
    const now = Date.now();
    return Array.from(this.store.entries()).map(([key, entry]) => ({
      key,
      ageMs: now - entry.storedAt,
      expired: now - entry.storedAt > this.ttlMs,
    }));
  }
}
