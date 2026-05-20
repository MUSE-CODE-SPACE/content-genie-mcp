/**
 * MCP Prompts exposed by content-genie-mcp.
 *
 *   - prompt://content-genie/viral-title
 *       Guided viral-title generation: feed in a topic + platform, get back
 *       a chained workflow (predict_viral_score -> optimize_title_hashtags
 *       -> generate_ab_test_variants).
 *
 *   - prompt://content-genie/competitor-analysis
 *       Guided competitor analysis: feed in URLs + goal, get back a
 *       step-by-step instruction set for the LLM to chain tools.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerPrompts(server: McpServer): void {
  // --- viral-title
  server.registerPrompt(
    'viral-title',
    {
      title: 'Viral title workflow',
      description:
        '주제와 플랫폼을 받아 바이럴 가능성 높은 제목을 만드는 멀티 도구 워크플로우를 시작합니다.',
      argsSchema: {
        topic: z.string().describe('콘텐츠 주제 (예: 다이어트 식단)'),
        platform: z.string().describe('타겟 플랫폼 (youtube, instagram, tiktok 등)'),
        original_title: z
          .string()
          .optional()
          .describe('이미 있는 후보 제목 (있다면)'),
      },
    },
    ({ topic, platform, original_title }) => {
      const seed = original_title || topic;
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                `당신은 한국 콘텐츠 크리에이터를 위한 바이럴 제목 생성 에이전트입니다.`,
                `주제: ${topic}`,
                `플랫폼: ${platform}`,
                `시드 제목: "${seed}"`,
                ``,
                `다음 단계를 차례로 수행하세요:`,
                `1. \`optimize_title_hashtags\` 도구로 "${seed}"의 변형 제목 7개를 생성하고 platform="${platform}"으로 해시태그 전략을 얻습니다.`,
                `2. 각 변형 제목에 대해 \`predict_viral_score\` 도구를 호출해 score + grade를 비교합니다.`,
                `3. 상위 3개를 \`generate_ab_test_variants\` (content_element="title", variants_count=3)에 다시 넣어 A/B 후보를 도출합니다.`,
                `4. 최종 추천 1개 + 이유 + 예상 CTR + 추천 해시태그를 정리해서 응답하세요.`,
              ].join('\n'),
            },
          },
        ],
      };
    },
  );

  // --- competitor-analysis
  server.registerPrompt(
    'competitor-analysis',
    {
      title: 'Competitor analysis workflow',
      description:
        '경쟁사 URL을 받아 분석 → 인사이트 추출 → 차별화 콘텐츠 아이디어까지의 워크플로우.',
      argsSchema: {
        urls: z
          .string()
          .describe('분석할 경쟁사 URL들 (쉼표로 구분)'),
        my_topic: z.string().describe('내 콘텐츠 주제'),
        target_platform: z
          .string()
          .optional()
          .describe('내가 발행할 플랫폼 (기본: blog)'),
      },
    },
    ({ urls, my_topic, target_platform }) => {
      const urlList = urls
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean);
      const platform = target_platform || 'blog';
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                `당신은 한국 시장 경쟁 분석 에이전트입니다.`,
                `분석 대상 URL (${urlList.length}개): ${urlList.join(', ')}`,
                `내 콘텐츠 주제: ${my_topic}`,
                `타겟 플랫폼: ${platform}`,
                ``,
                `다음 단계를 차례로 수행하세요:`,
                `1. \`analyze_competitor_content\` (analysis_depth="comprehensive", extract_strategy=true)로 URL들을 분석합니다. 도구는 SSRF 가드가 적용되어 있어 허용된 도메인만 받습니다 — 차단된 URL은 결과의 error 필드에 표시됩니다.`,
                `2. 결과의 \`strategy_insights.opportunities\`와 \`average_metrics\`를 요약하세요.`,
                `3. 그 격차(gap)를 메우는 콘텐츠 아이디어를 \`generate_content_ideas\` (topic="${my_topic}", content_type="${platform}", include_trends=true)로 가져옵니다.`,
                `4. 가장 차별화될 만한 아이디어 3개를 골라 각각에 대해 \`predict_content_performance\`로 예상 성과를 추정하세요.`,
                `5. 최종 결과 = 경쟁사 약점 요약 + 차별화 콘텐츠 3개 + 각각의 예상 성과 + 발행 권장 시간대.`,
              ].join('\n'),
            },
          },
        ],
      };
    },
  );
}
