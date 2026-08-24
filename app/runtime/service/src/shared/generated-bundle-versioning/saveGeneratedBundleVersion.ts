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
import type { GeneratedBundleVersionId } from '../../../../../contracts/types/generatedBundleVersioning.js';
import { commitBundleChanges } from '../utils/configDirectory/gitUtils/generatedHtmlGitService.js';
import {
  assertFrozenGeneratedVersionsIntegrity,
  currentVersionEntry,
} from './generatedBundleVersionLifecycle.js';
import {
  inspectGeneratedVersionGitState,
} from './generatedBundleVersionGitService.js';

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

export async function saveGeneratedBundleVersion(options: {
  bundleDirectory: string;
  configDirectory: string;
  versionId: string;
}): Promise<SaveGeneratedBundleVersionResult> {
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
  assertFrozenGeneratedVersionsIntegrity(options.bundleDirectory);
  if (loadAppConfig(options.configDirectory).manageGitAutomatically === false) {
    throw new SaveGeneratedBundleVersionError(
      'Saving generations through the CLI requires automatic Meadow Home versioning to be enabled.',
      409,
    );
  }

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
}
