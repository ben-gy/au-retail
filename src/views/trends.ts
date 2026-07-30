// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// Based on au-retail by Ben Richardson — https://benrichardson.dev

import type { Dataset } from '../types';
import { esc, delta, catColour } from '../format';
import { multiLine, horizontalBars, legend } from '../charts';
import { gloss } from '../glossary';
import { openCategory } from '../main';

let basis: 'nominal' | 'real' = 'real';

function rolling4(q: (number | null)[]): (number | null)[] {
  const out = new Array(q.length).fill(null);
  for (let i = 3; i < q.length; i++) {
    let s = 0; let ok = true;
    for (let j = i - 3; j <= i; j++) { const v = q[j]; if (v === null || !Number.isFinite(v)) { ok = false; break; } s += v; }
    if (ok) out[i] = s;
  }
  return out;
}
function firstFinite(rows: (number | null)[][]): number {
  const n = rows[0]?.length ?? 0;
  for (let i = 0; i < n; i++) if (rows.every((r) => r[i] !== null && Number.isFinite(r[i]))) return i;
  return 0;
}
function rebase(vals: (number | null)[], baseIdx: number): (number | null)[] {
  const b = vals[baseIdx];
  if (b === null || !b) return vals.map(() => null);
  return vals.map((v) => (v === null || !Number.isFinite(v) ? null : (v / b) * 100));
}

export function renderTrends(root: HTMLElement, data: Dataset): void {
  const { national } = data;
  const g = national.groups;

  const raw = basis === 'nominal'
    ? { labels: national.monthLabels, months: national.months, series: g.map((x) => x.roll12) }
    : { labels: national.quarterLabels, months: national.quarters, series: g.map((x) => rolling4(x.realSA_q)) };

  const baseIdx = firstFinite(raw.series);
  const rebased = raw.series.map((s) => rebase(s, baseIdx));
  const chart = multiLine(
    g.map((x, i) => ({ key: x.code, label: x.short, colour: catColour(x.code), values: rebased[i] })),
    raw.labels,
    { height: 400, valueFmt: (v) => v.toFixed(0), yMinZero: false },
  );

  // long-run growth: latest index minus 100
  const last = rebased.map((s) => { for (let i = s.length - 1; i >= 0; i--) if (s[i] !== null) return s[i] as number; return null; });
  const growth = g.map((x, i) => ({ code: x.code, name: x.name, value: last[i] !== null ? (last[i]! / 100 - 1) : 0 }))
    .sort((a, b) => b.value - a.value);
  const bars = growth.map((x) => ({ label: x.name, value: x.value, colour: catColour(x.code), id: x.code, fmt: (v: number) => delta(v, 0), tipText: `${x.name}: ${delta(x.value, 0)} since ${raw.labels[baseIdx]}` }));

  root.innerHTML = `
    <div class="view-head">
      <h2>Winners and losers, over the long run</h2>
      <p>Each category's turnover indexed to 100 at ${esc(raw.labels[baseIdx] ?? '')}, so you can compare a small category and a big one on one axis. In ${basis === 'real' ? gloss('chain volume', 'real (chain-volume)') : gloss('current prices', 'dollar')} terms, cafés and restaurants have pulled far ahead while department stores have gone nowhere.</p>
    </div>

    <div class="controls">
      <span class="control-label">Measure:</span>
      <div class="seg" role="group" aria-label="Measure">
        <button data-basis="real" aria-pressed="${basis === 'real'}">Real (quantity)</button>
        <button data-basis="nominal" aria-pressed="${basis === 'nominal'}">Dollars</button>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><h3>Category trajectories</h3><p>Indexed to 100 at the start. Hover for each category's index; click a legend entry's colour in the leaderboard below to drill in.</p></div>
      <div class="chart-wrap">${chart}</div>
      ${legend(g.map((x) => ({ label: x.short, colour: catColour(x.code) })))}
    </div>

    <div class="panel">
      <div class="panel-head"><h3>Total growth since ${esc(raw.labels[baseIdx] ?? '')}</h3><p>Cumulative growth in ${basis === 'real' ? 'quantity bought' : 'dollars spent'}. Click a bar for the category.</p></div>
      <div class="chart-wrap">${horizontalBars(bars, { width: 780, labelWidth: 190, valueFmt: (v) => delta(v, 0) })}</div>
    </div>
  `;

  root.querySelectorAll<HTMLButtonElement>('[data-basis]').forEach((b) =>
    b.addEventListener('click', () => { basis = b.dataset.basis as 'nominal' | 'real'; renderTrends(root, data); }));
  root.querySelectorAll<SVGGElement>('.bar-row[data-id]').forEach((el) =>
    el.addEventListener('click', () => openCategory(el.dataset.id!)));
}
