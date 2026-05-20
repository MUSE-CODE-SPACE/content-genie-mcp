/**
 * Competitor / benchmark / influencer tools:
 *   - analyze_competitor_content   (uses SSRF-guarded fetchWithRetry)
 *   - benchmark_content_performance
 *   - analyze_influencer_collab
 */

import { z } from 'zod';
import * as cheerio from 'cheerio';
import type { ToolDefinition } from '../core/registry.js';
import { ContentTypeSchema } from '../types.js';
import { ToolError } from '../core/errors.js';
import { fetchWithRetry, validatePublicUrl } from '../core/security.js';
import { getNaverBlogBenchmark } from '../scrapers/naver.js';

// ---------------------------------------------------------------------------
// analyze_competitor_content
// ---------------------------------------------------------------------------

async function analyzeCompetitorContent(
  urls: string[],
  depth: string,
  extractStrategy: boolean,
): Promise<Record<string, unknown>> {
  const results: Array<Record<string, unknown>> = [];

  for (const url of urls) {
    try {
      // SSRF guard + allow-list whitelist via core/security.
      validatePublicUrl(url);

      const fetched = await fetchWithRetry(
        url,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          },
        },
        { timeout: 30_000, maxRetries: 2, maxBodyBytes: 5 * 1024 * 1024 },
      );

      if (fetched.status >= 400) {
        results.push({ url, error: `HTTP ${fetched.status} ${fetched.statusText}` });
        continue;
      }

      const $ = cheerio.load(fetched.body);
      const analysis: Record<string, unknown> = {
        url,
        title: $('title').text().trim(),
        meta_description: $('meta[name="description"]').attr('content') || '',
        og_title: $('meta[property="og:title"]').attr('content') || '',
        og_description: $('meta[property="og:description"]').attr('content') || '',
      };

      if (depth === 'detailed' || depth === 'comprehensive') {
        analysis.structure = {
          h1: $('h1')
            .map((_i, el) => $(el).text().trim())
            .get(),
          h2: $('h2')
            .map((_i, el) => $(el).text().trim())
            .get()
            .slice(0, 15),
          h3: $('h3')
            .map((_i, el) => $(el).text().trim())
            .get()
            .slice(0, 10),
        };

        const bodyText = $('body').text();
        analysis.content_stats = {
          word_count: bodyText.split(/\s+/).length,
          char_count: bodyText.length,
          images_count: $('img').length,
          videos_count: $('video, iframe[src*="youtube"], iframe[src*="vimeo"]').length,
          internal_links: $('a[href^="/"]').length,
          external_links: $('a[href^="http"]').not(`a[href*="${new URL(url).hostname}"]`).length,
        };
      }

      if (depth === 'comprehensive') {
        const text = $('body').text().toLowerCase();
        const koreanWords = text.match(/[가-힯]{2,}/g) || [];
        const wordFreq: Record<string, number> = {};
        koreanWords.forEach((word) => {
          if (word.length >= 2) wordFreq[word] = (wordFreq[word] || 0) + 1;
        });
        analysis.keyword_analysis = {
          top_keywords: Object.entries(wordFreq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 30)
            .map(([word, count]) => ({
              word,
              count,
              density: ((count / koreanWords.length) * 100).toFixed(2) + '%',
            })),
          total_keywords: koreanWords.length,
        };
        analysis.content_structure = {
          has_toc: $('[class*="toc"], [class*="table-of-contents"], #toc').length > 0,
          has_faq: $('[class*="faq"], [itemtype*="FAQPage"]').length > 0,
          has_author: $('[class*="author"], [rel="author"]').length > 0,
          schema_types: $('[itemtype]')
            .map((_i, el) => $(el).attr('itemtype'))
            .get(),
        };
      }

      results.push(analysis);
    } catch (error) {
      if (error instanceof ToolError) {
        results.push({
          url,
          error: `분석 실패 (${error.code}): ${error.message}`,
          context: error.context,
        });
      } else {
        const msg = error instanceof Error ? error.message : String(error);
        results.push({ url, error: `분석 실패: ${msg || '알 수 없는 오류'}` });
      }
    }
  }

  let strategyInsights: Record<string, unknown> | null = null;
  if (extractStrategy && results.filter((r) => !r.error).length > 0) {
    const validResults = results.filter((r) => !r.error);
    const withStats = results.filter((r) => r.content_stats);
    const withStructure = results.filter((r) => r.content_structure);
    const commonPatterns: string[] = [];

    const h2Counts = validResults.filter(
      (r) => (r.structure as { h2?: string[] } | undefined)?.h2?.length,
    );
    if (h2Counts.length > validResults.length * 0.5) {
      const avgH2 = Math.round(
        h2Counts.reduce(
          (sum, r) => sum + ((r.structure as { h2: string[] }).h2.length || 0),
          0,
        ) / h2Counts.length,
      );
      commonPatterns.push(`H2 태그 평균 ${avgH2}개 사용 (섹션 구분)`);
    }
    if (withStats.length > 0) {
      const avgImages = Math.round(
        withStats.reduce(
          (sum, r) => sum + ((r.content_stats as { images_count: number }).images_count || 0),
          0,
        ) / withStats.length,
      );
      commonPatterns.push(
        avgImages > 5
          ? `이미지 다수 활용 (평균 ${avgImages}개)`
          : `이미지 적게 사용 (평균 ${avgImages}개)`,
      );
    }

    const hasToc = withStructure.filter(
      (r) => (r.content_structure as { has_toc?: boolean })?.has_toc,
    ).length;
    const hasFaq = withStructure.filter(
      (r) => (r.content_structure as { has_faq?: boolean })?.has_faq,
    ).length;
    if (hasToc > 0) commonPatterns.push(`목차(TOC) 제공 - ${hasToc}/${withStructure.length} 사이트`);
    if (hasFaq > 0) commonPatterns.push(`FAQ 섹션 포함 - ${hasFaq}/${withStructure.length} 사이트`);

    const avgWordCount =
      withStats.length > 0
        ? Math.round(
            withStats.reduce(
              (s, r) => s + ((r.content_stats as { word_count: number }).word_count || 0),
              0,
            ) / withStats.length,
          )
        : 0;
    const avgImages =
      withStats.length > 0
        ? Math.round(
            withStats.reduce(
              (s, r) =>
                s + ((r.content_stats as { images_count: number }).images_count || 0),
              0,
            ) / withStats.length,
          )
        : 0;
    const avgVideos =
      withStats.length > 0
        ? Math.round(
            withStats.reduce(
              (s, r) =>
                s + ((r.content_stats as { videos_count: number }).videos_count || 0),
              0,
            ) / withStats.length,
          )
        : 0;

    const opportunities: string[] = [];
    if (avgVideos === 0)
      opportunities.push('비디오 콘텐츠 추가로 차별화 가능 (경쟁사 비디오 미사용)');
    if (hasFaq === 0 && withStructure.length > 0)
      opportunities.push('FAQ 섹션 추가로 검색 노출 강화 (경쟁사 미적용)');
    if (avgWordCount > 0 && avgWordCount < 2000)
      opportunities.push(`콘텐츠 분량 확대 권장 (경쟁사 평균 ${avgWordCount}자)`);
    else if (avgWordCount >= 2000) opportunities.push(`상세 콘텐츠로 경쟁 중 — 핵심 정보 차별화 필요`);
    if (hasToc === 0 && withStructure.length > 0)
      opportunities.push('목차 추가로 사용자 경험 향상 가능');

    strategyInsights = {
      common_patterns: commonPatterns.slice(0, 5),
      average_metrics: {
        avg_word_count: avgWordCount,
        avg_images: avgImages,
        avg_videos: avgVideos,
        sites_with_toc: hasToc,
        sites_with_faq: hasFaq,
      },
      opportunities: opportunities.slice(0, 5),
      recommendation:
        avgWordCount > 3000
          ? '경쟁사가 상세 콘텐츠 제공 중 — 품질과 차별화에 집중'
          : '콘텐츠 깊이와 분량으로 경쟁 우위 확보 가능',
      analyzed_sites: validResults.length,
    };
  }

  return {
    analyzed_at: new Date().toISOString(),
    analysis_depth: depth,
    total_urls: urls.length,
    successful: results.filter((r) => !r.error).length,
    results,
    strategy_insights: strategyInsights,
  };
}

const competitorSchema = {
  urls: z.array(z.string()).describe('분석할 URL 목록 (최대 10개)'),
  analysis_depth: z
    .enum(['basic', 'detailed', 'comprehensive'])
    .optional()
    .describe('분석 깊이'),
  extract_strategy: z.boolean().optional().describe('콘텐츠 전략 추출'),
};

const competitorTool: ToolDefinition<typeof competitorSchema> = {
  name: 'analyze_competitor_content',
  description:
    '경쟁사 콘텐츠를 심층 분석하여 키워드, 구조, 전략 인사이트를 도출합니다.',
  schema: competitorSchema,
  handler: async (rawArgs) => {
    const args = rawArgs as {
      urls: string[];
      analysis_depth?: string;
      extract_strategy?: boolean;
    };
    const result = await analyzeCompetitorContent(
      args.urls.slice(0, 10),
      args.analysis_depth || 'detailed',
      args.extract_strategy ?? true,
    );
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
};

// ---------------------------------------------------------------------------
// benchmark_content_performance
// ---------------------------------------------------------------------------

function calculateRealTimeBenchmark(
  category: string,
  platform: string,
): Record<string, unknown> {
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay();

  const timeMultiplier =
    hour >= 19 && hour <= 22
      ? 1.3
      : hour >= 12 && hour <= 14
        ? 1.1
        : hour >= 7 && hour <= 9
          ? 0.9
          : 1.0;
  const dayMultiplier = dayOfWeek === 0 || dayOfWeek === 6 ? 1.2 : 1.0;

  const baseBenchmarks: Record<string, Record<string, Record<string, number>>> = {
    뷰티: {
      instagram: { base_engagement: 4.2, avg_likes: 3500, avg_comments: 120, avg_saves: 450 },
      youtube: { avg_views: 25000, avg_likes: 1200, avg_comments: 85, ctr: 5.5 },
      tiktok: { avg_views: 50000, avg_likes: 3000, avg_shares: 200, completion_rate: 45 },
      blog: { avg_views: 3000, avg_likes: 50, avg_comments: 15 },
    },
    테크: {
      instagram: { base_engagement: 3.5, avg_likes: 2000, avg_comments: 80, avg_saves: 300 },
      youtube: { avg_views: 35000, avg_likes: 1500, avg_comments: 120, ctr: 6.2 },
      tiktok: { avg_views: 30000, avg_likes: 2000, avg_shares: 150, completion_rate: 40 },
      blog: { avg_views: 5000, avg_likes: 80, avg_comments: 25 },
    },
    푸드: {
      instagram: { base_engagement: 5.1, avg_likes: 4500, avg_comments: 150, avg_saves: 600 },
      youtube: { avg_views: 40000, avg_likes: 2000, avg_comments: 100, ctr: 7.0 },
      tiktok: { avg_views: 80000, avg_likes: 5000, avg_shares: 400, completion_rate: 55 },
      blog: { avg_views: 4000, avg_likes: 100, avg_comments: 30 },
    },
    라이프스타일: {
      instagram: { base_engagement: 3.8, avg_likes: 3000, avg_comments: 100, avg_saves: 350 },
      youtube: { avg_views: 20000, avg_likes: 900, avg_comments: 70, ctr: 4.8 },
      tiktok: { avg_views: 40000, avg_likes: 2500, avg_shares: 180, completion_rate: 42 },
      blog: { avg_views: 2500, avg_likes: 40, avg_comments: 12 },
    },
  };

  const categoryData = baseBenchmarks[category] || baseBenchmarks['라이프스타일'];
  const platformData = categoryData[platform] || categoryData.instagram;

  const adjustedData: Record<string, number | string> = {};
  for (const [key, value] of Object.entries(platformData)) {
    if (typeof value === 'number') {
      if (key.includes('engagement') || key.includes('rate') || key.includes('ctr')) {
        adjustedData[key] = Math.round(value * timeMultiplier * 10) / 10;
      } else {
        adjustedData[key] = Math.round(value * timeMultiplier * dayMultiplier);
      }
    } else {
      adjustedData[key] = value;
    }
  }

  return {
    category,
    platform,
    benchmark: adjustedData,
    time_adjustment: {
      time_multiplier: timeMultiplier,
      day_multiplier: dayMultiplier,
      optimal_hours: '19:00-22:00',
      best_days: '토요일, 일요일',
    },
    calculated_at: now.toISOString(),
  };
}

function getCategoryPlatformTips(platform: string, category: string): string[] {
  const tips: Record<string, Record<string, string[]>> = {
    instagram: {
      뷰티: ['릴스에서 메이크업 튜토리얼 공유', 'Before/After 콘텐츠 활용', '스와이프 가이드 활용'],
      테크: ['제품 언박싱 릴스', '사용 팁 카드뉴스', '기술 비교 인포그래픽'],
      푸드: ['ASMR 요리 릴스', '레시피 카드 저장 유도', '먹방 스토리 활용'],
      default: ['릴스 콘텐츠 강화', '스토리 적극 활용', '해시태그 최적화'],
    },
    youtube: {
      뷰티: ['썸네일에 Before/After 강조', '쇼츠로 빠른 팁 공유', '챕터 활용'],
      테크: ['비교 리뷰 콘텐츠', '언박싱 + 한달 사용기', '숏폼으로 핵심 정리'],
      푸드: ['레시피 타임라인 제공', 'ASMR 조리 영상', '쇼츠로 30초 레시피'],
      default: ['매력적인 썸네일 제작', '쇼츠 적극 활용', '커뮤니티 탭 활용'],
    },
    tiktok: {
      뷰티: ['트렌드 사운드 활용', '듀엣 챌린지 참여', 'GRWM 콘텐츠'],
      테크: ['제품 해킹 팁', '포장 풀기 리액션', '가성비 추천'],
      푸드: ['음식 ASMR', '먹방 리액션', '쉬운 레시피 공유'],
      default: ['트렌딩 사운드 사용', '듀엣/스티치 활용', '후킹 3초 내 승부'],
    },
    blog: {
      뷰티: ['상세 리뷰 + 비포/애프터', '성분 분석 콘텐츠', '시즌별 추천'],
      테크: ['스펙 비교표 제공', '실사용 후기 중심', '가격 비교 정보'],
      푸드: ['상세 레시피 + 팁', '맛집 리스트업', '영양 정보 포함'],
      default: ['키워드 최적화', '상세한 정보 제공', '이미지 다수 삽입'],
    },
  };
  return (
    tips[platform]?.[category] ||
    tips[platform]?.default || ['일관된 콘텐츠 스타일 유지', '트렌드에 빠르게 대응', '커뮤니티 소통 강화']
  );
}

async function getBenchmarkData(
  category: string,
  platform: string,
  metric: string,
): Promise<Record<string, unknown>> {
  const realTimeBenchmark = calculateRealTimeBenchmark(category, platform);
  let liveData: Record<string, unknown> | null = null;
  try {
    if (platform === 'blog') liveData = await getNaverBlogBenchmark(category);
  } catch {
    // ignore — fall back to calculated benchmark
  }

  const benchmarkData = realTimeBenchmark.benchmark as Record<string, unknown>;
  if (liveData) {
    for (const [k, v] of Object.entries(liveData)) {
      if (typeof v === 'number') benchmarkData[k] = v;
    }
  }

  const hour = new Date().getHours();
  const optimalTimes =
    platform === 'instagram'
      ? ['19:00-21:00', '12:00-13:00', '07:00-09:00']
      : platform === 'youtube'
        ? ['17:00-20:00', '12:00-14:00', '21:00-23:00']
        : platform === 'tiktok'
          ? ['18:00-22:00', '11:00-13:00', '06:00-08:00']
          : ['09:00-11:00', '14:00-16:00', '19:00-21:00'];
  const isOptimalTime = (hour >= 19 && hour <= 21) || (hour >= 12 && hour <= 13);

  // metric is recorded in the response so the caller knows the slice they
  // asked for, but the full benchmark surface is always included since it's
  // tiny and useful.
  return {
    category,
    platform,
    metric,
    benchmark_data: benchmarkData,
    data_source: liveData ? 'live_scraping' : 'calculated_benchmark',
    time_adjusted: true,
    industry_average: {
      engagement_rate: `${(benchmarkData.base_engagement as number | undefined) || 3.5}%`,
      best_posting_frequency:
        platform === 'youtube' ? '주 2-3회' : platform === 'blog' ? '주 3-5회' : '매일 1-2회',
      optimal_posting_times: optimalTimes,
      current_time_status: isOptimalTime
        ? '지금이 최적 시간대입니다!'
        : '최적 시간대를 기다려보세요',
    },
    platform_specific_tips: getCategoryPlatformTips(platform, category),
    calculated_at: realTimeBenchmark.calculated_at,
  };
}

const benchmarkSchema = {
  category: z.string().describe('콘텐츠 카테고리'),
  platform: ContentTypeSchema.describe('플랫폼'),
  metric: z.enum(['engagement', 'reach', 'conversion', 'all']).optional().describe('측정 지표'),
};

const benchmarkTool: ToolDefinition<typeof benchmarkSchema> = {
  name: 'benchmark_content_performance',
  description: '업계/카테고리별 콘텐츠 성과 벤치마크 데이터를 제공합니다.',
  schema: benchmarkSchema,
  handler: async (rawArgs) => {
    const args = rawArgs as { category: string; platform: string; metric?: string };
    const result = await getBenchmarkData(args.category, args.platform, args.metric || 'all');
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
};

// ---------------------------------------------------------------------------
// analyze_influencer_collab
// ---------------------------------------------------------------------------

function analyzeInfluencerCollab(
  category: string,
  audience: string,
  budget: string,
  goal: string,
): Record<string, unknown> {
  const tierInfo: Record<string, Record<string, unknown>> = {
    nano: {
      followers: '1K-10K',
      engagement: '5-10%',
      cost: '10-50만원',
      pros: ['높은 참여율', '진정성', '저비용'],
      cons: ['도달 제한', '전문성 부족 가능'],
    },
    micro: {
      followers: '10K-50K',
      engagement: '3-8%',
      cost: '50-200만원',
      pros: ['좋은 참여율', '타겟 정확', '비용 효율'],
      cons: ['도달 중간', '협상 필요'],
    },
    mid: {
      followers: '50K-500K',
      engagement: '2-5%',
      cost: '200-1000만원',
      pros: ['넓은 도달', '전문성', '콘텐츠 품질'],
      cons: ['비용 상승', '광고 느낌'],
    },
    macro: {
      followers: '500K-1M',
      engagement: '1-3%',
      cost: '1000-3000만원',
      pros: ['큰 도달', '신뢰도', '브랜드 인지도'],
      cons: ['높은 비용', '낮은 참여율'],
    },
    mega: {
      followers: '1M+',
      engagement: '1-2%',
      cost: '3000만원+',
      pros: ['최대 도달', '화제성', '브랜드 이미지'],
      cons: ['매우 높은 비용', '진정성 의문'],
    },
  };

  const budgetTiers: Record<string, string[]> = {
    low: ['nano', 'micro'],
    medium: ['micro', 'mid'],
    high: ['mid', 'macro'],
    premium: ['macro', 'mega'],
  };
  const recommendedTiers = budgetTiers[budget] || ['micro', 'mid'];

  const platformsByCategory: Record<string, string[]> = {
    뷰티: ['인스타그램', '유튜브', '틱톡'],
    패션: ['인스타그램', '유튜브'],
    푸드: ['유튜브', '인스타그램', '블로그'],
    테크: ['유튜브', '블로그'],
    라이프스타일: ['인스타그램', '유튜브', '블로그'],
    게임: ['유튜브', '트위치', '틱톡'],
    육아: ['인스타그램', '블로그', '유튜브'],
    여행: ['인스타그램', '유튜브', '블로그'],
  };

  const collabTypes = [
    { type: '제품 협찬', description: '제품 제공 + 솔직 리뷰', suitable_for: ['awareness', 'content'] },
    { type: '유료 광고', description: '정해진 가이드라인 콘텐츠', suitable_for: ['awareness', 'conversion'] },
    { type: '어필리에이트', description: '판매 수수료 기반', suitable_for: ['conversion'] },
    { type: '앰버서더', description: '장기 파트너십', suitable_for: ['awareness', 'engagement'] },
    { type: '콘텐츠 공동제작', description: '함께 기획/제작', suitable_for: ['content', 'engagement'] },
  ];

  return {
    brand_category: category,
    target_audience: audience,
    budget_range: budget,
    campaign_goal: goal,
    recommended_influencer_tiers: recommendedTiers.map((tier) => ({ tier, ...tierInfo[tier] })),
    recommended_platforms: platformsByCategory[category] || ['인스타그램', '유튜브'],
    suitable_collab_types: collabTypes.filter((c) => c.suitable_for.includes(goal)),
    success_metrics:
      ({
        awareness: ['도달수', '노출수', '브랜드 검색량'],
        engagement: ['좋아요', '댓글', '저장', '공유'],
        conversion: ['클릭수', '구매수', 'ROAS'],
        content: ['콘텐츠 품질', '재사용 가능성'],
      } as Record<string, string[]>)[goal] || ['도달수', '참여율'],
    negotiation_tips: [
      '명확한 KPI 설정',
      '콘텐츠 사용권 협의',
      '수정 횟수 명시',
      '게시 일정 확정',
      '성과 리포트 요청',
    ],
    red_flags: [
      '팔로워 대비 참여율 너무 낮음 (1% 미만)',
      '댓글이 대부분 이모지나 봇성',
      '최근 콘텐츠 업로드 없음',
      '브랜드 이미지와 맞지 않는 과거 콘텐츠',
    ],
  };
}

const influencerSchema = {
  brand_category: z.string().describe('브랜드/제품 카테고리'),
  target_audience: z.string().describe('타겟 오디언스'),
  budget_range: z.enum(['low', 'medium', 'high', 'premium']).optional().describe('예산 범위'),
  campaign_goal: z
    .enum(['awareness', 'engagement', 'conversion', 'content'])
    .optional()
    .describe('캠페인 목표'),
};

const influencerTool: ToolDefinition<typeof influencerSchema> = {
  name: 'analyze_influencer_collab',
  description: '인플루언서 협업 전략 및 적합도를 분석합니다. 브랜드-인플루언서 매칭 가이드를 제공합니다.',
  schema: influencerSchema,
  handler: async (rawArgs) => {
    const args = rawArgs as {
      brand_category: string;
      target_audience: string;
      budget_range?: string;
      campaign_goal?: string;
    };
    const result = analyzeInfluencerCollab(
      args.brand_category,
      args.target_audience,
      args.budget_range || 'medium',
      args.campaign_goal || 'engagement',
    );
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
};

export const competitorAnalysisTools: ToolDefinition[] = [
  competitorTool as ToolDefinition,
  benchmarkTool as ToolDefinition,
  influencerTool as ToolDefinition,
];
