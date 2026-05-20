/**
 * Shared helpers for scrapers (src/scrapers/*).
 *
 * Provides:
 *   - keyword categorization (used to tag scraped trends)
 *   - dynamic / event-based fallback keyword generation when scraping fails
 *   - `runScraper()` — wraps a scraper fn in circuit breaker + cache + last
 *     known good fallback. This is the central reliability primitive: if the
 *     site changes and our selectors break, we degrade gracefully instead of
 *     erroring out.
 */

import { getBreaker, CircuitOpenError } from '../core/circuitBreaker.js';
import { LRUCache } from '../core/cache.js';
import type { TrendItem, ScrapeResult } from '../types.js';
import { KOREAN_EVENTS_DB } from '../data/koreanEvents.js';

// ---------------------------------------------------------------------------
// Per-source response cache (15 min TTL, max 100 entries — Phase 4 spec)
// ---------------------------------------------------------------------------

const SCRAPER_CACHE = new LRUCache<string, TrendItem[]>({
  maxEntries: 100,
  ttlMs: 15 * 60_000,
});

/** Diagnostic — exported so the resources module can show cache health. */
export function getScraperCache(): LRUCache<string, TrendItem[]> {
  return SCRAPER_CACHE;
}

// ---------------------------------------------------------------------------
// runScraper — the reliability wrapper
// ---------------------------------------------------------------------------

export interface RunScraperOptions {
  /** Logical cache key. Default `source`. Use a richer key for parameterized fetches. */
  cacheKey?: string;
  /** If true, allow returning expired cache entries when fetch fails. Default true. */
  useStaleOnFailure?: boolean;
}

/**
 * Wrap a scraper function so it:
 *   1. Returns cached fresh data if available
 *   2. Otherwise runs through the per-source circuit breaker
 *   3. On success, stores in cache and returns { status: 'ok' }
 *   4. On circuit-open or fetch failure, returns the last known cache entry
 *      as { status: 'stale' } if present, else { status: 'unavailable' }
 *
 * Importantly we NEVER throw — graceful degradation is the explicit
 * contract. Callers can check `result.status` to decide what to surface.
 */
export async function runScraper(
  source: string,
  fetcher: () => Promise<TrendItem[]>,
  options: RunScraperOptions = {},
): Promise<ScrapeResult> {
  const { cacheKey = source, useStaleOnFailure = true } = options;
  const breaker = getBreaker(source);

  // Fresh cache hit
  const fresh = SCRAPER_CACHE.get(cacheKey);
  if (fresh) {
    return {
      source,
      status: 'ok',
      data: fresh,
      fetchedAt: new Date().toISOString(),
    };
  }

  try {
    const data = await breaker.execute(fetcher);
    if (data && data.length > 0) {
      SCRAPER_CACHE.set(cacheKey, data);
    }
    return {
      source,
      status: 'ok',
      data,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    // Try the stale cache before giving up
    if (useStaleOnFailure) {
      const stale = SCRAPER_CACHE.peek(cacheKey);
      if (stale) {
        return {
          source,
          status: 'stale',
          data: stale.value,
          fetchedAt: new Date().toISOString(),
          cachedAt: new Date(stale.storedAt).toISOString(),
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    return {
      source,
      status: 'unavailable',
      data: [],
      fetchedAt: new Date().toISOString(),
      error:
        err instanceof CircuitOpenError
          ? `Circuit open: ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Keyword categorization (used by every scraper for the `category` field)
// ---------------------------------------------------------------------------

export function categorizeKeyword(keyword: string): string {
  const text = keyword.toLowerCase();

  if (/ai|gpt|인공지능|기술|테크|앱|소프트웨어|코딩|개발/.test(text)) return 'tech';
  if (/주식|코인|비트코인|투자|금리|경제|재테크|부동산|환율/.test(text)) return 'finance';
  if (/운동|헬스|다이어트|건강|병원|의료|영양/.test(text)) return 'health';
  if (/맛집|음식|요리|레시피|카페|먹방|배달/.test(text)) return 'food';
  if (/여행|호텔|관광|항공|휴가|리조트/.test(text)) return 'travel';
  if (/드라마|영화|연예|아이돌|방송|예능|넷플릭스|kpop/.test(text)) return 'entertainment';
  if (/게임|롤|배그|스팀|플스|닌텐도/.test(text)) return 'gaming';
  if (/뷰티|화장품|스킨케어|메이크업|패션|옷/.test(text)) return 'beauty';
  if (/축구|야구|농구|스포츠|올림픽|월드컵/.test(text)) return 'sports';
  if (/교육|공부|학교|시험|자격증|취업/.test(text)) return 'education';
  if (/쇼핑|할인|세일|구매|가격/.test(text)) return 'shopping';
  if (/뉴스|정치|사회|이슈/.test(text)) return 'news';

  return 'general';
}

// ---------------------------------------------------------------------------
// Dynamic keyword generator (used as final fallback)
// ---------------------------------------------------------------------------

export function generateDynamicKeywords(now: Date = new Date()): {
  seasonal: string[];
  timeBase: string[];
  evergreen: string[];
} {
  const month = now.getMonth() + 1;
  const hour = now.getHours();
  const dayOfWeek = now.getDay();

  const seasonalKeywords: Record<string, string[]> = {
    winter: ['겨울 패션', '핫초코', '스키장', '연말 파티', '크리스마스 선물', '방한용품'],
    spring: ['봄 나들이', '벚꽃 명소', '봄 패션', '꽃구경', '피크닉', '알레르기'],
    summer: ['여름 휴가', '물놀이', '에어컨', '바캉스', '수박', '썬크림', '휴양지'],
    fall: ['단풍 여행', '가을 패션', '와인', '독서', '캠핑', '고구마', '할로윈'],
  };

  const season =
    month <= 2 || month === 12 ? 'winter' : month <= 5 ? 'spring' : month <= 8 ? 'summer' : 'fall';

  const timeKeywords =
    hour >= 6 && hour <= 9
      ? ['아침 루틴', '출근 준비', '모닝커피', '아침 운동', '조식 메뉴']
      : hour >= 11 && hour <= 14
        ? ['점심 메뉴', '런치 맛집', '오후 카페', '낮잠', '점심 도시락']
        : hour >= 17 && hour <= 21
          ? ['퇴근 후 활동', '저녁 메뉴', '헬스장', '넷플릭스', '야식', '홈트']
          : ['심야 콘텐츠', '불면증', '야식 배달', '새벽 감성', '올빼미 생활'];

  const dayKeywords =
    dayOfWeek === 0
      ? ['일요일 브런치', '주말 마무리', '월요병 극복']
      : dayOfWeek === 5
        ? ['불금', '주말 계획', '금요일 회식']
        : dayOfWeek === 6
          ? ['토요일 나들이', '주말 여행', '늦잠']
          : ['평일 루틴', '직장인 팁', '재택근무'];

  const evergreenKeywords = [
    'AI 활용법',
    'ChatGPT 팁',
    '돈 버는 방법',
    '재테크',
    '다이어트',
    '운동 루틴',
    '자기계발',
    '영어 공부',
    '부업 추천',
    'N잡',
    '투잡',
    '주식 투자',
  ];

  return {
    seasonal: [...seasonalKeywords[season], ...dayKeywords],
    timeBase: timeKeywords,
    evergreen: evergreenKeywords,
  };
}

/**
 * Looks up KOREAN_EVENTS_DB for events occurring today or within the next
 * 3 days, returning their keywords. Used as fallback content fuel.
 */
export function getEventBasedKeywords(now: Date = new Date()): string[] {
  const dateStr = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const todayEvent = KOREAN_EVENTS_DB.find((e) => e.date === dateStr);
  const keywords: string[] = [];

  if (todayEvent) {
    keywords.push(todayEvent.name);
    keywords.push(...(todayEvent.contentIdeas || []));
  }

  for (let i = 1; i <= 3; i++) {
    const futureDate = new Date(now);
    futureDate.setDate(now.getDate() + i);
    const futureDateStr = `${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(futureDate.getDate()).padStart(2, '0')}`;
    const futureEvent = KOREAN_EVENTS_DB.find((e) => e.date === futureDateStr);
    if (futureEvent && futureEvent.priority === 'high') {
      keywords.push(`${futureEvent.name} 준비`);
    }
  }

  return keywords;
}

// ---------------------------------------------------------------------------
// Standard browser-y User-Agent for scrapers
// ---------------------------------------------------------------------------

export const SCRAPER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export const SCRAPER_HEADERS = {
  'User-Agent': SCRAPER_USER_AGENT,
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};
