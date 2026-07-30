// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// Based on au-retail by Ben Richardson — https://benrichardson.dev

import { describe, expect, it } from 'vitest';
import { histogramBins, ticks, fmtTick } from '../src/charts';

describe('histogramBins — positional correctness', () => {
  it('bins are contiguous, flush, and cover the range exactly', () => {
    const vals = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const bins = histogramBins(vals, 5);
    expect(bins).toHaveLength(5);
    // contiguous + flush: each bin's x1 equals the next bin's x0
    for (let i = 1; i < bins.length; i++) expect(bins[i].x0).toBeCloseTo(bins[i - 1].x1, 9);
    // spans exactly [min,max]
    expect(bins[0].x0).toBeCloseTo(0, 9);
    expect(bins[bins.length - 1].x1).toBeCloseTo(10, 9);
    // equal widths
    const w = bins[0].x1 - bins[0].x0;
    for (const b of bins) expect(b.x1 - b.x0).toBeCloseTo(w, 9);
  });

  it('every value is counted exactly once (no loss, no double-count)', () => {
    const vals = Array.from({ length: 137 }, (_, i) => Math.sin(i) * 50);
    const bins = histogramBins(vals, 20);
    expect(bins.reduce((a, b) => a + b.count, 0)).toBe(vals.length);
    expect(bins.reduce((a, b) => a + b.items.length, 0)).toBe(vals.length);
  });

  it('the max value lands in the last bin (closed on the right)', () => {
    const bins = histogramBins([1, 2, 3, 10], 3);
    expect(bins[bins.length - 1].count).toBeGreaterThanOrEqual(1);
    expect(bins[bins.length - 1].items).toContain(10);
  });

  it('handles a single unique value without NaN', () => {
    const bins = histogramBins([5, 5, 5], 4);
    expect(bins.reduce((a, b) => a + b.count, 0)).toBe(3);
    for (const b of bins) expect(Number.isFinite(b.x0) && Number.isFinite(b.x1)).toBe(true);
  });

  it('empty input → no bins', () => expect(histogramBins([], 10)).toEqual([]));
});

describe('ticks', () => {
  it('top tick sits at or above max', () => {
    for (const max of [1, 7, 37, 543, 9999, 36351.9e6]) {
      const t = ticks(max);
      expect(t[t.length - 1]).toBeGreaterThanOrEqual(max - 1e-6);
      // strictly increasing
      for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThan(t[i - 1]);
    }
  });
  it('non-positive max → [0]', () => { expect(ticks(0)).toEqual([0]); expect(ticks(-5)).toEqual([0]); });
});

describe('fmtTick', () => {
  it('compacts millions and billions', () => {
    expect(fmtTick(443.7e9)).toBe('444bn');
    expect(fmtTick(66.3e9)).toBe('66bn');
    expect(fmtTick(340e6)).toBe('340m');
    expect(fmtTick(1500)).toBe('2k');
  });
});
