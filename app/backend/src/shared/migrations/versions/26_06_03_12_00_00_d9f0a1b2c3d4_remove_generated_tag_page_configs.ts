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
import { SiteConfigPaths } from '../../../../../shared_code/paths/siteConfigPaths.js';
import { getDefaultConfigDirectory } from '../../../../../shared_code/utils/appConfigUtils.js';

function isGeneratedTagPageConfig(item: Record<string, unknown>): boolean {
  return item.sourceGraphSubdirectory === SiteConfigPaths.TAGPAGES_DIR ||
    item.source_graph_subdirectory === SiteConfigPaths.TAGPAGES_DIR;
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

function removeStaleGeneratedTagContent(siteDir: string): void {
  const paths = [
    SiteConfigPaths.getTrackedPageContentTagpagesDir(siteDir),
    SiteConfigPaths.getPreparedSourceContentDir(siteDir),
    SiteConfigPaths.getPreparedSitePageConfigFile(siteDir),
    SiteConfigPaths.getLegacyRenderSourceContentDir(siteDir),
  ];

  for (const targetPath of paths) {
    if (fs.existsSync(targetPath)) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    }
  }
}

function migrateSites(configDir: string): void {
  const sitesDir = path.join(configDir, 'sites');
  if (!fs.existsSync(sitesDir)) return;

  const siteEntries = fs.readdirSync(sitesDir, { withFileTypes: true });
  for (const entry of siteEntries) {
    if (!entry.isDirectory()) continue;

    const siteDir = path.join(sitesDir, entry.name);
    const confDir = SiteConfigPaths.getConfDir(siteDir);
    if (fs.existsSync(confDir)) {
      for (const filename of ['site_page_config.yaml', 'draft_site_page_config.yaml']) {
        const filePath = path.join(confDir, filename);
        if (fs.existsSync(filePath)) {
          removeGeneratedTagPageConfigs(filePath);
        }
      }
    }

    removeStaleGeneratedTagContent(siteDir);
  }
}

export const migration: Migration = {
  name: 'Remove generated tag page configs',
  description: 'Remove generated tag page entries from persisted site page configs and clean stale generated source material.',
  run: (): Promise<void> => {
    migrateSites(getDefaultConfigDirectory());
    return Promise.resolve();
  }
};
