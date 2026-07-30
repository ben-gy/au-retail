// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// Based on au-retail by Ben Richardson — https://benrichardson.dev

const NF = new Intl.NumberFormat('en-AU');

export function num(n: number | null | undefined, dp = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return dp > 0
    ? n.toLocaleString('en-AU', { minimumFractionDigits: dp, maximumFractionDigits: dp })
    : NF.format(Math.round(n));
}

export function pct(n: number | null | undefined, dp = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(dp)}%`;
}

/** Signed percentage, for change columns. */
export function delta(n: number | null | undefined, dp = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const s = (n * 100).toFixed(dp);
  return `${n > 0 ? '+' : ''}${s}%`;
}

/** Compact AUD from base dollars, e.g. $443.7bn, $66.3bn, $340m, $12k. */
export function money(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(a >= 1e11 ? 0 : 1)}bn`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}m`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(0)}k`;
  return `$${Math.round(n)}`;
}

/** Dollars per person, e.g. $16,340. */
export function perPerson(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `$${NF.format(Math.round(n))}`;
}

/** Escape text destined for innerHTML. */
export function esc(s: unknown): string {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

/** Escape for a `data-tip` attribute (rendered as textContent — keep plain). */
export const tip = (s: string): string => esc(s);

// ── one stable colour per retail category (major group), used everywhere ──────
export const CATEGORY_COLOUR: Record<string, string> = {
  '41': '#3f9b52', // Food retailing — green (groceries)
  '42': '#d98a2b', // Household goods — amber
  '43': '#a2489b', // Clothing & footwear — purple
  '44': '#4d6b9c', // Department stores — blue
  '45': '#2f9ca0', // Other retailing — teal
  '46': '#d9533f', // Cafés, restaurants & takeaway — coral
  '20': '#5a636f', // Total — slate
};
export const catColour = (groupCode: string): string => CATEGORY_COLOUR[groupCode] ?? 'var(--text-tertiary)';

// ── one stable colour per state ───────────────────────────────────────────────
export const STATE_COLOUR: Record<string, string> = {
  NSW: '#3d6fb4', Vic: '#5a4b9c', Qld: '#b5642f', SA: '#b03a68',
  WA: '#c79a33', Tas: '#2f8f6b', NT: '#c85a3a', ACT: '#4f8a9c', AUS: '#5a636f', Other: '#8a837a',
};
export const stateColour = (abbr: string): string => STATE_COLOUR[abbr] ?? 'var(--text-tertiary)';

/** Diverging colour for a signed growth value against a mid of 0. */
export function growthColour(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return 'var(--text-tertiary)';
  if (v >= 0.06) return '#1f7a4d';
  if (v >= 0.02) return '#69a97f';
  if (v >= -0.02) return '#c9b98a';
  if (v >= -0.06) return '#d9895f';
  return '#b0402f';
}
