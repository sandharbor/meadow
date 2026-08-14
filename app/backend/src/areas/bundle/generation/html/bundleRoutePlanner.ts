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

import path from 'path';
import { BundleConfigPaths } from '../../../../../../shared_code/paths/bundleConfigPaths.js';
import type { BundleConfig } from '../../../../../../shared_code/types/bundleConfig.js';
import type { FileBundleNodeConfig, BundleNodeConfig, BundleNodeId } from '../../../../../../shared_code/types/bundleNodeConfig.js';
import { normalizePageTitle } from './shared.js';

export type BundleRouteTable = ReadonlyMap<BundleNodeId, string>;

export interface PreferredRouteCollision {
  preferredRoute: string;
  bundleNodeIds: BundleNodeId[];
  plannedRoutes: string[];
}

export interface BundleRoutePlan {
  folderDerived: boolean;
  routes: BundleRouteTable;
  collisions: PreferredRouteCollision[];
}

const canonicalRoute = (route: string): string => route.normalize('NFC').toLocaleLowerCase('en-US');
const posixJoin = (...parts: string[]): string => path.posix.join(...parts.filter(Boolean));

function preferredFileRoute(config: BundleNodeConfig, bundleConfig: BundleConfig, bundleSlug?: string): string {
  const name = normalizePageTitle(config.bundleNodeName, bundleConfig, bundleSlug);
  const sourceDirectory = config.sourceGraphSubdirectory ?? '';
  if (sourceDirectory === BundleConfigPaths.TAGPAGE_SOURCE_STAGING_DIR) {
    return posixJoin(
      BundleConfigPaths.GENERATED_BUNDLE_INTERNAL_DIR,
      BundleConfigPaths.GENERATED_TAGPAGES_DIR,
      `${name}.html`,
    );
  }
  const sourceSegments = sourceDirectory.split('/').filter(Boolean);
  const outputDirectory = sourceSegments[0] === BundleConfigPaths.GENERATED_BUNDLE_INTERNAL_DIR
    ? posixJoin(
        BundleConfigPaths.GENERATED_BUNDLE_INTERNAL_DIR,
        BundleConfigPaths.GENERATED_SOURCEPAGES_DIR,
        ...sourceSegments.slice(1),
      )
    : sourceDirectory;
  return posixJoin(outputDirectory, `${name}.html`);
}

function generatedStructuralRoute(
  config: BundleNodeConfig,
  bundleConfig: BundleConfig,
  bundleSlug?: string,
): string {
  const normalizedTitle = normalizePageTitle(config.bundleNodeName, bundleConfig, bundleSlug);
  const slug = normalizedTitle
    .normalize('NFKD')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'folder';
  return posixJoin(
    BundleConfigPaths.GENERATED_BUNDLE_INTERNAL_DIR,
    BundleConfigPaths.GENERATED_FOLDERPAGES_DIR,
    `${slug}-${config.bundleNodeId}.html`,
  );
}

function uniqueFallback(base: string, occupied: Set<string>): string {
  if (!occupied.has(canonicalRoute(base))) return base;
  const extension = path.posix.extname(base);
  const stem = base.slice(0, -extension.length);
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${stem}-${suffix}${extension}`;
    if (!occupied.has(canonicalRoute(candidate))) return candidate;
  }
}

/** Plans every rendered route before generation writes any output. */
export function planBundleRoutes(
  configs: BundleNodeConfig[],
  bundleConfig: BundleConfig,
  bundleSlug?: string,
): BundleRoutePlan {
  const entry = configs.find(config => config.bundleNodeId === bundleConfig.entryBundleNodeId);
  if (!entry) throw new Error('Cannot plan routes: entryBundleNodeId does not resolve');
  const rendered = configs.filter(config => config.listType === 'whitelist');
  const folderDerived = entry.bundleNodeKind !== 'file';

  const preferred = new Map<BundleNodeId, string>();
  for (const config of rendered) {
    if (folderDerived && config.bundleNodeId === entry.bundleNodeId) {
      preferred.set(config.bundleNodeId, 'index.html');
    } else if (config.bundleNodeKind === 'file') {
      preferred.set(config.bundleNodeId, preferredFileRoute(config, bundleConfig, bundleSlug));
    } else {
      preferred.set(config.bundleNodeId, generatedStructuralRoute(config, bundleConfig, bundleSlug));
    }
  }

  // Preserve the long-standing page-derived routing behavior, including
  // duplicate preferred source routes. The reserved namespace makes the new
  // generated routes collision-safe without changing how existing pages win
  // same-path collisions during generation.
  if (!folderDerived) {
    return {
      folderDerived: false,
      routes: new Map(rendered.map(config => [config.bundleNodeId, preferred.get(config.bundleNodeId)!])),
      collisions: [],
    };
  }

  const routes = new Map<BundleNodeId, string>();
  const occupied = new Set<string>();
  const preferredOwners = new Map<string, BundleNodeConfig[]>();
  for (const config of rendered) {
    const route = preferred.get(config.bundleNodeId);
    if (!route) continue;
    const owners = preferredOwners.get(canonicalRoute(route)) ?? [];
    owners.push(config);
    preferredOwners.set(canonicalRoute(route), owners);
  }

  if (folderDerived) {
    routes.set(entry.bundleNodeId, 'index.html');
    occupied.add(canonicalRoute('index.html'));
  }

  const files = rendered
    .filter((config): config is FileBundleNodeConfig => config.bundleNodeKind === 'file')
    .sort((left, right) => canonicalRoute(preferred.get(left.bundleNodeId) ?? '').localeCompare(canonicalRoute(preferred.get(right.bundleNodeId) ?? '')) || left.bundleNodeId.localeCompare(right.bundleNodeId));
  for (const file of files) {
    const desired = preferred.get(file.bundleNodeId)!;
    let route = desired;
    if (occupied.has(canonicalRoute(route))) {
      const dir = path.posix.dirname(desired) === '.' ? '' : path.posix.dirname(desired);
      const stem = path.posix.basename(desired, '.html');
      route = uniqueFallback(posixJoin(dir, `${stem}--file-${file.bundleNodeId.slice(0, 6)}.html`), occupied);
    }
    routes.set(file.bundleNodeId, route);
    occupied.add(canonicalRoute(route));
  }

  const structuralNodes = rendered
    .filter(config => config.bundleNodeKind !== 'file' && config.bundleNodeId !== entry.bundleNodeId)
    .sort((left, right) => left.bundleNodeId.localeCompare(right.bundleNodeId));
  for (const structuralNode of structuralNodes) {
    const desired = preferred.get(structuralNode.bundleNodeId)!;
    const route = uniqueFallback(desired, occupied);
    routes.set(structuralNode.bundleNodeId, route);
    occupied.add(canonicalRoute(route));
  }

  if (routes.size !== new Set([...routes.values()].map(canonicalRoute)).size) {
    throw new Error('Route planning failed: generated routes do not have one-to-one ownership');
  }

  const collisions = [...preferredOwners.values()]
    .filter(owners => owners.length > 1)
    .map(owners => ({
      preferredRoute: preferred.get(owners[0].bundleNodeId)!,
      bundleNodeIds: owners.map(owner => owner.bundleNodeId),
      plannedRoutes: owners.map(owner => routes.get(owner.bundleNodeId)!),
    }))
    .sort((left, right) => left.preferredRoute.localeCompare(right.preferredRoute));

  return { folderDerived, routes, collisions };
}

export function routeForBundleNode(config: BundleNodeConfig, routeTable: BundleRouteTable): string {
  const route = routeTable.get(config.bundleNodeId);
  if (!route) throw new Error(`No generated route planned for bundle node ${config.bundleNodeId}`);
  return route;
}
