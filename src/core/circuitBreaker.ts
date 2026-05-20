/**
 * Per-source circuit breaker for the trend scrapers.
 *
 * Each scraper (naver/daum/google/youtube/zum) lives behind one
 * CircuitBreaker instance keyed by `source`. The breaker tracks consecutive
 * failures and opens the circuit (i.e. short-circuits future calls without
 * actually running them) once a threshold is hit. This protects us when
 * Naver / Daum HTML changes and our cheerio selectors silently break — we
 * stop hammering the source for `openMs` and let cached data / fallbacks
 * serve users.
 *
 * States:
 *   - closed     : normal operation, calls go through.
 *   - open       : last `failureThreshold` calls failed; calls are rejected
 *                  immediately for `openMs`.
 *   - half-open  : `openMs` has elapsed; the next call gets to try. On
 *                  success we go back to `closed`; on failure we go back to
 *                  `open` for another `openMs`.
 *
 * Defaults: 3 consecutive failures → open for 5 minutes.
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  /** Consecutive failures before the circuit opens. Default 3. */
  failureThreshold?: number;
  /** Duration (ms) the circuit stays open before half-open. Default 300_000 (5min). */
  openMs?: number;
  /** Clock source for tests. Default `Date.now`. */
  now?: () => number;
}

export interface CircuitStatus {
  source: string;
  state: CircuitState;
  consecutiveFailures: number;
  openedAt?: string;
  willRetryAt?: string;
  lastError?: string;
}

export class CircuitOpenError extends Error {
  public readonly source: string;
  public readonly willRetryAt: number;
  constructor(source: string, willRetryAt: number) {
    super(
      `Circuit open for source "${source}". Will retry at ${new Date(
        willRetryAt,
      ).toISOString()}.`,
    );
    this.name = 'CircuitOpenError';
    this.source = source;
    this.willRetryAt = willRetryAt;
  }
}

export class CircuitBreaker {
  public readonly source: string;
  private readonly failureThreshold: number;
  private readonly openMs: number;
  private readonly now: () => number;

  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private openedAt = 0;
  private lastError?: string;

  constructor(source: string, options: CircuitBreakerOptions = {}) {
    this.source = source;
    this.failureThreshold = options.failureThreshold ?? 3;
    this.openMs = options.openMs ?? 5 * 60_000;
    this.now = options.now ?? Date.now;
  }

  /**
   * Wraps `fn`. Throws `CircuitOpenError` immediately if the breaker is
   * open, otherwise runs `fn` and updates state based on success/failure.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      const elapsed = this.now() - this.openedAt;
      if (elapsed < this.openMs) {
        throw new CircuitOpenError(this.source, this.openedAt + this.openMs);
      }
      // Time's up — let one call through.
      this.state = 'half-open';
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err);
      throw err;
    }
  }

  /** Public state accessor. */
  getState(): CircuitState {
    // Lazily transition open -> half-open without requiring an execute() call.
    if (this.state === 'open' && this.now() - this.openedAt >= this.openMs) {
      return 'half-open';
    }
    return this.state;
  }

  /** Snapshot for the resource://content-genie/sources resource. */
  getStatus(): CircuitStatus {
    return {
      source: this.source,
      state: this.getState(),
      consecutiveFailures: this.consecutiveFailures,
      openedAt: this.openedAt ? new Date(this.openedAt).toISOString() : undefined,
      willRetryAt:
        this.state === 'open'
          ? new Date(this.openedAt + this.openMs).toISOString()
          : undefined,
      lastError: this.lastError,
    };
  }

  /** Test helper — fully reset to closed state. */
  reset(): void {
    this.state = 'closed';
    this.consecutiveFailures = 0;
    this.openedAt = 0;
    this.lastError = undefined;
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = 'closed';
    this.openedAt = 0;
    this.lastError = undefined;
  }

  private onFailure(err: unknown): void {
    this.consecutiveFailures++;
    this.lastError = err instanceof Error ? err.message : String(err);

    if (this.state === 'half-open' || this.consecutiveFailures >= this.failureThreshold) {
      this.state = 'open';
      this.openedAt = this.now();
    }
  }
}

/**
 * Module-level registry of circuit breakers keyed by source name. Used by
 * scrapers AND by the `resource://content-genie/sources` resource so the
 * snapshot includes the same instances actually serving traffic.
 */
const breakers = new Map<string, CircuitBreaker>();

export function getBreaker(
  source: string,
  options?: CircuitBreakerOptions,
): CircuitBreaker {
  let b = breakers.get(source);
  if (!b) {
    b = new CircuitBreaker(source, options);
    breakers.set(source, b);
  }
  return b;
}

export function getAllBreakerStatuses(): CircuitStatus[] {
  return Array.from(breakers.values()).map((b) => b.getStatus());
}

/** Test-only — clear the singleton registry. */
export function resetAllBreakers(): void {
  for (const b of breakers.values()) b.reset();
  breakers.clear();
}
