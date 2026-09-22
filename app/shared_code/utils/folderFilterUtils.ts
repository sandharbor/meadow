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

import type { BundleSource } from '../../contracts/types/bundleConfig.js';
import { IBundleNode } from '../../contracts/types/IBundleNode.js';
import { sourceLocationLabel } from './bundleSourceUtils.js';

export const ROOT_FOLDER_LABEL = 'Root';

export interface FolderTreeNode {
  name: string;
  sourceRow?: boolean;
  displayPath?: string;
  path: string;
  nodeCount: number;
  directNodeCount: number;
  children: FolderTreeNode[];
}

interface MutableFolderTreeNode extends Omit<FolderTreeNode, 'children'> {
  children: Map<string, MutableFolderTreeNode>;
}

export const normalizeFolderPath = (path: string | undefined): string => (
  (path || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .join('/')
);

export const hasNodesInMultipleFolders = (nodes: IBundleNode[]): boolean => {
  const folders = new Set(nodes.map(node => folderStatePath(node)));
  return folders.size > 1;
};

const toFolderTreeNode = (node: MutableFolderTreeNode): FolderTreeNode => ({
  name: node.name,
  path: node.path,
  nodeCount: node.nodeCount,
  directNodeCount: node.directNodeCount,
  children: Array.from(node.children.values())
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    .map(toFolderTreeNode)
});

export const folderStatePath = (node: Pick<IBundleNode, 'sourceId' | 'sourceGraphSubdirectory'>): string =>
  node.sourceId ? `source:${node.sourceId}/folders/${normalizeFolderPath(node.sourceGraphSubdirectory)}` : normalizeFolderPath(node.sourceGraphSubdirectory);

export const nodeMatchesFolderState = (node: IBundleNode, key: string): boolean => {
  if (key.startsWith('source:')) {
    const [source, scope, ...segments] = key.split('/');
    if (source !== `source:${node.sourceId}`) return false;
    if (!scope) return true;
    return nodeIsInFolder(node.sourceGraphSubdirectory, segments.join('/'));
  }
  // Existing folder settings migrate to the original source only.
  return (!node.sourceId || node.sourceId === 'source000001') && nodeIsInFolder(node.sourceGraphSubdirectory, key);
};

export const buildFolderTree = (nodes: IBundleNode[], sources?: readonly BundleSource[]): FolderTreeNode[] => {
  if (sources?.length) {
    const qualify = (node: FolderTreeNode, source: BundleSource): FolderTreeNode => ({ ...node,
      path: `source:${source.id}/folders/${node.path}`,
      displayPath: sources.length > 1 ? sourceLocationLabel(source.name, node.path) : node.path || ROOT_FOLDER_LABEL,
      children: node.children.map(child => qualify(child, source)),
    });
    return sources.flatMap(source => {
      const members = nodes.filter(node => node.bundleNodeKind !== 'collection' && node.sourceId === source.id);
      const folders = buildFolderTree(members).map(node => qualify(node, source));
      return sources.length === 1 ? folders : [{ name: sourceLocationLabel(source.name), path: `source:${source.id}`, displayPath: sourceLocationLabel(source.name),
        sourceRow: true, nodeCount: members.length, directNodeCount: 0, children: folders }];
    });
  }
  const topLevel = new Map<string, MutableFolderTreeNode>();
  let rootNodeCount = 0;

  nodes.forEach(node => {
    const folderPath = normalizeFolderPath(node.sourceGraphSubdirectory);
    if (!folderPath) {
      rootNodeCount += 1;
      return;
    }

    let children = topLevel;
    let currentPath = '';
    const segments = folderPath.split('/');

    segments.forEach((segment, index) => {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      let node = children.get(segment);
      if (!node) {
        node = {
          name: segment,
          path: currentPath,
          nodeCount: 0,
          directNodeCount: 0,
          children: new Map()
        };
        children.set(segment, node);
      }

      node.nodeCount += 1;
      if (index === segments.length - 1) {
        node.directNodeCount += 1;
      }
      children = node.children;
    });
  });

  const folderNodes = Array.from(topLevel.values())
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    .map(toFolderTreeNode);

  if (rootNodeCount > 0) {
    folderNodes.unshift({
      name: ROOT_FOLDER_LABEL,
      path: '',
      nodeCount: rootNodeCount,
      directNodeCount: rootNodeCount,
      children: []
    });
  }

  return folderNodes;
};

export const nodeIsInFolder = (nodeFolder: string | undefined, folderPath: string): boolean => {
  const normalizedNodeFolder = normalizeFolderPath(nodeFolder);
  const normalizedFolder = normalizeFolderPath(folderPath);

  // The synthetic Root row represents only nodes stored directly at the root.
  if (!normalizedFolder) return normalizedNodeFolder === '';

  return normalizedNodeFolder === normalizedFolder
    || normalizedNodeFolder.startsWith(`${normalizedFolder}/`);
};
