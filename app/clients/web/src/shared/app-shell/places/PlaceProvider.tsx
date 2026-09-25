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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { placeRegistry } from '../../../../../../contracts/places/index.js';
import { PlaceContext, PlaceEpochContext, type PlaceContextValue } from '../../places/placeContext.js';
import { apiRequest } from '../../utils/apiClient.js';
import { logger } from '../../utils/logger.js';
import { PlaceCoordinator } from './placeCoordinator.js';

const placeLogger = logger.child('place');

/**
 * The only component that connects App Places to the router. It publishes
 * the current place for tooling, opens linked places, reports arrivals to the
 * Runtime, and shows a callout when a link could not be followed all the way.
 */
export const PlaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [notice, setNotice] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  /** Locations the coordinator produced itself, which need no handling. */
  const ownLocations = useRef<string[]>([]);
  const initial = useRef(true);
  // Children mount (and run effects) before this provider handles the first
  // location, so the initial link is known from the start.
  const initialSurface = useRef<string | undefined>((() => {
    try {
      return placeRegistry.parseAppPlace(`${location.pathname}${location.search}`).place.surface?.name;
    } catch {
      return undefined;
    }
  })());

  const coordinator = useMemo(() => new PlaceCoordinator({
    registry: placeRegistry,
    navigate: (path, { push }) => {
      ownLocations.current.push(path);
      navigateRef.current(path, { replace: !push });
    },
    back: () => navigateRef.current(-1),
    publish: path => { document.documentElement.dataset.meadowPlace = path; },
    pageEntered: () => setEpoch(value => value + 1),
    reached: (path, via) => placeLogger.info(`[place] reached ${path} via ${via}`),
    notify: message => setNotice(message),
    arrived: arrival => {
      setNotice(arrival.notice ?? null);
      void apiRequest('/places/arrivals', { method: 'POST', json: arrival }).catch(error => {
        placeLogger.debug('Could not report a place arrival to the Runtime', error);
      });
    },
  }), []);

  useEffect(() => {
    const path = `${location.pathname}${location.search}`;
    const ownIndex = ownLocations.current.indexOf(path);
    if (ownIndex >= 0) {
      ownLocations.current.splice(0, ownIndex + 1);
      return;
    }
    coordinator.handleLocation(path, { initial: initial.current });
    initial.current = false;
    initialSurface.current = undefined;
  }, [coordinator, location.pathname, location.search]);

  const context = useMemo<PlaceContextValue>(() => ({
    openPlace: place => coordinator.openInApp(place),
    openLink: path => navigateRef.current(path),
    isSurfaceRequested: surface => initialSurface.current === surface || coordinator.requestedSurface() === surface,
    registerSurface: participant => coordinator.registerSurface(participant),
    reportSurface: (surface, owned, open, parameters) => coordinator.reportSurface(surface, owned, open, parameters),
    registerSelection: handler => coordinator.registerSelection(handler),
    reportSelection: references => coordinator.reportSelection(references),
  }), [coordinator]);

  return (
    <PlaceContext.Provider value={context}>
      <PlaceEpochContext.Provider value={epoch}>{children}</PlaceEpochContext.Provider>
      {notice && (
        <div
          role="status"
          data-testid="place-arrival-callout"
          className="fixed left-1/2 top-10 z-[70] flex max-w-2xl -translate-x-1/2 items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-lg"
        >
          <p className="flex-1">{notice}</p>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setNotice(null)}
            className="rounded px-1 text-amber-700 hover:bg-amber-100"
          >
            ×
          </button>
        </div>
      )}
    </PlaceContext.Provider>
  );
};
