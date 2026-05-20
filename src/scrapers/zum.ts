/**
 * Zum trend scraper — tries the home realtime widget, then news headlines.
 * Wrapped by `runScraper` so the circuit breaker tracks failure rate.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { SCRAPER_HEADERS, categorizeKeyword, runScraper } from './shared.js';
import type { TrendItem, ScrapeResult } from '../types.js';

function extractNewsKeyword(headline: string): string {
  const words = headline.split(/[\s,\.…]+/).filter((w) => w.length >= 2 && w.length <= 10);
  return words.slice(0, 3).join(' ') || headline.substring(0, 20);
}

async function scrapeZumTrendsRaw(): Promise<TrendItem[]> {
  try {
    const response = await axios.get('https://zum.com/', {
      headers: SCRAPER_HEADERS,
      timeout: 8000,
    });

    const $ = cheerio.load(response.data);
    const trends: TrendItem[] = [];

    const selectors = [
      '.realtime_keyword_list li',
      '.issue_keyword li',
      '[class*="ranking"] li',
      '[class*="keyword"] a',
      '.hot_keyword li',
    ];

    for (const selector of selectors) {
      if (trends.length >= 10) break;
      $(selector).each((_i, el) => {
        if (trends.length >= 10) return false;
        const keyword = $(el)
          .text()
          .trim()
          .replace(/^\d+\.?\s*/, '')
          .replace(/new|↑|↓|─/gi, '')
          .trim();
        if (
          keyword &&
          keyword.length > 1 &&
          keyword.length < 30 &&
          !trends.find((t) => t.keyword === keyword)
        ) {
          trends.push({
            keyword,
            platform: 'zum',
            rank: trends.length + 1,
            category: categorizeKeyword(keyword),
            source: 'zum_realtime',
          });
        }
      });
    }

    if (trends.length > 0) return trends;
  } catch {
    // fall through to news endpoint
  }

  // Fallback: zum news headlines
  const response = await axios.get('https://news.zum.com/', {
    headers: SCRAPER_HEADERS,
    timeout: 8000,
  });
  const $ = cheerio.load(response.data);
  const trends: TrendItem[] = [];

  $('h2, h3, .headline, .title, [class*="news_title"]').each((_i, el) => {
    if (trends.length >= 10) return false;
    const text = $(el).text().trim();
    if (text && text.length > 5 && text.length < 50) {
      const keyword = extractNewsKeyword(text);
      if (keyword && !trends.find((t) => t.keyword === keyword)) {
        trends.push({
          keyword,
          platform: 'zum',
          rank: trends.length + 1,
          category: categorizeKeyword(keyword),
          source: 'zum_news',
        });
      }
    }
  });

  if (trends.length === 0) {
    throw new Error('Zum realtime + news both returned 0 items');
  }
  return trends;
}

export async function getZumTrends(): Promise<ScrapeResult> {
  return runScraper('zum', scrapeZumTrendsRaw);
}
