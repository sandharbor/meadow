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

import { loadAppConfig } from '../../../../../shared_code/utils/appConfigUtils.js';
import type { GeneratedBundleVersionId } from '../../../../../contracts/types/shared/generated-bundle-versioning/generatedBundleVersioning.js';
import { commitBundleChanges } from '../utils/configDirectory/gitUtils/generatedHtmlGitService.js';
import {
  assertFrozenGeneratedVersionsIntegrity,
  currentVersionEntry,
  restoreFrozenGenerationRecords,
} from './generatedBundleVersionLifecycle.js';
import {
  GeneratedBundleVersionOperationConflictError,
  withGeneratedBundleVersionOperation,
} from './generatedBundleVersionOperationLock.js';
import { inspectGeneratedVersionGitState } from './generatedBundleVersionGitService.js';
import { resolveWorkingEndpoint } from './generatedOutputEndpoint.js';

export interface SaveGeneratedBundleVersionResult {
  versionId: GeneratedBundleVersionId;
  savedGenerationId: string;
  changed: boolean;
  commitSha?: string;
}

export class SaveGeneratedBundleVersionError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = 'SaveGeneratedBundleVersionError';
  }
}

/**
 * Why the installed current result cannot be saved, or null when its files
 * and records form a valid pair (or a legacy result that never had records).
 */
async function unsaveableCurrentResult(bundleDirectory: string, versionId: GeneratedBundleVersionId): Promise<string | null> {
  const working = await resolveWorkingEndpoint(bundleDirectory, versionId);
  const record = working.endpoint.record;
  if (record.kind === 'corrupt') {
    return `The current generation's records are damaged (${record.diagnostic}) Generate the bundle again before saving.`;
  }
  if (record.kind === 'unsupported') {
    return `${record.diagnostic} Generate the bundle again with this version of Meadow before saving.`;
  }
  return null;
}

/**
 * Commit generated-bundle state while no generation, freeze, or cancellation
 * can replace it. Generated results and their records are included only when
 * the current pair is valid, so a damaged pair is never cemented as saved.
 */
export async function commitGeneratedBundleState(
  bundleDirectory: string,
  commitMessage: string,
  options: { additionalDirs?: string[] } = {},
): Promise<string | null> {
  return withGeneratedBundleVersionOperation(bundleDirectory, async () => {
    const current = currentVersionEntry(bundleDirectory);
    const includeGeneratedResults = !current || await unsaveableCurrentResult(bundleDirectory, current.versionId) === null;
    return commitBundleChanges(bundleDirectory, commitMessage, {
      includeConfigDir: true,
      additionalDirs: options.additionalDirs,
      includeGeneratedResults,
    });
  });
}

export async function saveGeneratedBundleVersion(options: {
  bundleDirectory: string;
  configDirectory: string;
  versionId: string;
}): Promise<SaveGeneratedBundleVersionResult> {
  try {
    return await withGeneratedBundleVersionOperation(options.bundleDirectory, async () => {
      const current = currentVersionEntry(options.bundleDirectory);
      if (!current) {
        throw new SaveGeneratedBundleVersionError('Generate a version before saving it', 409);
      }
      if (current.versionId !== options.versionId) {
        throw new SaveGeneratedBundleVersionError(
          `Version ${options.versionId} is not the current generated version. Save ${current.versionId} or generate again.`,
          409,
        );
      }
      restoreFrozenGenerationRecords(options.bundleDirectory);
      assertFrozenGeneratedVersionsIntegrity(options.bundleDirectory);
      if (loadAppConfig(options.configDirectory).manageGitAutomatically === false) {
        throw new SaveGeneratedBundleVersionError(
          'Saving generations through the CLI requires automatic Meadow Home versioning to be enabled.',
          409,
        );
      }
      const problem = await unsaveableCurrentResult(options.bundleDirectory, current.versionId);
      if (problem) throw new SaveGeneratedBundleVersionError(problem, 409);

      const commitSha = await commitBundleChanges(
        options.bundleDirectory,
        `user saved generated bundle version ${current.versionId}`,
        { includeConfigDir: true },
      );
      const savedState = inspectGeneratedVersionGitState(options.bundleDirectory, current.versionId);
      if (!savedState.isSaved || !savedState.savedGenerationId) {
        throw new Error(`Version ${current.versionId} was not clean after saving`);
      }
      return {
        versionId: current.versionId,
        savedGenerationId: savedState.savedGenerationId,
        changed: commitSha !== null,
        ...(commitSha && { commitSha }),
      };
    });
  } catch (error) {
    if (error instanceof GeneratedBundleVersionOperationConflictError) {
      throw new SaveGeneratedBundleVersionError('Wait for the running generation or version operation to finish, then save again.', 409);
    }
    throw error;
  }
}
