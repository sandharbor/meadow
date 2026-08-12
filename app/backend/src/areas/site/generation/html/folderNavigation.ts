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

import type { FolderNavigationPage } from './types.js';

interface FolderNode {
  name: string;
  path: string;
  folders: Map<string, FolderNode>;
  pages: FolderNavigationPage[];
}

export interface FolderNavigationDataFile {
  name: string;
  path: string;
}

export interface FolderNavigationDataFolder {
  name: string;
  path: string;
  folders: FolderNavigationDataFolder[];
  files: FolderNavigationDataFile[];
}

export interface FolderNavigationData {
  folders: FolderNavigationDataFolder[];
  files: FolderNavigationDataFile[];
}

const compareNames = (left: string, right: string): number =>
  left.localeCompare(right, 'en', { sensitivity: 'base', numeric: true });

function buildTree(pages: FolderNavigationPage[]): FolderNode {
  const root: FolderNode = { name: '', path: '', folders: new Map(), pages: [] };

  for (const page of pages) {
    const segments = page.directory.split('/').filter(Boolean);
    let node = root;
    let accumulatedPath = '';

    for (const segment of segments) {
      accumulatedPath = accumulatedPath ? `${accumulatedPath}/${segment}` : segment;
      let child = node.folders.get(segment);
      if (!child) {
        child = { name: segment, path: accumulatedPath, folders: new Map(), pages: [] };
        node.folders.set(segment, child);
      }
      node = child;
    }

    node.pages.push(page);
  }

  return root;
}

function dataFile(page: FolderNavigationPage): FolderNavigationDataFile {
  return {
    name: `${page.normalizedTitle}.html`,
    path: page.outputPath,
  };
}

function dataFolder(node: FolderNode): FolderNavigationDataFolder {
  return {
    name: node.name,
    path: node.path,
    folders: [...node.folders.values()]
      .sort((left, right) => compareNames(left.name, right.name))
      .map(dataFolder),
    files: [...node.pages]
      .sort((left, right) => compareNames(left.normalizedTitle, right.normalizedTitle))
      .map(dataFile),
  };
}

export function buildFolderNavigationData(pages: FolderNavigationPage[]): FolderNavigationData {
  const entry = pages.find(page => page.isEntry && page.siteNodeId);
  if (entry) {
    const childrenByParent = new Map<string, FolderNavigationPage[]>();
    for (const page of pages) {
      if (!page.parentSiteNodeId) continue;
      const children = childrenByParent.get(page.parentSiteNodeId) ?? [];
      children.push(page);
      childrenByParent.set(page.parentSiteNodeId, children);
    }
    const directChildren = (parentId: string): FolderNavigationPage[] =>
      [...(childrenByParent.get(parentId) ?? [])].sort((left, right) => {
        const rank = (page: FolderNavigationPage) => page.siteNodeKind === 'folder' ? 0 : 1;
        return rank(left) - rank(right) || compareNames(left.normalizedTitle, right.normalizedTitle) || left.outputPath.localeCompare(right.outputPath);
      });
    const structuralFolder = (page: FolderNavigationPage): FolderNavigationDataFolder => ({
      name: page.normalizedTitle,
      path: page.outputPath,
      folders: directChildren(page.siteNodeId!)
        .filter(child => child.siteNodeKind === 'folder')
        .map(structuralFolder),
      files: directChildren(page.siteNodeId!)
        .filter(child => child.siteNodeKind === 'file')
        .map(dataFile),
    });
    const rootChildren = entry.siteNodeKind === 'collection' || entry.siteNodeKind === 'folder'
      ? directChildren(entry.siteNodeId!)
      : [];
    const semanticOnly = pages
      .filter(page => page.siteNodeKind === 'file' && !page.parentSiteNodeId && page.siteNodeId !== entry.siteNodeId)
      .sort((left, right) => compareNames(left.normalizedTitle, right.normalizedTitle));
    return {
      folders: rootChildren.filter(page => page.siteNodeKind === 'folder').map(structuralFolder),
      files: [...rootChildren.filter(page => page.siteNodeKind === 'file'), ...semanticOnly].map(dataFile),
    };
  }
  const root = buildTree(pages);
  return {
    folders: [...root.folders.values()]
      .sort((left, right) => compareNames(left.name, right.name))
      .map(dataFolder),
    files: [...root.pages]
      .sort((left, right) => compareNames(left.normalizedTitle, right.normalizedTitle))
      .map(dataFile),
  };
}

export function renderFolderNavigationDataScript(pages: FolderNavigationPage[]): string {
  const data = JSON.stringify(buildFolderNavigationData(pages))
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `window.MeadowFolderNavData=${data};\n`;
}
