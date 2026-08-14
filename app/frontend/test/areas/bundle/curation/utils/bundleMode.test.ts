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

import { describe, expect, it } from 'vitest';
import type { IBundleNode } from '../../../../../../shared_code/types/graph';
import { bundleIsFolderBased } from '../../../../../src/areas/bundle/curation/utils/bundleMode';

const node = (bundleNodeId: string, bundleNodeKind: IBundleNode['bundleNodeKind']) => ({ bundleNodeId, bundleNodeKind });

describe('bundleIsFolderBased', () => {
  it('uses the configured entry node kind as the bundle mode', () => {
    const nodes = [node('file-entry', 'file'), node('folder-entry', 'folder'), node('home', 'collection')];
    expect(bundleIsFolderBased(nodes, 'file-entry')).toBe(false);
    expect(bundleIsFolderBased(nodes, 'folder-entry')).toBe(true);
    expect(bundleIsFolderBased(nodes, 'home')).toBe(true);
  });

  it('falls back to the graph node kinds while the entry node is unavailable', () => {
    expect(bundleIsFolderBased([node('file', 'file')], 'missing')).toBe(false);
    expect(bundleIsFolderBased([node('folder', 'folder')], 'missing')).toBe(true);
  });
});
