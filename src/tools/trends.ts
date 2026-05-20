/**
 * Trend tools: `get_korean_trends`, `analyze_news_trends`.
 *
 * Both rely on the scrapers in src/scrapers, which already provide circuit
 * breaker + cache + graceful degradation. This module's job is just to
 * shape the outputs into the legacy tool response format so existing MCP
 * consumers don't break.
 */

import { z } from 'zod';
import axios from 'axios';
import * as cheerio from 'cheerio';
import type { ToolDefinition } from '../core/registry.js';
import { TrendPlatformSchema, TrendCategorySchema } from '../types.js';
import type { TrendItem, ScrapeResult } from '../types.js';
import { getNaverTrends } from '../scrapers/naver.js';
import { getDaumTrends, scrapeDaumNewsByCategory } from '../scrapers/daum.js';
import { getGoogleTrends } from '../scrapers/google.js';
import { getYouTubeTrends } from '../scrapers/youtube.js';
import { getZumTrends } from '../scrapers/zum.js';
import { SCRAPER_HEADERS } from '../scrapers/shared.js';
import { getUpcomingEvents } from '../data/koreanEvents.js';

// ---------------------------------------------------------------------------
// Helpers (insights / opportunities) used to be inline in index.ts
// ---------------------------------------------------------------------------

function generateTrendInsights(trends: TrendItem[]): Record<string, unknown> {
  const categories = trends.map((t) => t.category).filter(Boolean) as string[];
  const categoryCount: Record<string, number> = {};
  for (const c of categories) categoryCount[c] = (categoryCount[c] || 0) + 1;

  const topCategories = Object.entries(categoryCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat]) => cat);

  return {
    dominant_categories: topCategories,
    insights: [
      `${topCategories[0] || '기술'} 카테고리가 현재 가장 인기`,
      'AI/기술 관련 콘텐츠 수요 지속 증가 중',
      '재테크/투자 콘텐츠 꾸준한 관심',
      '실용적인 "방법" 콘텐츠가 검색량 높음',
    ],
    content_recommendations: [
      '트렌드 키워드를 제목에 포함하세요',
      '검색량 높은 시간대 (오전 9-11시, 저녁 7-9시)에 발행하세요',
      '롱테일 키워드로 경쟁을 피하세요',
    ],
    best_time_to_post: {
      weekday: '오전 9-11시, 저녁 7-9시',
      weekend: '오후 2-4시',
    },
  };
}

function identifyContentOpportunities(trends: TrendItem[]): Array<Record<string, unknown>> {
  return trends.slice(0, 5).map((trend) => ({
    keyword: trend.keyword,
    opportunity_type: 'trending_topic',
    suggested_formats: ['리스트형', '하우투', '비교분석'],
    urgency: '높음',
    estimated_search_volume: '높음',
  }));
}

// ---------------------------------------------------------------------------
// Tool: get_korean_trends
// ---------------------------------------------------------------------------

const getKoreanTrendsSchema = {
  platform: TrendPlatformSchema.optional().describe(
    '분석할 플랫폼 (naver, google, youtube, daum, zum, all). 기본값: all',
  ),
  category: TrendCategorySchema.optional().describe('카테고리 필터'),
  limit: z.number().min(1).max(50).optional().describe('가져올 트렌드 수. 기본값: 20'),
};

const getKoreanTrendsTool: ToolDefinition<typeof getKoreanTrendsSchema> = {
  name: 'get_korean_trends',
  description:
    '실시간 한국 트렌드 키워드를 분석합니다. 네이버, 다음, 구글, 유튜브에서 인기 검색어와 트렌드를 수집합니다.',
  schema: getKoreanTrendsSchema,
  handler: async (rawArgs) => {
    const args = rawArgs as { platform?: string; category?: string; limit?: number };
    const platform = args.platform || 'all';
    const category = args.category || 'all';
    const limit = args.limit || 20;

    const trends: TrendItem[] = [];
    const sourceStatuses: Array<Pick<ScrapeResult, 'source' | 'status' | 'error' | 'cachedAt'>> = [];

    const fetchOne = async (
      shouldFetch: boolean,
      fn: () => Promise<ScrapeResult>,
    ): Promise<void> => {
      if (!shouldFetch) return;
      const result = await fn();
      trends.push(...(result.data as TrendItem[]));
      sourceStatuses.push({
        source: result.source,
        status: result.status,
        error: result.error,
        cachedAt: result.cachedAt,
      });
    };

    await Promise.all([
      fetchOne(platform === 'naver' || platform === 'all', getNaverTrends),
      fetchOne(platform === 'daum' || platform === 'all', getDaumTrends),
      fetchOne(platform === 'google' || platform === 'all', getGoogleTrends),
      fetchOne(platform === 'youtube' || platform === 'all', getYouTubeTrends),
      fetchOne(platform === 'zum' || platform === 'all', getZumTrends),
    ]);

    let filteredTrends = trends;
    if (category !== 'all') {
      filteredTrends = trends.filter((t) => t.category === category || !t.category);
    }

    const result = {
      timestamp: new Date().toISOString(),
      platform,
      category,
      total: filteredTrends.length,
      trends: filteredTrends.slice(0, limit),
      insights: generateTrendInsights(filteredTrends),
      content_opportunities: identifyContentOpportunities(filteredTrends),
      upcoming_events: getUpcomingEvents(7),
      source_status: sourceStatuses,
    };

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
};

// ---------------------------------------------------------------------------
// Tool: analyze_news_trends
// ---------------------------------------------------------------------------

function analyzeSentiment(text: string): 'positive' | 'neutral' | 'negative' {
  const positive = /성공|상승|호조|기대|돌파|신기록|수상|인기|사랑|행복|좋은|최고|혁신|성장/;
  const negative = /하락|위기|우려|실패|폭락|충격|논란|피해|사망|사고|비난|급락|위험|문제/;
  if (positive.test(text)) return 'positive';
  if (negative.test(text)) return 'negative';
  return 'neutral';
}

function detectNewsSource(url: string, category: string): string {
  if (url.includes('sports')) return '스포츠';
  if (url.includes('entertain')) return '연예';
  const sources: Record<string, string> = {
    politics: '정치',
    economy: '경제',
    society: '사회',
    culture: '문화',
    tech: 'IT/과학',
    sports: '스포츠',
    entertainment: '연예',
  };
  return sources[category] || '종합';
}

function extractKeywordsFromText(text: string): string[] {
  return text
    .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && w.length <= 6)
    .filter((w) => !/^\d+$/.test(w));
}

function calculateKeywordFrequency(words: string[]): Array<Record<string, unknown>> {
  const frequency: Record<string, number> = {};
  for (const w of words) frequency[w] = (frequency[w] || 0) + 1;
  return Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([keyword, freq]) => ({
      keyword,
      frequency: freq,
      trend: freq >= 5 ? '상승' : freq >= 3 ? '유지' : '일반',
    }));
}

function generateNewsContentOpportunities(
  keywords: Array<Record<string, unknown>>,
  category: string,
): string[] {
  const opportunities: string[] = [];
  if (keywords.length > 0) {
    const topKeyword = (keywords[0]?.keyword as string) || '';
    opportunities.push(`"${topKeyword}" 관련 콘텐츠 수요 증가 — 해설/분석 콘텐츠 추천`);
  }
  const categoryOpps: Record<string, string[]> = {
    tech: ['AI/테크 트렌드 정리 콘텐츠', '신제품 리뷰 콘텐츠'],
    economy: ['재테크 팁 콘텐츠', '경제 뉴스 쉽게 풀어주기'],
    entertainment: ['K-콘텐츠 글로벌 화제', '연예 이슈 정리'],
    sports: ['경기 하이라이트', '선수 인터뷰 분석'],
    general: ['오늘의 이슈 정리', '트렌드 분석 콘텐츠'],
  };
  opportunities.push(...(categoryOpps[category] || categoryOpps.general));
  return opportunities.slice(0, 5);
}

async function analyzeKoreanNews(
  category: string,
  timeRange: string,
  extractKeywords: boolean,
): Promise<Record<string, unknown>> {
  const news: Array<{ headline: string; source: string; sentiment: string; url?: string }> = [];
  const allKeywords: string[] = [];

  const categoryUrls: Record<string, string> = {
    general: 'https://news.naver.com/',
    politics: 'https://news.naver.com/section/100',
    economy: 'https://news.naver.com/section/101',
    society: 'https://news.naver.com/section/102',
    culture: 'https://news.naver.com/section/103',
    tech: 'https://news.naver.com/section/105',
    sports: 'https://sports.news.naver.com/',
    entertainment: 'https://entertain.naver.com/home',
  };
  const url = categoryUrls[category] || categoryUrls.general;

  try {
    const response = await axios.get(url, { headers: SCRAPER_HEADERS, timeout: 10000 });
    const $ = cheerio.load(response.data);

    const headlineSelectors = [
      '.cjs_t',
      '.sa_text_title',
      'a.news_tit',
      '.cluster_text_headline',
      '.cluster_head_topic',
      'h2.tit',
      '.link_news',
      '[class*="headline"] a',
      '[class*="title"] a',
    ];

    for (const selector of headlineSelectors) {
      if (news.length >= 15) break;
      $(selector).each((_i, el) => {
        if (news.length >= 15) return false;
        const headline = $(el).text().trim();
        const href = $(el).attr('href') || '';
        if (headline && headline.length > 10 && headline.length < 100) {
          if (!news.find((n) => n.headline === headline)) {
            news.push({
              headline,
              source: detectNewsSource(href, category),
              sentiment: analyzeSentiment(headline),
              url: href.startsWith('http') ? href : `https://news.naver.com${href}`,
            });
            if (extractKeywords) allKeywords.push(...extractKeywordsFromText(headline));
          }
        }
      });
    }
  } catch {
    try {
      const daumNews = await scrapeDaumNewsByCategory(category);
      news.push(...daumNews);
      if (extractKeywords) {
        daumNews.forEach((n) => allKeywords.push(...extractKeywordsFromText(n.headline)));
      }
    } catch {
      // fallthrough to fallback below
    }
  }

  if (news.length === 0) {
    const now = new Date();
    news.push({
      headline: `[${now.toLocaleDateString('ko-KR')}] ${category} 카테고리 뉴스를 가져오지 못했습니다`,
      source: 'fallback',
      sentiment: 'neutral',
    });
  }

  const keywordFrequency = extractKeywords ? calculateKeywordFrequency(allKeywords) : [];
  const sentiments = news.map((n) => n.sentiment);
  const total = sentiments.length || 1;
  const positiveCount = sentiments.filter((s) => s === 'positive').length;
  const negativeCount = sentiments.filter((s) => s === 'negative').length;
  const neutralCount = sentiments.filter((s) => s === 'neutral').length;

  return {
    category,
    time_range: timeRange,
    analyzed_at: new Date().toISOString(),
    source: news[0]?.url?.includes('naver') ? 'naver_news' : 'daum_news',
    top_news: news.slice(0, 10),
    extracted_keywords: keywordFrequency.slice(0, 10),
    sentiment_summary: {
      positive: `${Math.round((positiveCount / total) * 100)}%`,
      neutral: `${Math.round((neutralCount / total) * 100)}%`,
      negative: `${Math.round((negativeCount / total) * 100)}%`,
    },
    content_opportunities: generateNewsContentOpportunities(keywordFrequency, category),
    trending_topics: news.slice(0, 5).map((n) => n.headline),
  };
}

const analyzeNewsSchema = {
  category: z
    .enum([
      'general',
      'politics',
      'economy',
      'society',
      'culture',
      'sports',
      'tech',
      'entertainment',
    ])
    .optional()
    .describe('뉴스 카테고리'),
  time_range: z.enum(['1h', '24h', '7d', '30d']).optional().describe('시간 범위'),
  extract_keywords: z.boolean().optional().describe('핵심 키워드 추출'),
};

const analyzeNewsTool: ToolDefinition<typeof analyzeNewsSchema> = {
  name: 'analyze_news_trends',
  description:
    '실시간 한국 뉴스를 분석하여 트렌딩 토픽과 콘텐츠 기회를 발견합니다.',
  schema: analyzeNewsSchema,
  handler: async (rawArgs) => {
    const args = rawArgs as {
      category?: string;
      time_range?: string;
      extract_keywords?: boolean;
    };
    const result = await analyzeKoreanNews(
      args.category || 'general',
      args.time_range || '24h',
      args.extract_keywords ?? true,
    );
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
};

export const trendTools: ToolDefinition[] = [getKoreanTrendsTool as ToolDefinition, analyzeNewsTool as ToolDefinition];
