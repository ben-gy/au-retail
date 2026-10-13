# Retail Spending — Build Review

This file exists only to create a reviewable PR. All code is already deployed on `main`.

**Merge this PR to acknowledge the build.** Closing without merging is also fine.

## Links

- **GitHub Pages:** https://ben-gy.github.io/au-retail/ *(redirects to the custom domain)*
- **Custom domain:** https://au-retail.benrichardson.dev *(HTTP live now; HTTPS live once the Let's Encrypt cert finishes issuing)*

## What it is

An explorer for the ABS *Retail Trade* release — what Australia spends at the shops, by category,
state and month, since April 1982. Built around the cost-of-living story: turnover keeps climbing
in dollars (+3.3% year on year) but the quantity actually bought is nearly flat (+1.0% real).
Cafés & restaurants ($66bn) now dwarf department stores ($23bn); food anchors 40% of every dollar.

Eight views: Overview, Categories (stacked-area + treemap), By state (Leaflet choropleth),
Real vs nominal (the signature view), Trends, Seasonality (year × month heatmap), Explorer, Insights.

## Verification (against the byte-identical local production build)

- 56 tests pass (parser, both reconciliation gates incl. injected-error cases, positional layout, headless render of every view).
- Both gates pass on the real ABS data: categories→total (27,979 checks, 0 fails), states→Australia (2,232 checks, 0 fails).
- Real trusted clicks confirmed: a state polygon opens the drawer **above** Leaflet; the About modal opens above Leaflet from the map view; a histogram bar filters the table (154→40).
- Zero horizontal overflow at 375px across all 8 views + an open drawer.
- Deploy workflow green; live HTTP bundle matches local `dist` byte-for-byte; all data/SEO assets serve 200.

## DNS setup

Already provisioned in Cloudflare (`benrichardson.dev` zone): CNAME `au-retail` → `ben-gy.github.io` (DNS only).
Cert issuance was triggered; if HTTPS is still pending, re-cycle:

```bash
gh api repos/ben-gy/au-retail/pages -X PUT -f cname=""
sleep 3
gh api repos/ben-gy/au-retail/pages -X PUT -f cname="au-retail.benrichardson.dev"
```
