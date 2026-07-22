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

import { ISitePage } from '../../../../../../shared_code/types/ISitePage.js';

export const ROOT_FOLDER_LABEL = 'Root';

export interface FolderTreeNode {
  name: string;
  path: string;
  pageCount: number;
  directPageCount: number;
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

export const hasPagesInMultipleFolders = (pages: ISitePage[]): boolean => {
  const folders = new Set(pages.map(page => normalizeFolderPath(page.sourceGraphSubdirectory)));
  return folders.size > 1;
};

const toFolderTreeNode = (node: MutableFolderTreeNode): FolderTreeNode => ({
  name: node.name,
  path: node.path,
  pageCount: node.pageCount,
  directPageCount: node.directPageCount,
  children: Array.from(node.children.values())
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    .map(toFolderTreeNode)
});

export const buildFolderTree = (pages: ISitePage[]): FolderTreeNode[] => {
  const topLevel = new Map<string, MutableFolderTreeNode>();
  let rootPageCount = 0;

  pages.forEach(page => {
    const folderPath = normalizeFolderPath(page.sourceGraphSubdirectory);
    if (!folderPath) {
      rootPageCount += 1;
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
          pageCount: 0,
          directPageCount: 0,
          children: new Map()
        };
        children.set(segment, node);
      }

      node.pageCount += 1;
      if (index === segments.length - 1) {
        node.directPageCount += 1;
      }
      children = node.children;
    });
  });

  const nodes = Array.from(topLevel.values())
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    .map(toFolderTreeNode);

  if (rootPageCount > 0) {
    nodes.unshift({
      name: ROOT_FOLDER_LABEL,
      path: '',
      pageCount: rootPageCount,
      directPageCount: rootPageCount,
      children: []
    });
  }

  return nodes;
};

export const pageIsInFolder = (pageFolder: string | undefined, folderPath: string): boolean => {
  const normalizedPageFolder = normalizeFolderPath(pageFolder);
  const normalizedFolder = normalizeFolderPath(folderPath);

  // The synthetic Root row represents only pages stored directly at the root.
  if (!normalizedFolder) return normalizedPageFolder === '';

  return normalizedPageFolder === normalizedFolder
    || normalizedPageFolder.startsWith(`${normalizedFolder}/`);
};
