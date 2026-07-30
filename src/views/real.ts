// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// Based on au-retail by Ben Richardson — https://benrichardson.dev
//
// The signature cost-of-living view: turnover in dollars (nominal) vs quantity
// bought (real chain volume), rebased to a common base so the widening gap since
// 2021 is visible — dollars keep climbing while volumes flatten.

import type { Dataset } from '../types';
import { esc, delta, catColour } from '../format';
import { multiLine, legend } from '../charts';
import { gloss } from '../glossary';

let sel = 'AUS';

/** 12-month trailing sum of a monthly series (annualised, seasonality removed). */
function rolling12(m: (number | null)[]): (number | null)[] {
  const out = new Array(m.length).fill(null);
  for (let i = 11; i < m.length; i++) {
    let s = 0; let ok = true;
    for (let j = i - 11; j <= i; j++) { const v = m[j]; if (v === null || !Number.isFinite(v)) { ok = false; break; } s += v; }
    if (ok) out[i] = s;
  }
  return out;
}
/** 4-quarter trailing sum. */
function rolling4(q: (number | null)[]): (number | null)[] {
  const out = new Array(q.length).fill(null);
  for (let i = 3; i < q.length; i++) {
    let s = 0; let ok = true;
    for (let j = i - 3; j <= i; j++) { const v = q[j]; if (v === null || !Number.isFinite(v)) { ok = false; break; } s += v; }
    if (ok) out[i] = s;
  }
  return out;
}
function rebase(vals: (number | null)[], baseIdx: number): (number | null)[] {
  const b = vals[baseIdx];
  if (b === null || !b) return vals.map(() => null);
  return vals.map((v) => (v === null || !Number.isFinite(v) ? null : (v / b) * 100));
}

export function renderReal(root: HTMLElement, data: Dataset): void {
  const { national, meta } = data;
  const quarters = national.quarters;
  const qLabels = national.quarterLabels;

  const entities = [
    { code: 'AUS', label: 'All retail', colour: 'var(--accent-primary)', annNomMonthly: rolling12(national.ausTotal.nominalOrig), realSA_q: national.ausTotal.realSA_q },
    ...national.groups.map((g) => ({ code: g.code, label: g.short, colour: catColour(g.code), annNomMonthly: g.roll12, realSA_q: g.realSA_q })),
  ];
  const e = entities.find((x) => x.code === sel) ?? entities[0];

  // sample the monthly annualised-nominal series at each quarter's final month
  const endMonthIdx = quarters.map((q) => {
    const [y, qq] = q.split('-Q').map(Number);
    const mm = String(qq * 3).padStart(2, '0');
    return national.months.indexOf(`${y}-${mm}`);
  });
  const nomAnnQ = endMonthIdx.map((mi) => (mi >= 0 ? e.annNomMonthly[mi] : null));
  const realAnnQ = rolling4(e.realSA_q);

  // base quarter: 2004-Q1 if present, else first quarter both series are finite
  let baseIdx = quarters.indexOf('2004-Q1');
  if (baseIdx < 0 || nomAnnQ[baseIdx] === null || realAnnQ[baseIdx] === null) {
    baseIdx = quarters.findIndex((_, i) => nomAnnQ[i] !== null && realAnnQ[i] !== null);
  }
  const nomIdx = rebase(nomAnnQ, baseIdx);
  const realIdx = rebase(realAnnQ, baseIdx);

  // latest gap
  const lastI = (() => { for (let i = quarters.length - 1; i >= 0; i--) if (nomIdx[i] !== null && realIdx[i] !== null) return i; return -1; })();
  const gap = lastI >= 0 ? (nomIdx[lastI]! - realIdx[lastI]!) : null;

  // per-person real (chain volume) index vs total real index
  const realPerPerson = realAnnQ.map((v, i) => {
    const yr = Number(quarters[i].slice(0, 4));
    const pop = national.popAnnual[String(yr)] ?? national.popAnnual[String(yr - 1)];
    return v !== null && pop ? v / pop : null;
  });
  const realTotIdx = rebase(realAnnQ, baseIdx);
  const realPPIdx = rebase(realPerPerson, baseIdx);

  const idxFmt = (v: number) => v.toFixed(0);
  const chart = multiLine(
    [
      { key: 'nom', label: 'Dollars (nominal)', colour: '#c0563f', values: nomIdx },
      { key: 'real', label: 'Quantity (real)', colour: '#0f6e6e', values: realIdx },
    ],
    qLabels,
    { height: 360, valueFmt: idxFmt, yMinZero: false, annotations: meta.annotations.filter((a) => a.month >= '2004').map((a) => ({ at: quarters.indexOf(`${a.month.slice(0, 4)}-Q${Math.ceil(Number(a.month.slice(5, 7)) / 3)}`), text: a.text })).filter((a) => a.at >= 0) },
  );
  const chart2 = multiLine(
    [
      { key: 'tot', label: 'Real total', colour: '#0f6e6e', values: realTotIdx },
      { key: 'pp', label: 'Real per person', colour: '#b5642f', values: realPPIdx },
    ],
    qLabels,
    { height: 300, valueFmt: idxFmt, yMinZero: false },
  );

  root.innerHTML = `
    <div class="view-head">
      <h2>Are we buying more, or just paying more?</h2>
      <p>Retail turnover in ${gloss('current prices', 'dollars')} against ${gloss('chain volume', 'chain volume')} (the quantity actually bought), both indexed to 100 in ${esc(qLabels[baseIdx] ?? '')}. When the red line pulls away from the teal one, inflation — not extra shopping — is driving the dollar figures.</p>
    </div>

    <div class="controls">
      <span class="control-label">Category:</span>
      <div class="seg" role="group" aria-label="Category">
        ${entities.map((x) => `<button data-sel="${x.code}" aria-pressed="${x.code === sel}">${esc(x.label)}</button>`).join('')}
      </div>
    </div>

    <div class="stat-row">
      <div class="stat"><div class="stat-label">Year on year — dollars</div><div class="stat-value ${(yoy(e, nomAnnQ) ?? 0) >= 0 ? 'up' : 'down'}">${delta(yoy(e, nomAnnQ))}</div><div class="stat-note">current prices</div></div>
      <div class="stat"><div class="stat-label">Year on year — real</div><div class="stat-value ${(yoy(e, realAnnQ) ?? 0) >= 0 ? 'up' : 'down'}">${delta(yoy(e, realAnnQ))}</div><div class="stat-note">chain volume</div></div>
      <div class="stat"><div class="stat-label">Inflation gap since ${esc((qLabels[baseIdx] ?? '').split(' ')[1] ?? '')}</div><div class="stat-value">${gap !== null ? `${gap.toFixed(0)} pts` : '—'}</div><div class="stat-note">how far dollars ran ahead of volume</div></div>
    </div>

    <div class="panel">
      <div class="panel-head"><h3>Dollars vs quantity — ${esc(e.label)}</h3><p>Both lines start at 100. The gap between them is cumulative price growth.</p></div>
      <div class="chart-wrap">${chart}</div>
      ${legend([{ label: 'Dollars (nominal)', colour: '#c0563f' }, { label: 'Quantity (real)', colour: '#0f6e6e' }])}
    </div>

    <div class="panel">
      <div class="panel-head"><h3>Real spending, total vs per person</h3><p>Even the “real” quantity bought is flattered by a growing population. Per person (orange), real retail growth is far more subdued.</p></div>
      <div class="chart-wrap">${chart2}</div>
      ${legend([{ label: 'Real total', colour: '#0f6e6e' }, { label: 'Real per person', colour: '#b5642f' }])}
    </div>
  `;

  root.querySelectorAll<HTMLButtonElement>('[data-sel]').forEach((b) =>
    b.addEventListener('click', () => { sel = b.dataset.sel!; renderReal(root, data); }));
}

function yoy(_e: unknown, annQ: (number | null)[]): number | null {
  let last = -1; for (let i = annQ.length - 1; i >= 0; i--) if (annQ[i] !== null) { last = i; break; }
  if (last < 4 || annQ[last] === null || annQ[last - 4] === null || !annQ[last - 4]) return null;
  return (annQ[last]! / annQ[last - 4]!) - 1;
}
