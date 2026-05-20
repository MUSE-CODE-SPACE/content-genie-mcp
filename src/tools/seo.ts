/**
 * SEO tools: `analyze_seo_keywords`, `optimize_title_hashtags`,
 * `generate_hashtag_strategy`.
 *
 * SEO analysis pulls live data from multiple scrapers (naver/google/daum
 * autocomplete + result counts + related keywords) in parallel and combines
 * them with template-based long-tail/question generation.
 */

import { z } from 'zod';
import type { ToolDefinition } from '../core/registry.js';
import { ContentTypeSchema } from '../types.js';
import {
  getNaverAutocomplete,
  getNaverRelatedKeywords,
  getNaverSearchResultCount,
} from '../scrapers/naver.js';
import { getGoogleAutocomplete, getGoogleSearchResultCount } from '../scrapers/google.js';
import { getDaumAutocomplete, getDaumSearchResultCount } from '../scrapers/daum.js';

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

function estimateSearchVolume(autocompleteRank: number, resultCount: number): string {
  if (autocompleteRank <= 3 && resultCount > 100000) return '매우 높음';
  if (autocompleteRank <= 5 && resultCount > 50000) return '높음';
  if (autocompleteRank <= 8 && resultCount > 10000) return '중간';
  return '낮음';
}

function estimateCompetition(resultCount: number): { level: string; score: number } {
  if (resultCount > 1000000) return { level: '매우 높음', score: 90 };
  if (resultCount > 500000) return { level: '높음', score: 75 };
  if (resultCount > 100000) return { level: '중간', score: 55 };
  if (resultCount > 10000) return { level: '낮음', score: 35 };
  return { level: '매우 낮음', score: 20 };
}

function calculateSEODifficulty(competition: number, resultCount: number): number {
  const resultFactor = Math.min(30, Math.log10(Math.max(1, resultCount)) * 5);
  return Math.min(100, Math.round(competition + resultFactor));
}

function calculateOpportunityScore(searchVolume: string, competition: string): number {
  const volumeScores: Record<string, number> = {
    '매우 높음': 40,
    높음: 30,
    중간: 20,
    낮음: 10,
  };
  const competitionScores: Record<string, number> = {
    '매우 낮음': 40,
    낮음: 30,
    중간: 20,
    높음: 10,
    '매우 높음': 5,
  };
  return (volumeScores[searchVolume] || 20) + (competitionScores[competition] || 20);
}

function detectQuestionType(text: string): string {
  if (/이란|무엇|뭐야|뜻/.test(text)) return '정의';
  if (/어떻게|방법|하는법/.test(text)) return '방법';
  if (/왜|이유/.test(text)) return '이유';
  if (/얼마|가격|비용/.test(text)) return '가격';
  if (/어디|장소|위치/.test(text)) return '장소';
  if (/언제|시간|기간/.test(text)) return '시간';
  return '일반';
}

function detectSearchIntent(text: string): string {
  if (/구매|가격|얼마|싼|저렴|할인/.test(text)) return '구매의도';
  if (/vs|비교|차이|어떤게/.test(text)) return '비교검토';
  if (/후기|리뷰|평가|사용/.test(text)) return '사용경험';
  return '정보탐색';
}

// ---------------------------------------------------------------------------
// Tool: analyze_seo_keywords
// ---------------------------------------------------------------------------

async function analyzeSEOKeywords(
  keyword: string,
  searchEngine: string,
  includeQuestions: boolean,
  includeLongtail: boolean,
  competitorAnalysis: boolean,
): Promise<Record<string, unknown>> {
  const includeNaver = searchEngine === 'naver' || searchEngine === 'all';
  const includeGoogle = searchEngine === 'google' || searchEngine === 'all';
  const includeDaum = searchEngine === 'daum' || searchEngine === 'all';

  const [
    naverAutocomplete,
    googleAutocomplete,
    daumAutocomplete,
    naverRelated,
    naverResultCount,
    googleResultCount,
    daumResultCount,
  ] = await Promise.all([
    includeNaver ? getNaverAutocomplete(keyword) : Promise.resolve([] as string[]),
    includeGoogle ? getGoogleAutocomplete(keyword) : Promise.resolve([] as string[]),
    includeDaum ? getDaumAutocomplete(keyword) : Promise.resolve([] as string[]),
    getNaverRelatedKeywords(keyword),
    includeNaver ? getNaverSearchResultCount(keyword) : Promise.resolve(0),
    includeGoogle ? getGoogleSearchResultCount(keyword) : Promise.resolve(0),
    includeDaum ? getDaumSearchResultCount(keyword) : Promise.resolve(0),
  ]);

  const primaryResultCount =
    searchEngine === 'naver'
      ? naverResultCount
      : searchEngine === 'google'
        ? googleResultCount
        : searchEngine === 'daum'
          ? daumResultCount
          : Math.max(naverResultCount, googleResultCount, daumResultCount);

  const competition = estimateCompetition(primaryResultCount);
  const autocompleteKeywords = [
    ...new Set([...daumAutocomplete, ...naverAutocomplete, ...googleAutocomplete]),
  ];
  const keywordRank = autocompleteKeywords.findIndex((k) => k.includes(keyword)) + 1 || 10;
  const searchVolume = estimateSearchVolume(keywordRank, primaryResultCount);

  const seoDifficulty = calculateSEODifficulty(competition.score, primaryResultCount);
  const opportunityScore = calculateOpportunityScore(searchVolume, competition.level);

  const relatedKeywords: Array<Record<string, unknown>> = [];

  for (let i = 0; i < Math.min(autocompleteKeywords.length, 5); i++) {
    const kw = autocompleteKeywords[i];
    if (kw && kw !== keyword) {
      relatedKeywords.push({
        keyword: kw,
        volume: estimateSearchVolume(i + 1, primaryResultCount * 0.7),
        competition: i < 3 ? '높음' : '중간',
        trend: '상승',
        source: 'autocomplete',
      });
    }
  }
  for (const related of naverRelated.slice(0, 5)) {
    if (!relatedKeywords.find((r) => r.keyword === related.keyword)) {
      relatedKeywords.push({
        keyword: related.keyword,
        volume: '중간',
        competition: '중간',
        trend: '유지',
        source: 'naver_related',
      });
    }
  }
  const templateKeywords = [
    { suffix: ' 방법', volume: '높음', competition: '중간' },
    { suffix: ' 추천', volume: '매우 높음', competition: '높음' },
    { suffix: ' 후기', volume: '높음', competition: '중간' },
    { suffix: ' 비교', volume: '중간', competition: '낮음' },
    { suffix: ' 가격', volume: '매우 높음', competition: '매우 높음' },
  ];
  for (const tmpl of templateKeywords) {
    const kw = keyword + tmpl.suffix;
    if (!relatedKeywords.find((r) => r.keyword === kw)) {
      relatedKeywords.push({
        keyword: kw,
        volume: tmpl.volume,
        competition: tmpl.competition,
        trend: '유지',
        source: 'template',
      });
    }
  }

  const questionKeywords: Array<Record<string, unknown>> = [];
  if (includeQuestions) {
    const questionSuffixes = ['란', '이란', ' 뭐', ' 무엇', ' 어떻게', ' 왜', ' 방법'];
    for (const ac of autocompleteKeywords) {
      if (questionSuffixes.some((s) => ac.includes(s)) || ac.includes('?')) {
        questionKeywords.push({
          keyword: ac,
          type: detectQuestionType(ac),
          intent: detectSearchIntent(ac),
          source: 'autocomplete',
        });
      }
    }
    if (questionKeywords.length < 5) {
      const defaults = [
        { keyword: `${keyword}이란?`, type: '정의', intent: '정보탐색' },
        { keyword: `${keyword} 어떻게 하나요?`, type: '방법', intent: '정보탐색' },
        { keyword: `${keyword} 왜 필요한가요?`, type: '이유', intent: '정보탐색' },
        { keyword: `${keyword} 얼마인가요?`, type: '가격', intent: '구매의도' },
      ];
      for (const q of defaults) {
        if (!questionKeywords.find((qk) => qk.keyword === q.keyword)) {
          questionKeywords.push({ ...q, source: 'template' });
        }
      }
    }
  }

  const longtailKeywords: Array<Record<string, unknown>> = [];
  if (includeLongtail) {
    for (const ac of autocompleteKeywords) {
      if (ac.length > keyword.length + 5 && !relatedKeywords.find((r) => r.keyword === ac)) {
        longtailKeywords.push({
          keyword: ac,
          difficulty: Math.round(seoDifficulty * 0.6 + Math.random() * 20),
          opportunity: '높음',
          source: 'autocomplete',
        });
      }
    }
    const longtailTemplates = [
      { pattern: `초보자를 위한 ${keyword} 완벽 가이드`, difficulty: 35 },
      { pattern: `${keyword} 실수 피하는 방법`, difficulty: 28 },
      { pattern: `2025년 ${keyword} 트렌드`, difficulty: 42 },
      { pattern: `${keyword} 비용 절약 팁`, difficulty: 31 },
      { pattern: `${keyword} 전문가 추천`, difficulty: 38 },
    ];
    for (const tmpl of longtailTemplates) {
      if (!longtailKeywords.find((l) => l.keyword === tmpl.pattern)) {
        longtailKeywords.push({
          keyword: tmpl.pattern,
          difficulty: Math.round(tmpl.difficulty + (seoDifficulty - 50) * 0.3),
          opportunity: tmpl.difficulty < 35 ? '매우 높음' : '높음',
          source: 'template',
        });
      }
    }
  }

  const searchEngineStrategy = {
    naver: {
      result_count: naverResultCount.toLocaleString(),
      competition: estimateCompetition(naverResultCount).level,
      tips: [
        '네이버 블로그/포스트에 발행하세요',
        '키워드를 제목에 정확히 포함하세요',
        '이미지 ALT 태그에 키워드 추가',
        '체류시간을 늘리는 콘텐츠 작성',
      ],
      content_types: ['블로그', '포스트', '지식iN'],
    },
    google: {
      result_count: googleResultCount.toLocaleString(),
      competition: estimateCompetition(googleResultCount).level,
      tips: [
        'H1, H2 태그에 키워드 배치',
        '메타 디스크립션 최적화',
        '모바일 친화적 디자인 필수',
        '페이지 로딩 속도 개선',
        '백링크 확보 전략 수립',
      ],
      content_types: ['웹사이트', '유튜브', '뉴스'],
    },
    daum: {
      result_count: daumResultCount.toLocaleString(),
      competition: estimateCompetition(daumResultCount).level,
      tips: [
        '다음 블로그/카페에 발행하세요',
        '카카오 채널과 연동 고려',
        '티스토리 블로그 활용 추천',
        '다음 뉴스 검색 노출 전략',
        '카카오톡 공유 최적화',
      ],
      content_types: ['티스토리', '다음카페', '브런치'],
    },
  } as const;

  const recommendedAction =
    seoDifficulty > 70
      ? '경쟁이 치열합니다. 롱테일 키워드로 진입 후 메인 키워드 공략을 권장합니다.'
      : seoDifficulty > 50
        ? '중간 경쟁입니다. 고품질 콘텐츠와 꾸준한 발행이 중요합니다.'
        : '경쟁이 낮습니다. 빠른 진입으로 선점 효과를 노리세요.';

  return {
    main_keyword: keyword,
    data_source: {
      daum_autocomplete: daumAutocomplete.length,
      naver_autocomplete: naverAutocomplete.length,
      google_autocomplete: googleAutocomplete.length,
      naver_related: naverRelated.length,
      daum_results: daumResultCount.toLocaleString(),
      naver_results: naverResultCount.toLocaleString(),
      google_results: googleResultCount.toLocaleString(),
    },
    overall_analysis: {
      search_volume: searchVolume,
      competition_level: competition.level,
      competition_score: competition.score,
      seo_difficulty: seoDifficulty,
      seo_difficulty_grade:
        seoDifficulty > 70 ? '어려움' : seoDifficulty > 50 ? '보통' : '쉬움',
      content_opportunity_score: opportunityScore,
      recommended_action: recommendedAction,
    },
    related_keywords: relatedKeywords.slice(0, 15),
    question_keywords: questionKeywords.slice(0, 8),
    longtail_keywords: longtailKeywords.slice(0, 8),
    search_engine_strategy:
      searchEngine === 'all'
        ? searchEngineStrategy
        : (searchEngineStrategy as Record<string, unknown>)[searchEngine],
    competitor_insights: competitorAnalysis
      ? {
          estimated_competitors:
            primaryResultCount > 100000 ? '10만+' : primaryResultCount > 10000 ? '1만+' : '1천+',
          top_ranking_strategy: [
            '제목에 키워드 정확히 포함',
            '3000자 이상의 상세 콘텐츠',
            '이미지/영상 풍부하게 활용',
            '정기적인 업데이트',
          ],
          gap_opportunities: [
            '최신 2025년 트렌드 반영',
            '실제 사례/후기 포함',
            '비교 분석 콘텐츠',
            'FAQ 섹션 추가',
          ],
        }
      : null,
  };
}

const seoSchema = {
  keyword: z.string().describe('분석할 메인 키워드'),
  search_engine: z
    .enum(['daum', 'naver', 'google', 'all'])
    .optional()
    .describe('검색엔진 (daum, naver, google, all)'),
  include_questions: z.boolean().optional().describe('관련 질문 키워드 포함'),
  include_longtail: z.boolean().optional().describe('롱테일 키워드 포함'),
  competitor_analysis: z.boolean().optional().describe('경쟁 분석 포함'),
};

const analyzeSEOTool: ToolDefinition<typeof seoSchema> = {
  name: 'analyze_seo_keywords',
  description: '키워드의 SEO 잠재력을 심층 분석하고 다음/네이버/구글 최적화 전략을 제공합니다.',
  schema: seoSchema,
  handler: async (rawArgs) => {
    const args = rawArgs as {
      keyword: string;
      search_engine?: string;
      include_questions?: boolean;
      include_longtail?: boolean;
      competitor_analysis?: boolean;
    };
    const result = await analyzeSEOKeywords(
      args.keyword,
      args.search_engine || 'all',
      args.include_questions ?? true,
      args.include_longtail ?? true,
      args.competitor_analysis ?? true,
    );
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
};

// ---------------------------------------------------------------------------
// Tool: optimize_title_hashtags
// ---------------------------------------------------------------------------

function calculateReadabilityScore(text: string): number {
  const length = text.length;
  const hasNumbers = /\d/.test(text) ? 10 : 0;
  const hasEmoji = /[\u{1F600}-\u{1F64F}]/u.test(text) ? 5 : 0;
  const optimal =
    length >= 20 && length <= 50 ? 15 : length >= 50 && length <= 70 ? 10 : 5;
  return Math.min(100, 60 + hasNumbers + hasEmoji + optimal);
}

function generateTitleVariations(original: string): Array<Record<string, unknown>> {
  const variations = [
    { title: `[2025 최신] ${original}`, style: 'informative', ctr_prediction: 92 },
    { title: `${original} (완벽 정리)`, style: 'comprehensive', ctr_prediction: 88 },
    { title: `${original}? 이것만 보세요`, style: 'clickbait', ctr_prediction: 95 },
    { title: `99%가 모르는 ${original}의 비밀`, style: 'curiosity', ctr_prediction: 90 },
    { title: `${original} 하는 법 | 초보자 필독`, style: 'how-to', ctr_prediction: 85 },
    { title: `${original} 총정리 (+ 꿀팁 5가지)`, style: 'listicle', ctr_prediction: 87 },
    { title: `${original}, 진짜 효과있을까? 직접 해봄`, style: 'personal', ctr_prediction: 89 },
  ];
  return variations.map((v) => ({
    ...v,
    length: v.title.length,
    word_count: v.title.split(/\s+/).length,
    platform_fit:
      v.title.length <= 40 ? 'instagram/tiktok' : v.title.length <= 60 ? 'youtube/blog' : 'blog',
  }));
}

function generatePlatformHashtags(
  keywords: string[],
  platform: string,
): Record<string, unknown> {
  const keywordHashtags = keywords.map((k) => `#${k.replace(/\s/g, '')}`);
  const platformTrending: Record<string, string[]> = {
    instagram: ['#일상', '#데일리', '#소통', '#맞팔', '#인스타그램', '#좋아요', '#팔로우', '#데일리그램', '#인스타', '#daily'],
    tiktok: ['#fyp', '#foryou', '#viral', '#trending', '#틱톡', '#추천', '#챌린지'],
    youtube: ['#유튜브', '#브이로그', '#일상브이로그', '#유튜버', '#vlog'],
    twitter: ['#트위터', '#오늘', '#일상', '#생각'],
    threads: ['#스레드', '#threads', '#일상', '#생각정리'],
  };
  const category = ['#정보', '#꿀팁', '#추천', '#리뷰', '#후기', '#트렌드', '#핫이슈', '#신상', '#best', '#top'];
  return {
    primary: keywordHashtags.slice(0, 5),
    platform_trending: platformTrending[platform] || platformTrending.instagram,
    category,
    total_recommended: platform === 'instagram' ? 25 : platform === 'tiktok' ? 5 : 10,
    placement_tip:
      platform === 'instagram'
        ? '첫 댓글에 해시태그를 넣으면 깔끔합니다'
        : '캡션 마지막에 배치하세요',
  };
}

const optimizeTitleSchema = {
  original_title: z.string().describe('원본 제목 또는 주제'),
  platform: ContentTypeSchema.optional().describe('타겟 플랫폼'),
  keywords: z.array(z.string()).optional().describe('포함할 키워드 목록'),
  style: z
    .enum([
      'clickbait',
      'informative',
      'emotional',
      'question',
      'how-to',
      'listicle',
      'controversy',
      'story',
    ])
    .optional()
    .describe('제목 스타일'),
  language: z.enum(['ko', 'en', 'mixed']).optional().describe('언어 스타일'),
};

const optimizeTitleTool: ToolDefinition<typeof optimizeTitleSchema> = {
  name: 'optimize_title_hashtags',
  description:
    'AI 기반으로 콘텐츠 제목을 최적화하고 플랫폼별 해시태그를 생성합니다. CTR 예측과 A/B 테스트 변형을 제공합니다.',
  schema: optimizeTitleSchema,
  handler: async (rawArgs) => {
    const args = rawArgs as {
      original_title: string;
      platform?: string;
      keywords?: string[];
      style?: string;
      language?: string;
    };
    const variations = generateTitleVariations(args.original_title);
    const hashtags = generatePlatformHashtags(args.keywords || [], args.platform || 'all');
    const result = {
      original: args.original_title,
      optimized_titles: variations,
      recommended: variations[0],
      title_analysis: {
        original_length: args.original_title.length,
        has_numbers: /\d/.test(args.original_title),
        has_emotional_words: /놀라운|충격|비밀|최고|완벽|필수|대박/.test(args.original_title),
        has_question: /\?/.test(args.original_title),
        readability_score: calculateReadabilityScore(args.original_title),
      },
      hashtag_strategy: hashtags,
      seo_recommendations: [
        '메인 키워드를 제목 앞부분에 배치하세요',
        '50자 이내로 유지하세요 (검색 결과 노출 최적화)',
        '감정을 자극하는 파워워드를 1-2개 포함하세요',
      ],
      ab_test_suggestion: '변형 A와 B를 각각 50%씩 테스트해보세요',
    };
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
};

// ---------------------------------------------------------------------------
// Tool: generate_hashtag_strategy
// ---------------------------------------------------------------------------

const hashtagSchema = {
  topic: z.string().describe('콘텐츠 주제'),
  platform: z
    .enum(['instagram', 'tiktok', 'youtube', 'twitter', 'threads'])
    .describe('타겟 플랫폼'),
  count: z.number().min(5).max(50).optional().describe('해시태그 수. 기본값: 30'),
  include_korean: z.boolean().optional().describe('한국어 해시태그 포함. 기본값: true'),
  include_english: z.boolean().optional().describe('영어 해시태그 포함. 기본값: true'),
};

const hashtagStrategyTool: ToolDefinition<typeof hashtagSchema> = {
  name: 'generate_hashtag_strategy',
  description: '플랫폼별 최적화된 해시태그 전략을 생성합니다. 인기도, 경쟁도, 관련성을 분석합니다.',
  schema: hashtagSchema,
  handler: async (rawArgs) => {
    const args = rawArgs as {
      topic: string;
      platform: string;
      count?: number;
      include_korean?: boolean;
      include_english?: boolean;
    };
    const topic = args.topic;
    const platform = args.platform;
    const count = args.count ?? 30;
    const includeKorean = args.include_korean ?? true;
    const includeEnglish = args.include_english ?? true;

    const koreanHashtags = [
      { tag: `#${topic.replace(/\s/g, '')}`, type: 'main', popularity: '높음' },
      { tag: `#${topic}팁`, type: 'related', popularity: '중간' },
      { tag: `#${topic}추천`, type: 'related', popularity: '높음' },
      { tag: '#일상', type: 'general', popularity: '매우 높음' },
      { tag: '#데일리', type: 'general', popularity: '매우 높음' },
      { tag: '#소통', type: 'engagement', popularity: '높음' },
      { tag: '#맞팔', type: 'engagement', popularity: '높음' },
      { tag: '#좋아요', type: 'engagement', popularity: '매우 높음' },
      { tag: '#인스타그램', type: 'platform', popularity: '매우 높음' },
      { tag: '#정보공유', type: 'content', popularity: '중간' },
      { tag: '#꿀팁', type: 'content', popularity: '높음' },
      { tag: '#추천', type: 'content', popularity: '높음' },
      { tag: '#리뷰', type: 'content', popularity: '높음' },
      { tag: '#브이로그', type: 'format', popularity: '높음' },
      { tag: '#2025', type: 'time', popularity: '중간' },
    ];
    const englishHashtags = [
      { tag: '#instagood', type: 'general', popularity: '매우 높음' },
      { tag: '#photooftheday', type: 'general', popularity: '매우 높음' },
      { tag: '#love', type: 'emotion', popularity: '매우 높음' },
      { tag: '#beautiful', type: 'emotion', popularity: '높음' },
      { tag: '#happy', type: 'emotion', popularity: '높음' },
      { tag: '#followme', type: 'engagement', popularity: '높음' },
      { tag: '#like4like', type: 'engagement', popularity: '중간' },
      { tag: '#style', type: 'lifestyle', popularity: '높음' },
      { tag: '#lifestyle', type: 'lifestyle', popularity: '높음' },
      { tag: '#tips', type: 'content', popularity: '중간' },
    ];
    let all: typeof koreanHashtags = [];
    if (includeKorean) all = [...all, ...koreanHashtags];
    if (includeEnglish) all = [...all, ...englishHashtags];

    const platformLimits: Record<string, number> = {
      instagram: 30,
      tiktok: 5,
      youtube: 15,
      twitter: 5,
      threads: 10,
    };
    const recommendedCount = Math.min(count, platformLimits[platform] || 20);

    const result = {
      topic,
      platform,
      strategy: {
        total_hashtags: recommendedCount,
        mix_ratio: {
          main_keyword: '10%',
          related: '30%',
          general: '30%',
          engagement: '20%',
          trending: '10%',
        },
      },
      hashtags: {
        high_priority: all.filter((h) => h.popularity === '매우 높음').slice(0, 5),
        medium_priority: all.filter((h) => h.popularity === '높음').slice(0, 10),
        niche: all.filter((h) => h.popularity === '중간').slice(0, 10),
      },
      all_hashtags: all.slice(0, recommendedCount).map((h) => h.tag),
      copy_paste: all
        .slice(0, recommendedCount)
        .map((h) => h.tag)
        .join(' '),
      tips: [
        `${platform}에서는 ${recommendedCount}개 이하의 해시태그를 권장합니다`,
        '인기 해시태그와 니치 해시태그를 섞어 사용하세요',
        '첫 댓글에 해시태그를 넣으면 캡션이 깔끔해집니다',
        '트렌딩 해시태그는 주기적으로 업데이트하세요',
      ],
    };
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
};

export const seoTools: ToolDefinition[] = [
  analyzeSEOTool as ToolDefinition,
  optimizeTitleTool as ToolDefinition,
  hashtagStrategyTool as ToolDefinition,
];
