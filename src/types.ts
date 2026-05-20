/**
 * Shared Zod schemas + type aliases for the content-genie-mcp tools.
 *
 * Centralized so the tool modules (src/tools/*.ts) don't redefine the same
 * platform/content-type/category enums in 17 different places.
 */

import { z } from 'zod';

export const TrendPlatformSchema = z.enum([
  'naver',
  'google',
  'youtube',
  'daum',
  'zum',
  'all',
]);
export type TrendPlatform = z.infer<typeof TrendPlatformSchema>;

export const TrendCategorySchema = z.enum([
  'general',
  'news',
  'shopping',
  'entertainment',
  'tech',
  'finance',
  'sports',
  'all',
]);
export type TrendCategory = z.infer<typeof TrendCategorySchema>;

export const ContentTypeSchema = z.enum([
  'blog',
  'youtube',
  'instagram',
  'tiktok',
  'newsletter',
  'threads',
  'twitter',
  'all',
]);
export type ContentType = z.infer<typeof ContentTypeSchema>;

export const ToneSchema = z.enum([
  'professional',
  'casual',
  'humorous',
  'educational',
  'inspirational',
  'provocative',
  'storytelling',
]);
export type Tone = z.infer<typeof ToneSchema>;

/**
 * Standard trend item shape returned by scrapers.
 * Scrapers may add platform-specific fields (e.g. `views`, `channel`),
 * so this is intentionally permissive.
 */
export interface TrendItem {
  keyword: string;
  platform: string;
  rank: number;
  category?: string;
  source: string;
  [key: string]: unknown;
}

/**
 * Result envelope returned by scrapers via the circuit-breaker layer.
 * `status: 'ok'` -> fresh data, `'stale'` -> served from cache, `'unavailable'`
 * -> circuit open or fetch failed and no cache to fall back on.
 */
export type ScrapeStatus = 'ok' | 'stale' | 'unavailable';

export interface ScrapeResult<T = TrendItem[]> {
  source: string;
  status: ScrapeStatus;
  data: T;
  fetchedAt: string;
  /** Present when status === 'stale' — ISO timestamp of the cached fetch. */
  cachedAt?: string;
  /** Present when status === 'unavailable'. */
  error?: string;
}
