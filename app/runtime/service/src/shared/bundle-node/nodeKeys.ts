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

import type { BundleNodeConfig, EncodedBundleNodeKey } from '../../../../../contracts/types/bundleNodeConfig.js';
import { bundleNodeKeyFromConfig, fileNodeKeyFromSourceFilePath, serializeBundleNodeKey } from '../../../../../shared_code/utils/bundleNodeKey.js';

export interface BundleNodeConfigMap {
  [bundleNodeKey: EncodedBundleNodeKey]: BundleNodeConfig;
}

/** Construct a file key from a title, extension and graph-relative directory. */
export function makeBundleNodeKey(bundleNodeName: string, fileType: string = 'md', directory: string = ''): EncodedBundleNodeKey {
  const filename = `${bundleNodeName}.${fileType}`;
  return sourceFilePathToBundleNodeKey(directory ? `${directory}/${filename}` : filename);
}

export function sourceFilePathToBundleNodeKey(sourcePath: string): EncodedBundleNodeKey {
  return serializeBundleNodeKey(fileNodeKeyFromSourceFilePath(sourcePath));
}

export function bundleNodeConfigToKey(conf: BundleNodeConfig): EncodedBundleNodeKey {
  return serializeBundleNodeKey(bundleNodeKeyFromConfig(conf));
}
