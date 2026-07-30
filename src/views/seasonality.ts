// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// Based on au-retail by Ben Richardson — https://benrichardson.dev

import type { Dataset } from '../types';
import { money, tip } from '../format';
import { horizontalBars } from '../charts';
import { gloss } from '../glossary';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const RAMP = ['#33608f', '#6f97bd', '#b9cfe0', '#f2ede3', '#f4cf9e', '#e79a5a', '#cf5a2f'];

function rampColour(index: number): string {
  // index is month value / that year's mean (1.0 = average month)
  const stops = [0.7, 0.85, 0.95, 1.05, 1.15, 1.3];
  let i = 0; while (i < stops.length && index >= stops[i]) i++;
  return RAMP[i];
}

export function renderSeasonality(root: HTMLElement, data: Dataset): void {
  const { national } = data;
  const months = national.months;
  const vals = national.ausTotal.nominalOrig;

  // bucket into years → 12 monthly values
  const byYear = new Map<number, (number | null)[]>();
  for (let i = 0; i < months.length; i++) {
    const [y, mm] = months[i].split('-').map(Number);
    if (!byYear.has(y)) byYear.set(y, new Array(12).fill(null));
    byYear.get(y)![mm - 1] = vals[i];
  }
  const years = [...byYear.keys()].sort((a, b) => b - a);

  // per-cell index = value / year mean (over present months)
  const rows = years.map((y) => {
    const arr = byYear.get(y)!;
    const present = arr.filter((v): v is number => v !== null && Number.isFinite(v));
    const mean = present.length ? present.reduce((a, b) => a + b, 0) / present.length : 0;
    return { y, arr, mean };
  });

  // average month profile across full years (all 12 present)
  const profile = MONTHS.map((_, m) => {
    const idxs = rows.filter((r) => r.arr.every((v) => v !== null) && r.mean > 0).map((r) => (r.arr[m] as number) / r.mean);
    return idxs.length ? idxs.reduce((a, b) => a + b, 0) / idxs.length : 1;
  });

  const heat = `<table class="heatmap"><thead><tr><th>Year</th>${MONTHS.map((m) => `<th>${m}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr><th>${r.y}</th>${r.arr.map((v, m) => {
      if (v === null || !Number.isFinite(v) || r.mean <= 0) return `<td class="hm-cell empty" aria-hidden="true"></td>`;
      const idx = v / r.mean;
      return `<td class="hm-cell" style="background:${rampColour(idx)}" data-tip="${tip(`${MONTHS[m]} ${r.y}\n${money(v)}\n${(idx * 100).toFixed(0)}% of that year's average month`)}"></td>`;
    }).join('')}</tr>`).join('')}</tbody></table>`;

  const profileBars = MONTHS.map((m, i) => ({ label: m, value: profile[i], colour: rampColour(profile[i]), fmt: (x: number) => `${(x * 100).toFixed(0)}%`, tipText: `${m}: ${(profile[i] * 100).toFixed(0)}% of the average month` }));

  root.innerHTML = `
    <div class="view-head">
      <h2>The rhythm of the retail year</h2>
      <p>Retail has a huge, predictable pulse: December is always the biggest month by far, the summer sales feed January, and February is the quietest. This is why the headline figures are ${gloss('seasonally adjusted', 'seasonally adjusted')} — but here we show the raw ${gloss('original', 'original')} series precisely to reveal the pattern.</p>
    </div>

    <div class="panel">
      <div class="panel-head"><h3>Every month, every year</h3><p>Each cell is one month, shaded against that year's average month — warm is busier than average, cool is quieter. The bright December column runs down the whole record. Hover any cell.</p></div>
      <div class="scroll-x">${heat}</div>
      <div class="legend" style="margin-top:var(--space-md)">
        <span class="legend-item"><span class="legend-swatch" style="background:${RAMP[0]}"></span>quiet</span>
        <span class="legend-item"><span class="legend-swatch" style="background:${RAMP[3]}"></span>average</span>
        <span class="legend-item"><span class="legend-swatch" style="background:${RAMP[6]}"></span>busy</span>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><h3>The average month</h3><p>Averaged across every full year, as a share of the typical month (100% = average). December towers over the rest.</p></div>
      <div class="chart-wrap">${horizontalBars(profileBars, { width: 700, labelWidth: 54, valueFmt: (v) => `${(v * 100).toFixed(0)}%` })}</div>
    </div>
  `;
}
