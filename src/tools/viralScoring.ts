/**
 * Viral scoring + content performance tools:
 *   - predict_viral_score
 *   - generate_ab_test_variants
 *   - predict_content_performance
 *   - analyze_thumbnail
 *
 * Grouped together because they all consume a piece of content (title +
 * description / thumbnail concept) and produce a heuristic score + grade.
 */

import { z } from 'zod';
import type { ToolDefinition } from '../core/registry.js';
import { ContentTypeSchema } from '../types.js';

// ---------------------------------------------------------------------------
// predict_viral_score
// ---------------------------------------------------------------------------

function predictViralScore(
  title: string,
  description: string,
  platform: string,
  hashtags: string[],
  contentType: string,
): Record<string, unknown> {
  const emotional = {
    positive: /최고|완벽|대박|필수|추천|굿|좋은|행복|성공|감동/g,
    negative: /충격|경악|실화|심각|위험|주의|경고/g,
    curiosity: /비밀|숨겨진|몰랐던|알려지지|진실|실체/g,
  };
  const structural = {
    numbers: /\d+/g,
    questions: /\?/g,
    brackets: /\[|\]/g,
    emphasis: /!/g,
  };
  const urgency = /지금|당장|오늘|한정|마감|급|바로|즉시|놓치면/g;
  const socialProof = /만명|팔로워|구독자|조회수|리뷰|후기|인증|추천|화제/g;
  const utility = /방법|팁|가이드|정리|비법|노하우|꿀팁|해결/g;

  let score = 50;
  const text = title + description;
  const analysis: Record<string, unknown> = {};

  const positiveMatches = text.match(emotional.positive);
  const negativeMatches = text.match(emotional.negative);
  const curiosityMatches = text.match(emotional.curiosity);
  if (positiveMatches) score += Math.min(positiveMatches.length * 5, 15);
  if (negativeMatches) score += Math.min(negativeMatches.length * 4, 12);
  if (curiosityMatches) score += Math.min(curiosityMatches.length * 6, 18);
  analysis.emotional_triggers = {
    positive: positiveMatches?.length || 0,
    negative: negativeMatches?.length || 0,
    curiosity: curiosityMatches?.length || 0,
  };

  const hasNumbers = structural.numbers.test(title);
  const hasQuestion = structural.questions.test(title);
  const hasBrackets = structural.brackets.test(title);
  const hasEmphasis = structural.emphasis.test(title);
  if (hasNumbers) score += 10;
  if (hasQuestion) score += 8;
  if (hasBrackets) score += 5;
  if (hasEmphasis) score += 3;
  analysis.structural_elements = { hasNumbers, hasQuestion, hasBrackets, hasEmphasis };

  if (urgency.test(text)) score += 8;
  if (socialProof.test(text)) score += 10;
  if (utility.test(text)) score += 7;

  if (title.length >= 20 && title.length <= 45) score += 5;
  else if (title.length > 60) score -= 5;
  if (hashtags.length >= 5 && hashtags.length <= 15) score += 5;
  else if (hashtags.length > 25) score -= 3;

  const typeBonus: Record<string, number> = {
    video: 10,
    reel: 15,
    carousel: 8,
    image: 5,
    text: 0,
  };
  score += typeBonus[contentType] || 0;

  const platformMultiplier: Record<string, number> = {
    tiktok: 1.2,
    instagram: 1.1,
    youtube: 1.0,
    twitter: 0.9,
    blog: 0.8,
  };
  score = Math.round(score * (platformMultiplier[platform] || 1));
  score = Math.min(Math.max(score, 0), 100);

  const grade =
    score >= 85
      ? 'S (바이럴 예상)'
      : score >= 70
        ? 'A (높은 잠재력)'
        : score >= 55
          ? 'B (양호)'
          : score >= 40
            ? 'C (개선 필요)'
            : 'D (재검토 필요)';

  const improvements: string[] = [];
  if (!hasNumbers) improvements.push('숫자를 추가하세요 (예: "5가지 방법")');
  if (!curiosityMatches) improvements.push('호기심을 자극하는 표현을 추가하세요');
  if (!hasQuestion && !hasEmphasis) improvements.push('질문형이나 감탄형을 시도해보세요');
  if (title.length > 50) improvements.push('제목을 50자 이내로 줄이세요');
  if (hashtags.length < 5) improvements.push('관련 해시태그를 5개 이상 추가하세요');
  if (contentType === 'text') improvements.push('이미지나 영상을 추가하면 참여율이 높아집니다');

  return {
    title,
    content_type: contentType,
    platform,
    viral_score: score,
    grade,
    analysis: {
      ...analysis,
      title_length: title.length,
      hashtag_count: hashtags.length,
      urgency_detected: urgency.test(text),
      social_proof_detected: socialProof.test(text),
      utility_detected: utility.test(text),
    },
    improvements,
    predicted_performance: {
      reach: score >= 70 ? '높음' : score >= 50 ? '보통' : '낮음',
      engagement: score >= 75 ? '높음' : score >= 55 ? '보통' : '낮음',
      shares: score >= 80 ? '높음' : score >= 60 ? '보통' : '낮음',
      saves: score >= 65 ? '높음' : score >= 45 ? '보통' : '낮음',
    },
    optimized_title_suggestions: [
      hasNumbers ? null : `${title.slice(0, 20)}... 5가지 방법`,
      hasQuestion ? null : `${title}?`,
      `[필독] ${title}`,
    ]
      .filter(Boolean)
      .slice(0, 3),
  };
}

const viralSchema = {
  title: z.string().describe('콘텐츠 제목'),
  description: z.string().optional().describe('콘텐츠 설명'),
  platform: ContentTypeSchema.optional().describe('타겟 플랫폼'),
  hashtags: z.array(z.string()).optional().describe('사용할 해시태그'),
  content_type: z
    .enum(['image', 'video', 'text', 'carousel', 'reel'])
    .optional()
    .describe('콘텐츠 형식'),
};

const predictViralTool: ToolDefinition<typeof viralSchema> = {
  name: 'predict_viral_score',
  description:
    'AI 기반 바이럴 가능성 예측. 감정 분석, 트렌드 매칭, 플랫폼 최적화 점수를 제공합니다.',
  schema: viralSchema,
  handler: async (rawArgs) => {
    const args = rawArgs as {
      title: string;
      description?: string;
      platform?: string;
      hashtags?: string[];
      content_type?: string;
    };
    const result = predictViralScore(
      args.title,
      args.description || '',
      args.platform || 'all',
      args.hashtags || [],
      args.content_type || 'text',
    );
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
};

// ---------------------------------------------------------------------------
// generate_ab_test_variants
// ---------------------------------------------------------------------------

function generateABTestVariants(
  originalContent: string,
  element: string,
  count: number,
): Record<string, unknown> {
  const variants: Array<Record<string, unknown>> = [];

  if (element === 'title') {
    const patterns = [
      { pattern: `[완벽정리] ${originalContent}`, style: 'bracket' },
      { pattern: `${originalContent} (이것만 보세요)`, style: 'parenthesis' },
      { pattern: `${originalContent}? 전문가가 답합니다`, style: 'question' },
      { pattern: `99%가 모르는 ${originalContent}`, style: 'curiosity' },
      { pattern: `${originalContent} 하는 5가지 방법`, style: 'listicle' },
      { pattern: `오늘부터 시작하는 ${originalContent}`, style: 'action' },
      { pattern: `${originalContent}: 초보자 필독`, style: 'target' },
      { pattern: `${originalContent}의 모든 것`, style: 'comprehensive' },
      { pattern: `당신이 몰랐던 ${originalContent}`, style: 'reveal' },
      { pattern: `${originalContent} 실패하지 않는 법`, style: 'negative' },
    ];
    for (let i = 0; i < Math.min(count, patterns.length); i++) {
      variants.push({
        variant_id: String.fromCharCode(65 + i),
        content: patterns[i].pattern,
        style: patterns[i].style,
        predicted_ctr: Math.floor(Math.random() * 30) + 70,
      });
    }
  } else if (element === 'cta') {
    const ctas = [
      '지금 바로 확인하기',
      '더 알아보기',
      '무료로 시작하기',
      '자세히 보기',
      '놓치지 마세요',
      '지금 신청하기',
      '한정 기회',
      '바로 체험하기',
    ];
    for (let i = 0; i < Math.min(count, ctas.length); i++) {
      variants.push({
        variant_id: String.fromCharCode(65 + i),
        content: ctas[i],
        style: i < 3 ? 'action' : 'urgency',
        predicted_click_rate: Math.floor(Math.random() * 20) + 60,
      });
    }
  } else if (element === 'description') {
    const styles = ['concise', 'detailed', 'emotional', 'factual', 'story'];
    for (let i = 0; i < Math.min(count, 5); i++) {
      variants.push({
        variant_id: String.fromCharCode(65 + i),
        style: styles[i],
        content: `[${styles[i]} 스타일] ${originalContent}`,
        predicted_engagement: Math.floor(Math.random() * 25) + 65,
      });
    }
  }

  return {
    original: originalContent,
    element_tested: element,
    variants,
    testing_recommendation: {
      sample_size: '최소 1,000명 노출 후 판단',
      duration: '최소 7일',
      metrics_to_track:
        element === 'title'
          ? ['CTR', '조회수']
          : element === 'cta'
            ? ['클릭율', '전환율']
            : ['체류시간', '이탈율'],
    },
    statistical_note: '95% 신뢰구간 확보를 위해 충분한 데이터 수집 필요',
  };
}

const abSchema = {
  original_content: z.string().describe('원본 콘텐츠 (제목, 설명 등)'),
  content_element: z
    .enum(['title', 'description', 'cta', 'hashtags', 'thumbnail_concept'])
    .describe('테스트할 요소'),
  variants_count: z.number().min(2).max(10).optional().describe('변형 수. 기본값: 5'),
};

const abTool: ToolDefinition<typeof abSchema> = {
  name: 'generate_ab_test_variants',
  description: '콘텐츠의 A/B 테스트 변형을 자동으로 생성합니다.',
  schema: abSchema,
  handler: async (rawArgs) => {
    const args = rawArgs as {
      original_content: string;
      content_element: string;
      variants_count?: number;
    };
    const result = generateABTestVariants(
      args.original_content,
      args.content_element,
      args.variants_count ?? 5,
    );
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
};

// ---------------------------------------------------------------------------
// predict_content_performance
// ---------------------------------------------------------------------------

function predictContentPerformance(
  title: string,
  description: string,
  platform: string,
  category: string,
  postingTime: string | undefined,
  hasTrending: boolean,
): Record<string, unknown> {
  let baseScore = 50;
  const factors: Record<string, unknown> = {};

  const titleFactors = {
    has_numbers: /\d/.test(title),
    has_question: /\?/.test(title),
    has_emotional: /놀라운|충격|비밀|최고|완벽|필수|대박|꿀팁|진짜/.test(title),
    optimal_length: title.length >= 20 && title.length <= 60,
    has_brackets: /[\[\]【】]/.test(title),
  };
  factors.title = titleFactors;
  if (titleFactors.has_numbers) baseScore += 8;
  if (titleFactors.has_question) baseScore += 5;
  if (titleFactors.has_emotional) baseScore += 10;
  if (titleFactors.optimal_length) baseScore += 5;
  if (titleFactors.has_brackets) baseScore += 3;

  if (hasTrending) {
    baseScore += 15;
    factors.trending_boost = true;
  }

  const timeScores: Record<string, number> = {
    '평일 아침': 60,
    '평일 점심': 75,
    '평일 저녁': 90,
    '주말 오후': 85,
    '주말 저녁': 80,
  };
  if (postingTime) {
    const timeMatch = Object.keys(timeScores).find((t) =>
      postingTime.includes(t.split(' ')[1]),
    );
    if (timeMatch) {
      baseScore += (timeScores[timeMatch] - 50) / 5;
      factors.posting_time_score = timeScores[timeMatch];
    }
  }

  const platformMultiplier: Record<string, number> = {
    tiktok: 1.2,
    instagram: 1.1,
    youtube: 1.0,
    blog: 0.9,
    twitter: 0.95,
  };
  baseScore *= platformMultiplier[platform] || 1;

  const finalScore = Math.min(Math.round(baseScore), 100);

  const performanceRanges: Record<string, Record<string, Record<string, string>>> = {
    youtube: {
      high: { views: '10K-50K', engagement: '5-8%', shares: '100-500' },
      medium: { views: '1K-10K', engagement: '3-5%', shares: '20-100' },
      low: { views: '100-1K', engagement: '1-3%', shares: '5-20' },
    },
    instagram: {
      high: { reach: '5K-20K', engagement: '6-10%', saves: '50-200' },
      medium: { reach: '1K-5K', engagement: '3-6%', saves: '10-50' },
      low: { reach: '200-1K', engagement: '1-3%', saves: '2-10' },
    },
    tiktok: {
      high: { views: '50K-500K', engagement: '8-15%', shares: '500-2K' },
      medium: { views: '5K-50K', engagement: '5-8%', shares: '50-500' },
      low: { views: '500-5K', engagement: '2-5%', shares: '10-50' },
    },
  };

  const tier = finalScore >= 75 ? 'high' : finalScore >= 50 ? 'medium' : 'low';
  const platformPerf = performanceRanges[platform] || performanceRanges.youtube;

  // Unused descriptor reference (kept for compatibility)
  void description;

  return {
    title,
    platform,
    category,
    performance_score: finalScore,
    grade:
      finalScore >= 85
        ? 'A (높은 성과 예상)'
        : finalScore >= 70
          ? 'B (좋은 성과 예상)'
          : finalScore >= 50
            ? 'C (보통)'
            : 'D (개선 필요)',
    analysis_factors: factors,
    predicted_performance: platformPerf[tier],
    confidence_level: hasTrending ? '높음 (트렌딩 반영)' : '보통',
    optimization_suggestions: [
      !titleFactors.has_numbers ? '제목에 숫자 추가 (예: 5가지, TOP 10)' : null,
      !titleFactors.has_emotional ? '감정을 자극하는 단어 추가' : null,
      !titleFactors.optimal_length ? '제목 길이 20-60자 권장' : null,
      !hasTrending ? '트렌딩 키워드 연계 고려' : null,
    ].filter(Boolean),
    best_posting_windows: {
      weekday: '오전 7-9시, 점심 12-1시, 저녁 7-10시',
      weekend: '오후 2-4시, 저녁 7-9시',
    },
  };
}

const perfSchema = {
  title: z.string().describe('콘텐츠 제목'),
  description: z.string().optional().describe('콘텐츠 설명'),
  platform: ContentTypeSchema.describe('플랫폼'),
  category: z.string().optional().describe('카테고리'),
  posting_time: z.string().optional().describe('게시 예정 시간'),
  has_trending_topic: z.boolean().optional().describe('트렌딩 주제 포함 여부'),
};

const perfTool: ToolDefinition<typeof perfSchema> = {
  name: 'predict_content_performance',
  description: '콘텐츠의 예상 성과를 AI 기반으로 예측합니다. 조회수, 참여율, 공유 가능성을 분석합니다.',
  schema: perfSchema,
  handler: async (rawArgs) => {
    const args = rawArgs as {
      title: string;
      description?: string;
      platform: string;
      category?: string;
      posting_time?: string;
      has_trending_topic?: boolean;
    };
    const result = predictContentPerformance(
      args.title,
      args.description || '',
      args.platform,
      args.category || '일반',
      args.posting_time,
      args.has_trending_topic ?? false,
    );
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
};

// ---------------------------------------------------------------------------
// analyze_thumbnail
// ---------------------------------------------------------------------------

function analyzeThumbnailConcept(
  title: string,
  description: string,
  platform: string,
  category: string,
): Record<string, unknown> {
  const elements = {
    face_detected: /얼굴|표정|사람|인물/.test(description),
    text_overlay: /텍스트|글자|문구/.test(description),
    bright_colors: /밝은|화려한|눈에 띄는|빨간|노란/.test(description),
    food_closeup: /음식|클로즈업|맛있/.test(description),
    before_after: /비포|애프터|전후|변화/.test(description),
    arrow_pointing: /화살표|포인팅|가리키/.test(description),
    emoji_use: /이모지|이모티콘/.test(description),
  };

  let score = 50;
  const improvements: string[] = [];
  const strengths: string[] = [];

  if (elements.face_detected) {
    score += 15;
    strengths.push('얼굴/표정이 포함되어 있어 클릭률 상승 기대');
  } else {
    improvements.push('사람의 얼굴이나 표정을 추가하면 CTR 15-30% 상승');
  }
  if (elements.text_overlay) {
    score += 10;
    strengths.push('텍스트 오버레이로 핵심 메시지 전달');
  } else {
    improvements.push('핵심 키워드 2-3개를 텍스트로 추가');
  }
  if (elements.bright_colors) {
    score += 8;
    strengths.push('눈에 띄는 색상 사용');
  } else {
    improvements.push('노란색, 빨간색 등 눈에 띄는 색상 활용');
  }
  if (platform === 'youtube' && elements.face_detected) score += 5;
  if (platform === 'instagram' && elements.bright_colors) score += 5;

  const platformBestPractices: Record<string, string[]> = {
    youtube: [
      '1280x720 이상의 해상도 사용',
      '얼굴은 프레임의 1/3 이상 차지',
      '텍스트는 3-5단어 이내',
      '대비가 강한 색상 조합',
      '호기심 자극하는 표정/포즈',
    ],
    instagram: [
      '1:1 또는 4:5 비율 권장',
      '밝고 따뜻한 톤',
      '일관된 필터/색감',
      '미니멀한 구도',
      '브랜드 컬러 활용',
    ],
    tiktok: [
      '9:16 세로 비율 필수',
      '첫 0.5초 내 시선 집중',
      '트렌디한 비주얼',
      '빠른 동작/표정',
    ],
  };

  const categoryTips: Record<string, string[]> = {
    먹방: ['음식 클로즈업 + 김 오르는 장면', '먹는 표정 강조', '양 많아 보이게'],
    뷰티: ['비포-애프터 구도', '제품 + 결과물', '깨끗한 피부 강조'],
    테크: ['제품 + 손 포함', '스펙 텍스트 오버레이', '미래지향적 느낌'],
    브이로그: ['자연스러운 표정', '장소가 드러나는 구도', '감성적 색감'],
    교육: ['핵심 포인트 텍스트', '진지한 표정', '전문가 느낌'],
  };

  return {
    title,
    platform,
    category,
    thumbnail_score: Math.min(score, 100),
    grade:
      score >= 85
        ? 'A (매우 우수)'
        : score >= 70
          ? 'B (우수)'
          : score >= 55
            ? 'C (보통)'
            : 'D (개선 필요)',
    detected_elements: elements,
    strengths,
    improvements,
    platform_best_practices: platformBestPractices[platform] || platformBestPractices.youtube,
    category_specific_tips:
      categoryTips[category] || ['카테고리에 맞는 시각적 요소 강조', '타겟 오디언스가 관심 가질 요소 포함'],
    color_psychology: {
      red: '긴급함, 열정 - 할인, 긴급 콘텐츠',
      yellow: '주목, 행복 - 정보성 콘텐츠',
      blue: '신뢰, 전문성 - 교육, 테크',
      green: '건강, 자연 - 웰빙, 에코',
      orange: '에너지, 창의성 - 엔터테인먼트',
    },
    ctr_prediction: {
      current: score >= 70 ? '높음' : score >= 50 ? '보통' : '낮음',
      potential_with_improvements: '높음 (5-10% CTR 예상)',
    },
  };
}

const thumbSchema = {
  title: z.string().describe('콘텐츠 제목'),
  thumbnail_description: z.string().describe('썸네일 설명'),
  platform: z.enum(['youtube', 'instagram', 'tiktok', 'blog']).describe('플랫폼'),
  content_category: z.string().optional().describe('콘텐츠 카테고리'),
};

const thumbTool: ToolDefinition<typeof thumbSchema> = {
  name: 'analyze_thumbnail',
  description: 'YouTube/Instagram 썸네일 컨셉을 분석하고 개선점을 제안합니다. 클릭률 최적화 가이드를 제공합니다.',
  schema: thumbSchema,
  handler: async (rawArgs) => {
    const args = rawArgs as {
      title: string;
      thumbnail_description: string;
      platform: string;
      content_category?: string;
    };
    const result = analyzeThumbnailConcept(
      args.title,
      args.thumbnail_description,
      args.platform,
      args.content_category || '일반',
    );
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
};

export const viralScoringTools: ToolDefinition[] = [
  predictViralTool as ToolDefinition,
  abTool as ToolDefinition,
  perfTool as ToolDefinition,
  thumbTool as ToolDefinition,
];
