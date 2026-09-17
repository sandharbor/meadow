/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { reviewQueryHtmlPathForPage } from '../../generation/exported.js';
import { currentGeneratedBundleVersionDirectory } from '../../../../shared/generated-bundle-versioning/generatedBundleVersionManifestService.js';
import { loadDefaultTraversalPage, previewFileUrl } from '../../../../shared/generated-bundle-versioning/previewUrls.js';

export function defaultBundlePreviewUrl(
  req: express.Request, bundleSlug: string, bundleDirectory: string,
): string | null {
  const directory = currentGeneratedBundleVersionDirectory(bundleDirectory);
  if (!directory) return null;
  const page = loadDefaultTraversalPage(bundleDirectory);
  const relativePath = reviewQueryHtmlPathForPage(bundleDirectory, page.title, page.directory);
  if (relativePath && fs.existsSync(path.join(directory, relativePath))) {
    return previewFileUrl(req, bundleSlug, relativePath);
  }
  const fallback = fs.readdirSync(directory).find(file => file.endsWith('.html'));
  return fallback ? previewFileUrl(req, bundleSlug, fallback) : null;
}
