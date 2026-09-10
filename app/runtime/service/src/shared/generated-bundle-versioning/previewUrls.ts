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


import type express from 'express';
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import type { BundleConfig } from '../../../../../contracts/types/bundleConfig.js';
import { BundleConfigPaths } from '../../../../../shared_code/paths/bundleConfigPaths.js';
import { encodePathForUrl } from '../../../../../shared_code/utils/urlUtils.js';
import {
  parseBundleNodeConfig, resolveBundleNodeRoles,
} from '../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { createPreviewReadToken, MEADOW_PREVIEW_TOKEN_QUERY } from '../app-shell/controlPlaneSecurity.js';
import { currentGeneratedBundleVersionDirectory } from './generatedBundleVersionManifestService.js';
import { getHtmlPathForPage } from '../utils/htmlPathLookup.js';

function getRequestOrigin(req: express.Request): string { return `${req.protocol}://${req.get('host')}`; }

export function previewFileUrl(req: express.Request, bundleSlug: string, relativePath: string): string {
  const capability = process.env.MEADOW_API_CAPABILITY;
  if (!capability) throw new Error('Preview access requires the launch capability');
  const url = new URL(
    `${getRequestOrigin(req)}/api/bundles/${encodeURIComponent(bundleSlug)}/generation/published/${encodePathForUrl(relativePath)}`,
  );
  url.searchParams.set(MEADOW_PREVIEW_TOKEN_QUERY, createPreviewReadToken(capability, bundleSlug));
  return url.toString();
}

export function loadDefaultTraversalPage(bundleDirectory: string): { title: string; directory: string } {
  const configPath = BundleConfigPaths.getBundleConfigFile(bundleDirectory);
  const nodeConfigPath = BundleConfigPaths.getBundleNodeConfigFile(bundleDirectory);
  const bundleConfig = YAML.parse(fs.readFileSync(configPath, 'utf8')) as BundleConfig;
  const nodes = parseBundleNodeConfig(fs.readFileSync(nodeConfigPath, 'utf8'), nodeConfigPath);
  const { defaultTraversalNode } = resolveBundleNodeRoles(nodes, bundleConfig, configPath);
  return {
    title: defaultTraversalNode.bundleNodeName,
    directory: defaultTraversalNode.sourceGraphSubdirectory || '',
  };
}

export function defaultBundlePreviewUrl(
  req: express.Request, bundleSlug: string, bundleDirectory: string,
): string | null {
  const directory = currentGeneratedBundleVersionDirectory(bundleDirectory);
  if (!directory) return null;
  const page = loadDefaultTraversalPage(bundleDirectory);
  const relativePath = getHtmlPathForPage(bundleDirectory, page.title, page.directory);
  if (relativePath && fs.existsSync(path.join(directory, relativePath))) {
    return previewFileUrl(req, bundleSlug, relativePath);
  }
  const fallback = fs.readdirSync(directory).find(file => file.endsWith('.html'));
  return fallback ? previewFileUrl(req, bundleSlug, fallback) : null;
}
