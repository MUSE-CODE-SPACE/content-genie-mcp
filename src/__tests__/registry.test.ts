/**
 * Tests for the central tool registry — checks that creating a server
 * registers exactly 17 tools and exposes their names.
 */

import { createServer } from '../server.js';
import { getToolNames, resetRegistry } from '../core/registry.js';

describe('tool registry', () => {
  it('registers exactly 17 tools when server is created', () => {
    resetRegistry();
    createServer();
    const names = getToolNames();
    expect(names).toHaveLength(17);
  });

  it('includes all expected tool names', () => {
    resetRegistry();
    createServer();
    const names = getToolNames();

    const expected = [
      'get_korean_trends',
      'analyze_news_trends',
      'generate_content_ideas',
      'generate_script_outline',
      'repurpose_content',
      'analyze_seo_keywords',
      'optimize_title_hashtags',
      'generate_hashtag_strategy',
      'predict_viral_score',
      'generate_ab_test_variants',
      'predict_content_performance',
      'analyze_thumbnail',
      'analyze_competitor_content',
      'benchmark_content_performance',
      'analyze_influencer_collab',
      'create_content_calendar',
      'get_seasonal_content_guide',
    ];

    for (const n of expected) {
      expect(names).toContain(n);
    }
  });

  it('throws on duplicate tool registration', () => {
    resetRegistry();
    createServer();
    // creating a second server without reset triggers the dup guard
    expect(() => createServer()).toThrow(/registered twice/);
  });
});
