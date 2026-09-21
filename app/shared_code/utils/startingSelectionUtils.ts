/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { BundleConfig, BundleSource } from '../../contracts/types/bundleConfig.js';
import type { BundleNodeConfig, BundleNodeId } from '../../contracts/types/bundleNodeConfig.js';
import type { StartingSelection } from '../../contracts/types/startingSelection.js';
import { FILE_TYPES, type FileType } from '../../contracts/types/FileType.js';
import { assignLegacySourceIdentity, LEGACY_SOURCE_ID, normalizeSourceRelativePath } from './bundleSourceUtils.js';
import { generateBundleNodeId } from './bundleNodeConfigUtils.js';
import { canonicalPageFilename } from './fileTypeUtils.js';

export function bundleStartingSelections(config: BundleConfig, nodes: BundleNodeConfig[]): StartingSelection[] {
  const entry = nodes.find(node => node.bundleNodeId === config.entryBundleNodeId);
  const selected = entry?.bundleNodeKind === 'collection' ? entry.memberBundleNodeIds.map(id => nodes.find(node => node.bundleNodeId === id)) : [entry];
  return selected.flatMap(node => {
    if (!node || node.bundleNodeKind === 'collection') return [];
    return [{ sourceId: node.sourceId ?? LEGACY_SOURCE_ID, kind: node.bundleNodeKind,
      path: node.bundleNodeKind === 'folder' ? node.sourceGraphSubdirectory : [node.sourceGraphSubdirectory, canonicalPageFilename(node.bundleNodeName, node.fileType)].filter(Boolean).join('/') }];
  });
}

export function applyStartingSelections(options: {
  sources: BundleSource[]; selections: StartingSelection[]; nodes: BundleNodeConfig[];
  entryBundleNodeId?: BundleNodeId; bundleName: string;
}): { nodes: BundleNodeConfig[]; entryBundleNodeId: BundleNodeId; defaultTraversalBundleNodeId: BundleNodeId } {
  if (!Array.isArray(options.selections) || !options.selections.length) throw new Error('Choose at least one starting selection.');
  const nodes = assignLegacySourceIdentity(options.nodes).map(node => node.bundleNodeKind === 'collection' ? { ...node, memberBundleNodeIds: [...node.memberBundleNodeIds] } : { ...node });
  const members: BundleNodeId[] = [];
  const locators = new Set<string>();
  const ids = new Set(nodes.map(node => node.bundleNodeId));
  for (const selection of options.selections) {
    const source = options.sources.find(source => source.id === selection?.sourceId);
    if (!source || (selection.kind !== 'file' && selection.kind !== 'folder') || typeof selection.path !== 'string') throw new Error('A starting selection needs a registered source, kind, and relative path.');
    const relative = normalizeSourceRelativePath(selection.path);
    const key = `${source.id}/${selection.kind}/${relative}`;
    if (locators.has(key)) throw new Error('Each starting selection must be unique.');
    locators.add(key);
    const lastSlash = relative.lastIndexOf('/');
    let directory = selection.kind === 'folder' ? relative : relative.slice(0, Math.max(lastSlash, 0));
    let name = relative.slice(lastSlash + 1) || source.name;
    let fileType: FileType | undefined;
    if (selection.kind === 'file') {
      if (relative.endsWith('.excalidraw.md')) { fileType = 'excalidraw'; name = name.slice(0, -14); }
      else {
        const dot = name.lastIndexOf('.');
        if (dot <= 0 || !FILE_TYPES.includes(name.slice(dot + 1) as FileType)) throw new Error('Choose a supported file with its extension.');
        fileType = name.slice(dot + 1) as FileType;
        name = name.slice(0, dot);
      }
      if (!name) throw new Error('Choose a source file.');
      if (lastSlash < 0) directory = '';
    }
    let node = nodes.find(node => node.bundleNodeKind === selection.kind && node.sourceId === source.id
      && (node.sourceGraphSubdirectory ?? '') === directory && (node.bundleNodeKind === 'folder' || (node.bundleNodeName === name && node.fileType === fileType)));
    if (!node) {
      const bundleNodeId = generateBundleNodeId(ids); ids.add(bundleNodeId);
      node = selection.kind === 'folder'
        ? { bundleNodeKind: 'folder', bundleNodeName: name, sourceId: source.id, sourceGraphSubdirectory: directory, bundleNodeId, listType: 'whitelist' }
        : { bundleNodeKind: 'file', bundleNodeName: name, sourceId: source.id, sourceGraphSubdirectory: directory, fileType: fileType!, bundleNodeId, listType: 'whitelist' };
      nodes.push(node);
    } else { node.listType = 'whitelist'; }
    members.push(node.bundleNodeId);
  }
  const priorEntry = nodes.find(node => node.bundleNodeId === options.entryBundleNodeId);
  let entryBundleNodeId = members[0];
  if (members.length > 1 || priorEntry?.bundleNodeKind === 'collection') {
    if (priorEntry?.bundleNodeKind === 'collection') {
      priorEntry.memberBundleNodeIds = members;
      entryBundleNodeId = priorEntry.bundleNodeId;
    } else {
      entryBundleNodeId = generateBundleNodeId(ids);
      nodes.push({ bundleNodeKind: 'collection', bundleNodeName: options.bundleName || 'Bundle home', bundleNodeId: entryBundleNodeId, memberBundleNodeIds: members, listType: 'whitelist' });
    }
  }
  return { nodes, entryBundleNodeId, defaultTraversalBundleNodeId: entryBundleNodeId };
}
