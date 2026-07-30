// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// Based on au-retail by Ben Richardson — https://benrichardson.dev

import './styles.css';
import 'leaflet/dist/leaflet.css';
import { initTooltip } from './components/tooltip';
import { initGlossary, gloss, hideGlossary } from './glossary';
import { esc, money, delta } from './format';
import type { Dataset } from './types';
import { renderRegionDrawer, renderCategoryDrawer } from './drilldown';
import { renderOverview } from './views/overview';
import { renderCategories } from './views/categories';
import { renderMap } from './views/map';
import { renderReal } from './views/real';
import { renderTrends } from './views/trends';
import { renderSeasonality } from './views/seasonality';
import { renderExplorer } from './views/explorer';
import { renderInsights } from './views/insights';

const VIEWS = [
  { id: 'overview', label: 'Overview', render: renderOverview },
  { id: 'categories', label: 'Categories', render: renderCategories },
  { id: 'map', label: 'By state', render: renderMap },
  { id: 'real', label: 'Real vs nominal', render: renderReal },
  { id: 'trends', label: 'Trends', render: renderTrends },
  { id: 'seasonality', label: 'Seasonality', render: renderSeasonality },
  { id: 'explorer', label: 'Explorer', render: renderExplorer },
  { id: 'insights', label: 'Insights', render: renderInsights },
] as const;

export type ViewId = (typeof VIEWS)[number]['id'];
const STORE_KEY = 'au-retail:view';

interface Route { view: ViewId; state?: string; cat?: string; filter?: string }

function parseHash(): Route {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  const view = (params.get('v') ?? '') as ViewId;
  const known = VIEWS.some((v) => v.id === view);
  const stored = localStorage.getItem(STORE_KEY) as ViewId | null;
  return {
    view: known ? view : (VIEWS.some((v) => v.id === stored) && stored ? stored : 'overview'),
    state: params.get('state') ?? undefined,
    cat: params.get('cat') ?? undefined,
    filter: params.get('q') ?? undefined,
  };
}

export function navigate(patch: Partial<Route>, replace = false): void {
  const cur = parseHash();
  const next = { ...cur, ...patch };
  const params = new URLSearchParams();
  params.set('v', next.view);
  if (next.state) params.set('state', next.state);
  if (next.cat) params.set('cat', next.cat);
  if (next.filter) params.set('q', next.filter);
  const url = `#${params.toString()}`;
  if (replace) { history.replaceState(null, '', url); render(); }
  else location.hash = url;
}

export function openRegion(code: string): void { navigate({ state: code, cat: undefined }); }
export function openCategory(code: string): void { navigate({ cat: code, state: undefined }); }

let data: Dataset | null = null;

async function load(): Promise<Dataset> {
  const bust = `?v=${Date.now().toString(36).slice(0, 6)}`;
  const [national, states, meta] = await Promise.all(
    ['national', 'states', 'meta'].map(async (f) => {
      const res = await fetch(`data/${f}.json${bust}`);
      if (!res.ok) throw new Error(`Could not load ${f}.json (HTTP ${res.status})`);
      return res.json();
    }),
  );
  return { national, states, meta } as Dataset;
}

function shell(): void {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <header class="site-header">
      <div class="header-inner">
        <div class="brand">
          <span class="brand-mark" aria-hidden="true"></span>
          <h1>Retail Spending</h1>
          <span class="brand-sub">What Australia spends at the shops</span>
        </div>
        <div class="header-spacer"></div>
        <button class="icon-btn" id="about-btn" aria-label="About this site" title="About this site">?</button>
      </div>
      <div class="nav-wrap">
        <nav class="nav-tabs" role="tablist" aria-label="Views">
          ${VIEWS.map((v) => `<button class="nav-tab" role="tab" data-view="${v.id}" aria-selected="false">${v.label}</button>`).join('')}
        </nav>
      </div>
    </header>
    <main class="main-content" id="view-root"><div class="skeleton"></div></main>
    <footer class="site-footer">
      <div class="footer-inner">
        <p id="footer-source"></p>
        <p>Built by <a href="https://benrichardson.dev/">benrichardson.dev</a> · <a href="https://lab.benrichardson.dev" target="_blank" rel="noopener">more tools &amp; sites</a></p>
      </div>
    </footer>
    <div class="overlay" id="overlay"></div>
    <aside class="drawer" id="drawer" role="dialog" aria-label="Detail" aria-modal="true"></aside>
    <div class="modal" id="about-modal" role="dialog" aria-label="About this site" aria-modal="true"></div>
  `;

  app.querySelectorAll<HTMLButtonElement>('.nav-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      localStorage.setItem(STORE_KEY, btn.dataset.view!);
      navigate({ view: btn.dataset.view as ViewId, state: undefined, cat: undefined, filter: undefined });
    });
  });

  const header = document.querySelector<HTMLElement>('.site-header')!;
  const syncHeaderHeight = () => document.documentElement.style.setProperty('--sticky-top', `${header.offsetHeight}px`);
  syncHeaderHeight();
  new ResizeObserver(syncHeaderHeight).observe(header);

  const drawerEl = document.getElementById('drawer')!;
  drawerEl.addEventListener('transitionend', (e) => {
    if ((e as TransitionEvent).propertyName === 'transform' && !drawerEl.classList.contains('open')) {
      drawerEl.style.display = 'none';
    }
  });

  document.getElementById('about-btn')!.addEventListener('click', openAbout);
  document.getElementById('overlay')!.addEventListener('click', closeOverlays);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeOverlays(); });
}

function closeOverlays(): void {
  document.getElementById('overlay')!.classList.remove('open');
  document.getElementById('drawer')!.classList.remove('open');
  document.getElementById('about-modal')!.classList.remove('open');
  hideGlossary();
  const cur = parseHash();
  if (cur.state || cur.cat) navigate({ state: undefined, cat: undefined }, true);
}

function openAbout(): void {
  const m = document.getElementById('about-modal')!;
  const meta = data?.meta;
  const h = meta?.headline;
  m.innerHTML = `
    <button class="icon-btn modal-close" aria-label="Close">✕</button>
    <h2>About this site</h2>
    <p>Retail Spending turns the ABS ${gloss('retail turnover', 'Retail Trade')} release into something you can actually explore: how much Australia spends at the shops each month, split into the categories people recognise, compared across states and per person, from ${esc(meta?.firstMonthLabel ?? '')} to ${esc(meta?.latestMonthLabel ?? '')}.</p>

    <h3>Where the data comes from</h3>
    <p>The Australian Bureau of Statistics publishes Retail Trade every month, estimating turnover from a survey of retailers and tax data. This site pulls the machine-readable series straight from the ABS Data API and joins it to resident population so states can be compared fairly.</p>
    <ul>
      <li>ABS Retail Trade — turnover in ${gloss('current prices', 'current prices')} (monthly) and ${gloss('chain volume', 'chain volume')} (quarterly), by 6 categories × 8 states + Australia</li>
      <li>ABS Estimated Resident Population — the per-person denominator</li>
      <li>ABS ASGS state &amp; territory boundaries for the map</li>
    </ul>

    <h3>How to read the numbers</h3>
    <p>Australia now spends about <strong>${money(h?.annualTotal)}</strong> a year at the shops — roughly ${money(h?.latestMonthlyTotal)} a month. Over the past year that is up ${delta(h?.yoyNominal)} in dollars but only ${delta(h?.yoyReal)} in ${gloss('chain volume', 'real terms')}: most of the rise is prices, not extra shopping. ${gloss('cafes', 'Cafés, restaurants and takeaway')} (${money(h?.cafes12)}) now dwarf ${gloss('department store', 'department stores')} (${money(h?.dept12)}).</p>

    <h3>Two checks that prove the parse is right</h3>
    <p>The data is only trustworthy if it adds up. Two independent reconciliation checks run every build on the original (unadjusted) series:</p>
    <ul>
      <li><strong>Categories → total:</strong> the six categories, and each category's finer industries, must sum to the published total. ${meta ? `${meta.gates.category.checks.toLocaleString()} checks, ${meta.gates.category.fails} failures.` : ''}</li>
      <li><strong>States → Australia:</strong> the eight states must sum to the national figure. ${meta ? `${meta.gates.state.checks.toLocaleString()} checks, ${meta.gates.state.fails} failures.` : ''}</li>
    </ul>
    <p>Because these columns are published independently, agreement is strong evidence the figures were read and joined correctly. A shifted column breaks them by orders of magnitude.</p>

    <h3>Things worth knowing</h3>
    <ul>
      <li><strong>Turnover is not profit.</strong> It is the value of sales, before a shop pays wages, rent or stock.</li>
      <li><strong>Services aren't counted.</strong> Retail Trade covers goods (and café/restaurant meals), not haircuts, gyms, insurance or rent.</li>
      <li><strong>Online is mostly in the categories.</strong> Online sales by traditional retailers sit inside their category; only pure online-only sellers are hard to place.</li>
      <li><strong>Chain volumes are a trend, not a total.</strong> The “real” figures are indexed to a reference year, so read them as growth, not as a dollar amount.</li>
    </ul>

    <h3>Updates</h3>
    <p>The ABS publishes monthly; this site refreshes on the same cadence. Data last rebuilt ${esc(meta ? new Date(meta.generated).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : '')}. ABS data is used under CC BY 4.0.</p>
  `;
  m.querySelector('.modal-close')!.addEventListener('click', closeOverlays);
  document.getElementById('overlay')!.classList.add('open');
  m.classList.add('open');
  (m.querySelector('.modal-close') as HTMLElement).focus();
}

function render(): void {
  if (!data) return;
  const route = parseHash();
  document.querySelectorAll<HTMLButtonElement>('.nav-tab').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.view === route.view));
  });

  const root = document.getElementById('view-root')!;
  const view = VIEWS.find((v) => v.id === route.view) ?? VIEWS[0];
  root.scrollTop = 0;
  try {
    view.render(root, data, route.filter);
  } catch (err) {
    root.innerHTML = `<div class="error-state"><p>Something went wrong drawing this view.</p><p>${esc(err instanceof Error ? err.message : String(err))}</p></div>`;
  }

  const drawer = document.getElementById('drawer')!;
  const overlay = document.getElementById('overlay')!;
  const aboutOpen = document.getElementById('about-modal')!.classList.contains('open');

  if (route.state || route.cat) {
    if (route.state) {
      const region = data.states.find((s) => s.code === route.state);
      if (region) renderRegionDrawer(drawer, region, data);
    } else if (route.cat) {
      renderCategoryDrawer(drawer, route.cat, data);
    }
    drawer.querySelector('.drawer-close')?.addEventListener('click', closeOverlays);
    overlay.classList.add('open');
    drawer.style.display = 'block';
    void drawer.offsetWidth; // force reflow so the slide-in animates
    drawer.classList.add('open');
    (drawer.querySelector('.drawer-close') as HTMLElement | null)?.focus();
  } else if (!aboutOpen) {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
  }
}

async function boot(): Promise<void> {
  shell();
  initTooltip();
  initGlossary();
  window.addEventListener('hashchange', render);

  try {
    data = await load();
  } catch (err) {
    document.getElementById('view-root')!.innerHTML = `
      <div class="error-state">
        <p>Could not load the retail data.</p>
        <p>${esc(err instanceof Error ? err.message : String(err))}</p>
        <p><button class="icon-btn" style="width:auto;padding:0 12px;border-radius:8px" onclick="location.reload()">Retry</button></p>
      </div>`;
    return;
  }

  document.getElementById('footer-source')!.innerHTML =
    `Source: ABS Retail Trade, Australia (${esc(data.meta.firstMonthLabel)} – ${esc(data.meta.latestMonthLabel)}), ` +
    `ABS Estimated Resident Population and ABS ASGS boundaries — all © ABS, CC BY 4.0. ` +
    `Turnover is the value of retail sales; “real” figures are chain-volume (inflation-adjusted).`;

  render();
}

// Only auto-boot in the real app (index.html has #app). Under jsdom tests we
// import views to render them in isolation and must not kick off boot().
if (typeof document !== 'undefined' && document.getElementById('app')) void boot();
