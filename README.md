# 🧞 Content Genie MCP

> 한국 콘텐츠 크리에이터를 위한 AI 어시스턴트 MCP 서버

[![npm version](https://badge.fury.io/js/content-genie-mcp.svg)](https://www.npmjs.com/package/content-genie-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Content Genie MCP는 블로거, 유튜버, 인스타그래머, 마케터를 위한 올인원 콘텐츠 생성 도우미입니다. 한국 시장에 특화된 트렌드 분석, 콘텐츠 아이디어 생성, SEO 최적화 기능을 제공합니다.

## ✨ 주요 기능

### 🔥 7가지 핵심 도구

| 도구 | 설명 |
|------|------|
| `get_korean_trends` | 네이버, 구글, 유튜브 실시간 트렌드 분석 |
| `generate_content_ideas` | 주제 기반 콘텐츠 아이디어 자동 생성 |
| `optimize_title_hashtags` | CTR 최적화 제목 및 해시태그 생성 |
| `analyze_seo_keywords` | SEO 키워드 분석 및 롱테일 키워드 추천 |
| `create_content_calendar` | 한국 공휴일 반영 콘텐츠 캘린더 생성 |
| `analyze_competitor_content` | 경쟁사 콘텐츠 전략 분석 |
| `predict_viral_score` | 바이럴 가능성 예측 및 개선 제안 |

## 🚀 설치 및 사용법

### Claude Desktop에서 사용

`claude_desktop_config.json`에 추가:

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

### Claude Code에서 사용

```bash
claude mcp add content-genie-mcp -- npx -y content-genie-mcp
```

### PlayMCP에서 사용

[PlayMCP](https://playmcp.kakao.com)에서 "Content Genie"를 검색하여 도구함에 추가하세요.

## 📖 도구 상세 설명

### 1. get_korean_trends - 한국 트렌드 분석

```
실시간 한국 트렌드 키워드를 분석합니다.

매개변수:
- platform: "naver" | "google" | "youtube" | "all" (기본값: all)
- category: "general" | "news" | "shopping" | "entertainment" | "all"
- limit: 1-50 (기본값: 20)
```

### 2. generate_content_ideas - 콘텐츠 아이디어 생성

```
주제와 플랫폼에 맞는 콘텐츠 아이디어를 생성합니다.

매개변수:
- topic: 콘텐츠 주제 (필수)
- content_type: "blog" | "youtube" | "instagram" | "tiktok" | "newsletter" | "all"
- tone: "professional" | "casual" | "humorous" | "educational" | "inspirational"
- target_audience: 타겟 오디언스 설명
- count: 1-20 (기본값: 10)
```

### 3. optimize_title_hashtags - 제목/해시태그 최적화

```
CTR 향상을 위한 제목 최적화 및 해시태그 생성

매개변수:
- original_title: 원본 제목 (필수)
- platform: 타겟 플랫폼
- keywords: 포함할 키워드 배열
- style: "clickbait" | "informative" | "emotional" | "question" | "how-to" | "listicle"
- max_length: 최대 글자 수 (기본값: 60)
```

### 4. analyze_seo_keywords - SEO 키워드 분석

```
키워드의 SEO 잠재력 분석 및 추천

매개변수:
- keyword: 분석할 키워드 (필수)
- language: "ko" | "en" | "both"
- include_questions: 질문형 키워드 포함 (기본값: true)
- include_longtail: 롱테일 키워드 포함 (기본값: true)
```

### 5. create_content_calendar - 콘텐츠 캘린더 생성

```
한국 기념일 반영 콘텐츠 캘린더 자동 생성

매개변수:
- topics: 주제 배열 (필수)
- duration_weeks: 1-12주 (기본값: 4)
- posts_per_week: 1-14개 (기본값: 3)
- platforms: 플랫폼 배열
- include_holidays: 공휴일/기념일 포함 (기본값: true)
```

### 6. analyze_competitor_content - 경쟁사 분석

```
경쟁사 콘텐츠 전략 분석

매개변수:
- urls: 분석할 URL 배열 (최대 5개)
- analysis_type: "title" | "structure" | "keywords" | "all"
```

### 7. predict_viral_score - 바이럴 예측

```
콘텐츠 바이럴 가능성 점수 예측

매개변수:
- title: 콘텐츠 제목 (필수)
- description: 설명
- platform: 타겟 플랫폼
- hashtags: 해시태그 배열
```

## 💡 사용 예시

### 트렌드 기반 콘텐츠 기획

```
1. get_korean_trends로 최신 트렌드 파악
2. generate_content_ideas로 아이디어 생성
3. optimize_title_hashtags로 제목 최적화
4. predict_viral_score로 바이럴 가능성 확인
5. create_content_calendar로 일정 수립
```

### SEO 최적화 콘텐츠 작성

```
1. analyze_seo_keywords로 키워드 분석
2. analyze_competitor_content로 경쟁사 벤치마킹
3. generate_content_ideas로 차별화된 아이디어 도출
4. optimize_title_hashtags로 검색 최적화
```

## 🎯 타겟 사용자

- **블로거**: 네이버 블로그, 티스토리 운영자
- **유튜버**: 콘텐츠 기획 및 제목 최적화
- **인스타그래머**: 해시태그 전략 및 포스팅 일정
- **마케터**: 콘텐츠 마케팅 전략 수립
- **스타트업**: 브랜드 콘텐츠 기획

## 🔧 기술 스택

- TypeScript
- MCP SDK (@modelcontextprotocol/sdk)
- Axios & Cheerio (웹 스크래핑)
- Zod (스키마 검증)

## 📄 라이선스

MIT License

## 👨‍💻 개발자

**Yoonkyoung Gong** - [GitHub](https://github.com/MUSE-CODE-SPACE)

---

🏆 **PlayMCP Player 10 공모전 출품작**

이 프로젝트는 카카오 PlayMCP 개발 공모전을 위해 제작되었습니다.
