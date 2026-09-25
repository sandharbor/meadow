/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { AppPlace, PlaceArrival, PlaceNodeReference } from '../../../contracts/places/index.js';
import { appPlacePath, parseAppPlace, placeRegistry } from '../../../contracts/places/index.js';
import type { BundleNodeDetails } from '../../../contracts/types/cliOperations.js';

type RequestJson = (pathname: string, method?: string, body?: unknown) => Promise<unknown>;

/** Help for 'meadow bundle open', listing surfaces by owning area. */
export function showBundleOpenHelp(): void {
  const lines = [
    'Usage: meadow bundle open <bundle-slug> [--surface <name> [--<parameter> <value>]...] [--select <node>]...',
    '',
    'Opens the full Meadow Web Client at a place in this bundle and reports the',
    'place it actually reached.',
    '',
    '  --select <node>   Select a page: a bundle node ID, a source path, or a',
    '                    bundleNodeKey. Repeatable; the first one is focused.',
    '',
    'Surfaces:',
  ];
  const surfaces = placeRegistry.surfaces.filter(surface => surface.page === 'bundle');
  const owners = [...new Set(surfaces.map(surface => placeRegistry.ownerOf(surface)))];
  for (const owner of owners) {
    lines.push(`  ${owner}:`);
    for (const surface of surfaces.filter(candidate => placeRegistry.ownerOf(candidate) === owner)) {
      const parameters = surface.parameters.map(parameter => parameter.values
        ? `--${parameter.name} <${parameter.values.join('|')}>`
        : `--${parameter.name} <${parameter.required ? 'required' : 'value'}>`);
      lines.push(`    ${surface.surface.padEnd(18)} ${surface.title}${parameters.length ? `  ${parameters.join(' ')}` : ''}`);
    }
  }
  lines.push('', "Run 'meadow open <place-path>' to open any place directly, for example:", "  meadow open '/bundle/my-site?surface=preview&step=share'");
  console.log(lines.join('\n'));
}

const NODE_ID = /^[0-9a-f]{12}$/;

async function resolveSelection(slug: string, value: string, requestJson: RequestJson): Promise<PlaceNodeReference> {
  const locator = NODE_ID.test(value) ? { nodeId: value } : { path: value };
  const response = await requestJson(`/bundles/${encodeURIComponent(slug)}/curation/node/describe`, 'POST', locator) as { node?: BundleNodeDetails };
  const node = response?.node;
  if (!node) throw new Error(`No page matches --select ${value}`);
  return node.bundleNodeId ? { id: node.bundleNodeId } : { key: node.bundleNodeKey };
}

/** Parse 'bundle open' arguments into a place. */
export async function parseBundleOpen(args: string[], requestJson: RequestJson): Promise<AppPlace> {
  const [slug, ...options] = args;
  if (!slug || slug.startsWith('-')) throw new Error("Usage: meadow bundle open <bundle-slug> [--surface <name>] [--select <node>]");
  let surface: string | undefined;
  const parameters: Record<string, string> = {};
  const selections: string[] = [];
  for (let index = 0; index < options.length; index += 2) {
    const option = options[index];
    const value = options[index + 1];
    if (!option.startsWith('--') || value === undefined || value.startsWith('--')) throw new Error(`Expected a value after ${option}`);
    const name = option.slice(2);
    if (name === 'surface') surface = value;
    else if (name === 'select') selections.push(value);
    else parameters[name] = value;
  }
  if (!surface && Object.keys(parameters).length > 0) throw new Error(`--${Object.keys(parameters)[0]} needs --surface`);
  if (surface) {
    const definition = placeRegistry.surfaceDefinition('bundle', surface);
    if (!definition) throw new Error(`Unknown surface: ${surface}. Run 'meadow bundle open --help' to list surfaces.`);
    for (const name of Object.keys(parameters)) {
      if (!definition.parameters.some(parameter => parameter.name === name)) throw new Error(`${definition.title} has no --${name}`);
    }
  }
  const select = [];
  for (const value of selections) select.push(await resolveSelection(slug, value, requestJson));
  const place: AppPlace = {
    page: 'bundle',
    slug,
    ...(surface && { surface: { name: surface, parameters } }),
    ...(select.length > 0 && { select }),
  };
  appPlacePath(place); // Validates required parameters and allowed values.
  return place;
}

/** Validate a raw place path for 'meadow open'. */
export function parsePlacePath(path: string): string {
  const parsed = parseAppPlace(path);
  if (parsed.ignored.length > 0) throw new Error(`Not understood in this place: ${parsed.ignored.join(', ')}`);
  return appPlacePath(parsed.place);
}

/**
 * Wait for the web client to report arriving at the place this command opened,
 * so the command can say what was actually reached.
 */
export async function waitForArrival(requested: string, since: string, requestJson: RequestJson, timeoutMs = 15_000): Promise<PlaceArrival | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await requestJson(`/places/arrivals?since=${encodeURIComponent(since)}`) as { arrivals?: PlaceArrival[] };
    const arrival = response.arrivals?.find(candidate => candidate.requested === requested);
    if (arrival) return arrival;
    await new Promise(resolve => globalThis.setTimeout(resolve, 250));
  }
  return null;
}
