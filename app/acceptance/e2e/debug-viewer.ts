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

import { chromium } from '@playwright/test';

const URL = 'http://localhost:5175/2026-04-01_17-17-24_e2e/markdown-export-zip-enable-preview-save-and-verify-meadowhome-is-fully-committed';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Collect console errors
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(`PAGE ERROR: ${err.message}`));

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Check for errors
  console.log('=== Console Errors ===');
  for (const e of errors) console.log(e);
  if (errors.length === 0) console.log('(none)');

  // Check tick indicator
  const tickLabel = await page.locator('text=Tick:').first().textContent().catch(() => 'NOT FOUND');
  console.log('\n=== Tick label ===');
  console.log(tickLabel);

  // Check the snapshot dropdown area
  const snapshotArea = await page.locator('.relative.flex.items-center').first().textContent().catch(() => 'NOT FOUND');
  console.log('\n=== Snapshot/Tick indicator area ===');
  console.log(snapshotArea?.slice(0, 200));

  // Check MeadowHome Files area
  const filesHeader = await page.locator('text=MeadowHome Files').first().textContent().catch(() => 'NOT FOUND');
  console.log('\n=== Files header ===');
  console.log(filesHeader);

  // Check file tree content
  const fileTree = await page.locator('.w-60').first().textContent().catch(() => 'NOT FOUND');
  console.log('\n=== File tree (first 500 chars) ===');
  console.log(fileTree?.slice(0, 500));

  // Check filter bar
  const filterBar = await page.locator('text=added').first().isVisible().catch(() => false);
  console.log('\n=== Filter bar visible ===');
  console.log(filterBar);

  // Try pressing right arrow to navigate ticks
  console.log('\n=== Navigating ticks ===');
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(500);
    const indicator = await page.locator('.relative.flex.items-center').first().textContent().catch(() => '');
    const tickMatch = indicator?.match(/\((\d+)\/(\d+)/);
    console.log(`After arrow ${i + 1}: ${tickMatch ? `tick ${tickMatch[1]}/${tickMatch[2]}` : 'no tick info'}`);
  }

  // Check if manifest has tick data
  console.log('\n=== Checking manifest tick data ===');
  const manifestData = await page.evaluate(async () => {
    const res = await fetch('/api/2026-04-01_17-17-24_e2e/markdown-export-zip-enable-preview-save-and-verify-meadowhome-is-fully-committed/manifest');
    const m = await res.json();
    return {
      tickCount: m.ticks?.length || 0,
      firstTickFiles: m.ticks?.[0]?.uncommittedFiles?.length ?? 'missing',
      hasUncommittedFiles: m.ticks?.some((t: any) => t.uncommittedFiles && t.uncommittedFiles.length > 0),
      tickKeys: m.ticks?.[0] ? Object.keys(m.ticks[0]) : [],
    };
  });
  console.log(JSON.stringify(manifestData, null, 2));

  await browser.close();
})();
