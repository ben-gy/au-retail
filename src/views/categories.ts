// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// Based on au-retail by Ben Richardson — https://benrichardson.dev

import type { Dataset } from '../types';
import { esc, money, pct, delta, tip, catColour, growthColour } from '../format';
import { stackedArea, legend, clip } from '../charts';
import { squarify } from '../utils/squarify';
import { gloss } from '../glossary';
import { openCategory } from '../main';

let mode: 'share' | 'dollars' = 'share';

function treemap(data: Dataset): string {
  const W = 1000; const H = 440;
  const leaves = [...data.national.leaves].filter((l) => (l.latest12 ?? 0) > 0).sort((a, b) => (b.latest12 ?? 0) - (a.latest12 ?? 0));
  const rects = squarify(leaves.map((l) => l.latest12 ?? 0), W, H);
  const cells = rects.map((r, i) => {
    const l = leaves[i];
    const big = r.w > 120 && r.h > 34;
    const label = big
      ? `<text x="${r.x + 8}" y="${r.y + 18}" style="fill:#fff;font-size:13px;font-weight:600">${esc(clip(l.name, Math.floor(r.w / 8)))}</text>
         <text x="${r.x + 8}" y="${r.y + 34}" style="fill:rgba(255,255,255,.85);font-size:11px;font-family:var(--font-mono)">${esc(money(l.latest12))} · ${esc(delta(l.change))}</text>`
      : '';
    return `<g class="tm-cell" data-cat="${esc(l.groupCode)}" style="cursor:pointer" data-tip="${tip(`${l.name}\n${money(l.latest12)} a year (${pct(l.share, 0)} of retail)\nYear on year: ${delta(l.change)}`)}">
      <rect x="${r.x.toFixed(1)}" y="${r.y.toFixed(1)}" width="${r.w.toFixed(1)}" height="${r.h.toFixed(1)}" fill="${catColour(l.groupCode)}" stroke="var(--bg-panel)" stroke-width="1.5"/>
      ${label}</g>`;
  }).join('');
  return `<svg class="chart treemap" viewBox="0 0 ${W} ${H}" role="img" aria-label="Retail categories treemap">${cells}</svg>`;
}

export function renderCategories(root: HTMLElement, data: Dataset): void {
  const { national } = data;
  const start = 11; // first full 12-month window
  const labels = national.monthLabels.slice(start);
  const series = national.groups.map((g) => ({ key: g.code, label: g.short, colour: catColour(g.code), values: g.roll12.slice(start) }));
  const area = stackedArea(series, labels, { height: 380, percent: mode === 'share', valueFmt: (v) => money(v) });

  const board = [...national.groups].sort((a, b) => (b.latest12 ?? 0) - (a.latest12 ?? 0));

  root.innerHTML = `
    <div class="view-head">
      <h2>The changing shopping basket</h2>
      <p>How Australia's spending splits across the six retail ${gloss('category', 'categories')}, and how the mix has shifted over four decades — cafés and restaurants rising, department stores fading.</p>
    </div>

    <div class="panel">
      <div class="panel-head" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div><h3>Category mix over time</h3><p>Rolling 12-month turnover by category. Toggle between share of the retail dollar and absolute dollars.</p></div>
        <div class="seg" role="group" aria-label="Mode">
          <button data-mode="share" aria-pressed="${mode === 'share'}">Share</button>
          <button data-mode="dollars" aria-pressed="${mode === 'dollars'}">Dollars</button>
        </div>
      </div>
      <div class="chart-wrap">${area}</div>
      ${legend(national.groups.map((g) => ({ label: g.short, colour: catColour(g.code) })))}
    </div>

    <div class="panel">
      <div class="panel-head"><h3>The whole retail dollar, at a glance</h3><p>Every retail industry sized by annual turnover and coloured by category. Click any tile for its category. Hover for exact figures and year-on-year change.</p></div>
      <div class="chart-wrap treemap-wrap">${treemap(data)}</div>
    </div>

    <div class="panel">
      <div class="panel-head"><h3>Category leaderboard</h3><p>Click a row to drill into a category.</p></div>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Category</th><th class="right">Annual turnover</th><th class="right">Share</th><th class="right">YoY $</th><th class="right">YoY real</th></tr></thead>
          <tbody>
            ${board.map((g) => `<tr class="clickable" data-cat="${esc(g.code)}">
              <td class="region-name"><span class="cat-dot" style="background:${catColour(g.code)}"></span>${esc(g.name)}</td>
              <td class="right num">${money(g.latest12)}</td>
              <td class="right num">${pct(g.share, 0)}</td>
              <td class="right num ${(g.change ?? 0) >= 0 ? 'up' : 'down'}">${delta(g.change)}</td>
              <td class="right num" style="color:${growthColour(g.realChange)}">${delta(g.realChange)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) =>
    b.addEventListener('click', () => { mode = b.dataset.mode as 'share' | 'dollars'; renderCategories(root, data); }));
  root.querySelectorAll<Element>('.tm-cell[data-cat]').forEach((el) =>
    el.addEventListener('click', () => openCategory(el.getAttribute('data-cat')!)));
  root.querySelectorAll<HTMLTableRowElement>('tr.clickable[data-cat]').forEach((el) =>
    el.addEventListener('click', () => openCategory(el.dataset.cat!)));
}
