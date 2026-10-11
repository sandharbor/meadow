/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'fs';
import path from 'path';
import type { ReaderConnectionToPredecessor } from '../../../../../../../contracts/types/generatedBundleVersioning.js';
import { BundleConfigPaths } from '../../../../../../../shared_code/paths/bundleConfigPaths.js';
import { loadAppConfig } from '../../../../../../../shared_code/utils/appConfigUtils.js';
import { getConfigDirectory } from '../../../../shared/bundle-config/bundleConfigPaths.js';
import { assessBundleBoundary } from '../../../../shared/bundle-boundary-review/bundleBoundaryReviewService.js';
import {
  acceptedSourceRoot,
  loadSourceSnapshot,
  loadSourcingState,
  sourceConfigFingerprint,
  verifySourceSnapshot,
  withSourcingLock,
} from '../../../../shared/source-snapshot/sourceSnapshots.js';
import {
  createNewGeneratedBundleVersion,
  generateCurrentBundleVersion,
  type GeneratedResultMetadata,
  type VersionLifecycleResult,
} from '../../../../shared/generated-bundle-versioning/generatedBundleVersionLifecycle.js';
import {
  generationAffectingAppConfig,
  type CapturedGenerationInputs,
} from '../../../../shared/generated-bundle-versioning/generationRecords.js';
import { clearLivePreview, showLivePreview } from '../../../../shared/generated-bundle-versioning/livePreview.js';
import { loadBundleConfig } from '../../../../shared/utils/bundleConfigUtils.js';
import { createBundleOperationLogger } from '../../../../shared/utils/logging/bundleOperationLogger.js';
import { generateHtmlForBundle } from '../html/htmlService.js';
import { ensureTrackedPageContent } from '../source-material/trackedPageContent.js';
import { includedSourceInventory } from '../source-material/includedSourceInventory.js';

type HtmlGenerationOptions = Omit<NonNullable<Parameters<typeof generateHtmlForBundle>[1]>, 'outputDirectory'>;

interface SnapshotGeneration {
  captured: CapturedGenerationInputs;
  acceptedSourceDirectory: string;
  validate: () => void;
}

function generationAppConfigFingerprint(config: ReturnType<typeof loadAppConfig>): string {
  // UI preferences can be persisted while the first preview is still rendering.
  // Only settings that affect generated material invalidate that render.
  return JSON.stringify(generationAffectingAppConfig(config as unknown as Record<string, unknown>));
}

/**
 * Capture accepted inputs under the sourcing lock, refuse a generation whose
 * inputs change underneath it, and keep the lock until output is installed.
 */
async function withSnapshotGeneration<T>(
  bundleDirectory: string,
  action: (generation: SnapshotGeneration) => Promise<T>,
): Promise<T> {
  return await withSourcingLock(bundleDirectory, async () => {
    const acceptedSourceDirectory = acceptedSourceRoot(bundleDirectory);
    const sourceSnapshotId = loadSourcingState(bundleDirectory)!.acceptedId;
    verifySourceSnapshot(bundleDirectory, loadSourceSnapshot(bundleDirectory, sourceSnapshotId));
    const fingerprint = sourceConfigFingerprint(bundleDirectory);
    const appConfig = loadAppConfig(getConfigDirectory());
    const captured: CapturedGenerationInputs = {
      sourceSnapshotId,
      bundleConfig: loadBundleConfig(bundleDirectory),
      nodeConfig: fs.readFileSync(BundleConfigPaths.getBundleNodeConfigFile(bundleDirectory), 'utf8'),
      appConfig: generationAffectingAppConfig(appConfig as unknown as Record<string, unknown>),
    };
    const boundary = await assessBundleBoundary(path.basename(bundleDirectory));
    if (boundary.reviewRequired) throw new Error('Source sensitivity requires review before generation.');
    await ensureTrackedPageContent(bundleDirectory, acceptedSourceDirectory);
    const validate = () => {
      if (sourceConfigFingerprint(bundleDirectory) !== fingerprint
        || generationAppConfigFingerprint(loadAppConfig(getConfigDirectory())) !== generationAppConfigFingerprint(appConfig)) {
        throw new Error('Generation settings or curation changed during generation. Generate again with the saved settings.');
      }
    };
    validate();
    return await action({ captured, acceptedSourceDirectory, validate });
  });
}

async function generateWithRecords(
  bundleDirectory: string,
  generation: SnapshotGeneration,
  stagingDirectory: string,
  options: HtmlGenerationOptions,
): Promise<GeneratedResultMetadata> {
  const emission = await generateHtmlForBundle(bundleDirectory, { ...options, outputDirectory: stagingDirectory });
  return {
    captured: generation.captured,
    emitted: {
      owners: emission.owners,
      includedSources: includedSourceInventory({
        acceptedSourceDirectory: generation.acceptedSourceDirectory,
        nodeConfig: generation.captured.nodeConfig,
        includedBundleNodeIds: emission.includedBundleNodeIds,
      }),
    },
  };
}

/**
 * Generate the current version (creating the first one when none exists).
 * Every production entry point installs output with its matching records.
 */
export async function generateCurrentGeneratedVersion(
  bundleSlug: string,
  bundleDirectory: string,
  options: HtmlGenerationOptions = {},
): Promise<VersionLifecycleResult> {
  return await withSnapshotGeneration(bundleDirectory, async generation => {
    const operation = createBundleOperationLogger(bundleSlug, 'version-generate');
    let liveDirectory: string | undefined;
    operation.info('Started staging the current generated version');
    try {
      const result = await generateCurrentBundleVersion(bundleDirectory, {
        operationId: () => operation.operationId,
        onPhase: phase => operation.debug(`Reached ${phase}`),
        generate: stagingDirectory => generateWithRecords(bundleDirectory, generation, stagingDirectory, {
          ...options,
          onStartPageRendered: info => {
            if (options.shouldCancel?.()) return;
            if (options.preview) {
              liveDirectory = stagingDirectory;
              showLivePreview(bundleDirectory, stagingDirectory);
            }
            options.onStartPageRendered?.(info);
          },
        }),
        validate: () => {
          generation.validate();
          if (options.shouldCancel?.()) throw new Error('Preview generation was superseded by a newer request');
        },
      });
      operation.info(`${result.created ? 'Created first' : 'Regenerated current'} version ${result.versionId}; generated files and generation ${result.generationId} records installed together`);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('superseded by a newer request')) {
        operation.warn('Superseded by a newer preview request; local staging was rolled back safely');
      } else {
        operation.error(`Failed and rolled back local staging; retry is safe: ${message}`);
      }
      throw error;
    } finally {
      if (liveDirectory) clearLivePreview(bundleDirectory, liveDirectory);
    }
  });
}

/** Freeze the saved current version and generate its successor. */
export async function createSuccessorGeneratedVersion(
  bundleDirectory: string,
  options: {
    operationId: string;
    notes: string;
    confirmedNoGeneratedChanges: boolean;
    readerConnectionToPredecessor?: ReaderConnectionToPredecessor;
    onPhase?: (phase: string) => void;
  },
): Promise<VersionLifecycleResult> {
  return await withSnapshotGeneration(bundleDirectory, generation => createNewGeneratedBundleVersion(bundleDirectory, {
    validate: generation.validate,
    operationId: () => options.operationId,
    onPhase: options.onPhase,
    notes: options.notes,
    confirmedNoGeneratedChanges: options.confirmedNoGeneratedChanges,
    readerConnectionToPredecessor: options.readerConnectionToPredecessor,
    generate: stagingDirectory => generateWithRecords(bundleDirectory, generation, stagingDirectory, { preview: true }),
  }));
}
