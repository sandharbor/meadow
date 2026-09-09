/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { test, expect } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGitBranchFixture } from '../fixtures/git-branch-fixture.js';

test('the existing Git file view switches branches and replays revisions at their captured ticks', async ({ page }) => {
  const run = mkdtempSync(path.join(os.homedir(), 'meadow-e2e-artifacts/current/rv-branches-'));
  try {
    const f = createGitBranchFixture(path.join(run, 'branch-replay'));
    await page.goto(`/${path.basename(run)}/branch-replay`);
    await page.getByRole('button', { name: 'Files', exact: true }).click();
    await expect(page.getByRole('button', { name: /Git branches and source history/ })).toHaveCount(0);
    const picker = page.getByLabel('Git branch', { exact: true });
    await expect(picker).toHaveValue('refs/heads/main');
    const pane = page.getByTestId('meadow-files-git');
    await pane.getByText('Git file view', { exact: true }).click();
    await pane.getByRole('button').filter({ hasText: 'Before sourcing' }).click();
    await expect(pane.locator('[data-file-path="home.txt"]')).toBeVisible();
    await picker.selectOption(f.candidate);
    await pane.getByText('Git file view', { exact: true }).click();
    await pane.getByRole('button').filter({ hasText: 'First candidate observed' }).click();
    await pane.locator('[data-file-path="page.md"]').click();
    await expect(pane).toContainText('first candidate');
    await expect(pane).toContainText('before');
    await pane.getByText('Git file view', { exact: true }).click();
    await pane.getByRole('button').filter({ hasText: 'Candidate replaced' }).click();
    await expect(pane).toContainText('second candidate');
    await pane.locator('[data-file-path="removed.md"]').click();
    await expect(pane).toContainText('before');
    await picker.selectOption(f.branch);
    await pane.locator('[data-file-path="page.md"]').click();
    await expect(pane).toContainText('before');
    await expect(pane).not.toContainText('second candidate');
    await picker.selectOption('refs/heads/main');
    await expect(pane.locator('[data-file-path="home.txt"]')).toBeVisible();
    await expect(pane.locator('[data-file-path="page.md"]')).toHaveCount(0);
  } finally { await page.goto('about:blank'); }
  // Retain this small recording with the other review artifacts.
});
