// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// Based on au-retail by Ben Richardson — https://benrichardson.dev

import type { Dataset } from '../types';
import { esc } from '../format';
import { buildInsights } from '../analysis';
import { navigate, openRegion, openCategory } from '../main';

export function renderInsights(root: HTMLElement, data: Dataset): void {
  const insights = buildInsights(data);
  root.innerHTML = `
    <div class="view-head">
      <h2>What the numbers are telling us</h2>
      <p>Findings pulled automatically from the latest data — the cost-of-living gap, the categories rising and fading, and where Australians spend most.</p>
    </div>
    <div class="insight-grid">
      ${insights.map((ins, i) => `
        <div class="insight ${ins.severity}">
          <h3>${esc(ins.title)}</h3>
          <p>${esc(ins.body)}</p>
          ${ins.action ? `<button data-i="${i}">${esc(ins.action.label)} →</button>` : ''}
        </div>`).join('')}
    </div>
  `;

  root.querySelectorAll<HTMLButtonElement>('.insight button[data-i]').forEach((b) =>
    b.addEventListener('click', () => {
      const a = insights[Number(b.dataset.i)].action;
      if (!a) return;
      if (a.state) { if (a.view) navigate({ view: a.view as never }); openRegion(a.state); }
      else if (a.cat) { if (a.view) navigate({ view: a.view as never }); openCategory(a.cat); }
      else if (a.view) navigate({ view: a.view as never });
    }));
}
