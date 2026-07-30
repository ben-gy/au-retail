// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// Based on au-retail by Ben Richardson — https://benrichardson.dev

export interface GroupSeries {
  code: string;
  name: string;
  short: string;
  /** Rolling 12-month nominal turnover, one per month (null until window fills). */
  roll12: (number | null)[];
  latest12: number | null;
  prev12: number | null;
  change: number | null;
  share: number | null;
  /** Quarterly real (chain-volume) turnover level. */
  realSA_q: (number | null)[];
  realLatest12: number | null;
  realPrev12: number | null;
  realChange: number | null;
}

export interface LeafSeries {
  code: string;
  name: string;
  groupCode: string;
  latest12: number | null;
  prev12: number | null;
  change: number | null;
  share: number | null;
}

export interface National {
  months: string[];
  monthLabels: string[];
  quarters: string[];
  quarterLabels: string[];
  ausTotal: {
    nominalSA: (number | null)[];
    nominalOrig: (number | null)[];
    nominalSA_q: (number | null)[];
    realSA_q: (number | null)[];
  };
  groups: GroupSeries[];
  leaves: LeafSeries[];
  popAnnual: Record<string, number>;
}

export interface IndustryRow {
  code: string;
  name: string;
  groupCode: string;
  isGroup: boolean;
  latest12: number | null;
  prev12: number | null;
  change: number | null;
  share: number | null;
  spark: number[];
}

export interface MixItem {
  code: string;
  short: string;
  name: string;
  latest12: number | null;
  share: number | null;
}

export interface Region {
  code: string;
  abbr: string;
  name: string;
  geoCode: string | null;
  pop: number | null;
  totalMonthlyOrig: (number | null)[];
  latest12: number | null;
  prev12: number | null;
  change: number | null;
  realLatest12: number | null;
  realPrev12: number | null;
  realChange: number | null;
  perCapita: number | null;
  mix: MixItem[];
  industries: IndustryRow[];
}

export interface Meta {
  generated: string;
  firstMonth: string; firstMonthLabel: string;
  latestMonth: string; latestMonthLabel: string;
  latestQuarter: string; latestQuarterLabel: string;
  headline: {
    latestMonthlyTotal: number | null;
    latestMonthlyOrig: number | null;
    annualTotal: number | null;
    yoyNominal: number | null;
    yoyReal: number | null;
    biggestGroup: { code: string; name: string; short: string; share: number | null } | null;
    cafes12: number | null;
    dept12: number | null;
  };
  counts: { months: number; quarters: number; states: number; groups: number; leaves: number };
  medians: { change: number | null; perCapita: number | null; realChange: number | null };
  annotations: { month: string; text: string }[];
  gates: {
    category: { checks: number; fails: number; worstAbs: number; worstRel: number; pass: boolean };
    state: { checks: number; fails: number; worstAbs: number; worstRel: number; pass: boolean };
  };
  source: Record<string, string>;
}

export interface Dataset {
  national: National;
  states: Region[];
  meta: Meta;
}
