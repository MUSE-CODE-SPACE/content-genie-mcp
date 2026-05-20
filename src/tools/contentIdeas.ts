/**
 * Content ideation tools:
 *   - generate_content_ideas
 *   - generate_script_outline
 *   - repurpose_content
 */

import { z } from 'zod';
import type { ToolDefinition } from '../core/registry.js';
import { ContentTypeSchema, ToneSchema } from '../types.js';
import { getNaverTrends } from '../scrapers/naver.js';
import { getUpcomingEvents } from '../data/koreanEvents.js';

// ---------------------------------------------------------------------------
// Shared content helpers
// ---------------------------------------------------------------------------

function getAdvancedContentTemplates(topic: string): Array<Record<string, unknown>> {
  const templates = [
    { format: '리스트', pattern: 'X가지 {topic} 꿀팁', engagement: '매우 높음', seo_score: 90 },
    { format: '리스트', pattern: '{topic} BEST 10', engagement: '높음', seo_score: 85 },
    { format: '리스트', pattern: '2025년 {topic} 트렌드 7가지', engagement: '높음', seo_score: 88 },
    { format: '하우투', pattern: '{topic} 완벽 가이드', engagement: '높음', seo_score: 92 },
    { format: '하우투', pattern: '초보자를 위한 {topic} 시작하기', engagement: '높음', seo_score: 90 },
    { format: '하우투', pattern: '{topic} 쉽게 따라하기', engagement: '중간', seo_score: 85 },
    { format: '비교', pattern: '{topic} A vs B 완벽 비교', engagement: '높음', seo_score: 88 },
    { format: '비교', pattern: '{topic} 장단점 총정리', engagement: '높음', seo_score: 86 },
    { format: '리뷰', pattern: '{topic} 솔직 후기', engagement: '매우 높음', seo_score: 82 },
    { format: '리뷰', pattern: '{topic} 3개월 사용 후기', engagement: '높음', seo_score: 80 },
    { format: '질문', pattern: '{topic}, 진짜 효과 있을까?', engagement: '매우 높음', seo_score: 78 },
    { format: '질문', pattern: '왜 {topic}이 중요한가?', engagement: '중간', seo_score: 75 },
    { format: '스토리', pattern: '내가 {topic}을 시작한 이유', engagement: '높음', seo_score: 70 },
    { format: '스토리', pattern: '{topic}로 인생이 바뀐 이야기', engagement: '매우 높음', seo_score: 72 },
    { format: '트렌드', pattern: '요즘 뜨는 {topic}', engagement: '높음', seo_score: 85 },
    { format: '트렌드', pattern: '{topic} 최신 트렌드 분석', engagement: '중간', seo_score: 83 },
  ];

  return templates.map((t) => ({ ...t, title: t.pattern.replace('{topic}', topic) }));
}

function getEstimatedCreationTime(format: string): string {
  const times: Record<string, string> = {
    리스트: '2-3시간',
    하우투: '3-4시간',
    비교: '4-5시간',
    리뷰: '2-3시간',
    질문: '1-2시간',
    스토리: '2-3시간',
    트렌드: '2-3시간',
  };
  return times[format] || '2-3시간';
}

function getRecommendedLength(format: string): string {
  const lengths: Record<string, string> = {
    리스트: '2000-3000자',
    하우투: '3000-5000자',
    비교: '2500-4000자',
    리뷰: '1500-2500자',
    질문: '1000-2000자',
    스토리: '2000-3000자',
    트렌드: '1500-2500자',
  };
  return lengths[format] || '2000-3000자';
}

function generateKeyPoints(topic: string): string[] {
  return [
    `${topic}의 핵심 개념 설명`,
    '실제 사례 또는 예시 제공',
    '독자가 바로 적용할 수 있는 팁',
    '흔한 실수와 해결 방법',
    '추가 리소스 또는 참고자료',
  ];
}

function generateCTASuggestions(): string[] {
  return [
    '댓글로 여러분의 경험을 공유해주세요!',
    '도움이 되셨다면 저장해두세요',
    '더 많은 정보는 프로필 링크에서!',
    '궁금한 점은 DM 주세요!',
  ];
}

function getPlatformSpecificTips(platform: string): Record<string, unknown> {
  const tips: Record<string, Record<string, unknown>> = {
    blog: {
      optimal_length: '2000-4000자',
      seo_tips: ['H2 태그 3-5개 사용', '키워드 밀도 2-3%', '내부링크 추가'],
      best_time: '오전 9-11시',
    },
    youtube: {
      optimal_length: '8-15분',
      tips: ['처음 30초가 핵심', '챕터 추가', '엔드스크린 활용'],
      best_time: '토요일 오후 2-4시',
    },
    instagram: {
      optimal_length: '캡션 150-200자',
      tips: ['첫 줄이 핵심', '캐러셀 활용', '릴스 우선'],
      best_time: '점심 12-1시, 저녁 7-9시',
      hashtag_count: '20-25개',
    },
    tiktok: {
      optimal_length: '15-60초',
      tips: ['처음 1초가 승부', '트렌딩 사운드 활용', '빠른 전개'],
      best_time: '저녁 7-10시',
      hashtag_count: '3-5개',
    },
    threads: {
      optimal_length: '200-300자',
      tips: ['대화체 사용', '시리즈로 연결', '인스타 연동'],
      best_time: '오전 8-9시, 저녁 6-8시',
    },
    newsletter: {
      optimal_length: '800-1200자',
      tips: ['제목에 숫자 사용', '개인화된 인사', '명확한 CTA'],
      best_time: '화요일/목요일 오전 9시',
    },
  };
  return tips[platform] || tips;
}

function getRecommendedSchedule(platform: string): Record<string, unknown> {
  return {
    frequency:
      platform === 'tiktok'
        ? '매일 1-2회'
        : platform === 'instagram'
          ? '매일 1회 + 스토리'
          : '주 3-4회',
    best_days: ['화요일', '수요일', '목요일'],
    consistency_tip: '같은 시간대에 발행하면 알고리즘에 유리합니다',
  };
}

function generateSeasonalIdeas(topic: string): Array<Record<string, unknown>> {
  const upcoming = getUpcomingEvents(30);
  return upcoming.slice(0, 5).map((event, i) => ({
    id: i + 1,
    event: event.name,
    date: event.date_full,
    days_until: event.days_until,
    content_ideas: event.contentIdeas?.map((idea) => `${topic} x ${idea}`) || [],
    urgency: event.days_until <= 7 ? '긴급' : event.days_until <= 14 ? '높음' : '보통',
  }));
}

async function generateTrendBasedIdeas(topic: string): Promise<Array<Record<string, unknown>>> {
  const result = await getNaverTrends();
  return result.data.slice(0, 5).map((trend, i) => ({
    id: i + 1,
    trend_keyword: trend.keyword,
    combined_idea: `${topic} x ${trend.keyword}`,
    title_suggestion: `${trend.keyword} 시대의 ${topic}`,
    relevance_score: Math.floor(Math.random() * 30) + 70,
  }));
}

// ---------------------------------------------------------------------------
// Tool: generate_content_ideas
// ---------------------------------------------------------------------------

const ideasSchema = {
  topic: z.string().describe('콘텐츠 주제 또는 키워드'),
  content_type: ContentTypeSchema.optional().describe('콘텐츠 유형'),
  tone: ToneSchema.optional().describe('톤앤매너'),
  target_audience: z.string().optional().describe('타겟 오디언스'),
  count: z.number().min(1).max(30).optional().describe('생성할 아이디어 수. 기본값: 15'),
  include_trends: z.boolean().optional().describe('트렌드 기반 아이디어 포함. 기본값: true'),
};

const generateContentIdeasTool: ToolDefinition<typeof ideasSchema> = {
  name: 'generate_content_ideas',
  description:
    '주제와 플랫폼에 맞는 콘텐츠 아이디어를 생성합니다. 트렌드와 시즌을 반영한 추천을 제공합니다.',
  schema: ideasSchema,
  handler: async (rawArgs) => {
    const args = rawArgs as {
      topic: string;
      content_type?: string;
      tone?: string;
      target_audience?: string;
      count?: number;
      include_trends?: boolean;
    };
    const topic = args.topic;
    const count = args.count ?? 15;
    const includeTrends = args.include_trends ?? true;

    const templates = getAdvancedContentTemplates(topic);
    const ideas = templates.slice(0, count).map((template, i) => ({
      id: i + 1,
      title: template.title,
      format: template.format,
      predicted_engagement: template.engagement,
      seo_score: template.seo_score,
      target_audience: args.target_audience || '일반',
      estimated_time_to_create: getEstimatedCreationTime(template.format as string),
      recommended_length: getRecommendedLength(template.format as string),
      key_points_to_cover: generateKeyPoints(topic),
      cta_suggestions: generateCTASuggestions(),
    }));

    const seasonalIdeas = generateSeasonalIdeas(topic);
    let trendBasedIdeas: Array<Record<string, unknown>> = [];
    if (includeTrends) trendBasedIdeas = await generateTrendBasedIdeas(topic);

    const result = {
      topic,
      content_type: args.content_type || 'all',
      tone: args.tone || 'professional',
      target_audience: args.target_audience || '일반',
      generated_at: new Date().toISOString(),
      main_ideas: ideas,
      seasonal_ideas: seasonalIdeas,
      trend_based_ideas: trendBasedIdeas,
      platform_specific_tips: getPlatformSpecificTips(args.content_type || 'all'),
      recommended_posting_schedule: getRecommendedSchedule(args.content_type || 'all'),
    };

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
};

// ---------------------------------------------------------------------------
// Tool: generate_script_outline
// ---------------------------------------------------------------------------

function calculateSectionTime(section: string, format: string): string {
  const times: Record<string, Record<string, string>> = {
    youtube_long: {
      인트로: '30초-1분',
      훅: '30초',
      본문1: '3-4분',
      본문2: '3-4분',
      본문3: '2-3분',
      정리: '1분',
      CTA: '30초',
      아웃트로: '30초',
    },
    youtube_short: { 훅: '3초', '핵심 포인트': '20-40초', CTA: '5초' },
    reels: { 훅: '1초', '메인 콘텐츠': '20초', '반전/CTA': '5초' },
    tiktok: { 훅: '1초', 스토리: '15-30초', 포인트: '10초', CTA: '3초' },
  };
  return times[format]?.[section] || '적절히 조절';
}

function generateScriptOutline(
  topic: string,
  format: string,
  duration: string | undefined,
  style: string,
  includeHooks: boolean,
): Record<string, unknown> {
  const formatSettings: Record<string, Record<string, unknown>> = {
    youtube_long: {
      recommended_duration: '8-15분',
      sections: ['인트로', '훅', '본문1', '본문2', '본문3', '정리', 'CTA', '아웃트로'],
      hook_time: '0-30초',
    },
    youtube_short: {
      recommended_duration: '30-60초',
      sections: ['훅', '핵심 포인트', 'CTA'],
      hook_time: '0-3초',
    },
    podcast: {
      recommended_duration: '20-45분',
      sections: ['인트로', '주제 소개', '본론1', '본론2', '질문/토론', '정리', '아웃트로'],
      hook_time: '0-60초',
    },
    reels: {
      recommended_duration: '15-30초',
      sections: ['훅', '메인 콘텐츠', '반전/CTA'],
      hook_time: '0-1초',
    },
    tiktok: {
      recommended_duration: '15-60초',
      sections: ['훅', '스토리', '포인트', 'CTA'],
      hook_time: '0-1초',
    },
    live: {
      recommended_duration: '30-60분',
      sections: ['인사', '오늘의 주제', '메인 콘텐츠', 'Q&A', '마무리'],
      hook_time: '0-5분',
    },
  };

  const settings = formatSettings[format] || formatSettings.youtube_long;

  const hooks = [
    `"${topic}에 대해 이런 건 몰랐을 거예요"`,
    `"오늘 알려드릴 ${topic} 팁, 진짜 중요합니다"`,
    `"${topic} 관련해서 가장 많이 받는 질문이에요"`,
    `"이거 알고 나면 ${topic}이 완전 달라집니다"`,
    `"3년간 ${topic} 하면서 깨달은 것들"`,
  ];

  const styleGuides: Record<string, Record<string, unknown>> = {
    educational: {
      tone: '전문적이지만 친근하게',
      structure: '문제 → 해결책 → 실습',
      tips: ['전문 용어는 쉽게 풀어서 설명', '실제 예시 풍부하게', '요약 정리 포함'],
    },
    entertainment: {
      tone: '활기차고 재미있게',
      structure: '훅 → 스토리 → 반전',
      tips: ['유머 포인트 삽입', '빠른 템포', '시청자 참여 유도'],
    },
    storytelling: {
      tone: '감성적이고 몰입감 있게',
      structure: '도입 → 갈등 → 해결',
      tips: ['개인적 경험 공유', '감정선 구축', '교훈으로 마무리'],
    },
    review: {
      tone: '객관적이고 솔직하게',
      structure: '소개 → 장점 → 단점 → 총평',
      tips: ['구체적 스펙/기능 언급', '비교 대상 제시', '별점/추천도'],
    },
    tutorial: {
      tone: '차분하고 명확하게',
      structure: '개요 → 단계별 설명 → 마무리',
      tips: ['화면 보며 따라할 수 있게', '실수 포인트 미리 안내', '팁 추가'],
    },
  };

  const outline: Record<string, unknown> = {
    topic,
    format,
    recommended_duration: duration || settings.recommended_duration,
    style,
    style_guide: styleGuides[style] || styleGuides.educational,
    hook_examples: includeHooks ? hooks : [],
    sections: [],
  };

  const sectionsArr = settings.sections as string[];
  sectionsArr.forEach((section, index) => {
    const sectionDetail: Record<string, unknown> = {
      order: index + 1,
      name: section,
      estimated_time: calculateSectionTime(section, format),
      key_points: [],
      script_template: '',
    };
    if (section === '인트로') {
      sectionDetail.key_points = ['채널 소개', '오늘의 주제 예고', '시청 이유 제시'];
      sectionDetail.script_template = `안녕하세요, [채널명]입니다. 오늘은 ${topic}에 대해 이야기해볼게요.`;
    } else if (section === '훅') {
      sectionDetail.key_points = ['호기심 자극', '문제 제기', '결과 미리보기'];
      sectionDetail.script_template = hooks[0];
    } else if (section.includes('본문') || section.includes('본론')) {
      sectionDetail.key_points = [`${topic}의 핵심 포인트`, '구체적 예시', '실용적 팁'];
      sectionDetail.script_template = `[핵심 내용]에 대해 자세히 설명드릴게요...`;
    } else if (section === 'CTA') {
      sectionDetail.key_points = ['구독/좋아요 요청', '다음 영상 예고', '댓글 유도'];
      sectionDetail.script_template = '이 영상이 도움이 되셨다면 구독과 좋아요 부탁드려요!';
    } else if (section === '아웃트로') {
      sectionDetail.key_points = ['핵심 요약', '감사 인사', '다음 콘텐츠 예고'];
      sectionDetail.script_template = `오늘 ${topic}에 대해 알아봤는데요, 도움이 되셨길 바랍니다.`;
    }
    (outline.sections as unknown[]).push(sectionDetail);
  });

  outline.production_tips = {
    filming: ['조명은 자연광 또는 3점 조명', '음질이 화질보다 중요', '배경 정리'],
    editing: ['점프컷으로 템포 유지', '자막 필수', 'BGM 볼륨은 음성의 10-20%'],
    thumbnail: ['제목과 연계된 이미지', '얼굴 표정 강조', '텍스트 3-5단어'],
  };

  return outline;
}

const scriptSchema = {
  topic: z.string().describe('콘텐츠 주제'),
  format: z
    .enum(['youtube_long', 'youtube_short', 'podcast', 'reels', 'tiktok', 'live'])
    .describe('콘텐츠 형식'),
  duration: z.string().optional().describe('예상 길이'),
  style: z
    .enum([
      'educational',
      'entertainment',
      'storytelling',
      'review',
      'tutorial',
      'interview',
      'vlog',
    ])
    .optional()
    .describe('스타일'),
  include_hooks: z.boolean().optional().describe('오프닝 훅 포함. 기본값: true'),
};

const scriptTool: ToolDefinition<typeof scriptSchema> = {
  name: 'generate_script_outline',
  description: '유튜브, 팟캐스트, 릴스용 스크립트 아웃라인을 자동 생성합니다.',
  schema: scriptSchema,
  handler: async (rawArgs) => {
    const args = rawArgs as {
      topic: string;
      format: string;
      duration?: string;
      style?: string;
      include_hooks?: boolean;
    };
    const result = generateScriptOutline(
      args.topic,
      args.format,
      args.duration,
      args.style || 'educational',
      args.include_hooks ?? true,
    );
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
};

// ---------------------------------------------------------------------------
// Tool: repurpose_content
// ---------------------------------------------------------------------------

function adaptTitleForPlatform(original: string, platform: string): string {
  const adaptations: Record<string, string> = {
    youtube_shorts: `${original} #shorts`,
    instagram_post: original.length > 50 ? original.substring(0, 47) + '...' : original,
    instagram_reels: `${original}`,
    tiktok: `${original} 알려줌`,
    twitter: original.length > 100 ? original.substring(0, 97) + '...' : original,
    threads: original,
    linkedin: `[인사이트] ${original}`,
    blog: `${original} - 완벽 가이드`,
    newsletter: `[Newsletter] ${original}`,
  };
  return adaptations[platform] || original;
}

function getContentAdjustments(source: string, target: string): string[] {
  const adjustments: string[] = [];
  if (source === 'youtube' && target.includes('short')) {
    adjustments.push('긴 영상에서 핵심 15-60초 추출');
  }
  if (target === 'blog') {
    adjustments.push('영상 스크립트를 글로 확장');
    adjustments.push('스크린샷 추가');
  }
  if (target.includes('instagram')) {
    adjustments.push('비주얼 중심으로 재구성');
    adjustments.push('해시태그 20-25개 추가');
  }
  return adjustments.length > 0 ? adjustments : ['플랫폼 특성에 맞게 조정'];
}

function getEffortEstimate(source: string, target: string): string {
  if (source === target) return '0분';
  if (target.includes('short') || target.includes('reels')) return '15-30분';
  if (target === 'blog') return '1-2시간';
  if (target === 'newsletter') return '30분-1시간';
  return '20-40분';
}

function getPriorityScore(platform: string): number {
  const scores: Record<string, number> = {
    instagram_reels: 95,
    tiktok: 90,
    youtube_shorts: 88,
    instagram_post: 80,
    twitter: 70,
    threads: 65,
    linkedin: 60,
    blog: 75,
    newsletter: 70,
  };
  return scores[platform] || 50;
}

const repurposeSchema = {
  original_content: z.string().describe('원본 콘텐츠'),
  source_platform: z
    .enum(['youtube', 'blog', 'podcast', 'instagram', 'newsletter'])
    .describe('원본 플랫폼'),
  target_platforms: z
    .array(
      z.enum([
        'youtube',
        'youtube_shorts',
        'instagram_post',
        'instagram_reels',
        'tiktok',
        'blog',
        'newsletter',
        'twitter',
        'threads',
        'linkedin',
      ]),
    )
    .describe('변환할 플랫폼 목록'),
};

const repurposeTool: ToolDefinition<typeof repurposeSchema> = {
  name: 'repurpose_content',
  description: '하나의 콘텐츠를 여러 플랫폼용으로 변환하는 전략을 제안합니다.',
  schema: repurposeSchema,
  handler: async (rawArgs) => {
    const args = rawArgs as {
      original_content: string;
      source_platform: string;
      target_platforms: string[];
    };
    const strategies: Record<string, Record<string, unknown>> = {
      youtube_shorts: {
        approach: '핵심 하이라이트 추출',
        format: '세로 9:16',
        duration: '60초 이내',
        tips: ['가장 임팩트 있는 장면 선택', '자막 필수', '훅으로 시작'],
      },
      instagram_post: {
        approach: '핵심 포인트 카드뉴스화',
        format: '1:1 또는 4:5 캐러셀',
        tips: ['10장 이내 슬라이드', '각 슬라이드 하나의 포인트', '마지막에 CTA'],
      },
      instagram_reels: {
        approach: '15-30초 하이라이트',
        format: '세로 9:16',
        tips: ['트렌딩 오디오 활용', '빠른 컷 편집', '캡션에 풀버전 링크'],
      },
      tiktok: {
        approach: '바이럴 포인트 추출',
        format: '세로 9:16, 15-60초',
        tips: ['트렌딩 사운드 필수', '첫 1초 승부', '댓글 유도형 마무리'],
      },
      blog: {
        approach: '상세 텍스트 버전 작성',
        format: '2000-3000자 글',
        tips: ['SEO 키워드 포함', 'H2/H3 구조화', '이미지 5-10개'],
      },
      newsletter: {
        approach: '핵심 인사이트 요약',
        format: '800-1200자',
        tips: ['개인적인 톤', 'actionable 팁', '다음 호 예고'],
      },
      twitter: {
        approach: '핵심 문장 + 스레드',
        format: '280자 × 여러 개',
        tips: ['첫 트윗이 핵심', '숫자/통계 활용', '마지막에 원본 링크'],
      },
      threads: {
        approach: '대화형 스레드',
        format: '500자 이내 × 여러 개',
        tips: ['스토리텔링 형식', '이미지 함께', '인스타 연동'],
      },
      linkedin: {
        approach: '전문적 인사이트 버전',
        format: '1000-1500자',
        tips: ['전문성 강조', '데이터/결과 중심', '업계 해시태그'],
      },
    };

    const results = args.target_platforms.map((target) => ({
      platform: target,
      strategy: strategies[target] || { approach: '플랫폼에 맞게 변환', tips: [] },
      adapted_title: adaptTitleForPlatform(args.original_content, target),
      content_adjustments: getContentAdjustments(args.source_platform, target),
      estimated_effort: getEffortEstimate(args.source_platform, target),
      priority: getPriorityScore(target),
    }));

    const result = {
      original_content: args.original_content,
      source_platform: args.source_platform,
      repurposing_plan: results.sort((a, b) => b.priority - a.priority),
      workflow_tip: '고품질 원본 하나로 5-7개 플랫폼 커버 가능',
      time_saving: '평균 60-70% 시간 절약',
      recommended_order: results.map((r) => r.platform),
    };

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
};

export const contentIdeasTools: ToolDefinition[] = [
  generateContentIdeasTool as ToolDefinition,
  scriptTool as ToolDefinition,
  repurposeTool as ToolDefinition,
];
