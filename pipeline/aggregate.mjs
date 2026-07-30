// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// Based on au-retail by Ben Richardson — https://benrichardson.dev
// Shape the raw ABS Retail Trade slices in tmp/ into the app's public/data JSON,
// run the reconciliation gates, and copy the vendored state boundaries. Pure
// transforms live in parse.mjs (unit-tested); this file is the I/O + assembly.

import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GROUPS, LEAVES, IND_NAME, GROUP_OF, TOTAL, STATE, STATE_CODES, STATE_POP, POP_ANNUAL,
  parseSdmxCsv, indexRows, timeAxis, series, rollingSum, windowSum, median,
  monthLabel, quarterLabel, monthToQuarter, annualSample,
  gateCategorySum, gateStateSum,
} from './parse.mjs';

const TMP = join(import.meta.dirname, 'tmp');
const ROOT = join(import.meta.dirname, '..');
const OUT = join(ROOT, 'public', 'data');
mkdirSync(OUT, { recursive: true });
const read = (f) => readFileSync(join(TMP, f), 'utf8');

const GEO_CODE = { 1: 'NSW', 2: 'VIC', 3: 'QLD', 4: 'SA', 5: 'WA', 6: 'TAS', 7: 'NT', 8: 'ACT', 9: null };

// ── parse ────────────────────────────────────────────────────────────────────
const idxNom = indexRows(parseSdmxCsv(read('nom_orig.csv'))); // original current prices, monthly
const idxSA = indexRows(parseSdmxCsv(read('nom_sa.csv'))); // seasonally adjusted, Total, monthly
const idxReal = indexRows(parseSdmxCsv(read('real_sa.csv'))); // chain volume SA, quarterly

const months = timeAxis(idxNom, 'AUS', TOTAL);
const quarters = timeAxis(idxReal, 'AUS', TOTAL);
if (months.length < 200) throw new Error(`only ${months.length} months — nominal source incomplete`);
if (quarters.length < 80) throw new Error(`only ${quarters.length} quarters — real source incomplete`);
const last = months.length - 1;
const lastQ = quarters.length - 1;

// ── reconciliation gates ─────────────────────────────────────────────────────
const gateCat = gateCategorySum(idxNom, ['AUS', ...STATE_CODES], months);
const gateState = gateStateSum(idxNom, [TOTAL, ...GROUPS.map((g) => g.code)], months);
console.log('Gate 1 (category sum):', JSON.stringify(gateCat));
console.log('Gate 2 (state sum):   ', JSON.stringify(gateState));
if (!gateCat.pass) throw new Error(`category gate failed: ${gateCat.fails}/${gateCat.checks} (worstRel ${gateCat.worstRel})`);
if (!gateState.pass) throw new Error(`state gate failed: ${gateState.fails}/${gateState.checks} (worstRel ${gateState.worstRel})`);

// ── AUS totals ───────────────────────────────────────────────────────────────
const ausTotOrig = series(idxNom, 'AUS', TOTAL, months);
const ausTotSA = series(idxSA, 'AUS', TOTAL, months);

// Fold monthly SA into complete quarters, aligned to the real-series axis.
function monthlyToQuarterly(monthly) {
  const bucket = new Map();
  for (let i = 0; i < months.length; i++) {
    const v = monthly[i];
    if (v === null || !Number.isFinite(v)) continue;
    const q = monthToQuarter(months[i]);
    const b = bucket.get(q) ?? { sum: 0, n: 0 };
    b.sum += v; b.n += 1; bucket.set(q, b);
  }
  return quarters.map((q) => {
    const b = bucket.get(q);
    return b && b.n === 3 ? b.sum : null;
  });
}
const ausNomSA_q = monthlyToQuarterly(ausTotSA);
const ausRealSA_q = series(idxReal, 'AUS', TOTAL, quarters);

const ausLatest12 = windowSum(ausTotOrig, last, 12);

// real YoY from last 4 vs prior 4 quarters
function realYoY(reg, ind) {
  const s = series(idxReal, reg, ind, quarters);
  const l = windowSum(s, lastQ, 4);
  const p = windowSum(s, lastQ - 4, 4);
  return { latest: l, prev: p, change: l && p ? l / p - 1 : null };
}

// ── national groups + leaves ─────────────────────────────────────────────────
const groups = GROUPS.map((g) => {
  const monthly = series(idxNom, 'AUS', g.code, months);
  const roll12 = rollingSum(monthly, 12);
  const latest12 = windowSum(monthly, last, 12);
  const prev12 = windowSum(monthly, last - 12, 12);
  const r = realYoY('AUS', g.code);
  return {
    code: g.code, name: g.name, short: g.short,
    roll12,
    latest12, prev12,
    change: latest12 && prev12 ? latest12 / prev12 - 1 : null,
    share: latest12 && ausLatest12 ? latest12 / ausLatest12 : null,
    realSA_q: series(idxReal, 'AUS', g.code, quarters),
    realLatest12: r.latest, realPrev12: r.prev, realChange: r.change,
  };
});

const leaves = LEAVES.map((code) => {
  const monthly = series(idxNom, 'AUS', code, months);
  const latest12 = windowSum(monthly, last, 12);
  const prev12 = windowSum(monthly, last - 12, 12);
  return {
    code, name: IND_NAME[code], groupCode: GROUP_OF[code],
    latest12, prev12,
    change: latest12 && prev12 ? latest12 / prev12 - 1 : null,
    share: latest12 && ausLatest12 ? latest12 / ausLatest12 : null,
  };
});

// ── states (+ AUS as a region) ───────────────────────────────────────────────
function buildRegion(regCode) {
  const totalMonthly = series(idxNom, regCode, TOTAL, months);
  const latest12 = windowSum(totalMonthly, last, 12);
  const prev12 = windowSum(totalMonthly, last - 12, 12);
  const pop = regCode === 'AUS' ? POP_ANNUAL[Math.max(...Object.keys(POP_ANNUAL).map(Number))] : STATE_POP[Number(regCode)];
  const r = realYoY(regCode, TOTAL);

  // category mix (6 groups)
  const mix = GROUPS.map((g) => {
    const l = windowSum(series(idxNom, regCode, g.code, months), last, 12);
    return { code: g.code, short: g.short, name: g.name, latest12: l, share: l && latest12 ? l / latest12 : null };
  });

  // per-industry rows for the Explorer (groups + leaves where the region has data)
  const industries = [];
  for (const g of GROUPS) {
    pushIndustry(industries, regCode, g.code, IND_NAME[g.code], g.code, true, latest12);
    for (const s of g.subs) pushIndustry(industries, regCode, s, IND_NAME[s], g.code, false, latest12);
  }

  const meta = STATE[Number(regCode)];
  return {
    code: regCode,
    abbr: regCode === 'AUS' ? 'AUS' : meta.abbr,
    name: regCode === 'AUS' ? 'Australia' : meta.name,
    geoCode: regCode === 'AUS' ? null : GEO_CODE[Number(regCode)],
    pop: pop ?? null,
    totalMonthlyOrig: totalMonthly,
    latest12, prev12,
    change: latest12 && prev12 ? latest12 / prev12 - 1 : null,
    realLatest12: r.latest, realPrev12: r.prev, realChange: r.change,
    perCapita: latest12 && pop ? latest12 / pop : null,
    mix,
    industries,
  };
}

function pushIndustry(arr, regCode, code, name, groupCode, isGroup, regTotal12) {
  const monthly = series(idxNom, regCode, code, months);
  const latest12 = windowSum(monthly, last, 12);
  if (latest12 === null) return; // region doesn't publish this leaf
  const prev12 = windowSum(monthly, last - 12, 12);
  arr.push({
    code, name, groupCode, isGroup,
    latest12, prev12,
    change: latest12 && prev12 ? latest12 / prev12 - 1 : null,
    share: latest12 && regTotal12 ? latest12 / regTotal12 : null,
    spark: annualSample(rollingSum(monthly, 12), months),
  });
}

const states = [...STATE_CODES.filter((c) => idxNom.has(c)), 'AUS'].map(buildRegion);
const mapStates = states.filter((s) => s.code !== 'AUS' && s.geoCode); // 8 states with polygons

// ── medians across mappable states ───────────────────────────────────────────
const medians = {
  change: median(mapStates.map((s) => s.change)),
  perCapita: median(mapStates.map((s) => s.perCapita)),
  realChange: median(mapStates.map((s) => s.realChange)),
};

// ── headline ─────────────────────────────────────────────────────────────────
const ausReal = realYoY('AUS', TOTAL);
const cafes = groups.find((g) => g.code === '46');
const dept = groups.find((g) => g.code === '44');
const biggest = [...groups].sort((a, b) => (b.latest12 ?? 0) - (a.latest12 ?? 0))[0];

const annotations = [
  { month: '2000-07', text: 'GST introduced' },
  { month: '2008-10', text: 'GFC' },
  { month: '2020-03', text: 'COVID panic-buy' },
  { month: '2020-04', text: 'First lockdown' },
  { month: '2022-05', text: 'Rate hikes begin' },
].filter((a) => months.includes(a.month));

const meta = {
  generated: new Date().toISOString(),
  firstMonth: months[0], firstMonthLabel: monthLabel(months[0]),
  latestMonth: months[last], latestMonthLabel: monthLabel(months[last]),
  latestQuarter: quarters[lastQ], latestQuarterLabel: quarterLabel(quarters[lastQ]),
  headline: {
    latestMonthlyTotal: ausTotSA[last] ?? ausTotOrig[last],
    latestMonthlyOrig: ausTotOrig[last],
    annualTotal: ausLatest12,
    yoyNominal: (windowSum(ausTotOrig, last, 12) && windowSum(ausTotOrig, last - 12, 12))
      ? windowSum(ausTotOrig, last, 12) / windowSum(ausTotOrig, last - 12, 12) - 1 : null,
    yoyReal: ausReal.change,
    biggestGroup: biggest ? { code: biggest.code, name: biggest.name, short: biggest.short, share: biggest.share } : null,
    cafes12: cafes?.latest12 ?? null,
    dept12: dept?.latest12 ?? null,
  },
  counts: { months: months.length, quarters: quarters.length, states: mapStates.length, groups: groups.length, leaves: leaves.length },
  medians,
  annotations,
  gates: { category: gateCat, state: gateState },
  source: {
    retail: 'https://www.abs.gov.au/statistics/industry/retail-and-wholesale-trade/retail-trade-australia',
    api: 'https://data.api.abs.gov.au/rest/data/ABS,RT,1.0.0',
    erp: 'https://www.abs.gov.au/statistics/people/population/national-state-and-territory-population',
    boundaries: 'https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3',
  },
};

const national = {
  months, monthLabels: months.map(monthLabel),
  quarters, quarterLabels: quarters.map(quarterLabel),
  ausTotal: {
    nominalSA: ausTotSA,
    nominalOrig: ausTotOrig,
    nominalSA_q: ausNomSA_q,
    realSA_q: ausRealSA_q,
  },
  groups,
  leaves,
  popAnnual: POP_ANNUAL,
};

// ── boundaries ───────────────────────────────────────────────────────────────
// Vendored in-repo (pipeline/au-states.geojson, ABS ASGS states) so the CI data
// pipeline reconciles without the factory patterns dir.
copyFileSync(join(import.meta.dirname, 'au-states.geojson'), join(OUT, 'boundaries.geojson'));

// ── write ────────────────────────────────────────────────────────────────────
writeFileSync(join(OUT, 'meta.json'), JSON.stringify(meta, null, 2));
writeFileSync(join(OUT, 'national.json'), JSON.stringify(national));
writeFileSync(join(OUT, 'states.json'), JSON.stringify(states));

const kb = (f) => Math.round(statSync(join(OUT, f)).size / 1024);
console.log('Wrote:');
for (const f of ['meta.json', 'national.json', 'states.json', 'boundaries.geojson']) console.log(`  ${f}  ${kb(f)} KB`);
console.log(`  window ${meta.firstMonthLabel} .. ${meta.latestMonthLabel} (${months.length} months, ${quarters.length} quarters)`);
console.log(`  AUS annual turnover $${(ausLatest12 / 1e9).toFixed(1)}bn; YoY nominal ${(meta.headline.yoyNominal * 100).toFixed(1)}% real ${(meta.headline.yoyReal * 100).toFixed(1)}%`);
console.log(`  biggest group: ${biggest.name} (${(biggest.share * 100).toFixed(0)}%); cafés $${(cafes.latest12 / 1e9).toFixed(1)}bn vs dept stores $${(dept.latest12 / 1e9).toFixed(1)}bn`);
