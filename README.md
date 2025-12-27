# Content Genie MCP

**AI Content Creation Assistant MCP Server**

> All-in-one content assistant for Korean content creators - Trend analysis, SEO optimization, viral prediction

[![npm version](https://badge.fury.io/js/content-genie-mcp.svg)](https://www.npmjs.com/package/content-genie-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Wiki](https://img.shields.io/badge/docs-Wiki-blue.svg)](https://github.com/MUSE-CODE-SPACE/content-genie-mcp/wiki)

[English](#english) | [한국어](#korean)

---

<a name="english"></a>
## English

### Overview

Content Genie MCP is an MCP server providing **17 powerful tools** for bloggers, YouTubers, Instagrammers, and marketers. It offers Korean market-specialized trend analysis, content idea generation, SEO optimization, viral prediction, and influencer collaboration analysis.

### Features

- **Real-time Trend Scraping** - Naver, Daum, Google, YouTube, Zum
- **100+ Korean Holiday/Event DB** - Seasonal content planning
- **Advanced Viral Score Prediction** - AI-powered S~D grade system
- **Cross-platform Cache System** - 30-minute TTL trend cache
- **Real-time SEO API** - Naver/Google autocomplete integration

### 17 Core Tools

| # | Tool | Description |
|---|------|-------------|
| 1 | `get_korean_trends` | Real-time trends from Naver/Daum/Google/YouTube/Zum |
| 2 | `generate_content_ideas` | AI content ideas + seasonal/trend integration |
| 3 | `optimize_title_hashtags` | CTR-optimized titles + platform-specific hashtags |
| 4 | `analyze_seo_keywords` | Naver/Google SEO analysis + long-tail keywords |
| 5 | `create_content_calendar` | Content calendar with Korean holidays |
| 6 | `analyze_competitor_content` | Deep competitor content analysis |
| 7 | `predict_viral_score` | AI viral potential prediction (S~D grade) |
| 8 | `analyze_news_trends` | Real-time Korean news trend analysis |
| 9 | `generate_hashtag_strategy` | Platform-specific hashtag strategy |
| 10 | `benchmark_content_performance` | Industry performance benchmarks |
| 11 | `generate_ab_test_variants` | Auto A/B test variant generation |
| 12 | `get_seasonal_content_guide` | Seasonal/event content guide |
| 13 | `analyze_thumbnail` | Thumbnail analysis + CTR optimization |
| 14 | `generate_script_outline` | Script/outline auto-generation |
| 15 | `repurpose_content` | Content repurposing strategy |
| 16 | `analyze_influencer_collab` | Influencer collaboration analysis |
| 17 | `predict_content_performance` | AI content performance prediction |

### Installation

#### Claude Desktop

Add to `claude_desktop_config.json`:

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

#### Claude Code

```bash
claude mcp add content-genie-mcp -- npx -y content-genie-mcp
```

### Example Usage

```
User: "What are trending topics in Korea right now?"

Claude will:
1. Fetch real-time trends from Naver, Daum, Google, YouTube
2. Categorize trends (news, entertainment, tech, etc.)
3. Suggest content opportunities
4. Provide upcoming events and holidays
```

### Target Users

- **Bloggers**: Naver Blog, Tistory operators
- **YouTubers**: Content planning and title optimization
- **Instagrammers**: Hashtag strategy and posting schedule
- **TikTokers**: Trend analysis and viral prediction
- **Marketers**: Content marketing strategy
- **Startups**: Brand content planning

---

<a name="korean"></a>
## 한국어

### 개요

Content Genie MCP는 블로거, 유튜버, 인스타그래머, 마케터를 위한 **17가지 강력한 도구**를 제공하는 MCP 서버입니다. 한국 시장에 특화된 트렌드 분석, 콘텐츠 아이디어 생성, SEO 최적화, 바이럴 예측, 인플루언서 협업 분석 기능을 제공합니다.

### 주요 기능

- **실시간 트렌드 스크래핑** - 네이버, 다음, 구글, 유튜브, 줌
- **100+ 한국 기념일/이벤트 DB** - 시즌 콘텐츠 기획
- **고급 바이럴 점수 예측** - AI 기반 S~D 등급 시스템
- **크로스 플랫폼 캐시 시스템** - 30분 TTL 트렌드 캐시
- **실시간 SEO API** - 네이버/구글 자동완성 연동

### 17가지 핵심 도구

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
| 13 | `analyze_thumbnail` | 썸네일 분석 + CTR 최적화 |
| 14 | `generate_script_outline` | 스크립트/대본 아웃라인 생성 |
| 15 | `repurpose_content` | 콘텐츠 리퍼포징 전략 |
| 16 | `analyze_influencer_collab` | 인플루언서 협업 분석 |
| 17 | `predict_content_performance` | 콘텐츠 성과 예측 AI |

### 설치 및 사용법

#### Claude Desktop

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

#### Claude Code

```bash
claude mcp add content-genie-mcp -- npx -y content-genie-mcp
```

### 사용 예시

```
User: "요즘 한국에서 뭐가 트렌드야?"

Claude가 수행:
1. 네이버, 다음, 구글, 유튜브에서 실시간 트렌드 수집
2. 트렌드 카테고리 분류 (뉴스, 엔터, 테크 등)
3. 콘텐츠 기회 제안
4. 다가오는 이벤트 및 기념일 안내
```

### 한국 기념일 DB (100+)

- **공휴일 (18개)**: 새해, 설날 연휴, 삼일절, 어린이날, 부처님오신날, 현충일, 광복절, 추석 연휴, 개천절, 한글날, 크리스마스 등
- **14일 데이 시리즈 (12개)**: 발렌타인데이, 화이트데이, 블랙데이, 로즈데이, 키스데이, 빼빼로데이 등
- **전통 절기 (15개)**: 정월대보름, 입춘, 경칩, 하지, 초복/중복/말복, 동지 등
- **글로벌/상업 이벤트 (15개)**: 할로윈, 블랙프라이데이, 사이버먼데이, 지구의날 등
- **학교/입시 관련 (10개)**: 개학, 수능, 졸업시즌, 방학 등
- **쇼핑 시즌 (10개)**: 신년 세일, 여름 세일, 가을 신상, 연말 세일 등
- **시즌/날씨 관련 (12개)**: 벚꽃 시즌, 장마, 폭염, 단풍, 김장철 등
- **크리에이터 특화 (8개)**: 연간 콘텐츠 기획, 알고리즘 시즌, 연말결산 등

### 타겟 사용자

- **블로거**: 네이버 블로그, 티스토리 운영자
- **유튜버**: 콘텐츠 기획 및 제목 최적화
- **인스타그래머**: 해시태그 전략 및 포스팅 일정
- **틱토커**: 트렌드 분석 및 바이럴 예측
- **마케터**: 콘텐츠 마케팅 전략 수립
- **스타트업**: 브랜드 콘텐츠 기획

---

## Documentation

- **[Wiki Docs](https://github.com/MUSE-CODE-SPACE/content-genie-mcp/wiki)** - Detailed usage guide
  - [Installation Guide](https://github.com/MUSE-CODE-SPACE/content-genie-mcp/wiki/Installation)
  - [Quick Start](https://github.com/MUSE-CODE-SPACE/content-genie-mcp/wiki/Quick-Start)
  - [17 Tools Overview](https://github.com/MUSE-CODE-SPACE/content-genie-mcp/wiki/Tools-Overview)
  - [API Reference](https://github.com/MUSE-CODE-SPACE/content-genie-mcp/wiki/API-Reference)

## Links

- [npm Package](https://www.npmjs.com/package/content-genie-mcp)
- [GitHub Repository](https://github.com/MUSE-CODE-SPACE/content-genie-mcp)
- [MCP Registry](https://registry.modelcontextprotocol.io)

## License

MIT License

## Author

**Yoonkyoung Gong** - [GitHub](https://github.com/MUSE-CODE-SPACE)
