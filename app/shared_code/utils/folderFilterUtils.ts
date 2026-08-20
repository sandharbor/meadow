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

import { IBundleNode } from '../types/IBundleNode.js';

export const ROOT_FOLDER_LABEL = 'Root';

export interface FolderTreeNode {
  name: string;
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
  const folders = new Set(nodes.map(node => normalizeFolderPath(node.sourceGraphSubdirectory)));
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

export const buildFolderTree = (nodes: IBundleNode[]): FolderTreeNode[] => {
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
