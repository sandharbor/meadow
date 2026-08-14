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

import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import type { Migration } from '../../../../../shared_code/types/migrations.js';
import { getDefaultConfigDirectory } from '../../../../../shared_code/utils/appConfigUtils.js';

const LEGACY_ENTITY_DIRECTORY = 'sites';
const CANONICAL_ENTITY_DIRECTORY = 'bundles';

const CONTROLLED_PATH_RENAMES: ReadonlyArray<readonly [string, string]> = [
  ['conf/site_config.yaml', 'conf/bundle_config.yaml'],
  ['conf/site_node_config.yaml', 'conf/bundle_node_config.yaml'],
  ['conf/draft_site_node_config.yaml', 'conf/draft_bundle_node_config.yaml'],
  ['conf/generated_site_versions.yaml', 'conf/generated_bundle_versions.yaml'],
  ['raw/tracked_site_node_config.yaml', 'raw/tracked_bundle_node_config.yaml'],
  ['build/prepared_site_node_config.yaml', 'build/prepared_bundle_node_config.yaml'],
  ['html/generated_site_versions', 'html/generated_bundle_versions'],
];

export interface BundleDomainMigrationReport {
  movedPaths: string[];
  rewrittenConfigFiles: string[];
}

function sameFileContents(left: string, right: string): boolean {
  const leftStats = fs.statSync(left);
  const rightStats = fs.statSync(right);
  if (leftStats.size !== rightStats.size) return false;
  return fs.readFileSync(left).equals(fs.readFileSync(right));
}

function moveWithoutDataLoss(source: string, destination: string, movedPaths: string[]): void {
  if (!fs.existsSync(source)) return;

  if (!fs.existsSync(destination)) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.renameSync(source, destination);
    movedPaths.push(`${source} -> ${destination}`);
    return;
  }

  const sourceStats = fs.statSync(source);
  const destinationStats = fs.statSync(destination);
  if (sourceStats.isDirectory() && destinationStats.isDirectory()) {
    for (const entry of fs.readdirSync(source).sort((left, right) => left.localeCompare(right))) {
      moveWithoutDataLoss(
        path.join(source, entry),
        path.join(destination, entry),
        movedPaths,
      );
    }
    fs.rmdirSync(source);
    return;
  }

  if (sourceStats.isFile() && destinationStats.isFile() && sameFileContents(source, destination)) {
    fs.unlinkSync(source);
    movedPaths.push(`${source} -> ${destination} (identical destination retained)`);
    return;
  }

  throw new Error(`Cannot rename legacy Meadow path because both paths contain different data: ${source} and ${destination}`);
}

/**
 * Renames only Meadow's domain token. Literal website keys (for example
 * `websiteUrl`) are intentionally unaffected because lowercase replacements
 * require a token boundary and camel-case replacements require `Bundle`.
 */
export function canonicalBundleKey(key: string): string {
  return key
    .replace(/Sites/g, 'Bundles')
    .replace(/Site/g, 'Bundle')
    .replace(/(?<![A-Z])SITES(?=$|[^a-z])/g, 'BUNDLES')
    .replace(/(?<![A-Z])SITE(?=$|[^a-z])/g, 'BUNDLE')
    .replace(/(?<![A-Za-z])sites(?=$|[^a-z])/g, 'bundles')
    .replace(/(?<![A-Za-z])site(?=$|[^a-z])/g, 'bundle');
}

function renameYamlKeys(node: unknown, filePath: string): boolean {
  if (YAML.isMap(node)) {
    let changed = false;
    const canonicalKeys = new Map<string, string>();
    for (const pair of node.items) {
      if (YAML.isScalar(pair.key) && typeof pair.key.value === 'string') {
        const legacyKey = pair.key.value;
        const canonicalKey = canonicalBundleKey(legacyKey);
        const priorLegacyKey = canonicalKeys.get(canonicalKey);
        if (priorLegacyKey !== undefined && priorLegacyKey !== legacyKey) {
          throw new Error(
            `Cannot rename config keys in ${filePath}: '${priorLegacyKey}' and '${legacyKey}' both map to '${canonicalKey}'`,
          );
        }
        canonicalKeys.set(canonicalKey, legacyKey);
        if (canonicalKey !== legacyKey) {
          pair.key.value = canonicalKey;
          changed = true;
        }
      }
      changed = renameYamlKeys(pair.value, filePath) || changed;
    }
    return changed;
  }

  if (YAML.isSeq(node)) {
    return node.items.reduce(
      (changed: boolean, item: unknown) => renameYamlKeys(item, filePath) || changed,
      false,
    );
  }

  return false;
}

function renameJsonKeys(value: unknown, filePath: string): { value: unknown; changed: boolean } {
  if (Array.isArray(value)) {
    let changed = false;
    const items = value.map((item) => {
      const renamed = renameJsonKeys(item, filePath);
      changed = changed || renamed.changed;
      return renamed.value;
    });
    return { value: items, changed };
  }

  if (typeof value !== 'object' || value === null) return { value, changed: false };

  let changed = false;
  const result: Record<string, unknown> = {};
  for (const [legacyKey, child] of Object.entries(value)) {
    const canonicalKey = canonicalBundleKey(legacyKey);
    if (Object.prototype.hasOwnProperty.call(result, canonicalKey)) {
      throw new Error(`Cannot rename config key '${legacyKey}' in ${filePath}: '${canonicalKey}' already exists`);
    }
    const renamed = renameJsonKeys(child, filePath);
    result[canonicalKey] = renamed.value;
    changed = changed || canonicalKey !== legacyKey || renamed.changed;
  }
  return { value: result, changed };
}

function rewriteConfigKeys(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase();
  const original = fs.readFileSync(filePath, 'utf8');

  if (extension === '.yaml' || extension === '.yml') {
    const document = YAML.parseDocument(original);
    if (document.errors.length > 0) {
      throw new Error(`Cannot migrate invalid YAML config ${filePath}: ${document.errors[0].message}`);
    }
    if (!renameYamlKeys(document.contents, filePath)) return false;
    fs.writeFileSync(filePath, document.toString(), 'utf8');
    return true;
  }

  if (extension === '.json') {
    const renamed = renameJsonKeys(JSON.parse(original) as unknown, filePath);
    if (!renamed.changed) return false;
    fs.writeFileSync(filePath, `${JSON.stringify(renamed.value, null, 2)}\n`, 'utf8');
    return true;
  }

  return false;
}

function collectStructuredConfigs(directory: string, skippedDirectoryNames: ReadonlySet<string> = new Set()): string[] {
  if (!fs.existsSync(directory)) return [];
  const result: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!skippedDirectoryNames.has(entry.name)) {
        result.push(...collectStructuredConfigs(entryPath, skippedDirectoryNames));
      }
      continue;
    }
    if (entry.isFile() && ['.yaml', '.yml', '.json'].includes(path.extname(entry.name).toLowerCase())) {
      result.push(entryPath);
    }
  }
  return result;
}

function configFilesForBundle(bundleDirectory: string): string[] {
  const files = [
    ...collectStructuredConfigs(path.join(bundleDirectory, 'conf')),
    ...collectStructuredConfigs(path.join(bundleDirectory, 'config')),
  ];
  for (const relativePath of [
    'raw/tracked_bundle_node_config.yaml',
    'build/prepared_bundle_node_config.yaml',
  ]) {
    const filePath = path.join(bundleDirectory, relativePath);
    if (fs.existsSync(filePath)) files.push(filePath);
  }
  return files;
}

/** Migrate one Meadow home without altering user-authored content or slugs. */
export function migrateSitesToBundles(configDirectory: string): BundleDomainMigrationReport {
  const report: BundleDomainMigrationReport = { movedPaths: [], rewrittenConfigFiles: [] };
  const legacyEntities = path.join(configDirectory, LEGACY_ENTITY_DIRECTORY);
  const canonicalEntities = path.join(configDirectory, CANONICAL_ENTITY_DIRECTORY);
  moveWithoutDataLoss(legacyEntities, canonicalEntities, report.movedPaths);

  if (fs.existsSync(canonicalEntities)) {
    for (const entry of fs.readdirSync(canonicalEntities, { withFileTypes: true })
      .filter(candidate => candidate.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const bundleDirectory = path.join(canonicalEntities, entry.name);
      for (const [legacyRelativePath, canonicalRelativePath] of CONTROLLED_PATH_RENAMES) {
        moveWithoutDataLoss(
          path.join(bundleDirectory, legacyRelativePath),
          path.join(bundleDirectory, canonicalRelativePath),
          report.movedPaths,
        );
      }
      for (const filePath of configFilesForBundle(bundleDirectory)) {
        if (rewriteConfigKeys(filePath)) report.rewrittenConfigFiles.push(filePath);
      }
    }
  }

  const appDirectory = path.join(configDirectory, 'app');
  for (const filePath of collectStructuredConfigs(
    appDirectory,
    new Set(['hooks', 'custom_assets']),
  )) {
    if (rewriteConfigKeys(filePath)) report.rewrittenConfigFiles.push(filePath);
  }

  report.movedPaths.sort((left, right) => left.localeCompare(right));
  report.rewrittenConfigFiles.sort((left, right) => left.localeCompare(right));
  return report;
}

export const migration: Migration = {
  name: 'Rename sites to bundles',
  description: 'Move Meadow entity data to canonical bundle paths and config keys while preserving content and slugs.',
  run: (): Promise<void> => {
    migrateSitesToBundles(getDefaultConfigDirectory());
    return Promise.resolve();
  },
};
