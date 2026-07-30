// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// Based on au-retail by Ben Richardson — https://benrichardson.dev
//
// Headless jsdom render of every non-map view + both drawers against the REAL
// committed data, asserting no NaN/undefined/Infinity leaks and that each view's
// signature marks are present. (The Leaflet map needs a real layout engine and
// is verified in the browser instead.)

import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Dataset } from '../src/types';
import { renderOverview } from '../src/views/overview';
import { renderCategories } from '../src/views/categories';
import { renderReal } from '../src/views/real';
import { renderTrends } from '../src/views/trends';
import { renderSeasonality } from '../src/views/seasonality';
import { renderExplorer } from '../src/views/explorer';
import { renderInsights } from '../src/views/insights';
import { renderRegionDrawer, renderCategoryDrawer } from '../src/drilldown';

function load(f: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', `${f}.json`), 'utf8'));
}

let data: Dataset;
beforeAll(() => {
  data = { national: load('national') as never, states: load('states') as never, meta: load('meta') as never };
});

function el(): HTMLElement { const d = document.createElement('div'); document.body.appendChild(d); return d; }
function clean(html: string): void {
  expect(html).not.toMatch(/\bNaN\b/);
  expect(html).not.toMatch(/undefined/);
  expect(html).not.toMatch(/Infinity/);
  expect(html.length).toBeGreaterThan(200);
}

describe('data integrity', () => {
  it('has the expected shape', () => {
    expect(data.national.months.length).toBeGreaterThan(400);
    expect(data.national.groups).toHaveLength(6);
    expect(data.states.some((s) => s.code === 'AUS')).toBe(true);
    expect(data.meta.gates.category.pass).toBe(true);
    expect(data.meta.gates.state.pass).toBe(true);
  });
  it('every group has finite headline numbers', () => {
    for (const g of data.national.groups) {
      expect(Number.isFinite(g.latest12 as number)).toBe(true);
      expect(Number.isFinite(g.change as number)).toBe(true);
    }
  });
});

describe('views render cleanly', () => {
  it('overview', () => { const c = el(); renderOverview(c, data); clean(c.innerHTML); expect(c.innerHTML).toContain('stat-value'); expect(c.querySelectorAll('svg.chart').length).toBeGreaterThan(0); });
  it('categories', () => { const c = el(); renderCategories(c, data); clean(c.innerHTML); expect(c.querySelector('.treemap')).toBeTruthy(); expect(c.querySelectorAll('.tm-cell').length).toBeGreaterThan(5); });
  it('real vs nominal', () => { const c = el(); renderReal(c, data); clean(c.innerHTML); expect(c.querySelectorAll('svg.chart').length).toBeGreaterThanOrEqual(2); });
  it('trends', () => { const c = el(); renderTrends(c, data); clean(c.innerHTML); expect(c.querySelector('svg.chart')).toBeTruthy(); });
  it('seasonality', () => { const c = el(); renderSeasonality(c, data); clean(c.innerHTML); expect(c.querySelector('table.heatmap')).toBeTruthy(); expect(c.querySelectorAll('.hm-cell').length).toBeGreaterThan(100); });
  it('explorer', () => { const c = el(); renderExplorer(c, data); clean(c.innerHTML); expect(c.querySelectorAll('.hist-bar').length).toBeGreaterThan(5); expect(c.querySelectorAll('tbody tr').length).toBeGreaterThan(10); });
  it('insights', () => { const c = el(); renderInsights(c, data); clean(c.innerHTML); expect(c.querySelectorAll('.insight').length).toBeGreaterThan(3); });
});

describe('drawers render cleanly', () => {
  it('region drawer (a state)', () => {
    const nsw = data.states.find((s) => s.code === '1')!;
    const c = el(); renderRegionDrawer(c, nsw, data); clean(c.innerHTML);
    expect(c.querySelector('.kv')).toBeTruthy();
    expect(c.querySelector('.mixbar')).toBeTruthy();
  });
  it('region drawer (Australia)', () => {
    const aus = data.states.find((s) => s.code === 'AUS')!;
    const c = el(); renderRegionDrawer(c, aus, data); clean(c.innerHTML);
  });
  it('category drawer', () => {
    const c = el(); renderCategoryDrawer(c, '46', data); clean(c.innerHTML);
    expect(c.querySelector('.cat-dot')).toBeTruthy();
  });
});
