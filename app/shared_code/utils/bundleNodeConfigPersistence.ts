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

import type { BundleNodeConfig } from '../../contracts/types/bundleNodeConfig.js';
import { parseBundleNodeConfig, stringifyBundleNodeConfig } from './bundleNodeConfigUtils.js';
import {
  readDurableDocument,
  requireValidDocument,
  writeDurableDocument,
  type DurableDocumentCodec,
} from './durableDocument.js';

export const bundleNodeConfigCodec: DurableDocumentCodec<BundleNodeConfig[]> = {
  parse: source => parseBundleNodeConfig(source),
  validate: value => {
    if (!Array.isArray(value)) return { valid: false, diagnostic: '$.nodes must be an array' };
    try {
      const serialized = stringifyBundleNodeConfig(value as BundleNodeConfig[]);
      return { valid: true, value: parseBundleNodeConfig(serialized) };
    } catch (error) {
      return {
        valid: false,
        diagnostic: error instanceof Error ? error.message : String(error),
      };
    }
  },
  serialize: stringifyBundleNodeConfig,
};

export function loadBundleNodeConfigDocument(filePath: string): BundleNodeConfig[] {
  return requireValidDocument(
    readDurableDocument(filePath, bundleNodeConfigCodec),
    (): BundleNodeConfig[] => [],
  );
}

export function saveBundleNodeConfigDocument(filePath: string, nodes: BundleNodeConfig[]): void {
  writeDurableDocument({ path: filePath, value: nodes, codec: bundleNodeConfigCodec });
}
