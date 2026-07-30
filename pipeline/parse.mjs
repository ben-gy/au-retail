// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// Based on au-retail by Ben Richardson — https://benrichardson.dev
// Pure, dependency-free, network-free transforms for the ABS Retail Trade (RT)
// data. Everything here is unit-tested in tests/parse.test.ts and imported by
// aggregate.mjs — keep it free of `fs`/`fetch` so CI never installs anything.
//
// RT ships turnover as AUD in millions (UNIT_MULT 6). parseSdmxCsv normalises
// every value to base dollars so the app formats $/m/bn consistently.

// ── industry hierarchy ───────────────────────────────────────────────────────
// The six major groups, each the sum of its leaf industries; all six sum to
// Total (20). This structure is what the two reconciliation gates check.
export const GROUPS = [
  { code: '41', name: 'Food retailing', short: 'Food', subs: ['01', '02', '03'] },
  { code: '42', name: 'Household goods', short: 'Household goods', subs: ['04', '05', '06'] },
  { code: '43', name: 'Clothing & footwear', short: 'Clothing', subs: ['07', '08'] },
  { code: '44', name: 'Department stores', short: 'Dept stores', subs: ['09'] },
  { code: '45', name: 'Other retailing', short: 'Other', subs: ['10', '11', '12', '13'] },
  { code: '46', name: 'Cafés, restaurants & takeaway', short: 'Cafés & takeaway', subs: ['14', '15'] },
];
export const TOTAL = '20';

export const IND_NAME = {
  '20': 'Total retail',
  '41': 'Food retailing',
  '01': 'Supermarkets & grocery stores',
  '02': 'Liquor retailing',
  '03': 'Other specialised food retailing',
  '42': 'Household goods retailing',
  '04': 'Furniture, floor & houseware retailing',
  '05': 'Electrical & electronic goods retailing',
  '06': 'Hardware, building & garden retailing',
  '43': 'Clothing, footwear & accessory retailing',
  '07': 'Clothing retailing',
  '08': 'Footwear & other personal accessory retailing',
  '44': 'Department stores',
  '09': 'Department stores',
  '45': 'Other retailing',
  '10': 'Newspaper & book retailing',
  '11': 'Other recreational goods retailing',
  '12': 'Pharmaceutical, cosmetic & toiletry retailing',
  '13': 'Other retailing n.e.c.',
  '46': 'Cafés, restaurants & takeaway food services',
  '14': 'Cafés, restaurants & catering services',
  '15': 'Takeaway food services',
};

/** Which major group a leaf industry belongs to (leaf code → group code). */
export const GROUP_OF = (() => {
  const m = {};
  for (const g of GROUPS) for (const s of g.subs) m[s] = g.code;
  return m;
})();

export const LEAVES = GROUPS.flatMap((g) => g.subs);

// ── states ───────────────────────────────────────────────────────────────────
export const STATE = {
  1: { abbr: 'NSW', name: 'New South Wales' },
  2: { abbr: 'Vic', name: 'Victoria' },
  3: { abbr: 'Qld', name: 'Queensland' },
  4: { abbr: 'SA', name: 'South Australia' },
  5: { abbr: 'WA', name: 'Western Australia' },
  6: { abbr: 'Tas', name: 'Tasmania' },
  7: { abbr: 'NT', name: 'Northern Territory' },
  8: { abbr: 'ACT', name: 'Australian Capital Territory' },
  9: { abbr: 'Other', name: 'Other Territories' },
};
// Retail Trade publishes eight states + Australia (no "Other Territories"), and
// the eight states sum to Australia. These are the codes the state gate checks.
export const STATE_CODES = ['1', '2', '3', '4', '5', '6', '7', '8'];

// Embedded ABS Estimated Resident Population — the per-capita denominator.
// Factory-endorsed static table (never guessed); keeps ERP off the network path.
// State population: latest quarter (2025-Q4). National: June each year 1982–2025.
export const STATE_POP = {
  1: 8641085, 2: 7121913, 3: 5712124, 4: 1910553,
  5: 3076528, 6: 579110, 7: 267478, 8: 487202, 9: null,
};
export const POP_ANNUAL = {
  1982: 15184247, 1983: 15393472, 1984: 15579391, 1985: 15788312, 1986: 16018350,
  1987: 16263874, 1988: 16532164, 1989: 16814416, 1990: 17065128, 1991: 17284036,
  1992: 17478635, 1993: 17634808, 1994: 17805468, 1995: 18004882, 1996: 18224767,
  1997: 18423037, 1998: 18607584, 1999: 18812264, 2000: 19028802, 2001: 19274701,
  2002: 19495210, 2003: 19720737, 2004: 19932722, 2005: 20176844, 2006: 20450966,
  2007: 20827622, 2008: 21249199, 2009: 21691653, 2010: 22031750, 2011: 22340024,
  2012: 22733465, 2013: 23128129, 2014: 23475686, 2015: 23815995, 2016: 24190907,
  2017: 24592588, 2018: 24963258, 2019: 25334826, 2020: 25649248, 2021: 25685412,
  2022: 26018721, 2023: 26659922, 2024: 27194286, 2025: 27611026,
};

// ── CSV ──────────────────────────────────────────────────────────────────────
/** Split one CSV line, honouring double-quoted fields that may contain commas. */
export function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * Parse an ABS SDMX "data+csv" response into typed rows. Columns are addressed
 * by header NAME so a reordering upstream cannot silently misalign them. Values
 * are scaled by UNIT_MULT to base dollars.
 */
export function parseSdmxCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length);
  if (!lines.length) return [];
  const head = splitCsvLine(lines[0]);
  const col = (name) => head.indexOf(name);
  const iMeas = col('MEASURE');
  const iInd = col('INDUSTRY');
  const iTs = col('TSEST');
  const iReg = col('REGION');
  const iTime = col('TIME_PERIOD');
  const iVal = col('OBS_VALUE');
  const iMult = col('UNIT_MULT');
  if (iInd < 0 || iReg < 0 || iVal < 0 || iTime < 0) return [];
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const f = splitCsvLine(lines[i]);
    if (f.length < head.length) continue;
    // Number('') === 0, so an empty OBS_VALUE would be a false zero — skip it.
    if (f[iVal] === undefined || f[iVal].trim() === '') continue;
    const v = Number(f[iVal]);
    if (!Number.isFinite(v)) continue;
    const mult = iMult >= 0 ? Number(f[iMult]) : 0;
    rows.push({
      measure: f[iMeas],
      industry: f[iInd],
      tsest: iTs >= 0 ? f[iTs] : '',
      region: f[iReg],
      time: f[iTime],
      value: v * 10 ** (Number.isFinite(mult) ? mult : 0),
    });
  }
  return rows;
}

// ── nested series index ──────────────────────────────────────────────────────
/** rows → Map region → Map industry → Map time → value. */
export function indexRows(rows) {
  const idx = new Map();
  for (const r of rows) {
    let byInd = idx.get(r.region);
    if (!byInd) idx.set(r.region, (byInd = new Map()));
    let byTime = byInd.get(r.industry);
    if (!byTime) byInd.set(r.industry, (byTime = new Map()));
    byTime.set(r.time, r.value);
  }
  return idx;
}

/** Sorted distinct TIME_PERIODs for a given region+industry in the index. */
export function timeAxis(idx, region, industry) {
  const m = idx.get(region)?.get(industry);
  return m ? [...m.keys()].sort() : [];
}

/** Pull a value series for region+industry aligned to `axis` (null if absent). */
export function series(idx, region, industry, axis) {
  const m = idx.get(region)?.get(industry);
  return axis.map((t) => (m && m.has(t) ? m.get(t) : null));
}

// ── time helpers ─────────────────────────────────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function monthLabel(m) {
  const [y, mm] = m.split('-');
  return `${MONTHS[Number(mm) - 1]} ${y}`;
}
export function quarterLabel(q) {
  const [y, qq] = q.split('-');
  return `${qq} ${y}`;
}
/** Which quarter a "YYYY-MM" month falls in, as "YYYY-Qn". */
export function monthToQuarter(m) {
  const [y, mm] = m.split('-').map(Number);
  return `${y}-Q${Math.ceil(mm / 3)}`;
}

/** Rolling sum over the last `w` finite points; null until the window fills. */
export function rollingSum(values, w = 12) {
  const out = new Array(values.length).fill(null);
  for (let i = w - 1; i < values.length; i++) {
    let s = 0;
    let ok = true;
    for (let j = i - w + 1; j <= i; j++) {
      const v = values[j];
      if (v === null || !Number.isFinite(v)) { ok = false; break; }
      s += v;
    }
    if (ok) out[i] = s;
  }
  return out;
}

/** Sum of the `w` values ending at index `end` (inclusive). null if any gap. */
export function windowSum(values, end, w) {
  if (end - w + 1 < 0) return null;
  let s = 0;
  for (let j = end - w + 1; j <= end; j++) {
    const v = values[j];
    if (v === null || !Number.isFinite(v)) return null;
    s += v;
  }
  return s;
}

export function median(nums) {
  const a = nums.filter((n) => n !== null && Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

// ── reconciliation gates (pure) ──────────────────────────────────────────────
// A check fails only when it clears BOTH an absolute floor and a relative
// threshold. ABS rounds every published cell to $0.1m, so summing a handful of
// them drifts by a few hundred thousand dollars on a small base — which is a
// large RELATIVE error on a $5m category but meaningless. A genuine column
// shift or mis-join moves the total by tens to thousands of millions, far above
// both floors, so the gates still catch it. Values are base dollars.
const CAT_ABS = 0.6e6; // $0.6m — rounding of up to ~5 summed cells
const STATE_ABS = 1.2e6; // $1.2m — rounding of 8 states + the national total

function fails(abs, denom, absTol, relTol) {
  return abs > absTol && abs / denom > relTol;
}

/**
 * Gate 1 — category sum. For every region×month (original current prices), the
 * six major groups must sum to Total, and each group's leaf industries to the
 * group. A check only runs when every component is present (a blank leaf cell,
 * dropped at parse time, skips that check rather than counting as a zero).
 */
export function gateCategorySum(idx, regions, months, relTol = 0.01, absTol = CAT_ABS) {
  let worstAbs = 0;
  let worstRel = 0;
  let checks = 0;
  let fail = 0;
  const tally = (a, denom) => {
    checks++;
    if (a > worstAbs) worstAbs = a;
    const rel = a / denom;
    if (rel > worstRel) worstRel = rel;
    if (fails(a, denom, absTol, relTol)) fail++;
  };
  for (const reg of regions) {
    const byInd = idx.get(reg);
    if (!byInd) continue;
    for (const t of months) {
      const total = byInd.get(TOTAL)?.get(t);
      if (total === undefined || !(total > 0)) continue;
      // major groups → total
      let gsum = 0;
      let haveAll = true;
      for (const g of GROUPS) {
        const v = byInd.get(g.code)?.get(t);
        if (v === undefined) { haveAll = false; break; }
        gsum += v;
      }
      if (haveAll) tally(Math.abs(total - gsum), total);
      // each group → its leaves
      for (const g of GROUPS) {
        const gv = byInd.get(g.code)?.get(t);
        if (gv === undefined || !(gv > 0)) continue;
        let ssum = 0;
        let ok = true;
        for (const s of g.subs) {
          const v = byInd.get(s)?.get(t);
          if (v === undefined) { ok = false; break; }
          ssum += v;
        }
        if (ok) tally(Math.abs(gv - ssum), gv);
      }
    }
  }
  return { checks, fails: fail, worstAbs, worstRel, pass: fail === 0 && checks > 0 };
}

/**
 * Gate 2 — state sum. For every industry×month (original current prices), the
 * eight states must sum to Australia. Runs only when every state is present.
 */
export function gateStateSum(idx, industries, months, relTol = 0.005, absTol = STATE_ABS) {
  let worstAbs = 0;
  let worstRel = 0;
  let checks = 0;
  let fail = 0;
  for (const ind of industries) {
    for (const t of months) {
      const aus = idx.get('AUS')?.get(ind)?.get(t);
      if (aus === undefined || !(aus > 0)) continue;
      let ssum = 0;
      let haveAll = true;
      for (const sc of STATE_CODES) {
        const v = idx.get(sc)?.get(ind)?.get(t);
        if (v === undefined) { haveAll = false; break; }
        ssum += v;
      }
      if (!haveAll) continue;
      checks++;
      const abs = Math.abs(aus - ssum);
      if (abs > worstAbs) worstAbs = abs;
      const rel = abs / aus;
      if (rel > worstRel) worstRel = rel;
      if (fails(abs, aus, absTol, relTol)) fail++;
    }
  }
  return { checks, fails: fail, worstAbs, worstRel, pass: fail === 0 && checks > 0 };
}

// ── downsample for sparklines ────────────────────────────────────────────────
/** Keep every finite point whose month is June (or the last point) — ~annual. */
export function annualSample(values, months) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const isJune = months[i]?.endsWith('-06');
    const isLast = i === values.length - 1;
    if ((isJune || isLast) && values[i] !== null && Number.isFinite(values[i])) out.push(values[i]);
  }
  return out;
}
