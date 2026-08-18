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

import type { Migration } from '../../../../../shared_code/types/migrations.js';
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { BundleConfigPaths } from '../../../../../shared_code/paths/bundleConfigPaths.js';
import { getDefaultConfigDirectory } from '../../../../../shared_code/utils/appConfigUtils.js';

function isGeneratedTagPageConfig(item: Record<string, unknown>): boolean {
  return item.sourceGraphSubdirectory === BundleConfigPaths.TAGPAGE_SOURCE_STAGING_DIR ||
    item.source_graph_subdirectory === BundleConfigPaths.TAGPAGE_SOURCE_STAGING_DIR;
}

function removeGeneratedTagPageConfigs(filePath: string): void {
  const raw = fs.readFileSync(filePath, 'utf8');
  const doc = YAML.parse(raw) as { pages?: Array<Record<string, unknown>>; nodes?: Array<Record<string, unknown>> } | null;
  if (!doc) return;

  let changed = false;
  if (Array.isArray(doc.pages)) {
    const pages = doc.pages.filter(item => !isGeneratedTagPageConfig(item));
    changed = changed || pages.length !== doc.pages.length;
    doc.pages = pages;
  }
  if (Array.isArray(doc.nodes)) {
    const nodes = doc.nodes.filter(item => !isGeneratedTagPageConfig(item));
    changed = changed || nodes.length !== doc.nodes.length;
    doc.nodes = nodes;
  }

  if (!changed) return;
  fs.writeFileSync(filePath, YAML.stringify(doc, { sortMapEntries: true }), 'utf8');
}

function removeStaleGeneratedTagContent(bundleDir: string): void {
  const paths = [
    BundleConfigPaths.getTrackedPageContentTagpagesDir(bundleDir),
    BundleConfigPaths.getPreparedSourceContentDir(bundleDir),
    path.join(bundleDir, 'build', 'prepared_site_page_config.yaml'),
    BundleConfigPaths.getLegacyRenderSourceContentDir(bundleDir),
  ];

  for (const targetPath of paths) {
    if (fs.existsSync(targetPath)) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    }
  }
}

function migrateBundles(configDir: string): void {
  // This historical migration runs before the bundle-domain migration.
  const bundlesDir = path.join(configDir, 'sites');
  if (!fs.existsSync(bundlesDir)) return;

  const bundleEntries = fs.readdirSync(bundlesDir, { withFileTypes: true });
  for (const entry of bundleEntries) {
    if (!entry.isDirectory()) continue;

    const bundleDir = path.join(bundlesDir, entry.name);
    const confDir = path.join(bundleDir, 'conf');
    if (fs.existsSync(confDir)) {
      for (const filename of ['site_page_config.yaml', 'draft_site_page_config.yaml']) {
        const filePath = path.join(confDir, filename);
        if (fs.existsSync(filePath)) {
          removeGeneratedTagPageConfigs(filePath);
        }
      }
    }

    removeStaleGeneratedTagContent(bundleDir);
  }
}

export const migration: Migration = {
  id: '26_06_03_12_00_00_d9f0a1b2c3d4_remove_generated_tag_page_configs',
  name: 'Remove generated tag page configs',
  description: 'Remove generated tag page entries from legacy page configs and clean stale generated source material.',
  run: (): Promise<void> => {
    migrateBundles(getDefaultConfigDirectory());
    return Promise.resolve();
  }
};
