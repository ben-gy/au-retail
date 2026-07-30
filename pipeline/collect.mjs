// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// Based on au-retail by Ben Richardson — https://benrichardson.dev
// Fetch the raw ABS Retail Trade slices into pipeline/tmp/. No shaping here —
// that lives in parse.mjs so it can be unit-tested without the network.
//
// Sources (all free, no auth — ABS Data API, dataflow RT):
//   1. nom_orig  M1 (current prices), ALL industries × ALL regions, ORIGINAL,
//                monthly — the reconciliation base and every nominal series.
//   2. nom_sa    M1 (current prices), Total(20) × ALL regions, SEAS. ADJ,
//                monthly — the smooth headline lines.
//   3. real_sa   M3 (chain volume), Total + 6 groups × ALL regions, SEAS. ADJ,
//                quarterly — the "real" (inflation-stripped) series.
// RT key order: MEASURE.INDUSTRY.TSEST.REGION.FREQ

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TMP = join(import.meta.dirname, 'tmp');
mkdirSync(TMP, { recursive: true });

const BASE = 'https://data.api.abs.gov.au/rest/data/ABS,RT,1.0.0/';
const CSV = 'application/vnd.sdmx.data+csv';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const HEADERS = {
  'user-agent': UA,
  accept: `${CSV}, text/csv, */*`,
  'accept-language': 'en-AU,en;q=0.9',
};
const ATTEMPT_TIMEOUT_MS = 120_000;

async function fetchText(key) {
  const url = `${BASE}${key}?dimensionAtObservation=AllDimensions`;
  let lastErr;
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(url, {
        headers: HEADERS,
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });
      if (res.status === 404) return '';
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      const wait = 4000 * 2 ** i;
      console.log(`  retry ${i + 1}/4 in ${wait}ms — ${err.message}`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

async function grab(name, key) {
  const text = await fetchText(key);
  const rows = text ? text.split('\n').length - 1 : 0;
  if (rows < 50) throw new Error(`${name}: only ${rows} rows from ${key} — source incomplete`);
  writeFileSync(join(TMP, `${name}.csv`), text);
  console.log(`  ${name}.csv  ${rows.toLocaleString()} rows`);
}

console.log('Fetching ABS Retail Trade (RT)…');
// 1. nominal, original, all industries × all regions, monthly
await grab('nom_orig', 'M1..10..M');
// 2. nominal, seasonally adjusted, Total only, all regions, monthly
await grab('nom_sa', 'M1.20.20..M');
// 3. real (chain volume), seasonally adjusted, all published industries × all regions, quarterly
await grab('real_sa', 'M3..20..Q');
console.log('Done.');
