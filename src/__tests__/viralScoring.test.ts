/**
 * Tests for viralScoring tools — predict_viral_score, generate_ab_test_variants,
 * predict_content_performance, analyze_thumbnail.
 *
 * These tools are pure (no network), so we exercise the scoring logic directly.
 */

import { viralScoringTools } from '../tools/viralScoring.js';

function getTool(name: string) {
  const t = viralScoringTools.find((tool) => tool.name === name);
  if (!t) throw new Error(`tool ${name} not found`);
  return t;
}

describe('predict_viral_score', () => {
  it('returns a score and grade for a high-engagement title', async () => {
    const tool = getTool('predict_viral_score');
    const result = await tool.handler({
      title: '99%가 모르는 5가지 다이어트 비밀',
      description: '지금 당장 시작하세요',
      platform: 'tiktok',
      hashtags: ['#다이어트', '#홈트', '#운동', '#건강', '#팁'],
      content_type: 'reel',
    });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(typeof data.viral_score).toBe('number');
    expect(data.viral_score).toBeGreaterThan(50);
    expect(typeof data.grade).toBe('string');
  });

  it('flags improvements for a weak title', async () => {
    const tool = getTool('predict_viral_score');
    const result = await tool.handler({
      title: 'asdf',
      description: '',
      platform: 'blog',
      hashtags: [],
      content_type: 'text',
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.improvements.length).toBeGreaterThan(0);
  });
});

describe('generate_ab_test_variants', () => {
  it('returns multiple title variants', async () => {
    const tool = getTool('generate_ab_test_variants');
    const result = await tool.handler({
      original_content: '재테크 시작하기',
      content_element: 'title',
      variants_count: 5,
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.variants.length).toBe(5);
    expect(data.element_tested).toBe('title');
  });
});

describe('analyze_thumbnail', () => {
  it('scores thumbnails with detected elements', async () => {
    const tool = getTool('analyze_thumbnail');
    const result = await tool.handler({
      title: '먹방 챌린지',
      thumbnail_description: '놀란 표정의 사람과 음식 클로즈업, 노란 텍스트',
      platform: 'youtube',
      content_category: '먹방',
    });
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.detected_elements.face_detected).toBe(true);
    expect(data.detected_elements.bright_colors).toBe(true);
    expect(data.thumbnail_score).toBeGreaterThanOrEqual(70);
  });
});
