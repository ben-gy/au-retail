# Retail Spending

**What Australia spends at the shops — every retail dollar by category, state and month, since 1982.**

🔗 **Live:** [https://au-retail.benrichardson.dev](https://au-retail.benrichardson.dev)

## What is this?

Retail Spending turns the ABS *Retail Trade* release — the monthly measure of how much Australia
spends at the shops — into something you can actually explore. It covers 43 years (April 1982 to
the latest month), split into the categories people recognise: groceries, cafés and restaurants,
clothes, household goods, department stores and the rest.

The headline it's built around is the cost-of-living story of the decade: retail turnover keeps
climbing in dollars, but once price rises are stripped out the *quantity* Australians actually buy
has barely moved. The **Real vs nominal** view puts those two lines side by side so you can see
inflation, not extra shopping, doing the heavy lifting — and it does the same per category and per
state. Along the way: cafés and restaurants have quietly grown to roughly three times the size of
department stores, food anchors 40% of every retail dollar, and December towers over every other
month of the year.

Every figure is checked. Two independent reconciliation gates run on each build: the six categories
(and their finer industries) must sum to the published total, and the eight states must sum to
Australia. Because the ABS publishes those columns independently, agreement is strong evidence the
data was read and joined correctly — a shifted column breaks the checks by orders of magnitude.

## Who is this for?

Anyone making sense of the cost-of-living era through what people actually buy: curious citizens
and news readers, small retailers benchmarking their category, journalists, analysts and students.
No prior knowledge assumed — every piece of jargon (chain volume, seasonally adjusted, turnover)
has a plain-language definition a click away.

## Data Sources

| Source | What it provides | Update frequency |
|--------|-------------------|-----------------|
| ABS Retail Trade (dataflow RT) | Retail turnover in current prices (monthly) and chain volume (quarterly), by 6 categories × 8 states + Australia, Apr 1982 → present | Monthly |
| ABS Estimated Resident Population | The per-person denominator (embedded, June each year 1982–2025) | Annual |
| ABS ASGS state & territory boundaries | Real polygons for the choropleth | Static |

All data © the Australian Bureau of Statistics, used under CC BY 4.0.

## Features

- **Overview** — headline turnover, year-on-year in dollars and real terms, the 43-year timeline.
- **Categories** — a stacked-area of the shifting category mix, a treemap of the whole retail dollar, and a leaderboard.
- **By state** — a Leaflet choropleth (total, per person, year-on-year, real, café share) with a per-state drill-down.
- **Real vs nominal** — the signature cost-of-living view: dollars vs quantity, rebased, per category.
- **Trends** — every category's trajectory rebased to 100; winners and losers over the long run.
- **Seasonality** — a year × month heatmap of the retail year's rhythm (December always wins).
- **Explorer** — every category in every state, searchable and sortable, with a click-to-filter histogram.
- **Insights** — findings pulled automatically from the latest data.

## Tech Stack

- **Runtime:** Vanilla TypeScript
- **Build:** Vite 6
- **Testing:** Vitest (parser, reconciliation gates, positional layout, and a headless render of every view)
- **Hosting:** GitHub Pages (static, no backend)
- **Data:** GitHub Actions pipeline refreshing monthly from the ABS Data API
- **Map:** Leaflet + real ABS boundaries

## Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Run tests
npm test

# Production build
npm run build

# Preview production build
npm run preview
```

To refresh the data locally:

```bash
node pipeline/collect.mjs && node pipeline/aggregate.mjs
```

## How it works

`pipeline/collect.mjs` fetches three slices of the ABS Retail Trade dataflow (nominal monthly,
nominal seasonally-adjusted, and real chain-volume quarterly). `pipeline/aggregate.mjs` runs the
two reconciliation gates, then shapes the series into compact JSON in `public/data/`. The
front-end loads that JSON and renders eight views entirely client-side. All parsing and gate logic
lives in a dependency-free `pipeline/parse.mjs`, unit-tested in `tests/`.

## License

[GNU Affero General Public License v3.0 or later](./LICENSE), with an attribution
requirement added under section 7(b) — see [ADDITIONAL-TERMS.md](./ADDITIONAL-TERMS.md).

A separate commercial licence without the AGPL's source-disclosure obligations is
available on request: <hi@ben.gy>.

Third-party components keep their own licences — see [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).
Data sources keep theirs, and their attribution requirements are listed in the site's
own methodology/sources section.
