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
import { BundleConfigPaths } from '../../../../../../shared_code/paths/bundleConfigPaths.js';
import { loadValidatedBundleNodeConfiguration } from '../../../shared/bundle-node/bundleNodeConfigLoader.js';

type LoadedBundleConfiguration = ReturnType<typeof loadValidatedBundleNodeConfiguration>;

interface CacheEntry {
  revision: string;
  configuration: LoadedBundleConfiguration;
}

function fileRevision(filePath: string): string {
  const stat = fs.statSync(filePath, { bigint: true });
  return `${stat.mtimeNs}:${stat.size}`;
}

function configurationRevision(bundleDirectory: string): string {
  return [
    fileRevision(BundleConfigPaths.getBundleConfigFile(bundleDirectory)),
    fileRevision(BundleConfigPaths.getBundleNodeConfigFile(bundleDirectory)),
  ].join('|');
}

/**
 * Keeps expensive parsed node configuration available between bundle-list visits.
 * File revisions preserve correctness when either source document changes.
 */
export class BundleListConfigurationCache {
  private readonly entries = new Map<string, CacheEntry>();

  load(bundleDirectory: string): LoadedBundleConfiguration {
    const revisionBeforeLoad = configurationRevision(bundleDirectory);
    const cached = this.entries.get(bundleDirectory);
    if (cached?.revision === revisionBeforeLoad) return cached.configuration;

    const configuration = loadValidatedBundleNodeConfiguration(bundleDirectory);
    const revisionAfterLoad = configurationRevision(bundleDirectory);
    if (revisionAfterLoad === revisionBeforeLoad) {
      this.entries.set(bundleDirectory, {
        revision: revisionAfterLoad,
        configuration,
      });
    }
    return configuration;
  }

  prune(bundleDirectories: readonly string[]): void {
    const activeDirectories = new Set(bundleDirectories);
    for (const cachedDirectory of this.entries.keys()) {
      if (!activeDirectories.has(cachedDirectory)) this.entries.delete(cachedDirectory);
    }
  }
}

export const bundleListConfigurationCache = new BundleListConfigurationCache();
