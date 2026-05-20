/**
 * Daum scrapers — autocomplete-style related keywords, result counts, news
 * trend extraction.
 *
 * `getDaumTrends()` is wrapped by the circuit breaker; the other helpers
 * are best-effort and degrade to fallbacks individually.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { SCRAPER_HEADERS, SCRAPER_USER_AGENT, categorizeKeyword, runScraper } from './shared.js';
import type { TrendItem, ScrapeResult } from '../types.js';

export async function getDaumAutocomplete(keyword: string): Promise<string[]> {
  try {
    const response = await axios.get('https://search.daum.net/search', {
      params: { w: 'tot', q: keyword },
      headers: SCRAPER_HEADERS,
      timeout: 5000,
    });

    const $ = cheerio.load(response.data);
    const suggestions: string[] = [];

    $('[class*="related"] a, [class*="suggest"] a, .keyword_list a, .related_keyword a').each(
      (_i, el) => {
        const text = $(el).text().trim();
        if (text && text.length > 1 && text.length < 30 && text !== keyword && !suggestions.includes(text)) {
          suggestions.push(text);
        }
      },
    );

    if (suggestions.length < 5) {
      const patterns = ['추천', '방법', '후기', '비교', '가격', '순위', '효과'];
      for (const pattern of patterns) {
        const combo = `${keyword} ${pattern}`;
        if (!suggestions.includes(combo)) suggestions.push(combo);
        if (suggestions.length >= 10) break;
      }
    }

    return suggestions.slice(0, 10);
  } catch {
    return [
      `${keyword} 추천`,
      `${keyword} 후기`,
      `${keyword} 가격`,
      `${keyword} 비교`,
      `${keyword} 순위`,
    ];
  }
}

export async function getDaumSearchResultCount(keyword: string): Promise<number> {
  try {
    const response = await axios.get('https://search.daum.net/search', {
      params: { w: 'blog', q: keyword },
      headers: { 'User-Agent': SCRAPER_USER_AGENT },
      timeout: 5000,
    });

    const $ = cheerio.load(response.data);
    const countText = $('.sub_expander .txt_info, .cont_result .txt_info, [class*="count"]')
      .first()
      .text();
    const match = countText.match(/[\d,]+/);
    if (match) return parseInt(match[0].replace(/,/g, ''), 10);

    const itemCount = $('.wrap_cont.blog, .cont_blog').length;
    return itemCount > 0 ? itemCount * 10000 : 50000;
  } catch {
    return 50000;
  }
}

// ---------------------------------------------------------------------------
// Realtime daum trend (via news headlines)
// ---------------------------------------------------------------------------

function extractKeywordFromHeadline(headline: string): string {
  if (!headline || headline.length < 3) return '';
  let clean = headline
    .replace(/["""''`]/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .trim();
  if (clean.length > 20) {
    const match = clean.match(/^(.{4,20}?)(?:이|가|을|를|에|은|는|의|로|와|과|에서|부터|까지|\s)/);
    if (match) clean = match[1];
    else clean = clean.substring(0, 15);
  }
  clean = clean.replace(/^(속보|단독|긴급|브리핑|종합|UPDATE|BREAKING|오늘의)\s*/i, '');
  return clean.trim();
}

async function scrapeDaumTrendsRaw(): Promise<TrendItem[]> {
  const response = await axios.get('https://news.daum.net/', {
    headers: SCRAPER_HEADERS,
    timeout: 8000,
  });

  const $ = cheerio.load(response.data);
  const trends: TrendItem[] = [];
  const seen = new Set<string>();

  $('a[class*="link_txt"], a[class*="link_news"], .txt_thumb, .tit_thumb, .item_issue a, .link_issue').each(
    (_i, el) => {
      const text = $(el).text().trim();
      const keyword = extractKeywordFromHeadline(text);
      if (keyword && keyword.length >= 2 && keyword.length <= 20 && !seen.has(keyword)) {
        seen.add(keyword);
        trends.push({
          keyword,
          platform: 'daum',
          rank: trends.length + 1,
          category: categorizeKeyword(keyword),
          source: 'daum_news_headlines',
        });
      }
    },
  );

  if (trends.length < 5) {
    const searchResponse = await axios.get('https://search.daum.net/search?w=tot&q=인기검색어', {
      headers: { 'User-Agent': SCRAPER_USER_AGENT },
      timeout: 5000,
    });
    const $s = cheerio.load(searchResponse.data);
    $s('.link_txt, .keyword_item a, .item_suggest a').each((_i, el) => {
      const text = $s(el).text().trim();
      if (text && text.length >= 2 && text.length <= 20 && !seen.has(text)) {
        seen.add(text);
        trends.push({
          keyword: text,
          platform: 'daum',
          rank: trends.length + 1,
          category: categorizeKeyword(text),
          source: 'daum_popular_search',
        });
      }
    });
  }

  if (trends.length === 0) {
    throw new Error('Daum trend selectors returned 0 items — site likely changed');
  }
  return trends.slice(0, 10);
}

export async function getDaumTrends(): Promise<ScrapeResult> {
  return runScraper('daum', scrapeDaumTrendsRaw);
}

// ---------------------------------------------------------------------------
// Daum news (by category) — used by analyze_news_trends fallback
// ---------------------------------------------------------------------------

export async function scrapeDaumNewsByCategory(
  category: string,
): Promise<Array<{ headline: string; source: string; sentiment: string }>> {
  const categoryUrls: Record<string, string> = {
    general: 'https://news.daum.net/',
    politics: 'https://news.daum.net/politics',
    economy: 'https://news.daum.net/economic',
    society: 'https://news.daum.net/society',
    culture: 'https://news.daum.net/culture',
    tech: 'https://news.daum.net/digital',
    sports: 'https://sports.daum.net/',
    entertainment: 'https://entertain.daum.net/',
  };
  const url = categoryUrls[category] || categoryUrls.general;

  const response = await axios.get(url, { headers: SCRAPER_HEADERS, timeout: 8000 });
  const $ = cheerio.load(response.data);
  const news: Array<{ headline: string; source: string; sentiment: string }> = [];

  $('[class*="link_txt"], .tit_g, .news_view, .txt_info').each((_i, el) => {
    if (news.length >= 10) return false;
    const headline = $(el).text().trim();
    if (headline && headline.length > 10 && headline.length < 100) {
      if (!news.find((n) => n.headline === headline)) {
        news.push({
          headline,
          source: '다음뉴스',
          sentiment: 'neutral',
        });
      }
    }
  });
  return news;
}
