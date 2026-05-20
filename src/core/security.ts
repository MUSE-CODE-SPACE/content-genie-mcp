/**
 * Security utilities for content-genie-mcp.
 *
 * Ported & adapted from vibe-coding-mcp/src/core/security.ts.
 *
 * What this covers:
 *   - Path traversal guard for any tool that touches the filesystem.
 *   - SSRF / host whitelist guard for user-supplied URLs (e.g.
 *     analyze_competitor_content) — defaults to the common Korean
 *     content/commerce/social hosts, overridable via the env var
 *     CONTENT_GENIE_ALLOWED_HOSTS (comma-separated suffix list).
 *   - fetchWithRetry: hard 30s timeout, 5 MB response body cap, exponential
 *     backoff on 429/5xx, AbortController-based cancellation.
 *   - Internal-network guard so an attacker can't redirect us to
 *     169.254.169.254 (cloud metadata), 127.0.0.0/8, 10/8, 192.168/16, etc.
 */

import * as path from 'path';
import { ToolError } from './errors.js';

// ---------------------------------------------------------------------------
// Path validation
// ---------------------------------------------------------------------------

/**
 * Validates that `filePath` resolves to a location inside `allowedDir`.
 * Throws ToolError(VALIDATION_ERROR) on traversal.
 */
export function validatePathWithinDirectory(filePath: string, allowedDir: string): string {
  const resolvedPath = path.resolve(filePath);
  const resolvedAllowedDir = path.resolve(allowedDir);

  if (
    !resolvedPath.startsWith(resolvedAllowedDir + path.sep) &&
    resolvedPath !== resolvedAllowedDir
  ) {
    throw new ToolError(
      'Path traversal detected: file path escapes allowed directory',
      'VALIDATION_ERROR',
      { filePath, allowedDir }
    );
  }

  return resolvedPath;
}

/**
 * Sanitizes a user-supplied filename so it can be safely written to disk.
 */
export function sanitizeFilename(filename: string, maxLength = 200): string {
  return filename
    .replace(/\.\./g, '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLength);
}

// ---------------------------------------------------------------------------
// URL / host validation
// ---------------------------------------------------------------------------

/**
 * Default allow-list of public Korean content / commerce / search / social
 * domains that content-genie's scraping tools legitimately need to reach.
 * Each entry is matched as `hostname === host || hostname.endsWith('.' + host)`.
 *
 * Override at runtime by setting CONTENT_GENIE_ALLOWED_HOSTS to a
 * comma-separated list (e.g. "example.com,blog.example.com").
 */
export const DEFAULT_ALLOWED_HOSTS: string[] = [
  // Search / portal
  'naver.com',
  'daum.net',
  'kakao.com',
  'google.com',
  'google.co.kr',
  'zum.com',
  // Video / social
  'youtube.com',
  'youtu.be',
  'instagram.com',
  'tiktok.com',
  'threads.net',
  'twitter.com',
  'x.com',
  'facebook.com',
  // Blogging / publishing
  'tistory.com',
  'blog.naver.com',
  'brunch.co.kr',
  'velog.io',
  'medium.com',
  // Commerce
  'coupang.com',
  'gmarket.co.kr',
  '11st.co.kr',
  'auction.co.kr',
  'ssg.com',
  // Trends / analytics
  'trends.google.com',
  'trends.google.co.kr',
  'socialblade.com',
];

/**
 * Webhook host whitelists (kept for parity with vibe-coding security utils;
 * content-genie does not currently publish webhooks but exposing these
 * constants makes future ports trivial).
 */
export const SLACK_ALLOWED_HOSTS = ['hooks.slack.com'];
export const DISCORD_ALLOWED_HOSTS = ['discord.com', 'discordapp.com'];

/**
 * Reads CONTENT_GENIE_ALLOWED_HOSTS at call time so tests / runtime overrides
 * work without restart. Empty / unset → DEFAULT_ALLOWED_HOSTS.
 */
export function getAllowedHosts(): string[] {
  const raw = process.env.CONTENT_GENIE_ALLOWED_HOSTS;
  if (!raw || !raw.trim()) return DEFAULT_ALLOWED_HOSTS;
  return raw
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Returns true if `hostname` looks like a private / loopback / link-local IP.
 * Used to block SSRF attempts even when an attacker passes a hostname that
 * resolves to an internal IP literal directly in the URL.
 *
 * Note: this is a best-effort string check — full DNS-level protection
 * requires a custom DNS resolver, which is beyond Phase 1 scope.
 */
export function isPrivateOrLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '0.0.0.0' || h === '::1' || h === '::') return true;
  if (h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;

  // IPv4 literals
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true; // multicast / reserved
  }

  // IPv6 link-local / unique-local
  if (h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true;

  return false;
}

/**
 * Validates a user-supplied URL is HTTP/HTTPS, points to an allowed public
 * host, and doesn't target internal infrastructure. Throws on rejection.
 *
 * Use this for any tool that fetches a URL the LLM/user provided directly
 * (e.g. analyze_competitor_content). For known, hard-coded scraper targets
 * (naver/daum/google scrapers) use {@link fetchWithRetry} directly — they
 * don't need host validation but still benefit from timeout + body cap.
 */
export function validatePublicUrl(url: string, allowedHosts: string[] = getAllowedHosts()): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ToolError(
      'Invalid URL format',
      'VALIDATION_ERROR',
      { url: url.slice(0, 100) }
    );
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ToolError(
      `URL must use http or https protocol (got "${parsed.protocol}")`,
      'VALIDATION_ERROR',
      { url: url.slice(0, 100) }
    );
  }

  if (isPrivateOrLoopbackHost(parsed.hostname)) {
    throw new ToolError(
      'URL targets an internal/private network address',
      'VALIDATION_ERROR',
      { hostname: parsed.hostname }
    );
  }

  const host = parsed.hostname.toLowerCase();
  const allowed = allowedHosts.some(
    (h) => host === h || host.endsWith('.' + h)
  );

  if (!allowed) {
    throw new ToolError(
      `Host "${host}" is not in the allowed-hosts whitelist. ` +
        `Override via CONTENT_GENIE_ALLOWED_HOSTS env var if needed.`,
      'VALIDATION_ERROR',
      { hostname: host, allowedHosts }
    );
  }

  return parsed;
}

/**
 * Slack/Discord-style strict webhook URL validator (HTTPS-only, host-matched).
 * Kept for cross-repo parity.
 */
export function validateWebhookUrl(url: string, allowedHosts: string[]): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      throw new ToolError(
        'Webhook URL must use HTTPS protocol',
        'VALIDATION_ERROR',
        { url: url.slice(0, 50) }
      );
    }
    const ok = allowedHosts.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith('.' + host)
    );
    if (!ok) {
      throw new ToolError(
        `Webhook URL must be from allowed hosts: ${allowedHosts.join(', ')}`,
        'VALIDATION_ERROR',
        { hostname: parsed.hostname }
      );
    }
  } catch (error) {
    if (error instanceof ToolError) throw error;
    throw new ToolError(
      'Invalid webhook URL format',
      'VALIDATION_ERROR',
      { url: url.slice(0, 50) }
    );
  }
}

// ---------------------------------------------------------------------------
// Fetch with timeout + retry + body cap
// ---------------------------------------------------------------------------

export interface FetchWithRetryOptions {
  /** Per-attempt timeout in milliseconds. Default 30 000. */
  timeout?: number;
  /** Max retry attempts after the initial request. Default 3. */
  maxRetries?: number;
  /** Initial retry delay; doubled each attempt unless Retry-After is set. Default 1 000. */
  retryDelay?: number;
  /** HTTP status codes that trigger a retry. Default [429, 500, 502, 503, 504]. */
  retryStatusCodes?: number[];
  /** Hard cap on response body size in bytes. Default 5 MiB. */
  maxBodyBytes?: number;
}

/**
 * Result of a successful {@link fetchWithRetry} call.
 * `body` is already read (bounded by maxBodyBytes) so cheerio etc. can use
 * it without further async work — and so we can enforce the DOS cap.
 */
export interface FetchResult {
  status: number;
  statusText: string;
  headers: Headers;
  body: string;
  url: string;
}

const DEFAULT_MAX_BODY = 5 * 1024 * 1024; // 5 MiB

/**
 * fetch() wrapper with:
 *   - AbortController timeout (default 30 s)
 *   - exponential backoff on 429 / 5xx with Retry-After honored
 *   - hard cap on response body size to defeat malicious huge-response DOS
 *   - structured ToolError on failure (TIMEOUT, NETWORK_ERROR, BODY_TOO_LARGE,
 *     PLATFORM_ERROR for non-retryable 4xx)
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  options: FetchWithRetryOptions = {}
): Promise<FetchResult> {
  const {
    timeout = 30_000,
    maxRetries = 3,
    retryDelay = 1_000,
    retryStatusCodes = [429, 500, 502, 503, 504],
    maxBodyBytes = DEFAULT_MAX_BODY,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      // Retry on transient server errors
      if (retryStatusCodes.includes(response.status) && attempt < maxRetries) {
        clearTimeout(timeoutId);
        // Drain body so the connection can be reused
        try {
          await response.arrayBuffer();
        } catch {
          /* ignore */
        }
        const retryAfter = response.headers.get('retry-after');
        const delay = retryAfter
          ? Math.max(0, parseInt(retryAfter, 10)) * 1000
          : retryDelay * Math.pow(2, attempt);
        await sleep(delay);
        continue;
      }

      // Stream the body but stop reading once we hit the size cap.
      const body = await readBodyWithCap(response, maxBodyBytes, controller, timeoutId);
      clearTimeout(timeoutId);

      return {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        body,
        url: response.url || url,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof ToolError) {
        // BODY_TOO_LARGE etc. — don't retry, surface immediately.
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          lastError = new ToolError(
            `Request timed out after ${timeout}ms`,
            'TIMEOUT',
            { url: url.slice(0, 100), attempt }
          );
        } else {
          lastError = error;
        }
      } else {
        lastError = new Error(String(error));
      }

      if (attempt < maxRetries) {
        await sleep(retryDelay * Math.pow(2, attempt));
        continue;
      }
    }
  }

  throw lastError instanceof ToolError
    ? lastError
    : new ToolError(
        lastError?.message || 'Request failed after retries',
        'NETWORK_ERROR',
        { url: url.slice(0, 100) }
      );
}

/**
 * Reads response body in chunks, aborting the request if it exceeds the cap.
 */
async function readBodyWithCap(
  response: Response,
  maxBodyBytes: number,
  controller: AbortController,
  timeoutId: ReturnType<typeof setTimeout>
): Promise<string> {
  // Cheap pre-check via Content-Length header
  const declared = response.headers.get('content-length');
  if (declared) {
    const n = parseInt(declared, 10);
    if (Number.isFinite(n) && n > maxBodyBytes) {
      controller.abort();
      clearTimeout(timeoutId);
      throw new ToolError(
        `Response body exceeds cap (${n} > ${maxBodyBytes} bytes)`,
        'BODY_TOO_LARGE',
        { contentLength: n, maxBodyBytes }
      );
    }
  }

  if (!response.body) {
    return await response.text();
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let received = 0;
  let out = '';

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBodyBytes) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      controller.abort();
      throw new ToolError(
        `Response body exceeds cap (>${maxBodyBytes} bytes)`,
        'BODY_TOO_LARGE',
        { receivedBytes: received, maxBodyBytes }
      );
    }
    out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
