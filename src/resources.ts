/**
 * MCP Resources exposed by content-genie-mcp.
 *
 *   - resource://content-genie/korean-events/{year}
 *       JSON dump of the KOREAN_EVENTS_DB rebased to the given year. Useful
 *       for the LLM to @-mention "all 2026 holidays" without a tool call.
 *
 *   - resource://content-genie/sources
 *       Snapshot of every scraper circuit breaker (state, consecutive
 *       failures, opened_at, will_retry_at). Lets the LLM degrade gracefully:
 *       if `naver` is open, propose using `daum` data, etc.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getEventsForYear } from './data/koreanEvents.js';
import { getAllBreakerStatuses, getBreaker } from './core/circuitBreaker.js';
import { getScraperCache } from './scrapers/shared.js';
import { getToolNames } from './core/registry.js';

const KNOWN_SOURCES = ['naver', 'daum', 'google', 'youtube', 'zum'] as const;

export function registerResources(server: McpServer): void {
  // --- korean-events/{year}
  server.registerResource(
    'korean-events',
    new ResourceTemplate('resource://content-genie/korean-events/{year}', {
      list: undefined,
    }),
    {
      title: 'Korean events database',
      description:
        '특정 연도의 한국 공휴일/기념일/시즌 이벤트 전체 목록 (JSON). URL에 4자리 연도를 넣으세요. 예: resource://content-genie/korean-events/2026',
      mimeType: 'application/json',
    },
    async (uri, vars) => {
      const yearStr = Array.isArray(vars.year) ? vars.year[0] : vars.year;
      const year = parseInt(String(yearStr || new Date().getFullYear()), 10);
      const events = getEventsForYear(Number.isFinite(year) ? year : new Date().getFullYear());
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                year,
                total: events.length,
                events,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // --- sources (circuit breaker status)
  server.registerResource(
    'sources',
    'resource://content-genie/sources',
    {
      title: 'Scraper source status',
      description:
        '스크래퍼별 회로 차단기 상태와 캐시 통계. 어떤 소스가 현재 사용 가능한지(closed) / 일시 차단(open) / 시험 호출(half-open) 중인지 확인합니다.',
      mimeType: 'application/json',
    },
    async (uri) => {
      // Touch every known source so its breaker is registered for inspection
      // even if it hasn't been called yet this process lifetime.
      for (const s of KNOWN_SOURCES) getBreaker(s);

      const breakers = getAllBreakerStatuses();
      const cache = getScraperCache();
      const cacheEntries = cache.inspect();

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                generated_at: new Date().toISOString(),
                tools_count: getToolNames().length,
                tools: getToolNames(),
                sources: breakers,
                cache: {
                  size: cache.size(),
                  entries: cacheEntries.map((e) => ({
                    key: e.key,
                    age_seconds: Math.round(e.ageMs / 1000),
                    expired: e.expired,
                  })),
                },
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
