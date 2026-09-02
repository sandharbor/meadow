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

import type { StartupFailureDiagnostic } from '../../contracts/types/startupRecovery.js';
import { mainPalette, neutralPalette, warningPalette } from '../design/colors.js';

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
  const button = (
    action: string,
    label: string,
    className = '',
    confirmation?: string,
  ): string => (
    `<button${className ? ` class="${className}"` : ''} data-recovery-action="${action}"${confirmation ? ` data-confirm="${escapeHtml(confirmation)}"` : ''}>${escapeHtml(label)}</button>`
  );
  const migrationRecoveryDetails = diagnostic.checkpointId
    ? `${detail('Pre-migration Git commit', diagnostic.checkpointId)}${detail('Recovery files', diagnostic.checkpointPath ?? 'Not available')}`
    : detail('Pre-migration Git commit', 'None available');
  const blocker = diagnostic.runtimeBlocker;
  const technicalDetails = blocker
    ? [
        detail('Selected Meadow Home', diagnostic.selectedHomePath),
        detail('This app', `Meadow ${diagnostic.appVersion}`),
        detail('Active Runtime', blocker.appVersion ? `Meadow ${blocker.appVersion}` : 'Version not available'),
        detail('Browser sessions', String(blocker.browserSessions)),
        detail('Active operations', String(blocker.operationLeases)),
      ].join('')
    : diagnostic.category === 'incomplete-migration' || diagnostic.category === 'checkpoint-failure'
      ? [
          detail('Selected Meadow Home', diagnostic.selectedHomePath),
          detail('Running app', `Meadow ${diagnostic.appVersion}`),
          detail('Last successful migration', diagnostic.lastSuccessfulMigration ?? 'None recorded'),
          migrationRecoveryDetails,
        ].join('')
      : diagnostic.category === 'unsupported-home-format'
        ? [
            detail('Selected Meadow Home', diagnostic.selectedHomePath),
            detail('Home manifest', diagnostic.relevantPath ?? 'Not identified'),
            detail('Running app', `Meadow ${diagnostic.appVersion}`),
            detail('Supported Home formats', `${diagnostic.supportedHomeFormatMinimum}–${diagnostic.supportedHomeFormatMaximum}`),
          ].join('')
        : [
            detail('Selected Meadow Home', diagnostic.selectedHomePath),
            ...(diagnostic.relevantPath ? [detail('Relevant file', diagnostic.relevantPath)] : []),
            detail('Running app', `Meadow ${diagnostic.appVersion}`),
          ].join('');
  const runtimeContext = blocker
    ? `<section class="session-card" aria-label="Active Meadow session">
        <div class="session-icon" aria-hidden="true"><span></span><span></span><span></span></div>
        <div class="session-copy">
          <strong>${escapeHtml(blocker.browserSessions > 0
            ? 'Browser session'
            : blocker.operationLeases > 0
              ? 'Background operation'
              : 'Another Meadow session')}</strong>
          <span>${escapeHtml([
            blocker.appVersion ? `Meadow ${blocker.appVersion}` : null,
            blocker.browserSessions > 0
              ? `${blocker.browserSessions} browser ${blocker.browserSessions === 1 ? 'window' : 'windows'}`
              : null,
            blocker.operationLeases > 0
              ? `${blocker.operationLeases} active ${blocker.operationLeases === 1 ? 'operation' : 'operations'}`
              : null,
          ].filter((value): value is string => value !== null).join(' · '))}</span>
        </div>
      </section>`
    : '';

  let primaryActions: string;
  if (diagnostic.category === 'runtime-busy' && blocker?.operationLeases) {
    primaryActions = [
      button('retry', 'Try again', 'primary'),
      button(
        'take-over',
        'Stop other session and open here',
        'danger',
        'This will stop the active Meadow operation. Any unfinished work in that session may be lost. Continue?',
      ),
    ].join('');
  } else if (diagnostic.category === 'runtime-busy') {
    primaryActions = [
      button('take-over', 'Open here instead', 'primary'),
      ...(blocker?.sessionAvailable ? [button('open-active', 'Return to browser')] : []),
    ].join('');
  } else if (diagnostic.category === 'runtime-unavailable') {
    primaryActions = button('retry', 'Try again', 'primary');
  } else if (diagnostic.category === 'invalid-syntax' || diagnostic.category === 'invalid-schema') {
    primaryActions = [
      button('reveal', 'Show the file', 'primary'),
      button('retry', 'Try again'),
      button('choose-home', 'Choose another Home…'),
    ].join('');
  } else if (diagnostic.category === 'unsupported-home-format') {
    primaryActions = [
      button('choose-home', 'Choose another Home…', 'primary'),
      button('reveal', 'Show this Home'),
    ].join('');
  } else if (diagnostic.category === 'incomplete-migration' || diagnostic.category === 'checkpoint-failure') {
    primaryActions = [
      button('reveal', 'Show recovery files', 'primary'),
      button('retry', 'Try again'),
    ].join('');
  } else {
    primaryActions = [
      button('retry', 'Try again', 'primary'),
      button('choose-home', 'Choose another Home…'),
    ].join('');
  }

  const assurance = diagnostic.category === 'runtime-busy'
    ? 'Meadow paused before opening a second copy. Your Home is safe.'
    : diagnostic.category === 'runtime-unavailable'
      ? 'Meadow is waiting for exclusive access. Your Home is safe.'
      : 'Meadow stopped before making recovery changes to your Home.';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Meadow recovery</title>
<style>
:root { font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: ${neutralPalette[900]}; background: ${neutralPalette[50]}; font-synthesis: none; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: linear-gradient(180deg, #fff 0, ${neutralPalette[50]} 100%); }
.brand { height: 52px; display: flex; align-items: center; padding: 0 24px; border-bottom: 1px solid ${neutralPalette[200]}; background: rgba(255,255,255,.92); font-size: 14px; font-weight: 650; letter-spacing: -.01em; }
main { max-width: 680px; margin: 0 auto; padding: 58px 32px 44px; }
h1 { max-width: 620px; margin: 0; font-size: 34px; line-height: 1.14; letter-spacing: -.035em; font-weight: 680; }
.summary { max-width: 620px; margin: 14px 0 0; color: ${neutralPalette[600]}; font-size: 17px; line-height: 1.55; }
.assurance { display: flex; align-items: flex-start; gap: 9px; margin: 20px 0 0; color: ${mainPalette[800]}; font-size: 13px; line-height: 1.5; font-weight: 550; }
.assurance svg { flex: 0 0 auto; width: 17px; height: 17px; margin-top: 1px; }
.session-card { display: flex; align-items: center; gap: 15px; margin: 28px 0 0; padding: 16px 17px; border: 1px solid ${neutralPalette[200]}; border-radius: 12px; background: #fff; box-shadow: 0 1px 2px rgba(15,23,42,.04); }
.session-icon { position: relative; width: 38px; height: 34px; flex: 0 0 auto; }
.session-icon span { position: absolute; width: 27px; height: 20px; border: 1.5px solid ${neutralPalette[400]}; border-radius: 5px; background: #fff; box-shadow: 0 2px 4px rgba(15,23,42,.08); }
.session-icon span:nth-child(1) { top: 0; left: 0; }
.session-icon span:nth-child(2) { top: 7px; left: 6px; }
.session-icon span:nth-child(3) { top: 14px; left: 11px; border-color: ${mainPalette[500]}; }
.session-copy { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.session-copy strong { font-size: 14px; font-weight: 650; }
.session-copy span { color: ${neutralPalette[500]}; font-size: 12px; line-height: 1.4; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 30px; }
button { appearance: none; min-height: 42px; padding: 9px 15px; border: 1px solid ${neutralPalette[300]}; border-radius: 8px; background: #fff; color: ${neutralPalette[700]}; cursor: pointer; font: inherit; font-size: 14px; font-weight: 620; box-shadow: 0 1px 1px rgba(15,23,42,.03); }
button:hover { border-color: ${neutralPalette[400]}; background: ${neutralPalette[50]}; }
button.primary { border-color: ${mainPalette[600]}; background: ${mainPalette[600]}; color: #fff; }
button.primary:hover { border-color: ${mainPalette[700]}; background: ${mainPalette[700]}; }
button.danger { border-color: ${warningPalette[300]}; background: ${warningPalette[50]}; color: ${warningPalette[800]}; }
button.danger:hover { border-color: ${warningPalette[400]}; background: ${warningPalette[100]}; }
button:focus-visible, summary:focus-visible { outline: 3px solid ${mainPalette[200]}; outline-offset: 2px; }
button:disabled { cursor: wait; opacity: .55; }
#status { min-height: 21px; margin: 13px 0 0; color: ${neutralPalette[600]}; font-size: 13px; }
.technical { margin-top: 28px; padding-top: 22px; border-top: 1px solid ${neutralPalette[200]}; }
.technical > summary { display: inline-flex; align-items: center; gap: 7px; color: ${neutralPalette[500]}; cursor: pointer; font-size: 13px; font-weight: 570; list-style: none; }
.technical > summary::-webkit-details-marker { display: none; }
.technical > summary::before { content: "›"; display: inline-block; font-size: 18px; line-height: 12px; transform: rotate(0); transition: transform .12s ease; }
.technical[open] > summary::before { transform: rotate(90deg); }
.card { margin-top: 15px; padding: 17px; border: 1px solid ${neutralPalette[200]}; border-radius: 10px; background: ${neutralPalette[50]}; }
dl { display: grid; grid-template-columns: 155px minmax(0,1fr); gap: 9px 16px; margin: 0; }
dt { color: ${neutralPalette[500]}; font-size: 12px; font-weight: 560; }
dd { margin: 0; color: ${neutralPalette[700]}; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.45; overflow-wrap: anywhere; }
.technical-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.technical-actions button { min-height: 34px; padding: 6px 10px; font-size: 12px; box-shadow: none; }
@media (max-width: 620px) { main { padding: 42px 22px 34px; } h1 { font-size: 29px; } dl { grid-template-columns: 1fr; gap: 3px; } dd { margin-bottom: 8px; } }
</style></head><body>
<header class="brand">Meadow</header>
<main data-recovery-category="${escapeHtml(diagnostic.category)}">
<h1>${escapeHtml(diagnostic.title)}</h1>
<p class="summary">${escapeHtml(diagnostic.summary)}</p>
<p class="assurance"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5.5 10 3 3 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${escapeHtml(assurance)}</span></p>
${runtimeContext}
<div class="actions">${primaryActions}</div>
<p id="status" role="status" aria-live="polite"></p>
<details class="technical"><summary>Technical details</summary><section class="card"><dl>
${technicalDetails}
</dl><div class="technical-actions">${button('copy', 'Copy diagnostic')}${button('quit', 'Quit Meadow')}</div></section></details>
<script>
document.addEventListener('DOMContentLoaded', () => {
  const status = document.getElementById('status');
  for (const button of document.querySelectorAll('button[data-recovery-action]')) {
    button.addEventListener('click', async () => {
      const confirmation = button.dataset.confirm;
      if (confirmation && !window.confirm(confirmation)) return;
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
