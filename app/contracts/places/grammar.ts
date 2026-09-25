/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type {
  AppPlace,
  PlaceNodeReference,
  PlaceOwnerDefinition,
  PlaceSurfaceDefinition,
  PlaceSurfaceExtension,
} from './types.js';
import type { appPlace, ParticipatesIn } from '../../concepts/index.js';

/**
 * The place grammar over a set of owner definitions. index.ts binds it to the
 * registry; tests may bind it to small definition sets.
 */

const RESERVED = new Set(['surface', 'select']);
const SLUG = /^[a-zA-Z0-9_-]+$/;

export interface ParsedAppPlace {
  place: AppPlace;
  /** Parts of the link that were not understood and were ignored. */
  ignored: string[];
}

export interface PlaceRegistry {
  surfaces: readonly PlaceSurfaceDefinition[];
  owners: readonly PlaceOwnerDefinition[];
  surfaceDefinition(page: AppPlace['page'], surface: string): PlaceSurfaceDefinition | undefined;
  ownerOf(surface: PlaceSurfaceDefinition): string;
  appPlacePath(place: AppPlace): string;
  parseAppPlace(path: string): ParsedAppPlace;
  describeAppPlace(place: AppPlace): string;
  /** Whether a parameter belongs to the surface's owner rather than an extension. */
  isOwnParameter(page: AppPlace['page'], surface: string, name: string): boolean;
  /** Whether an open dialog is the current place's surface, a declared transient, or neither. */
  classifyDialog(dialogName: string, place: AppPlace): 'surface' | 'transient' | 'unaddressable';
}

function referenceText(reference: PlaceNodeReference): string {
  return 'id' in reference ? `id:${reference.id}` : `key:${reference.key}`;
}

function parseReference(value: string): PlaceNodeReference | null {
  if (value.startsWith('id:') && value.length > 3) return { id: value.slice(3) };
  if (value.startsWith('key:') && value.length > 4) return { key: value.slice(4) };
  return null;
}

function nameMatches(pattern: string | RegExp, name: string): boolean {
  return typeof pattern === 'string' ? pattern === name : pattern.test(name);
}

export function createPlaceRegistry(owners: readonly PlaceOwnerDefinition[]): PlaceRegistry {
  // Extensions contribute parameters (and the dialogs they open) to another
  // owner's surface; the effective definition carries both.
  const extensionsBySurface = new Map<string, PlaceSurfaceExtension[]>();
  for (const owner of owners) {
    for (const extension of owner.extensions ?? []) {
      const key = `${extension.page}:${extension.surface}`;
      extensionsBySurface.set(key, [...(extensionsBySurface.get(key) ?? []), extension]);
    }
  }
  const ownNames = new Map<string, Set<string>>();
  for (const owner of owners) for (const surface of owner.surfaces) {
    ownNames.set(`${surface.page}:${surface.surface}`, new Set(surface.parameters.map(parameter => parameter.name)));
  }
  const surfaces = owners.flatMap(owner => owner.surfaces.map(surface => {
    const extensions = extensionsBySurface.get(`${surface.page}:${surface.surface}`) ?? [];
    return extensions.length === 0 ? surface : { ...surface, parameters: [...surface.parameters, ...extensions.flatMap(extension => extension.parameters)] };
  }));
  for (const key of extensionsBySurface.keys()) {
    if (!surfaces.some(surface => `${surface.page}:${surface.surface}` === key)) throw new Error(`Place extension targets an unknown surface: ${key}`);
  }
  const transients = owners.flatMap(owner => owner.transients ?? []);
  const ownerBySurface = new Map<string, string>();
  for (const owner of owners) for (const surface of owner.surfaces) ownerBySurface.set(`${surface.page}:${surface.surface}`, owner.owner);

  // Refuse ambiguous grammars at load time rather than guessing at runtime.
  const meaningByPageParameter = new Map<string, string>();
  const surfaceKeys = new Set<string>();
  for (const surface of surfaces) {
    const key = `${surface.page}:${surface.surface}`;
    if (surfaceKeys.has(key)) throw new Error(`Place surface declared twice: ${key}`);
    surfaceKeys.add(key);
    const names = new Set<string>();
    for (const parameter of surface.parameters) {
      if (names.has(parameter.name)) throw new Error(`Place parameter declared twice on ${key}: ${parameter.name}`);
      names.add(parameter.name);
      if (RESERVED.has(parameter.name)) throw new Error(`Place parameter name is reserved: ${parameter.name}`);
      const meaningKey = `${surface.page}:${parameter.name}`;
      const meaning = `${parameter.description}|${(parameter.values ?? []).join(',')}`;
      const existing = meaningByPageParameter.get(meaningKey);
      if (existing !== undefined && existing !== meaning) {
        throw new Error(`Place parameter "${parameter.name}" means different things on the ${surface.page} page`);
      }
      meaningByPageParameter.set(meaningKey, meaning);
    }
  }

  const surfaceDefinition = (page: AppPlace['page'], surface: string) =>
    surfaces.find(candidate => candidate.page === page && candidate.surface === surface);

  const appPlacePath = (place: AppPlace): string => {
    const query = new globalThis.URLSearchParams();
    if (place.surface) {
      const definition = surfaceDefinition(place.page, place.surface.name);
      if (!definition) throw new Error(`Unknown ${place.page} surface: ${place.surface.name}`);
      query.set('surface', place.surface.name);
      for (const parameter of definition.parameters) {
        const value = place.surface.parameters[parameter.name];
        if (value === undefined) {
          if (parameter.required) throw new Error(`${definition.title} requires ${parameter.name}`);
          continue;
        }
        if (parameter.values && !parameter.values.includes(value)) {
          throw new Error(`${definition.title} ${parameter.name} must be one of ${parameter.values.join(', ')}`);
        }
        query.set(parameter.name, value);
      }
    }
    if (place.page === 'bundle' && place.select && place.select.length > 0) {
      query.set('select', place.select.map(referenceText).join(','));
    }
    const pathname = place.page === 'bundle-list' ? '/' : `/bundle/${encodeURIComponent(place.slug)}`;
    const search = query.toString().replace(/%3A/g, ':').replace(/%2C/g, ',');
    return search ? `${pathname}?${search}` : pathname;
  };

  const parseAppPlace = (path: string): ParsedAppPlace => {
    const url = new globalThis.URL(path, "http://place.invalid");
    const ignored: string[] = [];
    let place: AppPlace;
    if (url.pathname === '/') place = { page: 'bundle-list' };
    else {
      const match = /^\/bundle\/([^/]+)$/.exec(url.pathname);
      const slug = match ? decodeURIComponent(match[1]) : '';
      if (!match || !SLUG.test(slug)) throw new Error(`Not a Meadow place: ${url.pathname}`);
      place = { page: 'bundle', slug };
    }
    const surfaceName = url.searchParams.get('surface');
    const definition = surfaceName ? surfaceDefinition(place.page, surfaceName) : undefined;
    if (surfaceName && !definition) ignored.push(`surface=${surfaceName}`);
    if (definition) {
      const parameters: Record<string, string> = {};
      for (const parameter of definition.parameters) {
        const value = url.searchParams.get(parameter.name);
        if (value === null) continue;
        if (parameter.values && !parameter.values.includes(value)) ignored.push(`${parameter.name}=${value}`);
        else parameters[parameter.name] = value;
      }
      const missing = definition.parameters.filter(parameter => parameter.required && parameters[parameter.name] === undefined);
      if (missing.length > 0) ignored.push(`surface=${definition.surface} (missing ${missing.map(parameter => parameter.name).join(', ')})`);
      else place = { ...place, surface: { name: definition.surface, parameters } };
    }
    const select = url.searchParams.get('select');
    if (select !== null) {
      if (place.page !== 'bundle') ignored.push('select');
      else {
        const references = select.split(',').filter(Boolean).map(value => ({ value, reference: parseReference(value) }));
        for (const { value, reference } of references) if (!reference) ignored.push(`select ${value}`);
        const valid = references.flatMap(({ reference }) => reference ? [reference] : []);
        if (valid.length > 0) place = { ...place, select: valid };
      }
    }
    for (const key of url.searchParams.keys()) {
      if (key === 'surface' || key === 'select') continue;
      if (!definition?.parameters.some(parameter => parameter.name === key)) ignored.push(key);
    }
    return { place, ignored: [...new Set(ignored)] };
  };

  const describeAppPlace = (place: AppPlace): string => {
    const parts = [place.page === 'bundle-list' ? 'Bundles' : place.slug];
    if (place.surface) {
      const definition = surfaceDefinition(place.page, place.surface.name);
      parts.push(definition?.title ?? place.surface.name);
      for (const value of Object.values(place.surface.parameters)) parts.push(value);
    }
    if (place.page === 'bundle' && place.select?.length) parts.push(`${place.select.length} selected`);
    return parts.join(' › ');
  };

  return {
    surfaces,
    owners,
    surfaceDefinition,
    ownerOf: surface => ownerBySurface.get(`${surface.page}:${surface.surface}`) ?? 'unknown',
    isOwnParameter: (page, surface, name) => ownNames.get(`${page}:${surface}`)?.has(name) ?? false,
    classifyDialog: (name, place) => {
      if (transients.some(transient => nameMatches(transient.dialogName, name))) return 'transient';
      if (!place.surface) return 'unaddressable';
      const definition = surfaceDefinition(place.page, place.surface.name);
      if (definition?.dialogName && nameMatches(definition.dialogName, name)) return 'surface';
      const extensions = extensionsBySurface.get(`${place.page}:${place.surface.name}`) ?? [];
      return extensions.some(extension => extension.dialogNames.some(pattern => nameMatches(pattern, name))) ? 'surface' : 'unaddressable';
    },
    appPlacePath,
    parseAppPlace,
    describeAppPlace,
  };
}

export type AppPlaceMeadowConceptParticipations = [
  ParticipatesIn<typeof appPlace, "define-grammar", typeof createPlaceRegistry>,
];
