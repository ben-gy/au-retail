// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// Based on au-retail by Ben Richardson — https://benrichardson.dev

import L from 'leaflet';
import type { Dataset, Region } from '../types';
import { esc, money, perPerson, delta, pct } from '../format';
import { openRegion } from '../main';
import { gloss } from '../glossary';

type Measure = 'total12' | 'perCapita' | 'change' | 'realChange' | 'cafesShare';

const MEASURES: { id: Measure; label: string; blurb: string; diverging?: boolean }[] = [
  { id: 'total12', label: 'Total turnover', blurb: 'Annual retail turnover — largely a map of population: the big states spend the most in total.' },
  { id: 'perCapita', label: 'Per person', blurb: 'Annual turnover per resident. This strips out population, revealing where people actually spend more each.' },
  { id: 'change', label: 'Year-on-year $', blurb: 'Growth in the dollar value of turnover against a year ago. Blue is falling, red is rising.', diverging: true },
  { id: 'realChange', label: 'Year-on-year real', blurb: 'Growth in the QUANTITY bought (chain volume) against a year ago — inflation stripped out. Blue is falling, red is rising.', diverging: true },
  { id: 'cafesShare', label: 'Café & takeaway share', blurb: 'Share of each state\'s retail dollar spent on cafés, restaurants and takeaway.' },
];

const RAMP = ['#e8eef0', '#bcd6cf', '#84bcae', '#4f9c94', '#2b6f74'];
const DIVERGING = ['#2f6b8f', '#8fb8cc', '#efe9e1', '#d99a6c', '#a8352b'];
const NO_DATA = '#e3ded7';

let measure: Measure = 'perCapita';
let map: L.Map | null = null;

const cafesShare = (r: Region): number | null => {
  const m = r.mix.find((x) => x.code === '46');
  return m?.share ?? null;
};
const val = (r: Region | undefined, m: Measure): number | null => {
  if (!r) return null;
  switch (m) {
    case 'total12': return r.latest12;
    case 'perCapita': return r.perCapita;
    case 'change': return r.change;
    case 'realChange': return r.realChange;
    case 'cafesShare': return cafesShare(r);
  }
};

export function renderMap(root: HTMLElement, data: Dataset): void {
  root.innerHTML = `
    <div class="view-head">
      <h2>Retail spending across the states</h2>
      <p>Every state shaded by ${gloss('per capita', 'spending per person')}. Hover a state for its numbers; click to open its full profile. Territories are shown with their states.</p>
    </div>
    <div class="controls">
      <div class="seg" role="group" aria-label="Map measure">
        ${MEASURES.map((m) => `<button data-measure="${m.id}" aria-pressed="${m.id === measure}">${esc(m.label)}</button>`).join('')}
      </div>
    </div>
    <div class="map-shell"><div class="map-canvas" id="map-canvas"></div></div>
    <div class="map-legend" id="map-legend"></div>
    <p id="map-blurb" class="mini-note" style="margin-top:var(--space-sm)"></p>
  `;

  const byGeo = new Map(data.states.filter((s) => s.geoCode).map((s) => [s.geoCode as string, s]));
  const canvas = root.querySelector<HTMLElement>('#map-canvas')!;

  if (map) { map.remove(); map = null; }
  map = L.map(canvas, { minZoom: 3, maxZoom: 8, zoomControl: true, scrollWheelZoom: false });
  map.attributionControl.setPrefix(false);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
    attribution: 'Tiles © CARTO', subdomains: 'abcd', minZoom: 3, maxZoom: 8,
  }).addTo(map);

  let layer: L.GeoJSON | null = null;

  const thresholds = (): number[] => {
    const m = MEASURES.find((x) => x.id === measure)!;
    if (m.diverging) return [-0.02, 0.01, 0.03, 0.05];
    const vals = data.states.filter((s) => s.geoCode).map((s) => val(s, measure)).filter((v): v is number => v !== null).sort((a, b) => a - b);
    if (vals.length < 4) return [0, 0, 0, 0];
    const q = (p: number) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))];
    return [q(0.2), q(0.4), q(0.6), q(0.8)];
  };

  const colourFor = (r: Region | undefined): string => {
    const v = val(r, measure);
    if (v === null) return NO_DATA;
    const t = thresholds();
    const ramp = MEASURES.find((x) => x.id === measure)!.diverging ? DIVERGING : RAMP;
    let i = 0;
    while (i < t.length && v >= t[i]) i++;
    return ramp[i];
  };

  const tipHtml = (r: Region | undefined, name: string): string => {
    if (!r) return `<strong>${esc(name)}</strong><br>No data`;
    return `<strong>${esc(r.name)}</strong> <span style="opacity:.7">${esc(r.abbr)}</span><br>
      Annual turnover: <b>${money(r.latest12)}</b><br>
      Per person: <b>${perPerson(r.perCapita)}</b><br>
      YoY dollars: <b>${delta(r.change)}</b> · real <b>${delta(r.realChange)}</b><br>
      Cafés & takeaway: <b>${pct(cafesShare(r), 0)}</b> of spend`;
  };

  const fmt = (v: number): string =>
    measure === 'cafesShare' ? pct(v, 0)
    : measure === 'change' || measure === 'realChange' ? delta(v)
    : measure === 'perCapita' ? perPerson(v)
    : money(v);

  const paint = () => {
    layer?.setStyle((f: any) => ({ fillColor: colourFor(byGeo.get(f.properties.code)), fillOpacity: 0.85, color: '#ffffff', weight: 0.8 }));
    const t = thresholds();
    const m = MEASURES.find((x) => x.id === measure)!;
    const ramp = m.diverging ? DIVERGING : RAMP;
    root.querySelector<HTMLElement>('#map-legend')!.innerHTML = `
      <span>${esc(m.label)}</span>
      <span class="ramp">${ramp.map((c) => `<span style="background:${c}"></span>`).join('')}</span>
      <span style="color:var(--text-tertiary)">${fmt(t[0])} · ${fmt(t[1])} · ${fmt(t[2])} · ${fmt(t[3])}</span>`;
    root.querySelector<HTMLElement>('#map-blurb')!.textContent = m.blurb;
  };

  fetch('data/boundaries.geojson')
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then((geo) => {
      layer = L.geoJSON(geo, {
        attribution: 'Boundaries: ABS ASGS (CC BY 4.0)',
        style: () => ({ fillOpacity: 0.85, color: '#ffffff', weight: 0.8 }),
        onEachFeature: (f: any, lyr: any) => {
          const r = byGeo.get(f.properties.code);
          lyr.bindTooltip(tipHtml(r, f.properties.name), { sticky: true, className: 'map-tip' });
          lyr.on({
            mouseover: () => lyr.setStyle({ weight: 2, color: '#1c1f26' }),
            mouseout: () => layer?.resetStyle(lyr),
            click: () => { if (r) openRegion(r.code); },
          });
        },
      }).addTo(map!);
      paint();

      const bounds = layer.getBounds();
      const fit = () => { map?.invalidateSize(); if (bounds.isValid() && canvas.clientHeight > 50) map?.fitBounds(bounds, { padding: [12, 12] }); };
      const ro = new ResizeObserver(() => { if (canvas.clientHeight > 50) { fit(); ro.disconnect(); } });
      ro.observe(canvas);
      setTimeout(fit, 400);
    })
    .catch((err) => { canvas.innerHTML = `<div class="error-state">Could not load the map boundaries (${esc(err.message)}).</div>`; });

  root.querySelectorAll<HTMLButtonElement>('[data-measure]').forEach((b) =>
    b.addEventListener('click', () => {
      measure = b.dataset.measure as Measure;
      root.querySelectorAll<HTMLButtonElement>('[data-measure]').forEach((o) => o.setAttribute('aria-pressed', String(o.dataset.measure === measure)));
      paint();
    }));

  paint();
}
