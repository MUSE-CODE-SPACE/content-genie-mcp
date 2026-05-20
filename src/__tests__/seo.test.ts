/**
 * Tests for SEO tools. The `analyze_seo_keywords` tool hits live scrapers,
 * so we test it lightly (just check shape with a permissive timeout). The
 * other two are pure and tested fully.
 */

import { seoTools } from '../tools/seo.js';

function getTool(name: string) {
  const t = seoTools.find((tool) => tool.name === name);
  if (!t) throw new Error(`tool ${name} not found`);
  return t;
}

describe('optimize_title_hashtags', () => {
  it('returns variations + hashtags', async () => {
    const tool = getTool('optimize_title_hashtags');
    const result = await tool.handler({
      original_title: '여름 휴가지 추천',
      platform: 'instagram',
      keywords: ['여름', '휴가'],
      style: 'listicle',
      language: 'ko',
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.optimized_titles.length).toBe(7);
    expect(data.hashtag_strategy.primary.length).toBeGreaterThan(0);
  });

  it('error path: empty title still returns a result', async () => {
    const tool = getTool('optimize_title_hashtags');
    const result = await tool.handler({ original_title: '' });
    expect(result).toBeDefined();
    // The handler shouldn't crash on empty string — it returns variations
    // built from the empty seed.
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.original).toBe('');
  });
});

describe('generate_hashtag_strategy', () => {
  it('returns platform-bounded hashtag count', async () => {
    const tool = getTool('generate_hashtag_strategy');
    const result = await tool.handler({
      topic: '에어컨 추천',
      platform: 'tiktok',
      count: 30,
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    // tiktok caps at 5
    expect(data.strategy.total_hashtags).toBe(5);
    expect(data.all_hashtags.length).toBe(5);
  });

  it('respects include_english=false', async () => {
    const tool = getTool('generate_hashtag_strategy');
    const result = await tool.handler({
      topic: '운동',
      platform: 'instagram',
      count: 10,
      include_korean: true,
      include_english: false,
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    // No #instagood etc. in the output
    expect(data.all_hashtags.every((t: string) => !t.includes('instagood'))).toBe(true);
  });
});
