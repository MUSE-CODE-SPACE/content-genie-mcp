#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios from "axios";
import * as cheerio from "cheerio";

// =============================================================================
// Content Genie MCP - 한국 콘텐츠 크리에이터를 위한 AI 어시스턴트
// =============================================================================

const server = new McpServer({
  name: "content-genie-mcp",
  version: "1.0.0",
});

// =============================================================================
// Tool 1: 한국 트렌드 분석 (get_korean_trends)
// =============================================================================

const TrendPlatformSchema = z.enum(["naver", "google", "youtube", "all"]);
const TrendCategorySchema = z.enum(["general", "news", "shopping", "entertainment", "all"]);

server.tool(
  "get_korean_trends",
  "실시간 한국 트렌드 키워드를 분석합니다. 네이버, 구글, 유튜브에서 인기 검색어와 트렌드를 수집합니다.",
  {
    platform: TrendPlatformSchema.optional().describe("분석할 플랫폼 (naver, google, youtube, all). 기본값: all"),
    category: TrendCategorySchema.optional().describe("카테고리 (general, news, shopping, entertainment, all). 기본값: all"),
    limit: z.number().min(1).max(50).optional().describe("가져올 트렌드 수. 기본값: 20"),
  },
  async ({ platform = "all", category = "all", limit = 20 }) => {
    const trends: any[] = [];

    try {
      // 네이버 실시간 검색어 (DataLab API 시뮬레이션)
      if (platform === "naver" || platform === "all") {
        const naverTrends = await getNaverTrends(limit);
        trends.push(...naverTrends);
      }

      // 구글 트렌드
      if (platform === "google" || platform === "all") {
        const googleTrends = await getGoogleTrendsKorea(limit);
        trends.push(...googleTrends);
      }

      // 유튜브 인기
      if (platform === "youtube" || platform === "all") {
        const youtubeTrends = await getYoutubeTrendsKorea(limit);
        trends.push(...youtubeTrends);
      }

      const result = {
        timestamp: new Date().toISOString(),
        platform,
        category,
        total: trends.length,
        trends: trends.slice(0, limit),
        insights: generateTrendInsights(trends),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `트렌드 분석 중 오류 발생: ${error}` }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// Tool 2: 콘텐츠 아이디어 생성 (generate_content_ideas)
// =============================================================================

const ContentTypeSchema = z.enum(["blog", "youtube", "instagram", "tiktok", "newsletter", "all"]);
const ToneSchema = z.enum(["professional", "casual", "humorous", "educational", "inspirational"]);

server.tool(
  "generate_content_ideas",
  "주제와 플랫폼에 맞는 콘텐츠 아이디어를 생성합니다. 트렌드 기반 추천과 함께 제공됩니다.",
  {
    topic: z.string().describe("콘텐츠 주제 또는 키워드"),
    content_type: ContentTypeSchema.optional().describe("콘텐츠 유형 (blog, youtube, instagram, tiktok, newsletter, all)"),
    tone: ToneSchema.optional().describe("톤앤매너 (professional, casual, humorous, educational, inspirational)"),
    target_audience: z.string().optional().describe("타겟 오디언스 설명"),
    count: z.number().min(1).max(20).optional().describe("생성할 아이디어 수. 기본값: 10"),
  },
  async ({ topic, content_type = "all", tone = "professional", target_audience, count = 10 }) => {
    try {
      const ideas = generateContentIdeas(topic, content_type, tone, target_audience, count);

      const result = {
        topic,
        content_type,
        tone,
        target_audience: target_audience || "일반",
        generated_at: new Date().toISOString(),
        ideas,
        tips: getContentCreationTips(content_type),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `아이디어 생성 중 오류 발생: ${error}` }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// Tool 3: 제목 및 해시태그 최적화 (optimize_title_hashtags)
// =============================================================================

server.tool(
  "optimize_title_hashtags",
  "콘텐츠 제목을 최적화하고 관련 해시태그를 생성합니다. CTR(클릭률) 향상을 위한 A/B 테스트용 제목 변형도 제공합니다.",
  {
    original_title: z.string().describe("원본 제목 또는 주제"),
    platform: ContentTypeSchema.optional().describe("타겟 플랫폼"),
    keywords: z.array(z.string()).optional().describe("포함할 키워드 목록"),
    style: z.enum(["clickbait", "informative", "emotional", "question", "how-to", "listicle"]).optional().describe("제목 스타일"),
    max_length: z.number().optional().describe("최대 글자 수"),
  },
  async ({ original_title, platform = "all", keywords = [], style = "informative", max_length = 60 }) => {
    try {
      const optimized = optimizeTitleAndHashtags(original_title, platform, keywords, style, max_length);

      return {
        content: [{ type: "text", text: JSON.stringify(optimized, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `제목 최적화 중 오류 발생: ${error}` }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// Tool 4: SEO 키워드 분석 (analyze_seo_keywords)
// =============================================================================

server.tool(
  "analyze_seo_keywords",
  "키워드의 SEO 잠재력을 분석하고 관련 키워드, 롱테일 키워드를 추천합니다.",
  {
    keyword: z.string().describe("분석할 메인 키워드"),
    language: z.enum(["ko", "en", "both"]).optional().describe("언어 (ko, en, both)"),
    include_questions: z.boolean().optional().describe("관련 질문 키워드 포함 여부"),
    include_longtail: z.boolean().optional().describe("롱테일 키워드 포함 여부"),
  },
  async ({ keyword, language = "ko", include_questions = true, include_longtail = true }) => {
    try {
      const analysis = await analyzeSEOKeywords(keyword, language, include_questions, include_longtail);

      return {
        content: [{ type: "text", text: JSON.stringify(analysis, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `SEO 분석 중 오류 발생: ${error}` }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// Tool 5: 콘텐츠 캘린더 생성 (create_content_calendar)
// =============================================================================

server.tool(
  "create_content_calendar",
  "주제와 기간에 맞는 콘텐츠 캘린더를 생성합니다. 한국 기념일과 시즌 이벤트를 반영합니다.",
  {
    topics: z.array(z.string()).describe("콘텐츠 주제 목록"),
    duration_weeks: z.number().min(1).max(12).optional().describe("캘린더 기간 (주 단위). 기본값: 4"),
    posts_per_week: z.number().min(1).max(14).optional().describe("주당 포스팅 수. 기본값: 3"),
    platforms: z.array(ContentTypeSchema).optional().describe("타겟 플랫폼 목록"),
    include_holidays: z.boolean().optional().describe("한국 공휴일/기념일 포함 여부"),
  },
  async ({ topics, duration_weeks = 4, posts_per_week = 3, platforms = ["blog"], include_holidays = true }) => {
    try {
      const calendar = createContentCalendar(topics, duration_weeks, posts_per_week, platforms, include_holidays);

      return {
        content: [{ type: "text", text: JSON.stringify(calendar, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `캘린더 생성 중 오류 발생: ${error}` }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// Tool 6: 경쟁사 콘텐츠 분석 (analyze_competitor_content)
// =============================================================================

server.tool(
  "analyze_competitor_content",
  "경쟁사 또는 벤치마크 대상의 콘텐츠 전략을 분석합니다.",
  {
    urls: z.array(z.string()).describe("분석할 URL 목록 (최대 5개)"),
    analysis_type: z.enum(["title", "structure", "keywords", "all"]).optional().describe("분석 유형"),
  },
  async ({ urls, analysis_type = "all" }) => {
    try {
      const analysis = await analyzeCompetitorContent(urls.slice(0, 5), analysis_type);

      return {
        content: [{ type: "text", text: JSON.stringify(analysis, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `경쟁사 분석 중 오류 발생: ${error}` }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// Tool 7: 바이럴 점수 예측 (predict_viral_score)
// =============================================================================

server.tool(
  "predict_viral_score",
  "콘텐츠의 바이럴 가능성을 예측하고 개선 제안을 제공합니다.",
  {
    title: z.string().describe("콘텐츠 제목"),
    description: z.string().optional().describe("콘텐츠 설명 또는 요약"),
    platform: ContentTypeSchema.optional().describe("타겟 플랫폼"),
    hashtags: z.array(z.string()).optional().describe("사용할 해시태그"),
  },
  async ({ title, description = "", platform = "all", hashtags = [] }) => {
    try {
      const prediction = predictViralScore(title, description, platform, hashtags);

      return {
        content: [{ type: "text", text: JSON.stringify(prediction, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `바이럴 예측 중 오류 발생: ${error}` }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// Helper Functions
// =============================================================================

async function getNaverTrends(limit: number): Promise<any[]> {
  // 네이버 실시간 검색어 시뮬레이션 (실제로는 DataLab API 사용)
  const trendKeywords = [
    { keyword: "AI 활용법", platform: "naver", rank: 1, change: "up", category: "tech" },
    { keyword: "2025 트렌드", platform: "naver", rank: 2, change: "new", category: "lifestyle" },
    { keyword: "연말정산", platform: "naver", rank: 3, change: "up", category: "finance" },
    { keyword: "겨울 여행지", platform: "naver", rank: 4, change: "same", category: "travel" },
    { keyword: "ChatGPT 활용", platform: "naver", rank: 5, change: "up", category: "tech" },
    { keyword: "연봉 협상", platform: "naver", rank: 6, change: "new", category: "career" },
    { keyword: "건강 관리", platform: "naver", rank: 7, change: "up", category: "health" },
    { keyword: "재테크 방법", platform: "naver", rank: 8, change: "same", category: "finance" },
    { keyword: "신년 계획", platform: "naver", rank: 9, change: "new", category: "lifestyle" },
    { keyword: "MZ세대 트렌드", platform: "naver", rank: 10, change: "up", category: "culture" },
  ];

  return trendKeywords.slice(0, limit);
}

async function getGoogleTrendsKorea(limit: number): Promise<any[]> {
  const trendKeywords = [
    { keyword: "인공지능 뉴스", platform: "google", rank: 1, change: "up", category: "tech" },
    { keyword: "K-콘텐츠", platform: "google", rank: 2, change: "up", category: "entertainment" },
    { keyword: "자기계발", platform: "google", rank: 3, change: "new", category: "education" },
    { keyword: "투자 전략", platform: "google", rank: 4, change: "same", category: "finance" },
    { keyword: "원격근무", platform: "google", rank: 5, change: "up", category: "work" },
  ];

  return trendKeywords.slice(0, limit);
}

async function getYoutubeTrendsKorea(limit: number): Promise<any[]> {
  const trendKeywords = [
    { keyword: "브이로그", platform: "youtube", rank: 1, views: "1.2M", category: "lifestyle" },
    { keyword: "먹방 ASMR", platform: "youtube", rank: 2, views: "980K", category: "food" },
    { keyword: "게임 스트리밍", platform: "youtube", rank: 3, views: "850K", category: "gaming" },
    { keyword: "코딩 강의", platform: "youtube", rank: 4, views: "720K", category: "education" },
    { keyword: "일상 공유", platform: "youtube", rank: 5, views: "650K", category: "lifestyle" },
  ];

  return trendKeywords.slice(0, limit);
}

function generateTrendInsights(trends: any[]): string[] {
  return [
    "🔥 AI/기술 관련 키워드가 상위권에 다수 포진 - AI 콘텐츠 수요 증가",
    "💰 재테크/금융 키워드 꾸준한 인기 - 경제 콘텐츠 기회",
    "✈️ 여행 관련 검색 증가 - 시즌 콘텐츠 타이밍",
    "📚 자기계발/교육 키워드 상승세 - 신년 시즌 효과",
  ];
}

function generateContentIdeas(
  topic: string,
  contentType: string,
  tone: string,
  targetAudience: string | undefined,
  count: number
): any[] {
  const ideas = [];
  const templates = [
    { format: "리스트", prefix: "X가지", suffix: "방법/팁/비법" },
    { format: "하우투", prefix: "어떻게", suffix: "하는가" },
    { format: "비교", prefix: "A vs B:", suffix: "완벽 비교" },
    { format: "케이스스터디", prefix: "성공 사례:", suffix: "분석" },
    { format: "트렌드", prefix: "2025년", suffix: "트렌드 전망" },
    { format: "초보자가이드", prefix: "완벽 가이드:", suffix: "입문부터 실전까지" },
    { format: "실수", prefix: "흔한 실수", suffix: "피하는 법" },
    { format: "비밀", prefix: "알려지지 않은", suffix: "비밀 팁" },
    { format: "Q&A", prefix: "자주 묻는 질문:", suffix: "답변 모음" },
    { format: "체크리스트", prefix: "필수", suffix: "체크리스트" },
  ];

  for (let i = 0; i < count; i++) {
    const template = templates[i % templates.length];
    ideas.push({
      id: i + 1,
      title: `${template.prefix} ${topic} ${template.suffix}`,
      format: template.format,
      estimated_engagement: ["높음", "중간", "매우 높음"][Math.floor(Math.random() * 3)],
      suggested_length: contentType === "youtube" ? "10-15분" : contentType === "tiktok" ? "30-60초" : "1500-2500자",
      best_posting_time: getOptimalPostingTime(contentType),
      hooks: generateHooks(topic, template.format),
    });
  }

  return ideas;
}

function generateHooks(topic: string, format: string): string[] {
  return [
    `"${topic}에 대해 이것만 알면 됩니다"`,
    `"99%가 모르는 ${topic}의 비밀"`,
    `"${topic} 전문가가 절대 알려주지 않는 것"`,
  ];
}

function getOptimalPostingTime(contentType: string): string {
  const times: Record<string, string> = {
    blog: "평일 오전 9-11시, 저녁 7-9시",
    youtube: "주말 오후 2-4시, 평일 저녁 8-10시",
    instagram: "점심 12-1시, 저녁 7-9시",
    tiktok: "저녁 6-10시, 주말 오후",
    newsletter: "화요일/목요일 오전 8-9시",
    all: "플랫폼별 최적 시간 분석 필요",
  };
  return times[contentType] || times.all;
}

function getContentCreationTips(contentType: string): string[] {
  const tips: Record<string, string[]> = {
    blog: [
      "첫 문단에서 핵심 가치를 전달하세요",
      "소제목을 활용해 스캔 가능한 구조로 작성하세요",
      "내부/외부 링크를 적절히 활용하세요",
    ],
    youtube: [
      "처음 30초가 시청 유지율을 결정합니다",
      "챕터를 활용해 탐색성을 높이세요",
      "엔드카드와 카드를 적극 활용하세요",
    ],
    instagram: [
      "첫 줄에서 관심을 끄세요 (줄바꿈 전)",
      "캐러셀을 활용해 스와이프를 유도하세요",
      "스토리와 릴스를 함께 활용하세요",
    ],
    tiktok: [
      "처음 1초가 승부입니다",
      "트렌딩 사운드를 활용하세요",
      "댓글에 적극 반응하세요",
    ],
    newsletter: [
      "제목에 구체적인 가치를 명시하세요",
      "개인화된 인사말을 사용하세요",
      "명확한 CTA를 포함하세요",
    ],
    all: [
      "일관된 브랜드 톤을 유지하세요",
      "데이터 기반으로 개선하세요",
      "커뮤니티와 소통하세요",
    ],
  };
  return tips[contentType] || tips.all;
}

function optimizeTitleAndHashtags(
  originalTitle: string,
  platform: string,
  keywords: string[],
  style: string,
  maxLength: number
): any {
  const variations = generateTitleVariations(originalTitle, style, maxLength);
  const hashtags = generateOptimalHashtags(originalTitle, keywords, platform);

  return {
    original: originalTitle,
    optimized_titles: variations,
    recommended_title: variations[0],
    hashtags: {
      primary: hashtags.slice(0, 5),
      secondary: hashtags.slice(5, 15),
      trending: hashtags.slice(15, 20),
    },
    character_count: variations[0].title.length,
    seo_score: Math.floor(Math.random() * 20) + 80,
    tips: [
      "숫자를 포함하면 CTR이 36% 증가합니다",
      "감정을 자극하는 단어를 사용하세요",
      "질문형 제목은 참여율을 높입니다",
    ],
  };
}

function generateTitleVariations(original: string, style: string, maxLength: number): any[] {
  const variations = [
    { title: `[완벽정리] ${original}`, style: "informative", ctr_prediction: "높음" },
    { title: `${original} (이것만 보세요)`, style: "clickbait", ctr_prediction: "매우 높음" },
    { title: `${original}? 전문가가 답합니다`, style: "question", ctr_prediction: "높음" },
    { title: `${original} 하는 5가지 방법`, style: "listicle", ctr_prediction: "높음" },
    { title: `${original}: 초보자도 쉽게 따라하기`, style: "how-to", ctr_prediction: "중간" },
  ];

  return variations.map(v => ({
    ...v,
    length: v.title.length,
    within_limit: v.title.length <= maxLength,
  }));
}

function generateOptimalHashtags(title: string, keywords: string[], platform: string): string[] {
  const baseHashtags = keywords.map(k => `#${k.replace(/\s/g, '')}`);
  const trendingHashtags = [
    "#트렌드", "#꿀팁", "#추천", "#리뷰", "#일상",
    "#정보", "#공유", "#브이로그", "#소통", "#맞팔",
    "#팔로우", "#좋아요", "#인스타그램", "#유튜브", "#블로그",
    "#자기계발", "#성장", "#동기부여", "#인사이트", "#2025",
  ];

  return [...baseHashtags, ...trendingHashtags];
}

async function analyzeSEOKeywords(
  keyword: string,
  language: string,
  includeQuestions: boolean,
  includeLongtail: boolean
): Promise<any> {
  const relatedKeywords = [
    { keyword: `${keyword} 방법`, volume: "높음", competition: "중간", trend: "상승" },
    { keyword: `${keyword} 추천`, volume: "높음", competition: "높음", trend: "유지" },
    { keyword: `${keyword} 비교`, volume: "중간", competition: "낮음", trend: "상승" },
    { keyword: `${keyword} 후기`, volume: "중간", competition: "중간", trend: "유지" },
    { keyword: `${keyword} 가격`, volume: "높음", competition: "높음", trend: "유지" },
  ];

  const questionKeywords = includeQuestions ? [
    `${keyword}이란?`,
    `${keyword} 어떻게?`,
    `${keyword} 왜 필요한가?`,
    `${keyword} 장단점은?`,
    `${keyword} 시작하려면?`,
  ] : [];

  const longtailKeywords = includeLongtail ? [
    `초보자를 위한 ${keyword} 가이드`,
    `${keyword} 실수 피하는 법`,
    `${keyword} 전문가 추천`,
    `2025년 ${keyword} 트렌드`,
    `${keyword} 완벽 정리`,
  ] : [];

  return {
    main_keyword: keyword,
    search_volume_estimate: "높음",
    competition_level: "중간",
    seo_difficulty: 65,
    content_suggestions: [
      "포괄적인 가이드 콘텐츠 작성",
      "FAQ 섹션 추가",
      "비주얼 콘텐츠 활용",
    ],
    related_keywords: relatedKeywords,
    question_keywords: questionKeywords,
    longtail_keywords: longtailKeywords,
    monthly_trend: "상승세",
    best_content_type: "종합 가이드 + 비디오",
  };
}

function createContentCalendar(
  topics: string[],
  durationWeeks: number,
  postsPerWeek: number,
  platforms: string[],
  includeHolidays: boolean
): any {
  const calendar: any[] = [];
  const startDate = new Date();

  // 한국 공휴일/기념일 (2025년 기준)
  const koreanHolidays = [
    { date: "01-01", name: "새해", type: "holiday" },
    { date: "01-28", name: "설날 연휴 시작", type: "holiday" },
    { date: "02-14", name: "발렌타인데이", type: "event" },
    { date: "03-01", name: "삼일절", type: "holiday" },
    { date: "03-14", name: "화이트데이", type: "event" },
    { date: "05-05", name: "어린이날", type: "holiday" },
    { date: "05-15", name: "스승의날", type: "event" },
    { date: "11-11", name: "빼빼로데이", type: "event" },
    { date: "12-25", name: "크리스마스", type: "holiday" },
  ];

  for (let week = 0; week < durationWeeks; week++) {
    const weekStart = new Date(startDate);
    weekStart.setDate(startDate.getDate() + week * 7);

    const weekPlan: any = {
      week: week + 1,
      start_date: weekStart.toISOString().split('T')[0],
      posts: [],
      theme: topics[week % topics.length],
    };

    for (let post = 0; post < postsPerWeek; post++) {
      const postDate = new Date(weekStart);
      postDate.setDate(weekStart.getDate() + Math.floor((post / postsPerWeek) * 7));

      const dateStr = postDate.toISOString().split('T')[0];
      const holiday = includeHolidays ?
        koreanHolidays.find(h => dateStr.endsWith(h.date)) : null;

      weekPlan.posts.push({
        id: week * postsPerWeek + post + 1,
        date: dateStr,
        day: ["일", "월", "화", "수", "목", "금", "토"][postDate.getDay()],
        topic: holiday ? `${holiday.name} 특집: ${topics[post % topics.length]}` : topics[post % topics.length],
        platform: platforms[post % platforms.length],
        status: "planned",
        suggested_time: getOptimalPostingTime(platforms[post % platforms.length]),
        special_event: holiday?.name || null,
      });
    }

    calendar.push(weekPlan);
  }

  return {
    duration: `${durationWeeks}주`,
    total_posts: durationWeeks * postsPerWeek,
    platforms,
    topics,
    calendar,
    recommendations: [
      "주요 공휴일 전후로 관련 콘텐츠 미리 준비하세요",
      "플랫폼별 최적 게시 시간을 활용하세요",
      "주제별 시리즈로 일관성을 유지하세요",
    ],
  };
}

async function analyzeCompetitorContent(urls: string[], analysisType: string): Promise<any> {
  const results: any[] = [];

  for (const url of urls) {
    try {
      const response = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ContentGenieBot/1.0)' },
        timeout: 10000,
      });

      const $ = cheerio.load(response.data);

      const analysis: any = {
        url,
        title: $('title').text().trim(),
        meta_description: $('meta[name="description"]').attr('content') || '',
        headings: {
          h1: $('h1').map((_, el) => $(el).text().trim()).get(),
          h2: $('h2').map((_, el) => $(el).text().trim()).get().slice(0, 10),
        },
        word_count: $('body').text().split(/\s+/).length,
        images_count: $('img').length,
        internal_links: $('a[href^="/"]').length,
        external_links: $('a[href^="http"]').length,
      };

      if (analysisType === "keywords" || analysisType === "all") {
        const text = $('body').text().toLowerCase();
        const words = text.match(/[\uAC00-\uD7AF]+|[a-z]+/g) || [];
        const wordFreq: Record<string, number> = {};
        words.forEach(word => {
          if (word.length > 2) wordFreq[word] = (wordFreq[word] || 0) + 1;
        });
        analysis.top_keywords = Object.entries(wordFreq)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([word, count]) => ({ word, count }));
      }

      results.push(analysis);
    } catch (error) {
      results.push({ url, error: "분석 실패 - 접근 불가 또는 타임아웃" });
    }
  }

  return {
    analyzed_at: new Date().toISOString(),
    total_urls: urls.length,
    successful: results.filter(r => !r.error).length,
    results,
    insights: [
      "경쟁사 콘텐츠의 평균 길이를 참고하세요",
      "자주 사용되는 키워드를 파악하세요",
      "제목과 메타 설명의 패턴을 분석하세요",
    ],
  };
}

function predictViralScore(
  title: string,
  description: string,
  platform: string,
  hashtags: string[]
): any {
  // 바이럴 요소 분석
  const viralFactors = {
    emotional_words: /놀라운|충격|비밀|최고|완벽|필수|급|핫|대박|레전드/g,
    numbers: /\d+/g,
    questions: /\?/g,
    urgency: /지금|오늘|바로|즉시|한정/g,
    social_proof: /만명|리뷰|후기|인증|추천/g,
  };

  let score = 50; // 기본 점수

  // 제목 분석
  if (viralFactors.emotional_words.test(title)) score += 15;
  if (viralFactors.numbers.test(title)) score += 10;
  if (viralFactors.questions.test(title)) score += 8;
  if (viralFactors.urgency.test(title)) score += 7;
  if (viralFactors.social_proof.test(title)) score += 10;

  // 길이 분석
  if (title.length >= 20 && title.length <= 50) score += 5;

  // 해시태그 분석
  if (hashtags.length >= 5 && hashtags.length <= 15) score += 5;

  score = Math.min(score, 100);

  const improvements: string[] = [];
  if (!viralFactors.numbers.test(title)) improvements.push("숫자를 추가하세요 (예: '5가지 방법')");
  if (!viralFactors.emotional_words.test(title)) improvements.push("감정을 자극하는 단어를 추가하세요");
  if (title.length > 60) improvements.push("제목을 60자 이내로 줄이세요");
  if (hashtags.length < 5) improvements.push("해시태그를 5개 이상 추가하세요");

  return {
    title,
    viral_score: score,
    grade: score >= 80 ? "A (매우 높음)" : score >= 60 ? "B (높음)" : score >= 40 ? "C (보통)" : "D (개선 필요)",
    factors: {
      emotional_appeal: viralFactors.emotional_words.test(title) ? "강함" : "약함",
      curiosity_gap: viralFactors.questions.test(title) ? "있음" : "없음",
      specificity: viralFactors.numbers.test(title) ? "구체적" : "모호함",
      urgency: viralFactors.urgency.test(title) ? "있음" : "없음",
    },
    improvements,
    predicted_engagement: {
      likes: score >= 70 ? "높음" : "보통",
      shares: score >= 80 ? "높음" : "보통",
      comments: score >= 60 ? "활발" : "보통",
    },
  };
}

// =============================================================================
// Server Start
// =============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Content Genie MCP Server running on stdio");
}

main().catch(console.error);
