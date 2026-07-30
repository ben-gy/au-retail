// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// Based on au-retail by Ben Richardson — https://benrichardson.dev

import type { Dataset } from '../types';
import { esc, money, perPerson, delta, pct, catColour, stateColour } from '../format';
import { multiLine, horizontalBars } from '../charts';
import { gloss } from '../glossary';
import { openRegion, openCategory, navigate } from '../main';

function stat(label: string, value: string, note: string, cls = ''): string {
  return `<div class="stat"><div class="stat-label">${esc(label)}</div><div class="stat-value ${cls}">${value}</div><div class="stat-note">${note}</div></div>`;
}

export function renderOverview(root: HTMLElement, data: Dataset): void {
  const { national, meta, states } = data;
  const h = meta.headline;
  const aus = states.find((s) => s.code === 'AUS');

  const catBars = [...national.groups]
    .sort((a, b) => (b.latest12 ?? 0) - (a.latest12 ?? 0))
    .map((g) => ({ label: g.name, value: g.latest12 ?? 0, colour: catColour(g.code), id: g.code, tipText: `${g.name}: ${money(g.latest12)} (${pct(g.share, 0)} of retail)`, fmt: (v: number) => money(v) }));

  const stateBars = states
    .filter((s) => s.code !== 'AUS' && s.perCapita !== null)
    .sort((a, b) => (b.perCapita ?? 0) - (a.perCapita ?? 0))
    .map((s) => ({ label: s.abbr, value: s.perCapita ?? 0, colour: stateColour(s.abbr), id: s.code, tipText: `${s.name}: ${perPerson(s.perCapita)} per person`, fmt: (v: number) => perPerson(v) }));

  const anns = meta.annotations.map((a) => ({ at: national.months.indexOf(a.month), text: a.text })).filter((a) => a.at >= 0);
  const line = multiLine(
    [{ key: 'sa', label: 'Monthly turnover (seasonally adj.)', colour: 'var(--accent-primary)', values: national.ausTotal.nominalSA }],
    national.monthLabels,
    { height: 320, valueFmt: (v) => money(v), annotations: anns, yMinZero: true },
  );

  root.innerHTML = `
    <div class="view-head">
      <h2>What Australia spends at the shops</h2>
      <p>Retail turnover from the ABS, ${esc(meta.firstMonthLabel)} to ${esc(meta.latestMonthLabel)}. The headline is a ${gloss('current prices', 'dollars')}-vs-${gloss('chain volume', 'volume')} story: spending keeps climbing, but a lot of that is prices, not extra shopping.</p>
    </div>

    <div class="stat-row">
      ${stat('Spent per year', money(h.annualTotal), `about ${money(h.latestMonthlyTotal)} a month`)}
      ${stat('Year on year — dollars', delta(h.yoyNominal), 'current prices', (h.yoyNominal ?? 0) >= 0 ? 'up' : 'down')}
      ${stat('Year on year — real', delta(h.yoyReal), 'chain volume', (h.yoyReal ?? 0) >= 0 ? 'up' : 'down')}
      ${stat('Biggest category', h.biggestGroup?.short ?? '—', `${pct(h.biggestGroup?.share ?? null, 0)} of spending`)}
      ${stat('Spent per person', perPerson(aus?.perCapita ?? null), 'national average / year')}
    </div>

    <div class="panel">
      <div class="panel-head"><h3>The long climb</h3><p>Total monthly retail turnover, ${gloss('seasonally adjusted', 'seasonally adjusted')} so the trend shows through the Christmas swing. Marked: one-off shocks. Hover for any month.</p></div>
      <div class="chart-wrap">${line}</div>
      <p class="mini-note">Dollars of the day (current prices). To separate real growth from inflation, see <a href="#v=real" class="inline-link" data-goto="real">Real vs nominal</a>.</p>
    </div>

    <div class="cols">
      <div class="panel">
        <div class="panel-head"><h3>Where the money goes</h3><p>Annual turnover by category. Click a bar for its detail.</p></div>
        <div class="chart-wrap">${horizontalBars(catBars, { width: 560, labelWidth: 150, valueFmt: (v) => money(v) })}</div>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Who spends most per person</h3><p>Annual retail turnover per resident. Click a bar for the state.</p></div>
        <div class="chart-wrap">${horizontalBars(stateBars, { width: 560, labelWidth: 54, valueFmt: (v) => perPerson(v) })}</div>
      </div>
    </div>
  `;

  root.querySelectorAll<SVGGElement>('.cols .panel:first-child .bar-row[data-id]').forEach((el) =>
    el.addEventListener('click', () => openCategory(el.dataset.id!)));
  root.querySelectorAll<SVGGElement>('.cols .panel:last-child .bar-row[data-id]').forEach((el) =>
    el.addEventListener('click', () => openRegion(el.dataset.id!)));
  root.querySelector<HTMLAnchorElement>('[data-goto="real"]')?.addEventListener('click', (e) => { e.preventDefault(); navigate({ view: 'real' }); });
}
