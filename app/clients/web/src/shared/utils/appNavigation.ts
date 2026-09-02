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

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FindInBundlesOptions } from '../../../../../contracts/types/findInBundlesOptions';
import { logger } from './logger';

export type AppDestination =
  | { page: 'bundle-list'; findInBundlesOptions?: FindInBundlesOptions }
  | { page: 'bundle'; slug: string };

const navigationLogger = logger.child('appNavigation');

export const appPathFor = (destination: AppDestination): string => {
  switch (destination.page) {
    case 'bundle-list':
      return '/';
    case 'bundle':
      return `/bundle/${encodeURIComponent(destination.slug)}`;
  }
};

/**
 * Navigates within the app without reloading the document.
 * Keep route construction and cross-cutting navigation behavior here.
 */
export const useAppNavigation = (source: string) => {
  const navigate = useNavigate();

  return useCallback((destination: AppDestination) => {
    const path = appPathFor(destination);
    navigationLogger.debug(`Navigating from ${source} to ${path}`);

    if (destination.page === 'bundle-list' && destination.findInBundlesOptions) {
      navigate(path, { state: { findInBundlesOptions: destination.findInBundlesOptions } });
      return;
    }

    navigate(path);
  }, [navigate, source]);
};
