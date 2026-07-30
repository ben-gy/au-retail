// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// Based on au-retail by Ben Richardson — https://benrichardson.dev

import type { Dataset, Region } from './types';
import { esc, money, perPerson, pct, delta, tip, catColour, stateColour } from './format';
import { multiLine, horizontalBars } from './charts';
import { gloss } from './glossary';

function mixBar(region: Region): string {
  const segs = region.mix
    .filter((m) => m.share !== null)
    .map((m) => `<span style="width:${((m.share ?? 0) * 100).toFixed(2)}%;background:${catColour(m.code)}" data-tip="${tip(`${m.name}: ${money(m.latest12)} (${pct(m.share, 0)})`)}"></span>`)
    .join('');
  const legend = region.mix
    .map((m) => `<span class="legend-item"><span class="legend-swatch" style="background:${catColour(m.code)}"></span>${esc(m.short)} ${pct(m.share, 0)}</span>`)
    .join('');
  return `<div class="mixbar" style="width:100%;height:16px" role="img" aria-label="Category mix">${segs}</div><div class="legend" style="margin-top:8px">${legend}</div>`;
}

export function renderRegionDrawer(el: HTMLElement, region: Region, data: Dataset): void {
  const { states, national, meta } = data;
  const mappable = states.filter((s) => s.code !== 'AUS');
  const byTurnover = [...mappable].sort((a, b) => (b.latest12 ?? 0) - (a.latest12 ?? 0));
  const byPer = [...mappable].filter((s) => s.perCapita !== null).sort((a, b) => (b.perCapita ?? 0) - (a.perCapita ?? 0));
  const rankTurn = byTurnover.findIndex((s) => s.code === region.code) + 1;
  const rankPer = byPer.findIndex((s) => s.code === region.code) + 1;
  const isAus = region.code === 'AUS';

  const line = multiLine(
    [{ key: 'tot', label: 'Monthly turnover', colour: stateColour(region.abbr), values: region.totalMonthlyOrig }],
    national.monthLabels,
    { height: 210, valueFmt: (v) => money(v), annotations: meta.annotations.map((a) => ({ at: national.months.indexOf(a.month), text: a.text })).filter((a) => a.at >= 0), yMinZero: true },
  );

  el.innerHTML = `
    <button class="icon-btn drawer-close" aria-label="Close detail">✕</button>
    <h2>${esc(region.name)}</h2>
    <p class="sub"><span class="state-pill" style="background:${stateColour(region.abbr)};color:#fff">${esc(region.abbr)}</span>
      ${region.pop !== null ? `&nbsp;${(region.pop / 1e6).toFixed(2)}m residents` : ''}</p>

    <dl class="kv">
      <dt>${gloss('retail turnover', 'Annual retail turnover')}</dt><dd>${money(region.latest12)}</dd>
      ${isAus ? '' : `<dt>Rank by turnover</dt><dd>#${rankTurn} of ${mappable.length}</dd>`}
      <dt>${gloss('per capita', 'Spent per person / year')}</dt><dd>${perPerson(region.perCapita)}${!isAus && rankPer ? ` (#${rankPer})` : ''}</dd>
      <dt>${gloss('year on year', 'Year-on-year (dollars)')}</dt><dd class="${(region.change ?? 0) >= 0 ? 'up' : 'down'}">${delta(region.change)}</dd>
      <dt>Year-on-year (${gloss('chain volume', 'real')})</dt><dd class="${(region.realChange ?? 0) >= 0 ? 'up' : 'down'}">${delta(region.realChange)}</dd>
    </dl>

    <h3>Where the money goes</h3>
    ${mixBar(region)}

    <h3>Monthly turnover — ${esc(meta.firstMonthLabel)} to ${esc(meta.latestMonthLabel)}</h3>
    <div class="chart-wrap">${line}</div>
    <p class="mini-note">Original (unadjusted) monthly turnover, so the December peaks are real. Hover for the exact figure in any month.</p>
  `;
}

export function renderCategoryDrawer(el: HTMLElement, groupCode: string, data: Dataset): void {
  const { national, states, meta } = data;
  const g = national.groups.find((x) => x.code === groupCode);
  if (!g) { el.innerHTML = `<button class="icon-btn drawer-close" aria-label="Close">✕</button><p>Unknown category.</p>`; return; }

  const line = multiLine(
    [{ key: 'roll', label: 'Rolling 12-month turnover', colour: catColour(g.code), values: g.roll12 }],
    national.monthLabels,
    { height: 210, valueFmt: (v) => money(v), yMinZero: true, annotations: meta.annotations.map((a) => ({ at: national.months.indexOf(a.month), text: a.text })).filter((a) => a.at >= 0) },
  );

  // state breakdown for this category
  const stateBars = states
    .filter((s) => s.code !== 'AUS')
    .map((s) => {
      const m = s.mix.find((x) => x.code === g.code);
      return { label: s.abbr, value: m?.latest12 ?? 0, colour: stateColour(s.abbr), fmt: (v: number) => money(v), tipText: `${s.name}: ${money(m?.latest12)}` };
    })
    .sort((a, b) => b.value - a.value);

  el.innerHTML = `
    <button class="icon-btn drawer-close" aria-label="Close detail">✕</button>
    <h2><span class="cat-dot" style="background:${catColour(g.code)}"></span>${esc(g.name)}</h2>
    <p class="sub">${gloss('category', 'Retail category')} · ${pct(g.share, 0)} of all retail spending</p>

    <dl class="kv">
      <dt>Annual turnover</dt><dd>${money(g.latest12)}</dd>
      <dt>Share of retail</dt><dd>${pct(g.share, 0)}</dd>
      <dt>${gloss('year on year', 'Year-on-year (dollars)')}</dt><dd class="${(g.change ?? 0) >= 0 ? 'up' : 'down'}">${delta(g.change)}</dd>
      <dt>Year-on-year (${gloss('chain volume', 'real')})</dt><dd class="${(g.realChange ?? 0) >= 0 ? 'up' : 'down'}">${delta(g.realChange)}</dd>
    </dl>

    <h3>National turnover — rolling 12 months</h3>
    <div class="chart-wrap">${line}</div>

    <h3>By state</h3>
    <div class="chart-wrap">${horizontalBars(stateBars, { width: 500, labelWidth: 54, valueFmt: (v) => money(v) })}</div>
    <p class="mini-note">Annual turnover in this category by state. Hover for the exact figure.</p>
  `;
}
