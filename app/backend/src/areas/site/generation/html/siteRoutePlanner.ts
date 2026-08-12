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
import type { SiteConfig } from '../../../../../../shared_code/types/siteConfig.js';
import type { FileSiteNodeConfig, FolderSiteNodeConfig, SiteNodeConfig, SiteNodeId } from '../../../../../../shared_code/types/siteNodeConfig.js';
import { normalizePageTitle } from './shared.js';

export type SiteRouteTable = ReadonlyMap<SiteNodeId, string>;

export interface PreferredRouteCollision {
  preferredRoute: string;
  siteNodeIds: SiteNodeId[];
  plannedRoutes: string[];
}

export interface SiteRoutePlan {
  folderDerived: boolean;
  routes: SiteRouteTable;
  collisions: PreferredRouteCollision[];
}

const canonicalRoute = (route: string): string => route.normalize('NFC').toLocaleLowerCase('en-US');
const posixJoin = (...parts: string[]): string => path.posix.join(...parts.filter(Boolean));

function preferredFileRoute(config: SiteNodeConfig, siteConfig: SiteConfig, siteSlug?: string): string {
  const name = normalizePageTitle(config.siteNodeName, siteConfig, siteSlug);
  return posixJoin(config.sourceGraphSubdirectory ?? '', `${name}.html`);
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
export function planSiteRoutes(
  configs: SiteNodeConfig[],
  siteConfig: SiteConfig,
  siteSlug?: string,
): SiteRoutePlan {
  const entry = configs.find(config => config.siteNodeId === siteConfig.entrySiteNodeId);
  if (!entry) throw new Error('Cannot plan routes: entrySiteNodeId does not resolve');
  const rendered = configs.filter(config => config.listType === 'whitelist');
  const folderDerived = entry.siteNodeKind !== 'file';

  if (!folderDerived) {
    return {
      folderDerived: false,
      routes: new Map(rendered.map(config => [config.siteNodeId, preferredFileRoute(config, siteConfig, siteSlug)])),
      collisions: [],
    };
  }

  const preferred = new Map<SiteNodeId, string>();
  for (const config of rendered) {
    if (config.siteNodeId === entry.siteNodeId) preferred.set(config.siteNodeId, 'index.html');
    else if (config.siteNodeKind === 'folder') preferred.set(config.siteNodeId, posixJoin(config.sourceGraphSubdirectory, 'index.html'));
    else if (config.siteNodeKind === 'file') preferred.set(config.siteNodeId, preferredFileRoute(config, siteConfig, siteSlug));
  }

  const routes = new Map<SiteNodeId, string>();
  const occupied = new Set<string>();
  const preferredOwners = new Map<string, SiteNodeConfig[]>();
  for (const config of rendered) {
    const route = preferred.get(config.siteNodeId);
    if (!route) continue;
    const owners = preferredOwners.get(canonicalRoute(route)) ?? [];
    owners.push(config);
    preferredOwners.set(canonicalRoute(route), owners);
  }

  routes.set(entry.siteNodeId, 'index.html');
  occupied.add(canonicalRoute('index.html'));

  const files = rendered
    .filter((config): config is FileSiteNodeConfig => config.siteNodeKind === 'file')
    .sort((left, right) => canonicalRoute(preferred.get(left.siteNodeId) ?? '').localeCompare(canonicalRoute(preferred.get(right.siteNodeId) ?? '')) || left.siteNodeId.localeCompare(right.siteNodeId));
  for (const file of files) {
    const desired = preferred.get(file.siteNodeId)!;
    let route = desired;
    if (occupied.has(canonicalRoute(route))) {
      const dir = path.posix.dirname(desired) === '.' ? '' : path.posix.dirname(desired);
      const stem = path.posix.basename(desired, '.html');
      route = uniqueFallback(posixJoin(dir, `${stem}--file-${file.siteNodeId.slice(0, 6)}.html`), occupied);
    }
    routes.set(file.siteNodeId, route);
    occupied.add(canonicalRoute(route));
  }

  const folders = rendered
    .filter((config): config is FolderSiteNodeConfig => config.siteNodeKind === 'folder' && config.siteNodeId !== entry.siteNodeId)
    .sort((left, right) => left.sourceGraphSubdirectory.localeCompare(right.sourceGraphSubdirectory) || left.siteNodeId.localeCompare(right.siteNodeId));
  for (const folder of folders) {
    const desired = preferred.get(folder.siteNodeId)!;
    let route = desired;
    if (occupied.has(canonicalRoute(route))) {
      route = uniqueFallback(
        posixJoin(folder.sourceGraphSubdirectory, `_folder-${folder.siteNodeId.slice(0, 6)}.html`),
        occupied,
      );
    }
    routes.set(folder.siteNodeId, route);
    occupied.add(canonicalRoute(route));
  }

  if (routes.size !== new Set([...routes.values()].map(canonicalRoute)).size) {
    throw new Error('Route planning failed: generated routes do not have one-to-one ownership');
  }

  const collisions = [...preferredOwners.values()]
    .filter(owners => owners.length > 1)
    .map(owners => ({
      preferredRoute: preferred.get(owners[0].siteNodeId)!,
      siteNodeIds: owners.map(owner => owner.siteNodeId),
      plannedRoutes: owners.map(owner => routes.get(owner.siteNodeId)!),
    }))
    .sort((left, right) => left.preferredRoute.localeCompare(right.preferredRoute));

  return { folderDerived: true, routes, collisions };
}

export function routeForSiteNode(config: SiteNodeConfig, routeTable: SiteRouteTable): string {
  const route = routeTable.get(config.siteNodeId);
  if (!route) throw new Error(`No generated route planned for site node ${config.siteNodeId}`);
  return route;
}
