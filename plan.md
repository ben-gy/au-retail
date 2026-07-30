# Site Plan: Retail Spending

## Overview
- **Name:** Retail Spending
- **Repo name:** au-retail
- **Tagline:** What Australia spends at the shops — every retail dollar by category, state and month, since 1982.

### Naming Convention
Plain topic name, no country code. `country: "AU"` in the index entry renders the flag.

## Target Audience
Anyone trying to make sense of the cost-of-living era through what Australians actually buy:
curious citizens and news readers, small-business owners and retailers benchmarking their
category, journalists and analysts, students. Desktop-and-mobile, non-expert — the site must
explain what "retail turnover", "chain volume" and "seasonally adjusted" mean.

## Value Proposition
A single, fast, beautiful home for the ABS Retail Trade release: how much Australia spends at
the shops each month, split into the categories people recognise (groceries, cafes, clothes,
department stores, household goods), compared across states and per person, and — the killer —
separating **dollars spent** (nominal) from **stuff bought** (real, chain-volume) so you can see
inflation doing the heavy lifting. Nothing else turns this monthly release into an explorable,
plain-language tool.

## Data Sources
| Source | URL | What it provides | Update frequency | Auth? |
|--------|-----|-------------------|-----------------|-------|
| ABS Retail Trade (dataflow RT) | https://data.api.abs.gov.au/rest/data/ABS,RT,1.0.0 | Retail turnover, current prices (monthly) + chain volume (quarterly), by 22 industry categories × 9 states + Australia, original/seasonally-adjusted/trend, Apr 1982 → present | Monthly | No |
| ABS Estimated Resident Population (ERP_Q) | https://data.api.abs.gov.au/rest/data/ABS,ERP_Q | National annual + state population — the per-capita denominator (embedded static, June each year 1982–2025) | Annual | No |
| ABS ASGS state & territory boundaries | patterns/geo/au-states.geojson (vendored) | Real polygons for the choropleth | Static | No |

## Key Features
1. Monthly headline: total retail turnover, YoY nominal and YoY real, biggest category.
2. Category mix treemap + stacked-area share-over-time (the cafes-overtake-department-stores story).
3. Leaflet state choropleth: total, per-capita, YoY, real-YoY, cafés share — with a per-state drill-down drawer.
4. **Real vs nominal** cost-of-living view — nominal turnover vs chain-volume, rebased, with the widening gap since 2021.
5. Category trajectories — each major group rebased to 100 (real), winners vs losers.
6. Seasonality — year×month heatmap + average month profile (the December Christmas peak).
7. Explorer — every industry×state combination, sortable/searchable, sparklines, click-to-filter YoY histogram.
8. Auto-detected Insights + glossary popovers + honest About modal.

## Style Direction
**Tone:** friendly-civic, practical — a shopfront, not a terminal.
**Palette:** warm cream base, confident teal primary; six fixed category colours (food=green,
household=amber, clothing=purple, department=blue, other=teal, cafes=coral) reused across every view.
**UI density:** balanced (news-site).
**Theme:** light.
**Reference sites:** fuelaustralia.org (clean utility), abs.gov.au data explorer (authoritative but drier — beat it).

## Technical Architecture
- **Stack:** Vanilla TypeScript + Vite (single-page, tabbed views — no need for React).
- **Data strategy:** pipeline. ABS Retail Trade is **monthly** → monthly cron (the proportional cadence; monthly is the factory's fastest). Embeds the latest DATA month, not a run timestamp, so re-runs are idempotent.
- **Key libraries:** Leaflet (map). Everything else hand-rolled SVG from `patterns/`.

## Data model (pipeline output → public/data)
- `meta.json` — axes (months, quarters), headline stats, category + state lists, gate results, medians, annotations, source.
- `national.json` — AUS series: Total monthly nominal (SA + original), Total quarterly real (chain volume, SA); per-industry monthly nominal rolling-12 + latest/prev-12 + share; per-group quarterly real; national annual population.
- `states.json` — per region: population, Total monthly nominal-original series, latest/prev-12 nominal, real YoY (from quarterly M3), per-industry latest-12 (mix) + per-industry change + downsampled sparkline (for the Explorer's 220 combos).
- `boundaries.geojson` — copied from patterns/geo/au-states.geojson.

## Reconciliation gates (independently-published columns → agreement proves a correct parse)
1. **Category sum EXACT (rounding-tolerant):** for every region×month (original, current prices), the 6 major groups (41,42,43,44,45,46) sum to Total (20), and each group's leaf industries sum to the group. (Verified on real data: worst diff ≈ $0.1m.)
2. **State sum EXACT:** for every industry×month (original), the 8 states + NT/Other sum to Australia (AUS). (Verified: diff 0.0.)
3. **Real/nominal identity (tolerant):** published current-prices %-change (MEASURE M2) ≈ month-on-month change computed from M1 levels — a cross-measure sanity check.
A shifted or mis-joined column breaks gate 1 or 2 by orders of magnitude; the tests inject exactly those errors.

## Visualization Strategy (≥5 distinct views)
- **Treemap** (squarify pattern) — category composition, sized by $, shaded by YoY. *What's the big picture?*
- **Stacked-area** — category share over 43 years. *How has the mix changed?* (cafes rising, department stores fading)
- **Leaflet choropleth** — geography of spending + per-capita. *Where?*
- **Rebased dual line (real vs nominal)** — *Is spending growth real or just inflation?* (the signature cost-of-living view)
- **Small-multiple rebased trajectories** — *Which categories won and lost?*
- **Year×month heatmap** — *When do we spend?* (December peak)
- **Sortable table + YoY histogram** — *Explore & rank everything.*
- **Horizontal bars** — state + category leaderboards.
Every mark gets a `[data-tip]` hover; dense SVG isn't needed for zoom here (bounded categories), map uses Leaflet bindTooltip. Colour = category, identical across all views.
