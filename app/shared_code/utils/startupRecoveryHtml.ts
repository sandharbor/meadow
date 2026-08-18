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

import type { StartupFailureDiagnostic } from '../types/startupRecovery.js';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderStartupRecoveryHtml(diagnostic: StartupFailureDiagnostic): string {
  const detail = (label: string, value: string): string => (
    `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`
  );
  const restoreButton = diagnostic.checkpointAvailable
    ? '<button class="danger" data-recovery-action="restore">Restore verified checkpoint</button>'
    : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Meadow recovery</title>
<style>
:root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
body { margin: 0; background: #f4f1e8; color: #292a25; }
main { max-width: 760px; margin: 48px auto; padding: 0 32px 48px; }
.eyebrow { color: #607057; font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
h1 { font-family: Georgia, serif; font-size: 38px; line-height: 1.08; margin: 10px 0 14px; }
.summary { font-size: 17px; line-height: 1.55; max-width: 680px; }
.card { background: rgba(255,255,255,.72); border: 1px solid #cbc8ba; border-radius: 14px; margin: 26px 0; padding: 20px; }
dl { display: grid; grid-template-columns: 190px 1fr; gap: 10px 18px; margin: 0; }
dt { color: #66685f; font-size: 13px; font-weight: 650; }
dd { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12px; margin: 0; overflow-wrap: anywhere; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; }
button { appearance: none; border: 1px solid #64725d; border-radius: 9px; background: #fff; color: #273023; cursor: pointer; font: inherit; font-weight: 650; padding: 10px 14px; }
button.primary { background: #3f5940; color: #fff; }
button.danger { border-color: #9b563f; color: #7b3522; }
button:disabled { cursor: wait; opacity: .55; }
#status { min-height: 22px; margin-top: 16px; color: #596052; }
.note { color: #66685f; font-size: 13px; line-height: 1.45; }
@media (prefers-color-scheme: dark) { body { background: #20231f; color: #ecebdc; } .card { background: #292e29; border-color: #4b5149; } button { background: #31372f; color: #f2f0e4; } }
</style></head><body><main>
<div class="eyebrow">Safe startup recovery</div>
<h1>${escapeHtml(diagnostic.title)}</h1>
<p class="summary">${escapeHtml(diagnostic.summary)}</p>
<section class="card"><dl>
${detail('Selected Meadow Home', diagnostic.selectedHomePath)}
${detail('Bootstrap file', diagnostic.bootstrapPath)}
${detail('Relevant file', diagnostic.relevantPath ?? 'Not identified')}
${detail('Running app', `Meadow ${diagnostic.appVersion}`)}
${detail('Supported Home formats', `${diagnostic.supportedHomeFormatMinimum}–${diagnostic.supportedHomeFormatMaximum}`)}
${detail('Last successful migration', diagnostic.lastSuccessfulMigration ?? 'None recorded')}
${detail('Recovery checkpoint', diagnostic.checkpointId ?? 'None available')}
</dl></section>
<p class="note">Meadow has not reset the invalid file. Choose a different Home, repair the identified file outside Meadow and retry, or restore the verified checkpoint when one is available.</p>
<div class="actions">
<button class="primary" data-recovery-action="retry">Retry startup</button>
<button data-recovery-action="choose-home">Choose another Home…</button>
${restoreButton}
<button data-recovery-action="reveal">Reveal relevant file</button>
<button data-recovery-action="copy">Copy redacted diagnostic</button>
<button data-recovery-action="quit">Quit</button>
</div><p id="status" role="status" aria-live="polite"></p>
<script>
document.addEventListener('DOMContentLoaded', () => {
  const status = document.getElementById('status');
  for (const button of document.querySelectorAll('button[data-recovery-action]')) {
    button.addEventListener('click', async () => {
      for (const candidate of document.querySelectorAll('button')) candidate.disabled = true;
      status.textContent = 'Working…';
      try {
        const result = await window.recoveryAPI.perform(button.dataset.recoveryAction);
        status.textContent = result.message;
      } catch {
        status.textContent = 'The recovery action failed. Your files were preserved.';
      } finally {
        for (const candidate of document.querySelectorAll('button')) candidate.disabled = false;
      }
    });
  }
});
</script>
</main></body></html>`;
}
