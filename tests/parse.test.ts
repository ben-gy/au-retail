// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// Based on au-retail by Ben Richardson — https://benrichardson.dev

import { describe, expect, it } from 'vitest';
import {
  splitCsvLine, parseSdmxCsv, indexRows, timeAxis, series, rollingSum, windowSum,
  median, monthLabel, quarterLabel, monthToQuarter, annualSample,
  gateCategorySum, gateStateSum, GROUPS, STATE_CODES, TOTAL,
} from '../pipeline/parse.mjs';

describe('splitCsvLine', () => {
  it('splits a plain line', () => expect(splitCsvLine('a,b,c')).toEqual(['a', 'b', 'c']));
  it('honours quoted commas', () => expect(splitCsvLine('a,"b,c",d')).toEqual(['a', 'b,c', 'd']));
  it('handles escaped quotes', () => expect(splitCsvLine('"he said ""hi""",x')).toEqual(['he said "hi"', 'x']));
  it('keeps trailing empty field', () => expect(splitCsvLine('a,b,')).toEqual(['a', 'b', '']));
});

const HEAD = 'DATAFLOW,MEASURE,INDUSTRY,TSEST,REGION,TIME_PERIOD,OBS_VALUE,UNIT_MEASURE,UNIT_MULT,OBS_STATUS,OBS_COMMENT';
const row = (ind: string, reg: string, t: string, v: string) => `ABS:RT(1.0.0),M1,${ind},10,${reg},${t},${v},AUD,6,,`;

describe('parseSdmxCsv', () => {
  it('addresses columns by name and scales UNIT_MULT to dollars', () => {
    const rows = parseSdmxCsv(`${HEAD}\n${row('20', 'AUS', '2025-06', '36351.9')}`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ measure: 'M1', industry: '20', region: 'AUS', time: '2025-06' });
    expect(rows[0].value).toBeCloseTo(36351.9e6, 0); // millions → dollars
  });
  it('drops blank OBS_VALUE (never a false zero)', () => {
    const rows = parseSdmxCsv(`${HEAD}\n${row('20', 'AUS', '2025-06', '')}\n${row('20', '1', '2025-06', '10')}`);
    expect(rows).toHaveLength(1);
    expect(rows[0].region).toBe('1');
  });
  it('returns [] for empty input', () => expect(parseSdmxCsv('')).toEqual([]));
});

describe('index + series', () => {
  const csv = `${HEAD}\n${row('20', 'AUS', '2025-04', '1')}\n${row('20', 'AUS', '2025-05', '2')}\n${row('41', 'AUS', '2025-05', '3')}`;
  const idx = indexRows(parseSdmxCsv(csv));
  it('builds region→industry→time', () => {
    expect(timeAxis(idx, 'AUS', '20')).toEqual(['2025-04', '2025-05']);
    expect(series(idx, 'AUS', '20', ['2025-04', '2025-05', '2025-06'])).toEqual([1e6, 2e6, null]);
  });
});

describe('rollingSum + windowSum', () => {
  it('rolling 3 sum with leading nulls', () => {
    expect(rollingSum([1, 2, 3, 4], 3)).toEqual([null, null, 6, 9]);
  });
  it('nulls break the window', () => {
    expect(rollingSum([1, null, 3, 4], 3)).toEqual([null, null, null, null]);
  });
  it('windowSum sums the trailing w', () => {
    expect(windowSum([1, 2, 3, 4], 3, 2)).toBe(7);
    expect(windowSum([1, 2], 0, 2)).toBeNull();
  });
});

describe('median', () => {
  it('odd + even', () => { expect(median([3, 1, 2])).toBe(2); expect(median([1, 2, 3, 4])).toBe(2.5); });
  it('ignores non-finite', () => expect(median([1, null as unknown as number, 3])).toBe(2));
  it('empty → null', () => expect(median([])).toBeNull());
});

describe('time helpers', () => {
  it('monthLabel', () => expect(monthLabel('2025-06')).toBe('Jun 2025'));
  it('quarterLabel', () => expect(quarterLabel('2025-Q2')).toBe('Q2 2025'));
  it('monthToQuarter', () => {
    expect(monthToQuarter('2025-01')).toBe('2025-Q1');
    expect(monthToQuarter('2025-06')).toBe('2025-Q2');
    expect(monthToQuarter('2025-12')).toBe('2025-Q4');
  });
  it('annualSample keeps Junes + last', () => {
    const months = ['2023-05', '2023-06', '2023-07', '2024-06'];
    expect(annualSample([1, 2, 3, 4], months)).toEqual([2, 4]);
  });
});

// ── gates: build a tiny consistent cube, then break it deliberately ──────────
function buildCube(mutate?: (m: Record<string, number>) => void): string {
  // one month, AUS + all states, Total + 6 groups + leaves; states sum to AUS.
  const months = ['2025-06'];
  const regions = ['AUS', ...STATE_CODES];
  // per-region leaf values (small integers, in $m); groups + total derived.
  const leafBase: Record<string, number> = { '01': 100, '02': 30, '03': 20, '04': 40, '05': 25, '06': 35, '07': 22, '08': 8, '09': 18, '10': 5, '11': 12, '12': 15, '13': 10, '14': 28, '15': 14 };
  const lines: string[] = [];
  const acc: Record<string, number> = {};
  for (let ri = 0; ri < regions.length; ri++) {
    const reg = regions[ri];
    const scale = reg === 'AUS' ? 8 : 1; // AUS = sum of 8 states
    const vals: Record<string, number> = {};
    for (const [leaf, base] of Object.entries(leafBase)) vals[leaf] = base * scale;
    for (const g of GROUPS) vals[g.code] = g.subs.reduce((a: number, s: string) => a + vals[s], 0);
    vals[TOTAL] = GROUPS.reduce((a, g) => a + vals[g.code], 0);
    if (mutate && reg === '1') mutate(vals); // corrupt NSW only
    for (const [ind, v] of Object.entries(vals)) {
      acc[`${reg}|${ind}`] = v;
      lines.push(`ABS:RT(1.0.0),M1,${ind},10,${reg},${months[0]},${v},AUD,6,,`);
    }
  }
  void acc;
  return `${HEAD}\n${lines.join('\n')}`;
}

describe('reconciliation gates', () => {
  const idx = indexRows(parseSdmxCsv(buildCube()));
  const months = ['2025-06'];

  it('category gate PASSES on a consistent cube', () => {
    const g = gateCategorySum(idx, ['AUS', ...STATE_CODES], months);
    expect(g.pass).toBe(true);
    expect(g.checks).toBeGreaterThan(0);
    expect(g.worstAbs).toBeLessThan(1); // exact by construction
  });
  it('state gate PASSES on a consistent cube', () => {
    const g = gateStateSum(idx, [TOTAL, ...GROUPS.map((x) => x.code)], months);
    expect(g.pass).toBe(true);
    expect(g.checks).toBeGreaterThan(0);
  });

  it('category gate FAILS when a leaf column is shifted (Food leaves no longer sum)', () => {
    // bump one leaf by $500m after the group/total were derived → leaves no
    // longer sum to their group. This is the signature of a mis-joined column.
    const bad = indexRows(parseSdmxCsv(buildCube((m) => { m['01'] += 500; })));
    const g = gateCategorySum(bad, ['AUS', ...STATE_CODES], months);
    expect(g.pass).toBe(false);
    expect(g.fails).toBeGreaterThan(0);
  });

  it('state gate FAILS when a state total is corrupted', () => {
    const bad = indexRows(parseSdmxCsv(buildCube((m) => { m[TOTAL] += 999; })));
    const g = gateStateSum(bad, [TOTAL], months);
    expect(g.pass).toBe(false);
  });

  it('gates tolerate sub-million rounding noise', () => {
    const noisy = indexRows(parseSdmxCsv(buildCube((m) => { m['01'] += 0.2; }))); // +$0.2m
    const g = gateCategorySum(noisy, ['1'], months);
    expect(g.pass).toBe(true); // within the absolute floor
  });
});
