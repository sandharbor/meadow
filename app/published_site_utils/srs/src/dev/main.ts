/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import './page-typography.css';
import '../ui/styles.css';
import { collectWaypoints, createMemoryPersistence, loadStore } from '../core_logic';
import type { SrsClock, SrsSettings } from '../core_logic';
import { initializeMeadowSrs } from '../ui/controller';
import type { MeadowSrsDebugSourceGroup } from '../ui/controller';
import { devSamplePages } from './samplePages';
import { devGlobalCards } from './globalCardsMock';

// Intercept fetch for srs-all-cards.json so the "All pages" tab works in dev
const originalFetch = window.fetch;
window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.endsWith('srs-all-cards.json')) {
    const data = devGlobalCards(currentSample.siteGuid);
    return Promise.resolve(new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
  }
  return originalFetch.call(window, input, init);
};

class VirtualClock implements SrsClock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current);
  }

  set(value: Date): void {
    this.current = new Date(value);
  }
}

const persistence = createMemoryPersistence();
const clock = new VirtualClock(new Date());
let currentSample = devSamplePages[0];
let controller = initializeMeadowSrs;
let activeController: ReturnType<typeof initializeMeadowSrs> | null = null;
let runtimeSettings: Partial<SrsSettings> = {};
let activeSourceGroup: MeadowSrsDebugSourceGroup | null = null;
let activeSourceTab: 'rendered' | 'html' = 'rendered';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderCodePane(value: string): string {
  const lines = value.split('\n');
  return `
    <div style="background:#0f172a;border:1px solid #1e293b;border-radius:16px;overflow:auto;">
      <table style="width:100%;border-collapse:collapse;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;font-size:0.82rem;line-height:1.55;color:#e2e8f0;">
        <tbody>
          ${lines.map((line, index) => `
            <tr>
              <td style="width:1%;padding:0.1rem 0.75rem;vertical-align:top;text-align:right;color:#64748b;border-right:1px solid #1e293b;user-select:none;">${index + 1}</td>
              <td style="padding:0.1rem 0.9rem;white-space:pre;">${line.length > 0 ? escapeHtml(line) : '&nbsp;'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderApp(): void {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) {
    return;
  }

  app.innerHTML = `
    <div style="display:grid;grid-template-columns:minmax(280px,360px) minmax(0,1fr);gap:1rem;padding:1rem;height:100vh;background:#f5f3ef;color:#111827;">
      <aside style="display:grid;gap:1rem;align-content:start;overflow-y:auto;">
        <section style="background:#fff;border-radius:18px;padding:1rem;box-shadow:0 12px 24px rgba(15,23,42,0.08);">
          <h1 style="margin:0 0 0.75rem;font-size:1.1rem;">SRS Dev Tools</h1>
          <label style="display:grid;gap:0.35rem;margin-bottom:0.75rem;">
            <span>Sample page</span>
            <select data-role="sample-select" style="padding:0.6rem;border-radius:12px;border:1px solid #cbd5e1;">
              ${devSamplePages.map((sample) => `<option value="${sample.pageId}" ${sample.pageId === currentSample.pageId ? 'selected' : ''}>${sample.title}</option>`).join('')}
            </select>
          </label>
          <div style="display:grid;gap:0.5rem;">
            <div><strong>Virtual time</strong></div>
            <div data-role="time-label">${clock.now().toISOString()}</div>
            <div style="display:flex;flex-wrap:wrap;gap:0.5rem;">
              <button data-role="prev-waypoint" class="meadow-srs-button meadow-srs-button--subtle" type="button">← waypoint</button>
              <button data-role="next-waypoint" class="meadow-srs-button meadow-srs-button--subtle" type="button">waypoint →</button>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:0.5rem;">
              <button data-role="minus-hour" class="meadow-srs-button meadow-srs-button--subtle" type="button">-1h</button>
              <button data-role="plus-hour" class="meadow-srs-button meadow-srs-button--subtle" type="button">+1h</button>
              <button data-role="plus-day" class="meadow-srs-button meadow-srs-button--subtle" type="button">+1d</button>
            </div>
            <button data-role="clear-state" class="meadow-srs-button meadow-srs-button--subtle" type="button">Clear state</button>
          </div>
        </section>
        <section style="background:#fff;border-radius:18px;padding:1rem;box-shadow:0 12px 24px rgba(15,23,42,0.08);">
          <h2 style="margin:0 0 0.75rem;font-size:1rem;">Runtime settings</h2>
          <label style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
            <input type="checkbox" data-role="bury-siblings" checked />
            <span>Bury siblings in due mode</span>
          </label>
          <label style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.75rem;">
            <input type="checkbox" data-role="show-context" checked />
            <span>Show heading context</span>
          </label>
          <label style="display:grid;gap:0.35rem;margin-bottom:0.75rem;">
            <span>Default review mode</span>
            <select data-role="review-mode" style="padding:0.6rem;border-radius:12px;border:1px solid #cbd5e1;">
              <option value="due">Due</option>
              <option value="cram">Cram</option>
            </select>
          </label>
          <label style="display:grid;gap:0.35rem;">
            <span>End delimiter</span>
            <input data-role="end-delimiter" value="+++" style="padding:0.6rem;border-radius:12px;border:1px solid #cbd5e1;" />
          </label>
        </section>
        <section style="background:#fff;border-radius:18px;padding:1rem;box-shadow:0 12px 24px rgba(15,23,42,0.08);">
          <h2 style="margin:0 0 0.75rem;font-size:1rem;">Waypoints</h2>
          <div data-role="waypoints" style="display:grid;gap:0.4rem;font-size:0.9rem;"></div>
        </section>
        <section style="background:#fff;border-radius:18px;padding:1rem;box-shadow:0 12px 24px rgba(15,23,42,0.08);">
          <h2 style="margin:0 0 0.75rem;font-size:1rem;">State and cards</h2>
          <pre data-role="state" style="margin:0;white-space:pre-wrap;font-size:0.8rem;"></pre>
        </section>
      </aside>
      <main data-role="overlay-container" style="position:relative;background:#fffaf0;border-radius:24px;padding:1rem 1rem 5rem;box-shadow:0 12px 24px rgba(15,23,42,0.08);overflow-y:auto;">
        <div data-role="preview-root"></div>
      </main>
      <div data-role="source-modal" hidden style="position:fixed;inset:0;background:rgba(15,23,42,0.55);padding:2rem;display:none;align-items:center;justify-content:center;z-index:1000;">
        <div style="width:min(960px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:20px;padding:1rem 1rem 1.25rem;box-shadow:0 20px 50px rgba(15,23,42,0.2);">
          <div style="display:flex;justify-content:space-between;gap:1rem;align-items:start;margin-bottom:0.75rem;">
            <div>
              <h2 style="margin:0;font-size:1.05rem;">Source HTML</h2>
              <div data-role="source-modal-meta" style="margin-top:0.35rem;color:#64748b;font-size:0.9rem;"></div>
            </div>
            <button data-role="close-source-modal" class="meadow-srs-button meadow-srs-button--subtle" type="button">Close</button>
          </div>
          <div style="display:flex;gap:0.5rem;margin-bottom:0.85rem;">
            <button data-role="source-tab-rendered" class="meadow-srs-button meadow-srs-button--subtle" type="button">Rendered</button>
            <button data-role="source-tab-markup" class="meadow-srs-button meadow-srs-button--subtle" type="button">Markup</button>
          </div>
          <div data-role="source-modal-body" style="display:grid;gap:0.85rem;"></div>
        </div>
      </div>
    </div>
  `;

  const previewRoot = app.querySelector<HTMLDivElement>('[data-role="preview-root"]');
  const stateRoot = app.querySelector<HTMLElement>('[data-role="state"]');
  const waypointsRoot = app.querySelector<HTMLElement>('[data-role="waypoints"]');
  const timeLabel = app.querySelector<HTMLElement>('[data-role="time-label"]');
  const sourceModal = app.querySelector<HTMLDivElement>('[data-role="source-modal"]');
  const sourceModalMeta = app.querySelector<HTMLElement>('[data-role="source-modal-meta"]');
  const sourceModalBody = app.querySelector<HTMLElement>('[data-role="source-modal-body"]');
  const renderedTabButton = app.querySelector<HTMLButtonElement>('[data-role="source-tab-rendered"]');
  const markupTabButton = app.querySelector<HTMLButtonElement>('[data-role="source-tab-markup"]');
  const overlayContainer = app.querySelector<HTMLElement>('[data-role="overlay-container"]');
  if (
    !previewRoot
    || !stateRoot
    || !waypointsRoot
    || !timeLabel
    || !sourceModal
    || !sourceModalMeta
    || !sourceModalBody
    || !renderedTabButton
    || !markupTabButton
    || !overlayContainer
  ) {
    return;
  }

  const renderSourceModalBody = () => {
    if (!activeSourceGroup) {
      sourceModalBody.replaceChildren();
      return;
    }

    renderedTabButton.classList.toggle('is-active', activeSourceTab === 'rendered');
    markupTabButton.classList.toggle('is-active', activeSourceTab === 'html');

    if (activeSourceTab === 'rendered') {
      sourceModalBody.innerHTML = [
        `<div style="font-size:0.9rem;color:#475569;">This is how the captured source blocks render when inserted back into the page.</div>`,
        `<section style="background:#fffaf0;border:1px solid #e2e8f0;border-radius:16px;padding:1rem;">
          ${activeSourceGroup.blocks.map((block) => block.html).join('\n')}
        </section>`,
        ...activeSourceGroup.blocks.map((block, index) => `
          <section style="display:grid;gap:0.5rem;">
            <div style="font-weight:600;">Block ${index + 1}</div>
            <div style="background:#fffaf0;border:1px solid #e2e8f0;border-radius:16px;padding:0.9rem;">${block.html}</div>
            <div style="color:#64748b;font-size:0.82rem;">Text: ${escapeHtml(block.text || '(empty)')}</div>
          </section>`),
      ].join('');
      return;
    }

    sourceModalBody.innerHTML = [
      `<div style="font-size:0.9rem;color:#475569;">This is the exact raw HTML markup captured before the SRS library upgraded this group.</div>`,
      `<section>
        <div style="font-weight:600;margin-bottom:0.35rem;">Combined group markup</div>
        ${renderCodePane(activeSourceGroup.blocks.map((block) => block.html).join('\n'))}
      </section>`,
      ...activeSourceGroup.blocks.map((block, index) => `
        <section>
          <div style="font-weight:600;margin-bottom:0.35rem;">Block ${index + 1} markup</div>
          ${renderCodePane(block.html)}
          <div style="margin-top:0.35rem;color:#64748b;font-size:0.82rem;">Text: ${escapeHtml(block.text || '(empty)')}</div>
        </section>`),
    ].join('');
  };

  const closeSourceModal = () => {
    sourceModal.hidden = true;
    sourceModal.style.display = 'none';
    activeSourceGroup = null;
    activeSourceTab = 'rendered';
    renderedTabButton.classList.remove('is-active');
    markupTabButton.classList.remove('is-active');
    sourceModalMeta.textContent = '';
    sourceModalBody.replaceChildren();
  };

  const openSourceModal = (group: MeadowSrsDebugSourceGroup) => {
    activeSourceGroup = group;
    activeSourceTab = 'rendered';
    sourceModalMeta.textContent = `Source ${group.sourceId}${group.contextPath.length > 0 ? ` • ${group.contextPath.join(' / ')}` : ''}`;
    renderSourceModalBody();
    sourceModal.hidden = false;
    sourceModal.style.display = 'flex';
  };

  const renderSourceButtons = () => {
    previewRoot.querySelectorAll<HTMLElement>('[data-role="source-debug-toolbar"]').forEach((element) => {
      element.remove();
    });

    if (!activeController) {
      return;
    }

    activeController.getDebugSourceGroups().forEach((group) => {
      const toolbar = document.createElement('div');
      toolbar.dataset.role = 'source-debug-toolbar';
      toolbar.style.display = 'flex';
      toolbar.style.justifyContent = 'space-between';
      toolbar.style.alignItems = 'center';
      toolbar.style.gap = '0.75rem';
      toolbar.style.margin = '1rem 0 0.5rem';

      const label = document.createElement('div');
      label.style.fontSize = '0.82rem';
      label.style.color = '#64748b';
      label.textContent = group.contextPath.length > 0
        ? group.contextPath.join(' / ')
        : group.sourceId;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'meadow-srs-button meadow-srs-button--subtle';
      button.textContent = 'View source HTML';
      button.addEventListener('click', () => openSourceModal(group));

      toolbar.append(label, button);
      group.mountElement.parentNode?.insertBefore(toolbar, group.mountElement);
    });
  };

  const updateInspector = () => {
    if (!activeController) {
      return;
    }
    timeLabel.textContent = clock.now().toISOString();
    stateRoot.textContent = JSON.stringify({
      reviewMode: activeController.getReviewMode(),
      visibleReviewCards: activeController.getVisibleReviewCards().map((card) => ({
        id: card.definition.id,
        text: card.definition.searchText,
        context: card.definition.contextPath,
        due: card.due,
        newCard: card.newCard,
        buried: card.buried,
      })),
      runtimeCards: activeController.getRuntimeCards().map((card) => ({
        id: card.definition.id,
        text: card.definition.searchText,
        siblingGroupKey: card.definition.siblingGroupKey,
        context: card.definition.contextPath,
        dueAt: card.state.dueAt,
        buriedUntil: card.state.buriedUntil,
      })),
      store: loadStore(currentSample.siteGuid, persistence),
    }, null, 2);
    const waypoints = collectWaypoints(activeController.getRuntimeCards(), clock.now());
    waypointsRoot.innerHTML = waypoints.map((waypoint) => {
      const marker = waypoint.atMs === clock.now().getTime() ? '• ' : '';
      return `<div>${marker}${new Date(waypoint.atMs).toISOString()}<br /><span style="color:#64748b;">${waypoint.label}</span></div>`;
    }).join('');
  };

  const mountPreview = () => {
    activeController?.destroy();
    closeSourceModal();
    previewRoot.innerHTML = currentSample.bodyHtml;
    previewRoot.dataset.meadowSrsSiteGuid = currentSample.siteGuid;
    previewRoot.dataset.meadowSrsPageId = currentSample.pageId;
    activeController = controller({
      root: previewRoot,
      siteGuid: currentSample.siteGuid,
      pageId: currentSample.pageId,
      clock,
      persistence,
      settings: runtimeSettings,
      overlayContainer,
      onStateChange: updateInspector,
    });
    renderSourceButtons();
    updateInspector();
  };

  const jumpWaypoint = (direction: 'previous' | 'next') => {
    if (!activeController) {
      return;
    }
    const nowMs = clock.now().getTime();
    const waypoints = activeController.getWaypoints();
    const candidates = direction === 'next'
      ? waypoints.filter((waypoint) => waypoint.atMs > nowMs)
      : waypoints.filter((waypoint) => waypoint.atMs < nowMs);
    const selected = direction === 'next' ? candidates[0] : candidates[candidates.length - 1];
    if (selected) {
      clock.set(new Date(selected.atMs));
      activeController.refresh();
    }
  };

  app.querySelector<HTMLSelectElement>('[data-role="sample-select"]')?.addEventListener('change', (event) => {
    const nextPageId = (event.target as HTMLSelectElement).value;
    const nextSample = devSamplePages.find((sample) => sample.pageId === nextPageId);
    if (!nextSample) {
      return;
    }
    currentSample = nextSample;
    mountPreview();
  });

  app.querySelector<HTMLButtonElement>('[data-role="prev-waypoint"]')?.addEventListener('click', () => jumpWaypoint('previous'));
  app.querySelector<HTMLButtonElement>('[data-role="next-waypoint"]')?.addEventListener('click', () => jumpWaypoint('next'));
  app.querySelector<HTMLButtonElement>('[data-role="minus-hour"]')?.addEventListener('click', () => {
    clock.set(new Date(clock.now().getTime() - (60 * 60 * 1000)));
    activeController?.refresh();
  });
  app.querySelector<HTMLButtonElement>('[data-role="plus-hour"]')?.addEventListener('click', () => {
    clock.set(new Date(clock.now().getTime() + (60 * 60 * 1000)));
    activeController?.refresh();
  });
  app.querySelector<HTMLButtonElement>('[data-role="plus-day"]')?.addEventListener('click', () => {
    clock.set(new Date(clock.now().getTime() + (24 * 60 * 60 * 1000)));
    activeController?.refresh();
  });
  app.querySelector<HTMLButtonElement>('[data-role="clear-state"]')?.addEventListener('click', () => {
    activeController?.clearState();
    updateInspector();
  });
  renderedTabButton.addEventListener('click', () => {
    if (!activeSourceGroup) {
      return;
    }
    activeSourceTab = 'rendered';
    renderSourceModalBody();
  });
  markupTabButton.addEventListener('click', () => {
    if (!activeSourceGroup) {
      return;
    }
    activeSourceTab = 'html';
    renderSourceModalBody();
  });
  app.querySelector<HTMLButtonElement>('[data-role="close-source-modal"]')?.addEventListener('click', closeSourceModal);
  sourceModal.addEventListener('click', (event) => {
    if (event.target === sourceModal) {
      closeSourceModal();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !sourceModal.hidden) {
      closeSourceModal();
    }
  });
  app.querySelector<HTMLInputElement>('[data-role="bury-siblings"]')?.addEventListener('change', (event) => {
    runtimeSettings = {
      ...runtimeSettings,
      burySiblingCards: (event.target as HTMLInputElement).checked,
    };
    mountPreview();
  });
  app.querySelector<HTMLInputElement>('[data-role="show-context"]')?.addEventListener('change', (event) => {
    runtimeSettings = {
      ...runtimeSettings,
      showContext: (event.target as HTMLInputElement).checked,
    };
    mountPreview();
  });
  app.querySelector<HTMLSelectElement>('[data-role="review-mode"]')?.addEventListener('change', (event) => {
    runtimeSettings = {
      ...runtimeSettings,
      defaultReviewMode: (event.target as HTMLSelectElement).value as SrsSettings['defaultReviewMode'],
    };
    mountPreview();
  });
  app.querySelector<HTMLInputElement>('[data-role="end-delimiter"]')?.addEventListener('change', (event) => {
    runtimeSettings = {
      ...runtimeSettings,
      endDelimiter: (event.target as HTMLInputElement).value,
    };
    mountPreview();
  });

  mountPreview();
}

renderApp();
