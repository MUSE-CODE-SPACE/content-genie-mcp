/**
 * Tests for competitor analysis tools.
 *
 * The `analyze_competitor_content` tool calls validatePublicUrl which has
 * an SSRF allow-list — we exercise both an allowed and a blocked URL to
 * verify the security guard surfaces structured errors.
 */

import { competitorAnalysisTools } from '../tools/competitorAnalysis.js';

function getTool(name: string) {
  const t = competitorAnalysisTools.find((tool) => tool.name === name);
  if (!t) throw new Error(`tool ${name} not found`);
  return t;
}

describe('analyze_competitor_content', () => {
  it('error path: rejects internal URL via SSRF guard', async () => {
    const tool = getTool('analyze_competitor_content');
    const result = await tool.handler({
      urls: ['http://localhost:8080/admin', 'http://169.254.169.254/'],
      analysis_depth: 'basic',
      extract_strategy: false,
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.total_urls).toBe(2);
    expect(data.successful).toBe(0);
    // Both URLs should have error fields populated with VALIDATION_ERROR
    expect(data.results[0].error).toMatch(/VALIDATION_ERROR/);
    expect(data.results[1].error).toMatch(/VALIDATION_ERROR/);
  });

  it('error path: rejects non-whitelisted public host', async () => {
    const tool = getTool('analyze_competitor_content');
    const result = await tool.handler({
      urls: ['https://example.com/'],
      analysis_depth: 'basic',
      extract_strategy: false,
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.successful).toBe(0);
    expect(data.results[0].error).toMatch(/VALIDATION_ERROR|whitelist/);
  });
});

describe('benchmark_content_performance', () => {
  it('happy path: returns benchmark for known category', async () => {
    const tool = getTool('benchmark_content_performance');
    const result = await tool.handler({
      category: '뷰티',
      platform: 'instagram',
      metric: 'all',
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.category).toBe('뷰티');
    expect(data.platform).toBe('instagram');
    expect(data.benchmark_data).toBeDefined();
  });
});

describe('analyze_influencer_collab', () => {
  it('happy path: budget=low recommends nano + micro tiers', async () => {
    const tool = getTool('analyze_influencer_collab');
    const result = await tool.handler({
      brand_category: '뷰티',
      target_audience: '20대 여성',
      budget_range: 'low',
      campaign_goal: 'awareness',
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    const tiers = data.recommended_influencer_tiers.map((t: { tier: string }) => t.tier);
    expect(tiers).toContain('nano');
    expect(tiers).toContain('micro');
  });
});
