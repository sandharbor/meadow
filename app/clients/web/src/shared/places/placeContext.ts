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

import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import type { AppPlace, PlaceNodeReference } from '../../../../../contracts/places/index.js';

/**
 * Router-free hooks through which app areas take part in App Places. An area
 * reports when it opens or closes a surface it owns, and answers requests to
 * open it (from a link) or close it (from browser history). Only the app
 * shell's PlaceProvider knows about URLs.
 */

/** true when the surface opened; otherwise the reason it could not. */
export type SurfaceOpenResult = true | string;

export type SurfaceRequestHandler = (
  parameters: Readonly<Record<string, string>> | null,
) => SurfaceOpenResult | Promise<SurfaceOpenResult>;

export interface SurfaceParticipant {
  surface: string;
  /**
   * The parameters this participant owns. Omitted for the surface's owner,
   * which opens the surface itself; extensions own named parameters within it.
   */
  parameters?: readonly string[];
  onRequest: SurfaceRequestHandler;
}

export interface SelectionRequestResult {
  /** References that resolved, first one focused. */
  selected: readonly PlaceNodeReference[];
  missing: number;
}

export interface PlaceContextValue {
  openPlace(place: AppPlace): void;
  /** Follow a link from outside the app, such as a desktop meadow:// link. */
  openLink(path: string): void;
  /** Whether a link is asking for this surface, even before it is delivered. */
  isSurfaceRequested(surface: string): boolean;
  registerSurface(participant: SurfaceParticipant): () => void;
  reportSurface(surface: string, owned: readonly string[] | undefined, open: boolean, parameters: Readonly<Record<string, string>>): void;
  registerSelection(onRequest: (references: readonly PlaceNodeReference[]) => SelectionRequestResult | Promise<SelectionRequestResult>): () => void;
  reportSelection(references: readonly PlaceNodeReference[]): void;
}

export const PlaceContext = createContext<PlaceContextValue | null>(null);

/**
 * Changes whenever the page changes, so open surfaces report again. Kept apart
 * from PlaceContext so a page change does not rerun effects that only use it.
 */
export const PlaceEpochContext = createContext(0);

export interface PlaceSurfaceReporter {
  /** The person opened or changed the surface in the app. */
  opened(parameters?: Readonly<Record<string, string>>): void;
  closed(): void;
}

/**
 * Take part in one surface. Owners pass no `parameters` option; an area that
 * renders dialogs inside another owner's surface names the parameters it owns.
 */
export function usePlaceSurface(
  surface: string,
  onRequest: SurfaceRequestHandler,
  options: { parameters?: readonly string[] } = {},
): PlaceSurfaceReporter {
  const context = useContext(PlaceContext);
  const handler = useRef(onRequest);
  handler.current = onRequest;
  const owned = options.parameters;
  const ownedKey = owned?.join(',');
  useEffect(() => context?.registerSurface({
    surface,
    parameters: ownedKey === undefined ? undefined : ownedKey.split(','),
    onRequest: parameters => handler.current(parameters),
  }), [context, surface, ownedKey]);
  return useMemo(() => ({
    opened: (parameters = {}) => context?.reportSurface(surface, ownedKey === undefined ? undefined : ownedKey.split(','), true, parameters),
    closed: () => context?.reportSurface(surface, ownedKey === undefined ? undefined : ownedKey.split(','), false, {}),
  }), [context, surface, ownedKey]);
}

/** The bundle editor reports and restores the node selection. */
export function usePlaceSelection(
  onRequest: (references: readonly PlaceNodeReference[]) => SelectionRequestResult | Promise<SelectionRequestResult>,
): (references: readonly PlaceNodeReference[]) => void {
  const context = useContext(PlaceContext);
  const handler = useRef(onRequest);
  handler.current = onRequest;
  useEffect(() => context?.registerSelection(references => handler.current(references)), [context]);
  return useMemo(() => (references: readonly PlaceNodeReference[]) => context?.reportSelection(references), [context]);
}

/** Move the person to a place from within the app. */
export function useOpenPlace(): (place: AppPlace) => void {
  const context = useContext(PlaceContext);
  return useMemo(() => (place: AppPlace) => context?.openPlace(place), [context]);
}

/**
 * The common way a component makes a dialog it owns linkable: describe whether
 * it is open (and with which parameters), and how to open or close it.
 * Transitions are reported; requests from links and history call the actions.
 */
export function useLinkedSurface(
  surface: string,
  state: { open: boolean; parameters?: Readonly<Record<string, string>> },
  actions: {
    open(parameters: Readonly<Record<string, string>>): SurfaceOpenResult | Promise<SurfaceOpenResult>;
    close(): void;
  },
  options: { parameters?: readonly string[] } = {},
): void {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const reporter = usePlaceSurface(surface, parameters => {
    if (parameters === null) {
      actionsRef.current.close();
      return true;
    }
    return actionsRef.current.open(parameters);
  }, options);
  const parametersKey = JSON.stringify(state.parameters ?? {});
  const wasOpen = useRef(false);
  const epoch = useContext(PlaceEpochContext);
  useEffect(() => {
    if (state.open) reporter.opened(JSON.parse(parametersKey) as Record<string, string>);
    else if (wasOpen.current) reporter.closed();
    wasOpen.current = state.open;
  }, [reporter, state.open, parametersKey, epoch]);
}

/**
 * Whether a link is currently asking for this surface. Components use it to
 * skip work the link would undo, such as refreshing what it asks to show.
 */
export function useIsSurfaceRequested(): (surface: string) => boolean {
  const context = useContext(PlaceContext);
  return useMemo(() => (surface: string) => context?.isSurfaceRequested(surface) ?? false, [context]);
}

export function useOpenLink(): (path: string) => void {
  const context = useContext(PlaceContext);
  return useMemo(() => (path: string) => context?.openLink(path), [context]);
}

/**
 * Wait, across renders, until a value satisfies a condition. A surface that a
 * link opens alongside other state, such as the selection, waits for that
 * state to arrive before deciding whether it can open. Resolves false when
 * the condition still fails after the timeout.
 */
export function useEventually<T>(value: T): (condition: (value: T) => boolean, timeoutMs?: number) => Promise<boolean> {
  const latest = useRef(value);
  latest.current = value;
  const waiters = useRef(new Set<() => void>());
  useEffect(() => {
    for (const check of [...waiters.current]) check();
  });
  return useMemo(() => (condition, timeoutMs = 5_000) => new Promise<boolean>(resolve => {
    if (condition(latest.current)) {
      resolve(true);
      return;
    }
    const check = () => {
      if (!condition(latest.current)) return;
      waiters.current.delete(check);
      globalThis.clearTimeout(timer);
      resolve(true);
    };
    const timer = globalThis.setTimeout(() => {
      waiters.current.delete(check);
      resolve(condition(latest.current));
    }, timeoutMs);
    waiters.current.add(check);
  }), []);
}
