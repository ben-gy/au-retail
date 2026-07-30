// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// Based on au-retail by Ben Richardson — https://benrichardson.dev

import type { Dataset, Region, IndustryRow } from '../types';
import { esc, money, delta, pct, tip, catColour, stateColour, growthColour } from '../format';
import { sparkline, histogramBins } from '../charts';
import { openRegion } from '../main';

interface Combo { region: Region; ind: IndustryRow; }
let regionSel = 'ALL';
let search = '';
let sortKey: 'turnover' | 'yoy' | 'share' = 'turnover';
let band: { x0: number; x1: number } | null = null;

function combos(data: Dataset): Combo[] {
  const regions = regionSel === 'ALL' ? data.states.filter((s) => s.code !== 'AUS') : data.states.filter((s) => s.code === regionSel);
  return regions.flatMap((r) => r.industries.map((ind) => ({ region: r, ind })));
}

export function renderExplorer(root: HTMLElement, data: Dataset, filter?: string): void {
  if (filter !== undefined) search = filter;
  const all = combos(data);
  const forHist = all.filter((c) => c.ind.change !== null).map((c) => c.ind.change as number);
  const bins = histogramBins(forHist, 24);

  const q = search.trim().toLowerCase();
  let rows = all.filter((c) => !q || c.ind.name.toLowerCase().includes(q) || c.region.name.toLowerCase().includes(q) || c.region.abbr.toLowerCase().includes(q));
  if (band) rows = rows.filter((c) => c.ind.change !== null && (c.ind.change as number) >= band!.x0 - 1e-9 && (c.ind.change as number) <= band!.x1 + 1e-9);
  rows.sort((a, b) => {
    if (sortKey === 'turnover') return (b.ind.latest12 ?? 0) - (a.ind.latest12 ?? 0);
    if (sortKey === 'yoy') return (b.ind.change ?? -Infinity) - (a.ind.change ?? -Infinity);
    return (b.ind.share ?? 0) - (a.ind.share ?? 0);
  });

  const regionOpts = [{ code: 'ALL', abbr: 'All states' }, ...data.states.filter((s) => s.code !== 'AUS').map((s) => ({ code: s.code, abbr: s.abbr })), { code: 'AUS', abbr: 'Australia' }];

  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  const HB_W = 720; const HB_H = 140; const padB = 16;
  const bw = HB_W / (bins.length || 1);
  const hist = `<svg class="chart" viewBox="0 0 ${HB_W} ${HB_H}" role="img" aria-label="Distribution of year-on-year change">
    ${bins.map((b, i) => {
      const h = (b.count / maxCount) * (HB_H - padB - 6);
      const x = i * bw; const y = HB_H - padB - h;
      const active = band && Math.abs(b.x0 - band.x0) < 1e-9;
      return `<rect class="hist-bar${active ? ' active' : ''}" x="${(x + 1).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" rx="1.5"
        fill="${active ? 'var(--accent-primary)' : growthColour((b.x0 + b.x1) / 2)}" style="cursor:pointer"
        data-x0="${b.x0}" data-x1="${b.x1}" data-tip="${tip(`${delta(b.x0, 0)} to ${delta(b.x1, 0)}\n${b.count} categories`)}"/>`;
    }).join('')}
    <line class="axis-line" x1="0" y1="${HB_H - padB}" x2="${HB_W}" y2="${HB_H - padB}"/>
    ${[0, 6, 12, 18, 23].map((i) => bins[i] ? `<text class="axis-text" x="${(i * bw + bw / 2).toFixed(1)}" y="${HB_H - 4}" text-anchor="middle">${delta(bins[i].x0, 0)}</text>` : '').join('')}
  </svg>`;

  root.innerHTML = `
    <div class="view-head">
      <h2>Explore every category, in every state</h2>
      <p>The full grid — each retail category in each state, with annual turnover, year-on-year change and a 40-year trend. Search, sort, or click the histogram to isolate the fastest movers.</p>
    </div>

    <div class="controls">
      <div class="seg" role="group" aria-label="Region">
        ${regionOpts.map((o) => `<button data-region="${o.code}" aria-pressed="${o.code === regionSel}">${esc(o.abbr)}</button>`).join('')}
      </div>
      <input type="search" id="explorer-search" placeholder="Search category or state…" value="${esc(search)}" aria-label="Search" />
      <div class="seg" role="group" aria-label="Sort">
        <button data-sort="turnover" aria-pressed="${sortKey === 'turnover'}">Turnover</button>
        <button data-sort="yoy" aria-pressed="${sortKey === 'yoy'}">Year on year</button>
        <button data-sort="share" aria-pressed="${sortKey === 'share'}">Share</button>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div><h3>Distribution of year-on-year change</h3><p>Each category–state combination, by its latest year-on-year change. Click a bar to filter the table; click again to clear.</p></div>
        ${band ? `<button class="link-btn" id="clear-band">Clear filter ✕</button>` : ''}
      </div>
      <div class="chart-wrap">${hist}</div>
    </div>

    <div class="panel">
      <div class="panel-head"><h3>${rows.length} categor${rows.length === 1 ? 'y' : 'ies'}</h3><p>Click a row to open that state's profile.</p></div>
      <div class="table-scroll">
        <table>
          <thead><tr><th>State</th><th>Category</th><th class="right">Annual turnover</th><th class="right">Share of state</th><th class="right">YoY</th><th>Trend</th></tr></thead>
          <tbody>
            ${rows.slice(0, 400).map((c) => `<tr class="clickable" data-region="${esc(c.region.code)}">
              <td><span class="state-pill" style="background:${stateColour(c.region.abbr)};color:#fff">${esc(c.region.abbr)}</span></td>
              <td class="region-name"><span class="cat-dot" style="background:${catColour(c.ind.groupCode)}"></span>${esc(c.ind.name)}${c.ind.isGroup ? '' : ' <span class="leaf-tag">sub</span>'}</td>
              <td class="right num">${money(c.ind.latest12)}</td>
              <td class="right num">${pct(c.ind.share, 1)}</td>
              <td class="right num" style="color:${growthColour(c.ind.change)}">${delta(c.ind.change)}</td>
              <td>${sparkline(c.ind.spark, 120, 24, catColour(c.ind.groupCode))}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        ${rows.length > 400 ? `<p class="mini-note">Showing the first 400 of ${rows.length}. Narrow with search or the histogram.</p>` : ''}
      </div>
    </div>
  `;

  root.querySelectorAll<HTMLButtonElement>('button[data-region]').forEach((b) =>
    b.addEventListener('click', () => { regionSel = b.dataset.region!; band = null; renderExplorer(root, data); }));
  root.querySelectorAll<HTMLButtonElement>('[data-sort]').forEach((b) =>
    b.addEventListener('click', () => { sortKey = b.dataset.sort as typeof sortKey; renderExplorer(root, data); }));
  const input = root.querySelector<HTMLInputElement>('#explorer-search')!;
  let t: number | undefined;
  input.addEventListener('input', () => { window.clearTimeout(t); t = window.setTimeout(() => { search = input.value; renderExplorer(root, data); const el = root.querySelector<HTMLInputElement>('#explorer-search'); el?.focus(); el?.setSelectionRange(el.value.length, el.value.length); }, 300); });
  root.querySelectorAll<SVGRectElement>('.hist-bar').forEach((r) =>
    r.addEventListener('click', () => {
      const x0 = Number(r.dataset.x0); const x1 = Number(r.dataset.x1);
      band = band && Math.abs(band.x0 - x0) < 1e-9 ? null : { x0, x1 };
      renderExplorer(root, data);
    }));
  root.querySelector<HTMLButtonElement>('#clear-band')?.addEventListener('click', () => { band = null; renderExplorer(root, data); });
  root.querySelectorAll<HTMLTableRowElement>('tr.clickable[data-region]').forEach((el) =>
    el.addEventListener('click', () => openRegion(el.dataset.region!)));
}
