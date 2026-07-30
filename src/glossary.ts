// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// Based on au-retail by Ben Richardson — https://benrichardson.dev
//
// Domain jargon, defined for someone who has never encountered any of it.
// Rendered as click-to-open popovers via [data-term] spans.

export interface Term { term: string; definition: string }

export const GLOSSARY: Record<string, Term> = {
  'retail turnover': {
    term: 'Retail turnover',
    definition:
      'The total value of sales rung up by retail businesses — what shoppers actually spent, before the shop pays its own costs. The ABS estimates it every month from a survey of retailers plus tax data. It counts the sale of goods (and, for cafés and restaurants, meals), not services like haircuts or rent.',
  },
  'current prices': {
    term: 'Current prices (nominal)',
    definition:
      'Turnover measured in the dollars of the day. If prices rise 5% and shoppers buy exactly the same things, current-prices turnover still goes up 5%. It mixes together two different things: how much stuff was bought, and how much each thing cost. This is the headline dollar figure most people picture.',
  },
  'chain volume': {
    term: 'Chain volume (real)',
    definition:
      'Turnover with the effect of price changes stripped out, so it measures the quantity of goods bought rather than the dollars paid. The ABS builds it by re-pricing each period’s sales at a common set of prices. When real growth is far below nominal growth, inflation — not extra shopping — is doing the work. Chain volumes are expressed in the dollars of a reference year, so their level is only meaningful as a trend, not as a dollar total.',
  },
  'seasonally adjusted': {
    term: 'Seasonally adjusted',
    definition:
      'Retail has a huge, predictable rhythm — December is always the biggest month, February the quietest. Seasonal adjustment removes that repeating pattern so you can see the underlying trend and compare one month with the next. The headline lines here use the seasonally adjusted series; the seasonality view uses the original (unadjusted) series precisely to show the rhythm.',
  },
  original: {
    term: 'Original series',
    definition:
      'The raw monthly figures, with the seasonal rhythm left in. Because December and June are so different, comparing an original month with the month before is misleading — but the original series is exactly what you want when the seasonality itself is the point, and it is what the two reconciliation checks use (states and categories only add up in the un-adjusted numbers).',
  },
  'trailing 12 months': {
    term: 'Trailing 12 months',
    definition:
      'The most recent twelve months, summed. A single month is small and seasonal, so most headline figures here use the twelve-month total, which also cancels out the summer/Christmas swing and lets a year-on-year comparison be fair.',
  },
  'year on year': {
    term: 'Year-on-year change',
    definition:
      'Growth in the trailing-12-month total against the twelve months before it. Because it compares like with like (a full year vs a full year), it is immune to the monthly seasonal swing. Shown for both current prices (dollars) and chain volume (quantity).',
  },
  'per capita': {
    term: 'Per person (per capita)',
    definition:
      'Turnover divided by the resident population. Raw totals mostly measure how many people live somewhere — of course NSW spends more than Tasmania. Dividing by population is what makes a big state and a small one comparable, and reveals where people actually spend more each.',
  },
  category: {
    term: 'Retail category',
    definition:
      'The ABS splits retailing into six broad groups — food; household goods; clothing, footwear & accessories; department stores; cafés, restaurants & takeaway; and “other” (pharmacy, books, recreational goods and the rest). Each group is itself the sum of finer industries. Food is by far the largest because it includes supermarkets.',
  },
  'department store': {
    term: 'Department stores',
    definition:
      'Large stores selling a broad mix of goods across many departments — think Myer, David Jones, Kmart, Target, Big W. Once a dominant force in Australian retail, the category has shrunk relative to everything else as shoppers shifted to specialty and online sellers; it is now smaller than the amount Australians spend at cafés and restaurants.',
  },
  cafes: {
    term: 'Cafés, restaurants & takeaway',
    definition:
      'Spending on prepared meals eaten out or taken away — cafés, restaurants, pubs’ food, catering and fast food. It is the fastest-growing major category over the long run, reflecting how much more of the household food budget now goes to meals someone else cooks. It recently overtook department stores by a wide margin.',
  },
  'food retailing': {
    term: 'Food retailing',
    definition:
      'Supermarkets and grocery stores, liquor retailing, and specialised food sellers (butchers, bakers, greengrocers). Dominated by the supermarkets, it is the single biggest retail category and the most defensive — people keep buying groceries in good times and bad, so it barely dips in downturns.',
  },
  gst: {
    term: 'GST (July 2000)',
    definition:
      'The 10% Goods and Services Tax began on 1 July 2000. Shoppers brought purchases forward to beat it, producing a spike in mid-2000 and a slump just after — one of several one-off events marked on the timeline.',
  },
};

/** Wrap a term in an info-icon trigger. `key` must exist in GLOSSARY. */
export function gloss(key: string, label?: string): string {
  const t = GLOSSARY[key];
  if (!t) return label ?? key;
  return `<span class="glossary-link" data-term="${key}" tabindex="0" role="button" aria-label="Definition of ${t.term}">${label ?? t.term}<span class="gloss-icon" aria-hidden="true">i</span></span>`;
}

let popover: HTMLDivElement | null = null;
function ensurePopover(): HTMLDivElement {
  if (!popover) {
    popover = document.createElement('div');
    popover.className = 'glossary-popover';
    popover.setAttribute('role', 'dialog');
    document.body.appendChild(popover);
  }
  return popover;
}

export function hideGlossary(): void {
  popover?.classList.remove('visible');
}

function show(trigger: Element): void {
  const key = trigger.getAttribute('data-term') ?? '';
  const t = GLOSSARY[key];
  if (!t) return;
  const el = ensurePopover();
  el.innerHTML = `<h4></h4><p></p>`;
  (el.querySelector('h4') as HTMLElement).textContent = t.term;
  (el.querySelector('p') as HTMLElement).textContent = t.definition;
  el.classList.add('visible');

  const r = trigger.getBoundingClientRect();
  const pr = el.getBoundingClientRect();
  let left = r.left;
  let top = r.bottom + 8;
  if (left + pr.width > window.innerWidth - 12) left = window.innerWidth - pr.width - 12;
  if (top + pr.height > window.innerHeight - 12) top = r.top - pr.height - 8;
  el.style.left = `${Math.max(12, left)}px`;
  el.style.top = `${Math.max(12, top)}px`;
}

export function initGlossary(): void {
  document.addEventListener('click', (e) => {
    const trigger = (e.target as Element).closest('.glossary-link');
    if (trigger) {
      e.stopPropagation();
      show(trigger);
      return;
    }
    if (!(e.target as Element).closest('.glossary-popover')) hideGlossary();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideGlossary();
    if ((e.key === 'Enter' || e.key === ' ') && (e.target as Element)?.classList?.contains('glossary-link')) {
      e.preventDefault();
      show(e.target as Element);
    }
  });
  window.addEventListener('resize', hideGlossary);
}
