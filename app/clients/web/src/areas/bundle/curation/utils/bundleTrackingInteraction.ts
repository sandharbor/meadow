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

import type { BundleNodeConfig } from '../../../../../../../contracts/types/bundleNodeConfig';
import type { IBundleNode } from '../../../../../../../contracts/types/IBundleNode';
import { generateBundleNodeId } from '../../../../../../../shared_code/utils/bundleNodeConfigUtils';
import { mutateFileTracking, trackSafeNodeKeys } from './bundleTrackingClient';

type TrackingState = {
  tracked: boolean;
  blacklisted: boolean;
  bundleNodeId?: IBundleNode['bundleNodeId'];
  config?: BundleNodeConfig;
};

function trackingState(node: IBundleNode): TrackingState {
  return {
    tracked: node.tracked === true,
    blacklisted: node.blacklisted === true,
    bundleNodeId: node.bundleNodeId,
    config: node.conf,
  };
}

function applyTrackingState(node: IBundleNode, state: TrackingState): void {
  node.tracked = state.tracked;
  node.blacklisted = state.blacklisted;
  if (state.bundleNodeId) node.bundleNodeId = state.bundleNodeId;
  else delete node.bundleNodeId;
  if (state.config && state.config.bundleNodeKind === node.bundleNodeKind) {
    node.conf = state.config as IBundleNode['conf'];
  } else {
    delete node.conf;
  }
}

export function ensureNodeConfigForPersistence(options: {
  node: IBundleNode;
  listType: 'whitelist' | 'blacklist';
  existingIds: Iterable<string>;
}): void {
  const { node, listType } = options;
  if (!node.conf) {
    const bundleNodeId = generateBundleNodeId(options.existingIds);
    node.bundleNodeId = bundleNodeId;
    if (node.bundleNodeKind === 'collection') {
      throw new Error('The bundle home cannot be configured through generic curation actions');
    }
    node.conf = node.bundleNodeKind === 'folder'
      ? {
          bundleNodeName: node.bundleNodeName,
          sourceGraphSubdirectory: node.sourceGraphSubdirectory,
          bundleNodeKind: 'folder',
          bundleNodeId,
          listType,
        }
      : {
          bundleNodeName: node.bundleNodeName,
          sourceGraphSubdirectory: node.sourceGraphSubdirectory,
          bundleNodeKind: 'file',
          fileType: node.fileType,
          bundleNodeId,
          listType,
        };
  }
  node.conf.listType = listType;
}

export async function mutateFileTrackingOptimistically(options: {
  bundleSlug: string;
  page: Extract<IBundleNode, { bundleNodeKind: 'file' }>;
  tracked: boolean;
  effectivelySensitive: boolean;
  notifyChange: () => void;
}): Promise<void> {
  const previous = trackingState(options.page);
  options.page.tracked = options.tracked;
  options.notifyChange();
  try {
    const result = await mutateFileTracking({
      bundleSlug: options.bundleSlug,
      bundleNodeKey: options.page.bundleNodeKey,
      operation: options.tracked ? 'track' : 'untrack',
      includeSensitive: options.tracked && options.effectivelySensitive,
    });
    applyTrackingState(options.page, {
      tracked: result.node.tracked,
      blacklisted: result.node.blacklisted,
      bundleNodeId: result.node.bundleNodeId,
      config: result.node.config,
    });
    options.notifyChange();
  } catch (error) {
    applyTrackingState(options.page, previous);
    options.notifyChange();
    throw error;
  }
}

export async function trackNodesOptimistically(options: {
  bundleSlug: string;
  nodes: IBundleNode[];
  notifyChange: () => void;
}): Promise<void> {
  const previous = new Map(options.nodes.map(node => [node.bundleNodeKey, trackingState(node)]));
  options.nodes.forEach(node => { node.tracked = true; });
  options.notifyChange();
  try {
    const result = await trackSafeNodeKeys(
      options.bundleSlug,
      options.nodes.map(node => node.bundleNodeKey),
    );
    const tracked = new Map(
      [...result.newlyTracked, ...result.alreadyTracked]
        .map(node => [node.bundleNodeKey, node.config]),
    );
    options.nodes.forEach(node => {
      const config = tracked.get(node.bundleNodeKey);
      if (!config) return;
      applyTrackingState(node, {
        tracked: true,
        blacklisted: false,
        bundleNodeId: config.bundleNodeId,
        config,
      });
    });
    options.notifyChange();
  } catch (error) {
    options.nodes.forEach(node => applyTrackingState(node, previous.get(node.bundleNodeKey)!));
    options.notifyChange();
    throw error;
  }
}
