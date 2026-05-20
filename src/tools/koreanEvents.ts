/**
 * Korean event / seasonal tools:
 *   - create_content_calendar
 *   - get_seasonal_content_guide
 *
 * Both consume the central KOREAN_EVENTS_DB from src/data.
 */

import { z } from 'zod';
import type { ToolDefinition } from '../core/registry.js';
import { ContentTypeSchema } from '../types.js';
import { KOREAN_EVENTS_DB, getUpcomingEvents } from '../data/koreanEvents.js';

// ---------------------------------------------------------------------------
// create_content_calendar
// ---------------------------------------------------------------------------

function generateWeeklyGoals(_week: number, theme: string): string[] {
  return [
    `${theme} 관련 인게이지먼트 10% 향상`,
    '신규 팔로워 획득',
    '커뮤니티 참여 증대',
  ];
}

function determineContentType(index: number): string {
  return ['educational', 'entertaining', 'promotional', 'engaging'][index % 4];
}

function getFormatSuggestion(platform: string, contentType: string): string {
  const formats: Record<string, Record<string, string>> = {
    instagram: {
      educational: '캐러셀 (5-10장)',
      entertaining: '릴스 (15-30초)',
      promotional: '단일 이미지 + 스토리',
      engaging: '스토리 투표/퀴즈',
    },
    youtube: {
      educational: '튜토리얼 (10-15분)',
      entertaining: '브이로그 (8-12분)',
      promotional: '쇼츠 (30-60초)',
      engaging: '라이브 스트리밍',
    },
    blog: {
      educational: '가이드 (3000자+)',
      entertaining: '후기/에세이 (2000자)',
      promotional: '제품 리뷰 (2500자)',
      engaging: 'Q&A 포스트',
    },
    tiktok: {
      educational: '팁 영상 (30-60초)',
      entertaining: '트렌드 참여 (15-30초)',
      promotional: '제품 소개 (30초)',
      engaging: '듀엣/스티치',
    },
  };
  return formats[platform]?.[contentType] || '일반 포스트';
}

function getOptimalTimeForPlatform(platform: string): string {
  const times: Record<string, string> = {
    instagram: '12:00-13:00, 19:00-21:00',
    youtube: '토요일 14:00-16:00',
    blog: '09:00-11:00',
    tiktok: '19:00-22:00',
    newsletter: '화/목 09:00',
    threads: '08:00-09:00, 18:00-20:00',
    twitter: '12:00-13:00, 17:00-18:00',
  };
  return times[platform] || '09:00-11:00';
}

function getMonthlyThemeSuggestions(month: number): string[] {
  const suggestions: Record<number, string[]> = {
    1: ['새해 계획', '신년 트렌드', '겨울 콘텐츠', '설날 준비'],
    2: ['발렌타인', '봄 준비', '연인 콘텐츠'],
    3: ['봄 시즌', '신학기', '화이트데이', '봄나들이'],
    4: ['벚꽃', '봄 패션', '아웃도어'],
    5: ['가정의 달', '어버이날', '야외활동', '여름 준비'],
    6: ['여름 시작', '휴가 계획', '다이어트'],
    7: ['휴가 시즌', '여름 패션', '물놀이'],
    8: ['말복', '여름 끝', '가을 준비'],
    9: ['새학기', '가을 패션', '추석 준비'],
    10: ['가을', '추석', '할로윈', '단풍'],
    11: ['블랙프라이데이', '연말 준비', '빼빼로데이'],
    12: ['연말 결산', '크리스마스', '송년', '선물'],
  };
  return suggestions[month] || ['시즌 콘텐츠'];
}

function generateMonthlyThemes(startDate: Date, weeks: number): Array<Record<string, unknown>> {
  const themes: Array<Record<string, unknown>> = [];
  const months = Math.ceil(weeks / 4);
  for (let i = 0; i < months; i++) {
    const monthDate = new Date(startDate);
    monthDate.setMonth(startDate.getMonth() + i);
    themes.push({
      month: monthDate.toLocaleString('ko-KR', { month: 'long' }),
      suggested_themes: getMonthlyThemeSuggestions(monthDate.getMonth() + 1),
    });
  }
  return themes;
}

function createContentCalendar(
  topics: string[],
  durationWeeks: number,
  postsPerWeek: number,
  platforms: string[],
  includeEvents: boolean,
  contentMix: string,
): Record<string, unknown> {
  const calendar: Array<Record<string, unknown>> = [];
  const startDate = new Date();

  const mixRatios: Record<string, Record<string, number>> = {
    balanced: { educational: 40, entertaining: 30, promotional: 20, engaging: 10 },
    promotional: { educational: 20, entertaining: 20, promotional: 50, engaging: 10 },
    educational: { educational: 60, entertaining: 20, promotional: 10, engaging: 10 },
    entertaining: { educational: 20, entertaining: 50, promotional: 15, engaging: 15 },
  };
  const ratio = mixRatios[contentMix] || mixRatios.balanced;

  for (let week = 0; week < durationWeeks; week++) {
    const weekStart = new Date(startDate);
    weekStart.setDate(startDate.getDate() + week * 7);

    const weekPlan: Record<string, unknown> = {
      week: week + 1,
      start_date: weekStart.toISOString().split('T')[0],
      theme: topics[week % topics.length],
      posts: [] as Array<Record<string, unknown>>,
      weekly_goals: generateWeeklyGoals(week, topics[week % topics.length]),
    };

    for (let post = 0; post < postsPerWeek; post++) {
      const postDate = new Date(weekStart);
      postDate.setDate(weekStart.getDate() + Math.floor((post / postsPerWeek) * 7));

      const dateStr = postDate.toISOString().split('T')[0];
      const monthDay = `${String(postDate.getMonth() + 1).padStart(2, '0')}-${String(postDate.getDate()).padStart(2, '0')}`;
      const event = includeEvents ? KOREAN_EVENTS_DB.find((e) => e.date === monthDay) : null;
      const contentType = determineContentType(post);
      const platform = platforms[post % platforms.length];

      (weekPlan.posts as Array<Record<string, unknown>>).push({
        id: week * postsPerWeek + post + 1,
        date: dateStr,
        day: ['일', '월', '화', '수', '목', '금', '토'][postDate.getDay()],
        platform,
        content_type: contentType,
        topic: event
          ? `${event.name} 특집: ${topics[post % topics.length]}`
          : topics[post % topics.length],
        format_suggestion: getFormatSuggestion(platform, contentType),
        optimal_time: getOptimalTimeForPlatform(platform),
        special_event: event
          ? { name: event.name, type: event.type, ideas: event.contentIdeas }
          : null,
        status: 'planned',
        checklist: ['아이디어 확정', '콘텐츠 제작', '해시태그 준비', '발행'],
      });
    }
    calendar.push(weekPlan);
  }

  const upcoming = includeEvents ? getUpcomingEvents(durationWeeks * 7) : [];

  return {
    overview: {
      duration: `${durationWeeks}주`,
      total_posts: durationWeeks * postsPerWeek,
      platforms,
      topics,
      content_mix: ratio,
    },
    calendar,
    upcoming_events: upcoming,
    recommendations: [
      '주요 이벤트 1-2주 전에 관련 콘텐츠 준비',
      '일관된 발행 시간 유지',
      '주간 단위로 성과 분석',
      '각 플랫폼의 알고리즘 특성 반영',
    ],
    monthly_themes: generateMonthlyThemes(startDate, durationWeeks),
  };
}

const calendarSchema = {
  topics: z.array(z.string()).describe('콘텐츠 주제 목록'),
  duration_weeks: z.number().min(1).max(24).optional().describe('캘린더 기간 (주 단위). 기본값: 4'),
  posts_per_week: z.number().min(1).max(21).optional().describe('주당 포스팅 수. 기본값: 5'),
  platforms: z.array(ContentTypeSchema).optional().describe('타겟 플랫폼 목록'),
  include_events: z.boolean().optional().describe('기념일/이벤트 반영. 기본값: true'),
  content_mix: z
    .enum(['balanced', 'promotional', 'educational', 'entertaining'])
    .optional()
    .describe('콘텐츠 믹스 전략'),
};

const calendarTool: ToolDefinition<typeof calendarSchema> = {
  name: 'create_content_calendar',
  description: '한국 기념일, 시즌 이벤트, 쇼핑 시즌을 반영한 콘텐츠 캘린더를 생성합니다.',
  schema: calendarSchema,
  handler: async (rawArgs) => {
    const args = rawArgs as {
      topics: string[];
      duration_weeks?: number;
      posts_per_week?: number;
      platforms?: string[];
      include_events?: boolean;
      content_mix?: string;
    };
    const result = createContentCalendar(
      args.topics,
      args.duration_weeks ?? 4,
      args.posts_per_week ?? 5,
      args.platforms || ['blog', 'instagram'],
      args.include_events ?? true,
      args.content_mix || 'balanced',
    );
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
};

// ---------------------------------------------------------------------------
// get_seasonal_content_guide
// ---------------------------------------------------------------------------

function getMonthlyFocus(): Record<string, unknown> {
  const month = new Date().getMonth() + 1;
  const focuses: Record<number, Record<string, unknown>> = {
    1: { theme: '새해/신년', keywords: ['새해 계획', '신년 운세', '2025 트렌드'] },
    2: { theme: '발렌타인/겨울', keywords: ['발렌타인 선물', '커플', '초콜릿'] },
    3: { theme: '봄/신학기', keywords: ['봄맞이', '신학기', '화이트데이'] },
    4: { theme: '벚꽃/봄나들이', keywords: ['벚꽃명소', '봄 패션', '피크닉'] },
    5: { theme: '가정의 달', keywords: ['어버이날', '어린이날', '스승의날'] },
    6: { theme: '초여름/휴가', keywords: ['여름 휴가', '워케이션', '다이어트'] },
    7: { theme: '휴가 시즌', keywords: ['바캉스', '물놀이', '여행'] },
    8: { theme: '여름 끝/가을 준비', keywords: ['말복', '가을 신상', '처서'] },
    9: { theme: '추석/가을', keywords: ['추석 선물', '가을 패션', '단풍'] },
    10: { theme: '가을/할로윈', keywords: ['할로윈', '가을 나들이', '코스튬'] },
    11: { theme: '연말 준비', keywords: ['블프', '빼빼로데이', '연말 선물'] },
    12: { theme: '연말/크리스마스', keywords: ['크리스마스', '연말 파티', '송년회'] },
  };
  return focuses[month] || focuses[1];
}

function getSeasonalContentGuide(daysAhead: number, category: string): Record<string, unknown> {
  const events = getUpcomingEvents(daysAhead);
  const filtered = category === 'all' ? events : events.filter((e) => e.type === category);

  const guide = filtered.map((event) => ({
    ...event,
    content_preparation_timeline: {
      research: `D-${Math.max(event.days_until - 14, 1)}`,
      content_creation: `D-${Math.max(event.days_until - 7, 1)}`,
      publishing: `D-${Math.max(event.days_until - 3, 0)} ~ D-${event.days_until}`,
      follow_up: `D+1 ~ D+3`,
    },
    recommended_content_types: [
      '이벤트 관련 가이드',
      '시즌 추천 리스트',
      '타임라인 콘텐츠',
      '사용자 참여형 콘텐츠',
    ],
    hashtag_suggestions: event.contentIdeas?.map((idea) => `#${idea.replace(/\s/g, '')}`) || [],
  }));

  return {
    period: `${daysAhead}일`,
    category,
    total_events: filtered.length,
    events: guide,
    general_tips: [
      '주요 이벤트 2주 전에 콘텐츠 기획 시작',
      '이벤트 당일보다 1-3일 전 발행이 효과적',
      '이벤트 후 후기/정리 콘텐츠도 준비',
      '연관 키워드 미리 확보',
    ],
    monthly_focus: getMonthlyFocus(),
  };
}

const seasonalSchema = {
  days_ahead: z.number().min(1).max(90).optional().describe('앞으로 며칠간의 이벤트. 기본값: 30'),
  category: z
    .enum(['all', 'holiday', 'commercial', 'traditional', 'shopping', 'event'])
    .optional()
    .describe('이벤트 카테고리'),
};

const seasonalTool: ToolDefinition<typeof seasonalSchema> = {
  name: 'get_seasonal_content_guide',
  description: '다가오는 시즌/이벤트에 맞는 콘텐츠 가이드를 제공합니다.',
  schema: seasonalSchema,
  handler: async (rawArgs) => {
    const args = rawArgs as { days_ahead?: number; category?: string };
    const result = getSeasonalContentGuide(args.days_ahead ?? 30, args.category || 'all');
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
};

export const koreanEventsTools: ToolDefinition[] = [
  calendarTool as ToolDefinition,
  seasonalTool as ToolDefinition,
];
