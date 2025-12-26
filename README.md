# Content Genie MCP v2.0

> 한국 콘텐츠 크리에이터를 위한 올인원 AI 콘텐츠 어시스턴트

[![npm version](https://badge.fury.io/js/content-genie-mcp.svg)](https://www.npmjs.com/package/content-genie-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Content Genie MCP는 블로거, 유튜버, 인스타그래머, 마케터를 위한 **12가지 강력한 도구**를 제공하는 MCP 서버입니다. 한국 시장에 특화된 트렌드 분석, 콘텐츠 아이디어 생성, SEO 최적화, 바이럴 예측 기능을 제공합니다.

## v2.0 New Features

- 12개 도구로 확장 (기존 7개 → 12개)
- 실시간 네이버/다음/구글/유튜브 트렌드 스크래핑
- 40+ 한국 기념일/이벤트 DB 내장
- 고급 바이럴 점수 예측 알고리즘
- A/B 테스트 변형 자동 생성
- 플랫폼별 해시태그 전략

## 12가지 핵심 도구

| # | 도구 | 설명 |
|---|------|------|
| 1 | `get_korean_trends` | 네이버/다음/구글/유튜브/줌 실시간 트렌드 |
| 2 | `generate_content_ideas` | AI 콘텐츠 아이디어 + 시즌/트렌드 연계 |
| 3 | `optimize_title_hashtags` | CTR 최적화 제목 + 플랫폼별 해시태그 |
| 4 | `analyze_seo_keywords` | 네이버/구글 SEO 분석 + 롱테일 키워드 |
| 5 | `create_content_calendar` | 한국 기념일 반영 콘텐츠 캘린더 |
| 6 | `analyze_competitor_content` | 경쟁사 콘텐츠 심층 분석 |
| 7 | `predict_viral_score` | AI 바이럴 가능성 예측 (S~D 등급) |
| 8 | `analyze_news_trends` | 실시간 한국 뉴스 트렌드 분석 |
| 9 | `generate_hashtag_strategy` | 플랫폼별 해시태그 전략 생성 |
| 10 | `benchmark_content_performance` | 업계별 성과 벤치마크 |
| 11 | `generate_ab_test_variants` | A/B 테스트 변형 자동 생성 |
| 12 | `get_seasonal_content_guide` | 시즌/이벤트 콘텐츠 가이드 |

## 설치 및 사용법

### Claude Desktop

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "content-genie": {
      "command": "npx",
      "args": ["-y", "content-genie-mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add content-genie-mcp -- npx -y content-genie-mcp
```

### PlayMCP

[PlayMCP](https://playmcp.kakao.com)에서 "Content Genie"를 검색하여 도구함에 추가하세요.

## 도구 상세

### 1. get_korean_trends

```
실시간 한국 트렌드 키워드를 분석합니다.

Parameters:
- platform: "naver" | "google" | "youtube" | "daum" | "zum" | "all"
- category: "general" | "news" | "shopping" | "entertainment" | "tech" | "finance" | "sports" | "all"
- limit: 1-50

Returns:
- 플랫폼별 트렌드 키워드
- 카테고리 분석
- 콘텐츠 기회 발굴
- 다가오는 이벤트
```

### 2. generate_content_ideas

```
주제 기반 콘텐츠 아이디어 생성

Parameters:
- topic: 콘텐츠 주제
- content_type: "blog" | "youtube" | "instagram" | "tiktok" | "newsletter" | "threads" | "twitter" | "all"
- tone: "professional" | "casual" | "humorous" | "educational" | "inspirational" | "provocative" | "storytelling"
- target_audience: 타겟 오디언스
- count: 1-30
- include_trends: 트렌드 연계 아이디어 포함

Returns:
- 메인 아이디어 (형식별)
- 시즌/이벤트 연계 아이디어
- 트렌드 기반 아이디어
- 플랫폼별 팁
```

### 3. optimize_title_hashtags

```
CTR 최적화 제목 및 해시태그 생성

Parameters:
- original_title: 원본 제목
- platform: 타겟 플랫폼
- keywords: 키워드 목록
- style: "clickbait" | "informative" | "emotional" | "question" | "how-to" | "listicle" | "controversy" | "story"
- language: "ko" | "en" | "mixed"

Returns:
- 최적화된 제목 변형 (CTR 예측 포함)
- 플랫폼별 해시태그 전략
- SEO 권장사항
```

### 4. analyze_seo_keywords

```
SEO 키워드 심층 분석

Parameters:
- keyword: 메인 키워드
- search_engine: "naver" | "google" | "both"
- include_questions: 질문형 키워드 포함
- include_longtail: 롱테일 키워드 포함
- competitor_analysis: 경쟁 분석 포함

Returns:
- 검색량/경쟁도 분석
- 관련 키워드
- 질문형 키워드
- 롱테일 키워드
- 네이버/구글 최적화 전략
```

### 5. create_content_calendar

```
콘텐츠 캘린더 자동 생성

Parameters:
- topics: 주제 목록
- duration_weeks: 1-24주
- posts_per_week: 1-21개
- platforms: 플랫폼 목록
- include_events: 기념일/이벤트 반영
- content_mix: "balanced" | "promotional" | "educational" | "entertaining"

Returns:
- 주간/일간 캘린더
- 플랫폼별 포맷 제안
- 최적 게시 시간
- 한국 기념일 연계
```

### 6. analyze_competitor_content

```
경쟁사 콘텐츠 분석

Parameters:
- urls: URL 목록 (최대 10개)
- analysis_depth: "basic" | "detailed" | "comprehensive"
- extract_strategy: 전략 추출

Returns:
- 제목/메타 분석
- 구조 분석 (H1, H2, H3)
- 키워드 분석
- 전략 인사이트
```

### 7. predict_viral_score

```
바이럴 가능성 예측

Parameters:
- title: 콘텐츠 제목
- description: 설명
- platform: 플랫폼
- hashtags: 해시태그
- content_type: "image" | "video" | "text" | "carousel" | "reel"

Returns:
- 바이럴 점수 (0-100)
- 등급 (S/A/B/C/D)
- 감정/구조 분석
- 개선 제안
- 성과 예측
```

### 8. analyze_news_trends

```
한국 뉴스 트렌드 분석

Parameters:
- category: "general" | "politics" | "economy" | "society" | "culture" | "sports" | "tech" | "entertainment"
- time_range: "1h" | "24h" | "7d" | "30d"
- extract_keywords: 키워드 추출

Returns:
- 주요 뉴스
- 키워드 빈도
- 감성 분석
- 콘텐츠 기회
```

### 9. generate_hashtag_strategy

```
플랫폼별 해시태그 전략

Parameters:
- topic: 주제
- platform: "instagram" | "tiktok" | "youtube" | "twitter" | "threads"
- count: 5-50
- include_korean: 한국어 해시태그
- include_english: 영어 해시태그

Returns:
- 우선순위별 해시태그
- 복사용 해시태그 문자열
- 플랫폼별 권장사항
```

### 10. benchmark_content_performance

```
업계 벤치마크 데이터

Parameters:
- category: 콘텐츠 카테고리 (뷰티, 테크, 푸드 등)
- platform: 플랫폼
- metric: "engagement" | "reach" | "conversion" | "all"

Returns:
- 평균 성과 지표
- 성과 등급 기준
- 개선 팁
```

### 11. generate_ab_test_variants

```
A/B 테스트 변형 생성

Parameters:
- original_content: 원본 콘텐츠
- content_element: "title" | "description" | "cta" | "hashtags" | "thumbnail_concept"
- variants_count: 2-10

Returns:
- 변형 목록
- 예측 성과
- 테스트 권장사항
```

### 12. get_seasonal_content_guide

```
시즌/이벤트 콘텐츠 가이드

Parameters:
- days_ahead: 1-90일
- category: "all" | "holiday" | "commercial" | "traditional" | "shopping" | "event"

Returns:
- 다가오는 이벤트
- 준비 타임라인
- 콘텐츠 아이디어
- 해시태그 제안
```

## 한국 기념일 DB (40+)

- **공휴일**: 새해, 설날, 삼일절, 어린이날, 부처님오신날, 현충일, 광복절, 추석, 개천절, 한글날, 크리스마스
- **상업 이벤트**: 발렌타인데이, 화이트데이, 어버이날, 로즈데이, 빼빼로데이 등
- **시즌 이벤트**: 할로윈, 블랙프라이데이, 정월대보름, 수능 등
- **쇼핑 시즌**: 신년 세일, 여름 세일, 가을 신상, 연말 세일

## 타겟 사용자

- **블로거**: 네이버 블로그, 티스토리 운영자
- **유튜버**: 콘텐츠 기획 및 제목 최적화
- **인스타그래머**: 해시태그 전략 및 포스팅 일정
- **틱토커**: 트렌드 분석 및 바이럴 예측
- **마케터**: 콘텐츠 마케팅 전략 수립
- **스타트업**: 브랜드 콘텐츠 기획

## 기술 스택

- TypeScript
- MCP SDK (@modelcontextprotocol/sdk)
- Axios & Cheerio (웹 스크래핑)
- Zod (스키마 검증)

## License

MIT License

## Author

**Yoonkyoung Gong** - [GitHub](https://github.com/MUSE-CODE-SPACE)
