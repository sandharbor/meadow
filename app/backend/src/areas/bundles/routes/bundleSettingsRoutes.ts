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

import express from 'express';
import fs from 'fs';
import YAML from 'yaml';
import {
  generateBundleNodeId,
  parseBundleNodeConfig,
  stringifyBundleNodeConfig,
  validateCanonicalBundleConfiguration,
} from '../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import type { BundleConfig } from '../../../../../shared_code/types/bundleConfig.js';
import type { FileType } from '../../../../../shared_code/types/FileType.js';
import { generateBundleGuid, isValidBundleGuid } from '../../../../../shared_code/utils/bundleGuidUtils.js';
import { getBundleConfigPath } from '../../../shared/bundle-config/bundleConfigPaths.js';
import { clearBundleGuidCache, logBundleInfo } from '../../../shared/utils/logging/bundleLogger.js';
import { resolveDefaultDepth } from '../services/bundleTraversalDefaults.js';

const router = express.Router();

router.put('/bundles/:slug', (req, res, next) => {
  const { slug } = req.params;
  const {
    sourceDirectory,
    entryBundleNodeName,
    entrySourceGraphSubdirectory,
    entryFileType,
    bundleNotes,
    defaultOutlinksDepth: requestedDefaultOutlinksDepth,
    defaultInlinksDepth: requestedDefaultInlinksDepth,
  } = req.body as {
    sourceDirectory?: string;
    entryBundleNodeName?: string;
    entrySourceGraphSubdirectory?: string;
    entryFileType?: FileType;
    bundleNotes?: string;
    defaultOutlinksDepth?: number;
    defaultInlinksDepth?: number;
  };

  const configPath = getBundleConfigPath(slug);
  try {
    if (!fs.existsSync(configPath)) return res.status(404).json({ error: 'Bundle not found' });

    const existingConfig = YAML.parse(fs.readFileSync(configPath, 'utf8')) as BundleConfig;
    const nodeConfigPath = getBundleConfigPath(slug, 'bundle_node_config.yaml');
    const existingNodes = parseBundleNodeConfig(fs.readFileSync(nodeConfigPath, 'utf8'), nodeConfigPath);
    const currentEntryNode = existingNodes.find(node => node.bundleNodeId === existingConfig.entryBundleNodeId);
    if (!currentEntryNode) {
      return res.status(409).json({ error: 'The configured bundle entry node could not be found' });
    }

    const folderDerived = currentEntryNode.bundleNodeKind !== 'file';
    const defaultOutlinksDepth = resolveDefaultDepth(
      requestedDefaultOutlinksDepth,
      existingConfig.defaultOutlinksDepth ?? (folderDerived ? 1 : 3),
    );
    const defaultInlinksDepth = resolveDefaultDepth(
      requestedDefaultInlinksDepth,
      existingConfig.defaultInlinksDepth ?? (folderDerived ? 0 : 1),
    );
    if (defaultOutlinksDepth === null || defaultInlinksDepth === null) {
      return res.status(400).json({ error: 'Default traversal depths must be non-negative integers' });
    }

    const bundleGuid = isValidBundleGuid(existingConfig.bundleGuid) ? existingConfig.bundleGuid : generateBundleGuid();
    if (folderDerived) {
      if (sourceDirectory !== undefined && sourceDirectory !== existingConfig.sourceDirectory) {
        return res.status(409).json({ error: 'The source directory for a folder-derived bundle cannot be changed here' });
      }
      const updatedConfig: BundleConfig = {
        ...existingConfig,
        bundleGuid,
        defaultOutlinksDepth,
        defaultInlinksDepth,
        archivedAt: existingConfig.archivedAt ?? null,
        bundleCreatedAt: existingConfig.bundleCreatedAt || new Date().toISOString(),
        bundleUpdatedAt: new Date().toISOString(),
        bundleLastPublishedAt: existingConfig.bundleLastPublishedAt ?? null,
        bundleNotes: bundleNotes !== undefined ? bundleNotes : (existingConfig.bundleNotes || ''),
      };
      validateCanonicalBundleConfiguration({
        committedNodes: existingNodes,
        committedPath: nodeConfigPath,
        bundleConfig: updatedConfig,
        bundleConfigPath: configPath,
      });
      fs.writeFileSync(configPath, YAML.stringify(updatedConfig), 'utf8');
      clearBundleGuidCache(slug);
      logBundleInfo(slug, 'Folder-derived bundle defaults updated');
      return res.json({ success: true, message: 'Bundle updated successfully' });
    }

    if (!sourceDirectory || !entryBundleNodeName) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    const entryDirectory = entrySourceGraphSubdirectory || '';
    const resolvedEntryFileType = entryFileType || 'md';
    let entryNode = existingNodes.find(node =>
      node.bundleNodeName === entryBundleNodeName
      && (node.sourceGraphSubdirectory || '') === entryDirectory
      && node.fileType === resolvedEntryFileType);
    if (!entryNode) {
      entryNode = {
        bundleNodeName: entryBundleNodeName,
        ...(entryDirectory && { sourceGraphSubdirectory: entryDirectory }),
        bundleNodeKind: 'file',
        fileType: resolvedEntryFileType,
        bundleNodeId: generateBundleNodeId(existingNodes.map(node => node.bundleNodeId)),
        listType: 'whitelist',
      };
      existingNodes.push(entryNode);
    } else if (entryNode.listType === 'blacklist') {
      entryNode.listType = 'whitelist';
    }

    const defaultTraversalBundleNodeId = existingConfig.defaultTraversalBundleNodeId === existingConfig.entryBundleNodeId
      ? entryNode.bundleNodeId
      : existingConfig.defaultTraversalBundleNodeId;
    const updatedConfig: BundleConfig = {
      ...existingConfig,
      bundleGuid,
      sourceDirectory,
      entryBundleNodeId: entryNode.bundleNodeId,
      defaultTraversalBundleNodeId,
      defaultOutlinksDepth,
      defaultInlinksDepth,
      archivedAt: existingConfig.archivedAt ?? null,
      bundleCreatedAt: existingConfig.bundleCreatedAt || new Date().toISOString(),
      bundleUpdatedAt: new Date().toISOString(),
      bundleLastPublishedAt: existingConfig.bundleLastPublishedAt ?? null,
      bundleNotes: bundleNotes !== undefined ? bundleNotes : (existingConfig.bundleNotes || ''),
    };

    validateCanonicalBundleConfiguration({
      committedNodes: existingNodes,
      committedPath: nodeConfigPath,
      bundleConfig: updatedConfig,
      bundleConfigPath: configPath,
    });
    fs.writeFileSync(nodeConfigPath, stringifyBundleNodeConfig(existingNodes), 'utf8');
    fs.writeFileSync(configPath, YAML.stringify(updatedConfig), 'utf8');
    clearBundleGuidCache(slug);
    logBundleInfo(slug, 'Bundle updated');
    res.json({ success: true, message: 'Bundle updated successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
