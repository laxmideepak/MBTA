import { describe, expect, it } from 'vitest';
import { AMBER_DARKEN, BRAND_DARKEN_FACTOR, darkenRgb } from '../../src/utils/color';

describe('darkenRgb', () => {
  it('returns input unchanged when factor is 1.0', () => {
    expect(darkenRgb([200, 100, 50], 1.0)).toEqual([200, 100, 50]);
  });

  it('darkens by factor and rounds to integers', () => {
    // 200 * 0.7 = 140, 100 * 0.7 = 70, 50 * 0.7 = 35
    expect(darkenRgb([200, 100, 50], 0.7)).toEqual([140, 70, 35]);
  });

  it('returns black at factor 0', () => {
    expect(darkenRgb([200, 100, 50], 0)).toEqual([0, 0, 0]);
  });

  it('clamps out-of-range channels to [0, 255] before multiplying', () => {
    // 300 saturates to 255; -10 saturates to 0; 128 stays 128.
    expect(darkenRgb([300, -10, 128], 1)).toEqual([255, 0, 128]);
  });

  it('clamps factor above 1 down to 1 (no brightening)', () => {
    expect(darkenRgb([200, 100, 50], 1.5)).toEqual([200, 100, 50]);
  });

  it('clamps negative factor up to 0 (returns black)', () => {
    expect(darkenRgb([200, 100, 50], -0.5)).toEqual([0, 0, 0]);
  });
});

describe('BRAND_DARKEN_FACTOR', () => {
  it('darkens Red less aggressively than the default', () => {
    expect(BRAND_DARKEN_FACTOR.Red).toBe(0.78);
  });

  it('uses the standard 0.7 for Blue', () => {
    expect(BRAND_DARKEN_FACTOR.Blue).toBe(0.7);
  });

  it('uses the standard 0.7 for Mattapan', () => {
    expect(BRAND_DARKEN_FACTOR.Mattapan).toBe(0.7);
  });
});

describe('AMBER_DARKEN', () => {
  it('darkens delay amber less than the route brand default', () => {
    expect(AMBER_DARKEN).toBe(0.8);
  });
});
