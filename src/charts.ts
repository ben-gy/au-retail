// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// Based on au-retail by Ben Richardson — https://benrichardson.dev
//
// Hand-rolled SVG chart primitives. No chart library — every mark needs a
// [data-tip] hover anyway. Pure layout maths (histogramBins, heatmapCell) are
// exported for the positional tests.

import { esc, tip } from './format';

/** Nice round tick values covering [0, max]; the top tick sits at or past max. */
export function ticks(max: number, count = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
  const out: number[] = [];
  for (let v = 0; v < max - step * 1e-9; v += step) out.push(v);
  out.push(out.length ? out[out.length - 1] + step : step);
  return out;
}

export function fmtTick(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(a >= 1e10 ? 0 : 1)}bn`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(a >= 1e7 ? 0 : 1)}m`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(0)}k`;
  return v % 1 === 0 ? String(v) : v.toFixed(1);
}

export function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** A sparkline over a series that may contain nulls (drawn as gaps). */
export function sparkline(values: (number | null)[], w = 120, h = 26, colour = 'var(--accent-primary)'): string {
  const pts = values.map((v, i) => ({ v, i }));
  const finite = pts.filter((p) => p.v !== null && Number.isFinite(p.v)) as { v: number; i: number }[];
  if (finite.length < 2) return `<svg class="spark" width="${w}" height="${h}" aria-hidden="true"></svg>`;
  const max = Math.max(...finite.map((p) => p.v));
  const min = Math.min(...finite.map((p) => p.v));
  const span = max - min || 1;
  const x = (i: number) => (i / Math.max(1, values.length - 1)) * (w - 2) + 1;
  const y = (v: number) => h - 1 - ((v - min) / span) * (h - 2);
  let d = '';
  let pen = false;
  for (const p of pts) {
    if (p.v === null || !Number.isFinite(p.v)) { pen = false; continue; }
    d += `${pen ? 'L' : 'M'}${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`;
    pen = true;
  }
  const last = finite[finite.length - 1];
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <path d="${d}" fill="none" stroke="${colour}" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(last.i).toFixed(1)}" cy="${y(last.v).toFixed(1)}" r="1.9" fill="${colour}"/>
  </svg>`;
}

export interface BarDatum { label: string; value: number; colour?: string; tipText?: string; id?: string; fmt?: (v: number) => string; }

/** Horizontal bar chart with a value axis and a hover tip on every bar. */
export function horizontalBars(
  data: BarDatum[],
  opts: { width?: number; rowHeight?: number; labelWidth?: number; valueFmt?: (v: number) => string; signed?: boolean } = {},
): string {
  const width = opts.width ?? 860;
  const rowH = opts.rowHeight ?? 28;
  const labelW = opts.labelWidth ?? 190;
  const padR = 62;
  const h = data.length * rowH + 28;
  const vfmt = opts.valueFmt ?? fmtTick;
  const signed = opts.signed ?? false;
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.value)), 0) || 1;
  const plotW = width - labelW - padR;
  const zeroX = signed ? labelW + plotW / 2 : labelW;
  const scale = signed ? (plotW / 2) / maxAbs : plotW / maxAbs;

  const grid = signed
    ? `<line class="grid-line" x1="${zeroX}" y1="14" x2="${zeroX}" y2="${h - 14}"/>`
    : ticks(maxAbs).map((t) => `<line class="grid-line" x1="${labelW + t * scale}" y1="14" x2="${labelW + t * scale}" y2="${h - 14}"/><text class="axis-text" x="${labelW + t * scale}" y="${h - 3}" text-anchor="middle">${esc(vfmt(t))}</text>`).join('');

  const bars = data.map((d, i) => {
    const y = 14 + i * rowH;
    const w = Math.max(1, Math.abs(d.value) * scale);
    const x = d.value < 0 ? zeroX - w : zeroX;
    const labelAnchor = signed ? (d.value < 0 ? zeroX - w - 6 : zeroX + w + 6) : labelW + w + 6;
    return `<g class="bar-row"${d.id ? ` data-id="${esc(d.id)}" style="cursor:pointer"` : ''}>
      <text class="axis-text" x="${labelW - 8}" y="${y + rowH / 2}" text-anchor="end" dominant-baseline="middle" style="fill:var(--text-secondary)">${esc(clip(d.label, 26))}</text>
      <rect class="bar" x="${x.toFixed(1)}" y="${y + 4}" width="${w.toFixed(1)}" height="${rowH - 10}" rx="2" fill="${d.colour ?? 'var(--accent-primary)'}"
        data-tip="${tip(d.tipText ?? `${d.label}: ${(d.fmt ?? vfmt)(d.value)}`)}" aria-label="${esc(d.label)}"/>
      <text class="axis-text num" x="${labelAnchor.toFixed(1)}" y="${y + rowH / 2}" text-anchor="${signed && d.value < 0 ? 'end' : 'start'}" dominant-baseline="middle" style="fill:var(--text-secondary)">${esc((d.fmt ?? vfmt)(d.value))}</text>
    </g>`;
  }).join('');

  return `<svg class="chart" viewBox="0 0 ${width} ${h}" role="img">${grid}${bars}</svg>`;
}

export interface SeriesSpec { key: string; label: string; colour: string; values: (number | null)[]; }

/** Stacked area over an index axis, with an invisible hover column per step. */
export function stackedArea(
  series: SeriesSpec[],
  labels: string[],
  opts: { width?: number; height?: number; annotations?: { at: number; text: string }[]; percent?: boolean; valueFmt?: (v: number) => string } = {},
): string {
  const width = opts.width ?? 900;
  const height = opts.height ?? 380;
  const padL = 52; const padR = 12; const padT = 12; const padB = 30;
  const n = labels.length;
  if (!n || !series.length) return '<div class="empty-state">No data.</div>';
  const vfmt = opts.valueFmt ?? fmtTick;

  const raw = labels.map((_, i) => series.map((s) => s.values[i] ?? 0));
  const totals = raw.map((col) => col.reduce((a, b) => a + b, 0));
  const norm = (i: number, v: number) => (opts.percent ? (totals[i] ? v / totals[i] : 0) : v);
  const max = opts.percent ? 1 : Math.max(...totals, 1);
  const plotW = width - padL - padR; const plotH = height - padT - padB;
  const x = (i: number) => padL + (i / Math.max(1, n - 1)) * plotW;
  const y = (v: number) => padT + plotH - (v / max) * plotH;

  const grid = (opts.percent ? [0, 0.25, 0.5, 0.75, 1] : ticks(max)).map((t) =>
    `<line class="grid-line" x1="${padL}" y1="${y(t)}" x2="${width - padR}" y2="${y(t)}"/><text class="axis-text" x="${padL - 6}" y="${y(t)}" text-anchor="end" dominant-baseline="middle">${opts.percent ? `${Math.round(t * 100)}%` : esc(vfmt(t))}</text>`).join('');

  const cum = labels.map(() => 0);
  const bands = series.map((s, si) => {
    const top: string[] = []; const bottom: string[] = [];
    for (let i = 0; i < n; i++) {
      const y0 = cum[i]; const y1 = y0 + norm(i, s.values[i] ?? 0);
      top.push(`${x(i).toFixed(1)} ${y(y1).toFixed(1)}`);
      bottom.push(`${x(i).toFixed(1)} ${y(y0).toFixed(1)}`);
      cum[i] = y1;
    }
    void si;
    const d = `M${top.join('L')}L${bottom.reverse().join('L')}Z`;
    return `<path d="${d}" fill="${s.colour}" fill-opacity="0.92" stroke="none"/>`;
  }).join('');

  const step = Math.max(1, Math.round(n / 9));
  const xLabels = labels.map((l, i) => (i % step === 0 ? `<text class="axis-text" x="${x(i)}" y="${height - 8}" text-anchor="middle">${esc(l)}</text>` : '')).join('');

  const notes = (opts.annotations ?? []).filter((a) => a.at >= 0 && a.at < n).map((a, i) => {
    const labelY = padT + 10 + (i % 3) * 13;
    const flip = x(a.at) + 7 * a.text.length > width - padR;
    return `<line x1="${x(a.at)}" y1="${padT}" x2="${x(a.at)}" y2="${padT + plotH}" stroke="var(--text-primary)" stroke-width="1" stroke-dasharray="3 3" opacity=".4"/><text class="axis-text" x="${x(a.at) + (flip ? -4 : 4)}" y="${labelY}" text-anchor="${flip ? 'end' : 'start'}" style="fill:var(--text-secondary)">${esc(a.text)}</text>`;
  }).join('');

  const hover = labels.map((l, i) => {
    const bw = plotW / Math.max(1, n - 1);
    const lines = series.map((s) => `${s.label}: ${opts.percent ? `${Math.round(norm(i, s.values[i] ?? 0) * 100)}%` : vfmt(s.values[i] ?? 0)}`).reverse().join('\n');
    return `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${padT}" width="${bw.toFixed(1)}" height="${plotH}" fill="transparent" data-tip="${tip(`${l}\n${opts.percent ? '' : `Total: ${vfmt(totals[i])}\n`}${lines}`)}"/>`;
  }).join('');

  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img">${grid}${bands}${notes}<line class="axis-line" x1="${padL}" y1="${padT + plotH}" x2="${width - padR}" y2="${padT + plotH}"/>${xLabels}${hover}</svg>`;
}

/** Multi-line chart over an index axis (values may contain nulls → gaps). */
export function multiLine(
  series: SeriesSpec[],
  labels: string[],
  opts: { width?: number; height?: number; annotations?: { at: number; text: string }[]; valueFmt?: (v: number) => string; refLine?: { at: number; label?: string }; yMinZero?: boolean } = {},
): string {
  const width = opts.width ?? 900; const height = opts.height ?? 380;
  const padL = 54; const padR = 14; const padT = 12; const padB = 30;
  const n = labels.length;
  if (!n || !series.length) return '<div class="empty-state">No data.</div>';
  const vfmt = opts.valueFmt ?? fmtTick;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null && Number.isFinite(v)));
  if (!all.length) return '<div class="empty-state">No data.</div>';
  let min = Math.min(...all); let max = Math.max(...all);
  if (opts.yMinZero) min = Math.min(0, min);
  if (min === max) max = min + 1;
  const plotW = width - padL - padR; const plotH = height - padT - padB;
  const x = (i: number) => padL + (i / Math.max(1, n - 1)) * plotW;
  const y = (v: number) => padT + plotH - ((v - min) / (max - min)) * plotH;

  const tickVals: number[] = [];
  for (let k = 0; k <= 4; k++) tickVals.push(min + ((max - min) * k) / 4);
  const grid = tickVals.map((t) => `<line class="grid-line" x1="${padL}" y1="${y(t)}" x2="${width - padR}" y2="${y(t)}"/><text class="axis-text" x="${padL - 6}" y="${y(t)}" text-anchor="end" dominant-baseline="middle">${esc(vfmt(t))}</text>`).join('');

  const lines = series.map((s) => {
    let d = ''; let pen = false;
    for (let i = 0; i < n; i++) {
      const v = s.values[i];
      if (v === null || !Number.isFinite(v)) { pen = false; continue; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`; pen = true;
    }
    return `<path d="${d}" fill="none" stroke="${s.colour}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  }).join('');

  const step = Math.max(1, Math.round(n / 9));
  const xLabels = labels.map((l, i) => (i % step === 0 ? `<text class="axis-text" x="${x(i)}" y="${height - 8}" text-anchor="middle">${esc(l)}</text>` : '')).join('');

  const ref = opts.refLine && opts.refLine.at >= 0 && opts.refLine.at < n
    ? `<line x1="${x(opts.refLine.at)}" y1="${padT}" x2="${x(opts.refLine.at)}" y2="${padT + plotH}" stroke="var(--text-primary)" stroke-width="1" stroke-dasharray="4 3" opacity=".45"/>${opts.refLine.label ? `<text class="axis-text" x="${x(opts.refLine.at) + 4}" y="${padT + 10}" style="fill:var(--text-secondary)">${esc(opts.refLine.label)}</text>` : ''}`
    : '';
  const notes = (opts.annotations ?? []).filter((a) => a.at >= 0 && a.at < n).map((a, i) => {
    const labelY = padT + 10 + (i % 3) * 13;
    const flip = x(a.at) + 7 * a.text.length > width - padR;
    return `<line x1="${x(a.at)}" y1="${padT}" x2="${x(a.at)}" y2="${padT + plotH}" stroke="var(--text-primary)" stroke-width="1" stroke-dasharray="3 3" opacity=".35"/><text class="axis-text" x="${x(a.at) + (flip ? -4 : 4)}" y="${labelY}" text-anchor="${flip ? 'end' : 'start'}" style="fill:var(--text-secondary)">${esc(a.text)}</text>`;
  }).join('');

  const hover = labels.map((l, i) => {
    const bw = plotW / Math.max(1, n - 1);
    const parts = series.map((s) => (s.values[i] !== null && Number.isFinite(s.values[i]) ? `${s.label}: ${vfmt(s.values[i] as number)}` : null)).filter(Boolean).join('\n');
    return `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${padT}" width="${bw.toFixed(1)}" height="${plotH}" fill="transparent" data-tip="${tip(`${l}\n${parts}`)}"/>`;
  }).join('');

  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img">${grid}${ref}${notes}${lines}<line class="axis-line" x1="${padL}" y1="${padT + plotH}" x2="${width - padR}" y2="${padT + plotH}"/>${xLabels}${hover}</svg>`;
}

export function legend(items: { label: string; colour: string; id?: string }[]): string {
  return `<div class="legend">${items.map((i) => `<span class="legend-item"${i.id ? ` data-legend="${esc(i.id)}"` : ''}><span class="legend-swatch" style="background:${i.colour}"></span>${esc(i.label)}</span>`).join('')}</div>`;
}

// ── pure histogram binning (positional-tested) ───────────────────────────────
export interface Bin { x0: number; x1: number; count: number; items: number[]; }
/** Bin values into `n` equal-width bins spanning [min,max]; last bin is closed. */
export function histogramBins(values: number[], n = 20): Bin[] {
  const finite = values.filter((v) => Number.isFinite(v));
  if (!finite.length) return [];
  let lo = Math.min(...finite); let hi = Math.max(...finite);
  if (lo === hi) { lo -= 0.5; hi += 0.5; }
  const w = (hi - lo) / n;
  const bins: Bin[] = Array.from({ length: n }, (_, i) => ({ x0: lo + i * w, x1: lo + (i + 1) * w, count: 0, items: [] }));
  for (const v of finite) {
    let k = Math.floor((v - lo) / w);
    if (k < 0) k = 0; if (k >= n) k = n - 1;
    bins[k].count++; bins[k].items.push(v);
  }
  return bins;
}
