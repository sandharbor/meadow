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

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import type { Migration } from '../../../../../shared_code/types/migrations.js';
import type {
  GeneratedBundleVersionEntry,
  GeneratedBundleVersionId,
  GeneratedBundleVersionManifest,
} from '../../../../../shared_code/types/generatedBundleVersioning.js';
import { getDefaultConfigDirectory } from '../../../../../shared_code/utils/appConfigUtils.js';
import { GENERATED_BUNDLE_VERSION_ID_PATTERN } from '../../../../../shared_code/types/generatedBundleVersioning.js';
import { serializeGeneratedBundleVersionManifest } from '../../generated-bundle-versioning/generatedBundleVersionManifestService.js';
import { parseGeneratedBundleVersionManifest } from '../../generated-bundle-versioning/generatedBundleVersionDomain.js';
import { logger } from '../../utils/logging/backendLoggingUtils.js';

export const GENERATED_BUNDLE_VERSIONING_MIGRATION_EVIDENCE = path.join(
  'config',
  'migration_evidence',
  'generated_bundle_versioning_v1.json',
);

interface LegacyVersionRecord {
  versionId: string;
  firstPublishedAt?: unknown;
  lastUpdatedAt?: unknown;
  notes?: unknown;
  isActive?: unknown;
}

interface BundleMigrationPlan {
  alreadyCanonical: boolean;
  bundleDirectory: string;
  bundleConfig: Record<string, unknown>;
  manifest: GeneratedBundleVersionManifest;
  generatedDirectory: string;
  currentVersionDirectory: string | null;
  legacyManifestPathsToRemove: string[];
  legacyVersionDirectoriesToMove: string[];
  legacyVersionsRootToRemove: string | null;
  migrationEvidence: {
    schemaVersion: 1;
    bundleLastPublishedAt: string | null;
    versions: Array<{
      legacyVersionId: string;
      canonicalVersionId: GeneratedBundleVersionId;
      firstPublishedAt: string | null;
      lastUpdatedAt: string | null;
      hadVersionDirectory: boolean;
    }>;
  };
}

export interface GeneratedBundleVersioningMigrationReport {
  bundlesVisited: number;
  bundlesWithVersions: number;
  versionCount: number;
  generatedDirectoriesMoved: number;
  invalidLegacyIdsReplaced: number;
}

function optionalIso(value: unknown): string | null {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function randomVersionId(usedLowercase: Set<string>): GeneratedBundleVersionId {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    let value = 'v';
    const bytes = crypto.randomBytes(6);
    for (const byte of bytes) value += alphabet[byte % alphabet.length];
    if (!usedLowercase.has(value.toLowerCase())) {
      usedLowercase.add(value.toLowerCase());
      return value as GeneratedBundleVersionId;
    }
  }
  throw new Error('Could not reserve a collision-free generated bundle version ID');
}

function orderedLegacyRecords(
  manifestValue: unknown,
  bundleConfig: Record<string, unknown>,
  directoryNames: string[],
): LegacyVersionRecord[] {
  const parsed = manifestValue && typeof manifestValue === 'object'
    ? manifestValue as { versions?: unknown }
    : {};
  const records: LegacyVersionRecord[] = Array.isArray(parsed.versions)
    ? parsed.versions.map((value, index) => {
        if (!value || typeof value !== 'object' || typeof (value as { versionId?: unknown }).versionId !== 'string') {
          throw new Error(`Legacy version record ${index} is missing versionId`);
        }
        return value as LegacyVersionRecord;
      })
    : [];
  const seen = new Set(records.map(record => record.versionId));
  for (const field of ['generatedBundleVersions', 'publishVersions'] as const) {
    if (Array.isArray(bundleConfig[field])) {
      for (const value of bundleConfig[field]) {
        if (typeof value !== 'string') throw new Error(`${field} must contain only strings`);
        if (!seen.has(value)) {
          records.push({ versionId: value });
          seen.add(value);
        }
      }
    }
  }
  if (records.length === 0 && directoryNames.length === 1) {
    records.push({ versionId: directoryNames[0] });
  } else if (records.length === 0 && directoryNames.length > 1) {
    throw new Error('Multiple generated version directories exist without an ordered version record');
  }
  return records;
}

function planBundle(bundleDirectory: string): BundleMigrationPlan {
  const configDirectory = path.join(bundleDirectory, 'config');
  const bundleConfigPath = path.join(configDirectory, 'bundle_config.yaml');
  const canonicalManifestPath = path.join(configDirectory, 'generated_bundle_versions.yaml');
  const legacyManifestCandidates = [
    path.join(configDirectory, 'published_versions.yaml'),
    path.join(bundleDirectory, 'conf', 'published_versions.yaml'),
  ];
  const legacyManifestPathsToRemove = legacyManifestCandidates.filter(candidate => fs.existsSync(candidate));
  const manifestSourcePath = fs.existsSync(canonicalManifestPath)
    ? canonicalManifestPath
    : legacyManifestPathsToRemove[0];
  const bundleConfig = fs.existsSync(bundleConfigPath)
    ? (YAML.parse(fs.readFileSync(bundleConfigPath, 'utf8')) as Record<string, unknown> | null) ?? {}
    : {};
  const manifestValue: unknown = manifestSourcePath
    ? YAML.parse(fs.readFileSync(manifestSourcePath, 'utf8'))
    : null;
  const versionsRoot = path.join(bundleDirectory, 'html', 'generated_bundle_versions');
  const legacyVersionsRoot = path.join(bundleDirectory, 'html', 'published');
  const generatedDirectory = path.join(bundleDirectory, 'html', 'generated');
  if (
    manifestValue
    && typeof manifestValue === 'object'
    && (manifestValue as { schemaVersion?: unknown }).schemaVersion === 1
    && !fs.existsSync(generatedDirectory)
    && !('generatedBundleVersions' in bundleConfig)
    && !('publishVersions' in bundleConfig)
    && !('bundleLastPublishedAt' in bundleConfig)
    && legacyManifestPathsToRemove.length === 0
    && !fs.existsSync(legacyVersionsRoot)
  ) {
    const manifest = parseGeneratedBundleVersionManifest(manifestValue);
    const evidencePath = path.join(bundleDirectory, GENERATED_BUNDLE_VERSIONING_MIGRATION_EVIDENCE);
    const evidence = fs.existsSync(evidencePath)
      ? JSON.parse(fs.readFileSync(evidencePath, 'utf8')) as BundleMigrationPlan['migrationEvidence']
      : {
          schemaVersion: 1 as const,
          bundleLastPublishedAt: null,
          versions: manifest.versions.map(entry => ({
            legacyVersionId: entry.versionId,
            canonicalVersionId: entry.versionId,
            firstPublishedAt: null,
            lastUpdatedAt: null,
            hadVersionDirectory: entry.localFilesState === 'present',
          })),
        };
    return {
      alreadyCanonical: true,
      bundleDirectory,
      bundleConfig,
      manifest,
      generatedDirectory,
      currentVersionDirectory: manifest.versions.at(-1)
        ? path.join(versionsRoot, manifest.versions.at(-1)!.versionId)
        : null,
      legacyManifestPathsToRemove: [],
      legacyVersionDirectoriesToMove: [],
      legacyVersionsRootToRemove: null,
      migrationEvidence: evidence,
    };
  }
  const canonicalDirectoryNames = fs.existsSync(versionsRoot)
    ? fs.readdirSync(versionsRoot, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
        .map(entry => entry.name)
    : [];
  const legacyDirectoryNames = fs.existsSync(legacyVersionsRoot)
    ? fs.readdirSync(legacyVersionsRoot, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
        .map(entry => entry.name)
    : [];
  const canonicalNameSet = new Set(canonicalDirectoryNames);
  const duplicateDirectoryName = legacyDirectoryNames.find(name => canonicalNameSet.has(name));
  if (duplicateDirectoryName) {
    throw new Error(`Generated version directory exists in both legacy and canonical roots: ${duplicateDirectoryName}`);
  }
  const directoryNames = [...canonicalDirectoryNames, ...legacyDirectoryNames];
  const legacyRecords = orderedLegacyRecords(manifestValue, bundleConfig, directoryNames);
  const activeRecords = legacyRecords.filter(record => record.isActive === true);
  if (activeRecords.length > 1) throw new Error('More than one legacy version is active');
  if (activeRecords.length === 1 && activeRecords[0] !== legacyRecords.at(-1)) {
    throw new Error(`Active legacy version ${activeRecords[0].versionId} is not the final ordered version`);
  }

  const hasGenerated = fs.existsSync(generatedDirectory);
  const usedLowercase = new Set<string>();
  const canonicalIds = new Map<string, GeneratedBundleVersionId>();
  for (const record of legacyRecords) {
    const lower = record.versionId.toLowerCase();
    if (usedLowercase.has(lower)) throw new Error(`Duplicate or case-colliding legacy version ID: ${record.versionId}`);
    if (GENERATED_BUNDLE_VERSION_ID_PATTERN.test(record.versionId)) {
      usedLowercase.add(lower);
      canonicalIds.set(record.versionId, record.versionId as GeneratedBundleVersionId);
    } else {
      canonicalIds.set(record.versionId, randomVersionId(usedLowercase));
    }
  }
  if (legacyRecords.length === 0 && hasGenerated) {
    const versionId = randomVersionId(usedLowercase);
    legacyRecords.push({
      versionId,
      firstPublishedAt: bundleConfig.bundleCreatedAt,
      notes: '',
      isActive: true,
    });
    canonicalIds.set(versionId, versionId);
  }

  const currentLegacyId = legacyRecords.at(-1)?.versionId ?? null;
  const currentCanonicalId = currentLegacyId ? canonicalIds.get(currentLegacyId)! : null;
  const currentVersionDirectory = currentCanonicalId
    ? path.join(versionsRoot, currentCanonicalId)
    : null;
  if (
    currentCanonicalId
    && !hasGenerated
    && !fs.existsSync(currentVersionDirectory!)
    && !fs.existsSync(path.join(legacyVersionsRoot, currentLegacyId!))
  ) {
    throw new Error(`Current legacy version ${currentLegacyId} has neither generated working files nor a version directory`);
  }

  const fallbackCreatedAt = optionalIso(bundleConfig.bundleCreatedAt)
    ?? new Date(fs.statSync(bundleDirectory).mtimeMs).toISOString();
  const entries: GeneratedBundleVersionEntry[] = legacyRecords.map((record, index) => {
    const versionId = canonicalIds.get(record.versionId)!;
    const predecessorVersionId = index === 0
      ? null
      : canonicalIds.get(legacyRecords[index - 1].versionId)!;
    const createdAt = optionalIso(record.firstPublishedAt)
      ?? optionalIso(record.lastUpdatedAt)
      ?? fallbackCreatedAt;
    const legacyDirectory = path.join(versionsRoot, record.versionId);
    const preProviderLegacyDirectory = path.join(legacyVersionsRoot, record.versionId);
    const canonicalDirectory = path.join(versionsRoot, versionId);
    const isCurrent = index === legacyRecords.length - 1;
    const willBePresent = isCurrent
      ? hasGenerated || fs.existsSync(legacyDirectory) || fs.existsSync(canonicalDirectory) || fs.existsSync(preProviderLegacyDirectory)
      : fs.existsSync(legacyDirectory) || fs.existsSync(canonicalDirectory) || fs.existsSync(preProviderLegacyDirectory);
    const base = {
      versionId,
      createdAt,
      notes: typeof record.notes === 'string' ? record.notes : '',
      predecessorVersionId,
      readerConnectionToPredecessor: 'disconnected' as const,
      ...(isCurrent ? { readerAwarenessState: 'legacy-incomplete' as const } : {}),
    };
    return willBePresent
      ? { ...base, localFilesState: 'present' as const }
      : {
          ...base,
          localFilesState: 'deleted' as const,
          localFilesDeletedAt: optionalIso(record.lastUpdatedAt) ?? createdAt,
          lastSavedGenerationId: 'unknown',
        };
  });

  return {
    alreadyCanonical: false,
    bundleDirectory,
    bundleConfig,
    manifest: { schemaVersion: 1, versions: entries },
    generatedDirectory,
    currentVersionDirectory,
    legacyManifestPathsToRemove,
    legacyVersionDirectoriesToMove: legacyDirectoryNames.map(name => path.join(legacyVersionsRoot, name)),
    legacyVersionsRootToRemove: fs.existsSync(legacyVersionsRoot) ? legacyVersionsRoot : null,
    migrationEvidence: {
      schemaVersion: 1,
      bundleLastPublishedAt: optionalIso(bundleConfig.bundleLastPublishedAt),
      versions: legacyRecords.map(record => ({
        legacyVersionId: record.versionId,
        canonicalVersionId: canonicalIds.get(record.versionId)!,
        firstPublishedAt: optionalIso(record.firstPublishedAt),
        lastUpdatedAt: optionalIso(record.lastUpdatedAt),
        hadVersionDirectory: fs.existsSync(path.join(versionsRoot, record.versionId))
          || fs.existsSync(path.join(legacyVersionsRoot, record.versionId)),
      })),
    },
  };
}

function applyBundlePlan(plan: BundleMigrationPlan): { movedGenerated: boolean; invalidIds: number } {
  if (plan.alreadyCanonical) return { movedGenerated: false, invalidIds: 0 };
  const versionsRoot = path.join(plan.bundleDirectory, 'html', 'generated_bundle_versions');
  fs.mkdirSync(versionsRoot, { recursive: true });
  const evidenceByLegacy = new Map(plan.migrationEvidence.versions.map(value => [value.legacyVersionId, value]));
  const token = `${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  const config = { ...plan.bundleConfig };
  delete config.generatedBundleVersions;
  delete config.publishVersions;
  delete config.bundleLastPublishedAt;
  const metadata = [
    {
      target: path.join(plan.bundleDirectory, 'config', 'generated_bundle_versions.yaml'),
      content: serializeGeneratedBundleVersionManifest(plan.manifest),
    },
    {
      target: path.join(plan.bundleDirectory, 'config', 'bundle_config.yaml'),
      content: YAML.stringify(config),
    },
    {
      target: path.join(plan.bundleDirectory, GENERATED_BUNDLE_VERSIONING_MIGRATION_EVIDENCE),
      content: `${JSON.stringify(plan.migrationEvidence, null, 2)}\n`,
    },
  ].map(value => ({
    ...value,
    temporary: `${value.target}.migration-${token}`,
    backup: `${value.target}.migration-backup-${token}`,
    hadOriginal: fs.existsSync(value.target),
    originalMoved: false,
    installed: false,
  }));
  for (const item of metadata) {
    fs.mkdirSync(path.dirname(item.target), { recursive: true });
    fs.writeFileSync(item.temporary, item.content, 'utf8');
  }

  const directoryRenames: Array<{ from: string; to: string }> = [];
  const retiredLegacyMetadata = plan.legacyManifestPathsToRemove.map(source => ({
    source,
    backup: `${source}.migration-backup-${token}`,
    moved: false,
  }));
  let currentBackup: string | null = null;
  let movedGenerated = false;
  try {
    for (const legacyDirectory of plan.legacyVersionDirectoriesToMove) {
      const canonicalDirectory = path.join(versionsRoot, path.basename(legacyDirectory));
      if (fs.existsSync(canonicalDirectory)) {
        throw new Error(`Cannot merge legacy generated version directory ${path.basename(legacyDirectory)}`);
      }
      fs.renameSync(legacyDirectory, canonicalDirectory);
      directoryRenames.push({ from: legacyDirectory, to: canonicalDirectory });
    }
    for (const evidence of plan.migrationEvidence.versions) {
      if (evidence.legacyVersionId === evidence.canonicalVersionId) continue;
      const legacyDirectory = path.join(versionsRoot, evidence.legacyVersionId);
      const canonicalDirectory = path.join(versionsRoot, evidence.canonicalVersionId);
      if (fs.existsSync(legacyDirectory) && !fs.existsSync(canonicalDirectory)) {
        fs.renameSync(legacyDirectory, canonicalDirectory);
        directoryRenames.push({ from: legacyDirectory, to: canonicalDirectory });
      }
    }

    if (fs.existsSync(plan.generatedDirectory) && plan.currentVersionDirectory) {
      currentBackup = `${plan.currentVersionDirectory}.migration-backup-${token}`;
      if (fs.existsSync(plan.currentVersionDirectory)) fs.renameSync(plan.currentVersionDirectory, currentBackup);
      fs.renameSync(plan.generatedDirectory, plan.currentVersionDirectory);
      movedGenerated = true;
    }

    for (const item of metadata) {
      if (item.hadOriginal) {
        fs.renameSync(item.target, item.backup);
        item.originalMoved = true;
      }
      fs.renameSync(item.temporary, item.target);
      item.installed = true;
    }

    for (const item of retiredLegacyMetadata) {
      if (!fs.existsSync(item.source)) continue;
      fs.renameSync(item.source, item.backup);
      item.moved = true;
    }

    for (const item of metadata) fs.rmSync(item.backup, { force: true });
    for (const item of retiredLegacyMetadata) fs.rmSync(item.backup, { force: true });
    if (currentBackup) fs.rmSync(currentBackup, { recursive: true, force: true });
    if (
      plan.legacyVersionsRootToRemove
      && fs.existsSync(plan.legacyVersionsRootToRemove)
      && fs.readdirSync(plan.legacyVersionsRootToRemove).length === 0
    ) {
      fs.rmdirSync(plan.legacyVersionsRootToRemove);
    }
  } catch (error) {
    for (const item of [...retiredLegacyMetadata].reverse()) {
      if (item.moved && fs.existsSync(item.backup) && !fs.existsSync(item.source)) {
        fs.renameSync(item.backup, item.source);
      }
    }
    for (const item of [...metadata].reverse()) {
      if (item.installed && fs.existsSync(item.target)) fs.rmSync(item.target, { force: true });
      if (item.originalMoved && fs.existsSync(item.backup)) fs.renameSync(item.backup, item.target);
      if (fs.existsSync(item.temporary)) fs.rmSync(item.temporary, { force: true });
    }
    if (movedGenerated && plan.currentVersionDirectory && fs.existsSync(plan.currentVersionDirectory)) {
      fs.renameSync(plan.currentVersionDirectory, plan.generatedDirectory);
    }
    if (currentBackup && plan.currentVersionDirectory && fs.existsSync(currentBackup)) {
      fs.renameSync(currentBackup, plan.currentVersionDirectory);
    }
    for (const rename of [...directoryRenames].reverse()) {
      if (fs.existsSync(rename.to) && !fs.existsSync(rename.from)) {
        fs.mkdirSync(path.dirname(rename.from), { recursive: true });
        fs.renameSync(rename.to, rename.from);
      }
    }
    throw error;
  } finally {
    for (const item of metadata) {
      if (fs.existsSync(item.temporary)) fs.rmSync(item.temporary, { force: true });
    }
    for (const item of retiredLegacyMetadata) {
      if (fs.existsSync(item.backup)) fs.rmSync(item.backup, { force: true });
    }
  }
  return {
    movedGenerated,
    invalidIds: [...evidenceByLegacy.values()].filter(value => value.legacyVersionId !== value.canonicalVersionId).length,
  };
}

/** Validate every bundle before changing any bundle, then migrate deterministically. */
export function migrateGeneratedBundleVersioning(configDirectory: string): GeneratedBundleVersioningMigrationReport {
  const bundlesDirectory = path.join(configDirectory, 'bundles');
  const report: GeneratedBundleVersioningMigrationReport = {
    bundlesVisited: 0,
    bundlesWithVersions: 0,
    versionCount: 0,
    generatedDirectoriesMoved: 0,
    invalidLegacyIdsReplaced: 0,
  };
  if (!fs.existsSync(bundlesDirectory)) return report;
  const bundleDirectories = fs.readdirSync(bundlesDirectory, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(bundlesDirectory, entry.name))
    .sort((left, right) => left.localeCompare(right));
  const plans = bundleDirectories.map(planBundle);
  for (const plan of plans) {
    const result = applyBundlePlan(plan);
    logger.info(
      `[generated-bundle-versioning-migration] ${path.basename(plan.bundleDirectory)}: `
      + `${plan.manifest.versions.length} version(s), generated moved=${result.movedGenerated}, `
      + `legacy IDs replaced=${result.invalidIds}`,
    );
    report.bundlesVisited += 1;
    report.versionCount += plan.manifest.versions.length;
    if (plan.manifest.versions.length > 0) report.bundlesWithVersions += 1;
    if (result.movedGenerated) report.generatedDirectoriesMoved += 1;
    report.invalidLegacyIdsReplaced += result.invalidIds;
  }
  return report;
}

export const migration: Migration = {
  id: '26_08_16_18_30_00_q7m2v9k4c6x1_generated_bundle_versioning',
  name: 'Canonical generated bundle versioning',
  description: 'Move generated output into the ordered canonical version manifest and remove duplicate legacy authorities.',
  run: (): Promise<void> => {
    migrateGeneratedBundleVersioning(getDefaultConfigDirectory());
    return Promise.resolve();
  },
};
