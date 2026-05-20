/**
 * Google scrapers — autocomplete, Google Trends Korea RSS, search result count.
 * Trend lookup is circuit-broken via `runScraper`.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { SCRAPER_USER_AGENT, categorizeKeyword, runScraper } from './shared.js';
import type { TrendItem, ScrapeResult } from '../types.js';

export async function getGoogleAutocomplete(keyword: string): Promise<string[]> {
  try {
    const response = await axios.get('https://suggestqueries.google.com/complete/search', {
      params: { client: 'firefox', q: keyword, hl: 'ko' },
      headers: { 'User-Agent': SCRAPER_USER_AGENT },
      timeout: 5000,
    });

    if (Array.isArray(response.data) && Array.isArray(response.data[1])) {
      return response.data[1].slice(0, 10);
    }
    return [];
  } catch {
    return [];
  }
}

export async function getGoogleSearchResultCount(keyword: string): Promise<number> {
  try {
    const response = await axios.get('https://www.google.com/search', {
      params: { q: keyword, hl: 'ko', gl: 'kr' },
      headers: { 'User-Agent': SCRAPER_USER_AGENT },
      timeout: 5000,
    });
    const $ = cheerio.load(response.data);
    const stats = $('#result-stats').text();
    const match = stats.match(/[\d,]+/);
    if (match) return parseInt(match[0].replace(/,/g, ''), 10);
    return 100000;
  } catch {
    return 100000;
  }
}

// ---------------------------------------------------------------------------
// Google Trends Korea
// ---------------------------------------------------------------------------

async function scrapeGoogleTrendsRaw(): Promise<TrendItem[]> {
  // Primary: official RSS feed
  try {
    const response = await axios.get('https://trends.google.com/trending/rss?geo=KR', {
      headers: {
        'User-Agent': SCRAPER_USER_AGENT,
        Accept: 'application/rss+xml, application/xml, text/xml',
      },
      timeout: 8000,
    });

    const $ = cheerio.load(response.data, { xmlMode: true });
    const trends: TrendItem[] = [];

    $('item').each((i, el) => {
      if (i >= 15) return false;
      const title = $(el).find('title').text().trim();
      const traffic = $(el).find('ht\\:approx_traffic, approx_traffic').text().trim();
      const newsItem = $(el).find('ht\\:news_item_title, news_item_title').first().text().trim();
      if (title) {
        trends.push({
          keyword: title,
          platform: 'google',
          rank: i + 1,
          category: categorizeKeyword(title),
          trend: 'rising',
          traffic: traffic || '10K+',
          related_news: newsItem || null,
          source: 'google_trends_rss',
        });
      }
    });

    if (trends.length > 0) return trends;
  } catch {
    // fall through
  }

  // Secondary: trending page (HTML)
  const response = await axios.get(
    'https://trends.google.co.kr/trends/trendingsearches/daily?geo=KR',
    {
      headers: {
        'User-Agent': SCRAPER_USER_AGENT,
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      timeout: 8000,
    },
  );

  const $ = cheerio.load(response.data);
  const trends: TrendItem[] = [];
  $('[class*="feed-item"], [class*="trending"], .title').each((i, el) => {
    if (i >= 10) return false;
    const keyword = $(el).text().trim();
    if (keyword && keyword.length > 1 && keyword.length < 50) {
      trends.push({
        keyword,
        platform: 'google',
        rank: i + 1,
        category: categorizeKeyword(keyword),
        trend: 'rising',
        source: 'google_trends_page',
      });
    }
  });

  if (trends.length === 0) {
    throw new Error('Google Trends RSS+HTML both empty — site changed or geo-blocked');
  }
  return trends;
}

export async function getGoogleTrends(): Promise<ScrapeResult> {
  return runScraper('google', scrapeGoogleTrendsRaw);
}
