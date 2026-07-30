// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// Based on au-retail by Ben Richardson — https://benrichardson.dev
//
// Pure analysis reducers — turn the dataset into a ranked list of findings.

import type { Dataset } from './types';
import { money, pct, delta } from './format';

export interface Insight {
  severity: 'info' | 'good' | 'warn' | 'alert';
  title: string;
  body: string;
  action?: { label: string; view?: string; state?: string; cat?: string };
}

export function buildInsights(data: Dataset): Insight[] {
  const { national, meta, states } = data;
  const out: Insight[] = [];
  const g = national.groups;
  const cafes = g.find((x) => x.code === '46');
  const dept = g.find((x) => x.code === '44');
  const food = g.find((x) => x.code === '41');

  // 1. Nominal vs real gap — the cost-of-living headline.
  if (meta.headline.yoyNominal !== null && meta.headline.yoyReal !== null) {
    const gap = meta.headline.yoyNominal - meta.headline.yoyReal;
    out.push({
      severity: gap > 0.015 ? 'warn' : 'info',
      title: 'Dollars up, trolleys flat',
      body: `Over the past year retail turnover rose ${delta(meta.headline.yoyNominal)} in dollars but only ${delta(meta.headline.yoyReal)} once price rises are stripped out — a ${(gap * 100).toFixed(1)}-point gap. Most of the growth in what Australians spend is inflation, not extra shopping.`,
      action: { label: 'See real vs nominal', view: 'real' },
    });
  }

  // 2. Cafés overtook department stores.
  if (cafes?.latest12 && dept?.latest12) {
    const ratio = cafes.latest12 / dept.latest12;
    out.push({
      severity: 'info',
      title: 'Cafés now dwarf department stores',
      body: `Australians spend ${money(cafes.latest12)} a year at cafés, restaurants and takeaway — about ${ratio.toFixed(1)}× the ${money(dept.latest12)} spent in department stores. A generation ago the department store was king of the high street.`,
      action: { label: 'Explore categories', view: 'categories' },
    });
  }

  // 3. Fastest-growing and shrinking major category (year on year).
  const byGrowth = [...g].filter((x) => x.change !== null).sort((a, b) => (b.change ?? 0) - (a.change ?? 0));
  if (byGrowth.length) {
    const top = byGrowth[0]; const bot = byGrowth[byGrowth.length - 1];
    out.push({
      severity: 'good',
      title: `${top.name} is growing fastest`,
      body: `${top.name} turnover is up ${delta(top.change)} on a year ago — the fastest of the six major categories. The slowest is ${bot.name} at ${delta(bot.change)}.`,
      action: { label: 'Open categories', view: 'categories' },
    });
  }

  // 4. Food is the anchor.
  if (food?.share) {
    out.push({
      severity: 'info',
      title: 'Groceries anchor the retail dollar',
      body: `Food retailing is ${pct(food.share, 0)} of every retail dollar — the biggest category by far, and the most stable through downturns because people keep buying groceries.`,
      action: { label: 'Category detail', view: 'categories', cat: '41' },
    });
  }

  // 5. Highest spend per person (state).
  const perCap = states.filter((s) => s.code !== 'AUS' && s.perCapita !== null).sort((a, b) => (b.perCapita ?? 0) - (a.perCapita ?? 0));
  if (perCap.length) {
    const hi = perCap[0]; const lo = perCap[perCap.length - 1];
    out.push({
      severity: 'info',
      title: `${hi.name} spends the most per person`,
      body: `At ${money(hi.perCapita)} of retail turnover per resident a year, ${hi.name} tops the states — well above ${lo.name} on ${money(lo.perCapita)}. Per-person spending strips out the fact that big states simply have more people.`,
      action: { label: 'Open the map', view: 'map', state: hi.code },
    });
  }

  // 6. Fastest-growing state (real).
  const realStates = states.filter((s) => s.code !== 'AUS' && s.realChange !== null).sort((a, b) => (b.realChange ?? 0) - (a.realChange ?? 0));
  if (realStates.length) {
    const hi = realStates[0];
    out.push({
      severity: 'good',
      title: `${hi.name} leads real retail growth`,
      body: `After removing price rises, ${hi.name} retail volumes are up ${delta(hi.realChange)} over the year — the strongest of the states. Real growth is the honest measure of whether people are actually buying more.`,
      action: { label: 'Compare states', view: 'map', state: hi.code },
    });
  }

  // 7. Long-run scale.
  if (meta.headline.annualTotal) {
    out.push({
      severity: 'info',
      title: `A ${money(meta.headline.annualTotal)}-a-year habit`,
      body: `Australians now spend about ${money(meta.headline.annualTotal)} a year at the shops — roughly ${money((meta.headline.latestMonthlyTotal ?? 0))} every month. In ${meta.firstMonthLabel.split(' ')[1]} the monthly figure was a small fraction of today's.`,
      action: { label: 'See the timeline', view: 'overview' },
    });
  }

  return out;
}
