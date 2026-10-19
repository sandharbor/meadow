/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { test, expect } from '@playwright/test';

test('semantic AKA titles keep the readable name and navigate each linked concept', async ({ page }) => {
  await page.goto('/concepts/tracked-node-becomes-sensitive');
  await expect(page.getByRole('heading', { name: 'Tracked Bundle Node Becomes Sensitive', exact: true })).toBeVisible();
  const title = page.getByLabel('Semantic title', { exact: true });
  await expect(title).toContainText('AKA');
  await expect(title.getByRole('link')).toHaveText(['Tracked Bundle Node', 'Changes Since Tracking', 'Sensitivity']);
  await title.getByRole('link', { name: 'Changes Since Tracking', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Changes Since Tracking', exact: true })).toBeVisible();
  await expect(page.getByLabel('Semantic title', { exact: true })).toHaveCount(0);
  await page.goBack();
  await title.getByRole('link', { name: 'Sensitivity', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sensitive Bundle Node', exact: true })).toBeVisible();
});
