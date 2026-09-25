/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

// Gathers every owner's place definitions. Callers outside contracts/places
// import places only from here.

import { createPlaceRegistry } from './grammar.js';
import { bundlesPlaces } from './areas/bundles.js';
import { curationPlaces } from './areas/bundle/curation.js';
import { generationPlaces } from './areas/bundle/generation.js';
import { reviewPlaces } from './areas/bundle/review.js';
import { sharingPlaces } from './areas/bundle/sharing.js';
import { sourcingPlaces } from './areas/bundle/sourcing.js';
import { appShellPlaces } from './shared/app-shell.js';
import { bundleManagementPlaces } from './shared/bundle-management.js';

export type {
  AppPlace,
  PlaceArrival,
  PlaceNodeReference,
  PlaceOwnerDefinition,
  PlaceParameterDefinition,
  PlaceSurface,
  PlaceSurfaceDefinition,
} from './types.js';
export type { ParsedAppPlace, PlaceRegistry } from './grammar.js';

export const placeRegistry = createPlaceRegistry([
  bundlesPlaces,
  sourcingPlaces,
  curationPlaces,
  generationPlaces,
  reviewPlaces,
  sharingPlaces,
  appShellPlaces,
  bundleManagementPlaces,
]);

export const appPlacePath = placeRegistry.appPlacePath;
export const parseAppPlace = placeRegistry.parseAppPlace;
export const describeAppPlace = placeRegistry.describeAppPlace;

/** The nearest place a link may leave in the URL once a person moves on. */
export function historyPlace(place: import('./types.js').AppPlace): import('./types.js').AppPlace {
  const definition = place.surface ? placeRegistry.surfaceDefinition(place.page, place.surface.name) : undefined;
  if (place.page === 'bundle-list') return definition?.history ? { page: 'bundle-list', surface: place.surface } : { page: 'bundle-list' };
  return definition?.history ? { page: 'bundle', slug: place.slug, surface: place.surface } : { page: 'bundle', slug: place.slug };
}
