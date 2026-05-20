/**
 * YouTube Korea trending scraper.
 *
 * Tries to parse the `ytInitialData` JSON blob embedded in the trending
 * page, falling back to HTML selectors. Both wrapped by `runScraper`.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { SCRAPER_HEADERS, categorizeKeyword, runScraper } from './shared.js';
import type { TrendItem, ScrapeResult } from '../types.js';

function extractKeywordFromTitle(title: string): string {
  let keyword = title.replace(/[\[\(【].*?[\]\)】]/g, '').trim();
  keyword = keyword.replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ').trim();
  if (keyword.length > 30) keyword = keyword.substring(0, 30) + '...';
  return keyword || title.substring(0, 30);
}

function categorizeYouTubeContent(title: string, channel: string): string {
  const text = (title + ' ' + channel).toLowerCase();
  if (/먹방|mukbang|음식|요리|레시피|맛집/.test(text)) return 'food';
  if (/게임|gaming|롤|lol|배그|minecraft/.test(text)) return 'gaming';
  if (/뷰티|메이크업|화장|스킨케어|뷰스타/.test(text)) return 'beauty';
  if (/운동|헬스|다이어트|fitness|workout/.test(text)) return 'fitness';
  if (/브이로그|vlog|일상/.test(text)) return 'lifestyle';
  if (/여행|travel|trip/.test(text)) return 'travel';
  if (/음악|노래|커버|music|mv/.test(text)) return 'music';
  if (/드라마|예능|영화|movie/.test(text)) return 'entertainment';
  if (/공부|강의|교육|tutorial/.test(text)) return 'education';
  if (/테크|리뷰|tech|unboxing/.test(text)) return 'tech';
  if (/뉴스|이슈|news/.test(text)) return 'news';
  if (/shorts|쇼츠|숏/.test(text)) return 'shorts';
  return 'general';
}

function detectVideoFormat(title: string): string {
  const text = title.toLowerCase();
  if (/shorts|쇼츠/.test(text)) return 'shorts';
  if (/vlog|브이로그|일상/.test(text)) return 'vlog';
  if (/먹방|mukbang/.test(text)) return 'mukbang';
  if (/asmr/.test(text)) return 'asmr';
  if (/리뷰|review|언박싱|unboxing/.test(text)) return 'review';
  if (/튜토리얼|tutorial|강의|하는 법/.test(text)) return 'tutorial';
  if (/live|라이브/.test(text)) return 'live';
  if (/mv|뮤비|music video/.test(text)) return 'music_video';
  return 'standard';
}

async function scrapeYouTubeTrendsRaw(): Promise<TrendItem[]> {
  const response = await axios.get('https://www.youtube.com/feed/trending?gl=KR&hl=ko', {
    headers: SCRAPER_HEADERS,
    timeout: 10000,
  });

  const trends: TrendItem[] = [];
  const html = response.data as string;

  const initialMatch = html.match(/var ytInitialData = ({.*?});<\/script>/s);
  if (initialMatch) {
    try {
      const data = JSON.parse(initialMatch[1]);
      const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
      for (const tab of tabs) {
        const contents = tab?.tabRenderer?.content?.sectionListRenderer?.contents || [];
        for (const section of contents) {
          const items = section?.itemSectionRenderer?.contents || [];
          for (const item of items) {
            const video = item?.videoRenderer;
            if (video && trends.length < 15) {
              const title =
                video?.title?.runs?.[0]?.text || video?.title?.simpleText || '';
              const viewCount =
                video?.viewCountText?.simpleText || video?.shortViewCountText?.simpleText || '';
              const channel = video?.ownerText?.runs?.[0]?.text || '';
              if (title) {
                trends.push({
                  keyword: extractKeywordFromTitle(title),
                  title,
                  platform: 'youtube',
                  rank: trends.length + 1,
                  category: categorizeYouTubeContent(title, channel),
                  views: viewCount,
                  channel,
                  format: detectVideoFormat(title),
                  source: 'youtube_trending',
                });
              }
            }
          }
        }
      }
    } catch {
      // fall through to HTML parse
    }
  }

  if (trends.length === 0) {
    const $ = cheerio.load(html);
    $('a#video-title').each((i, el) => {
      if (i >= 15) return false;
      const title = $(el).text().trim();
      if (title) {
        trends.push({
          keyword: extractKeywordFromTitle(title),
          title,
          platform: 'youtube',
          rank: i + 1,
          category: categorizeYouTubeContent(title, ''),
          format: detectVideoFormat(title),
          source: 'youtube_html',
        });
      }
    });
  }

  if (trends.length === 0) {
    throw new Error('YouTube trending page returned 0 items');
  }
  return trends;
}

export async function getYouTubeTrends(): Promise<ScrapeResult> {
  return runScraper('youtube', scrapeYouTubeTrendsRaw);
}
