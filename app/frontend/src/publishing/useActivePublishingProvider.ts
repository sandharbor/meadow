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

import { useEffect, useState } from 'react';
import type { IPublishingProviderFrontend } from './IPublishingProviderFrontend.js';
import { getActiveFrontendProvider } from './providerRegistry';

/**
 * React hook that resolves the currently-active publishing provider. Returns
 * undefined while the lookup is pending, and null if no active provider is
 * registered on the frontend. Components should treat both cases as "don't
 * show provider-specific UI yet".
 */
export function useActivePublishingProvider(): IPublishingProviderFrontend | null | undefined {
  const [provider, setProvider] = useState<IPublishingProviderFrontend | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getActiveFrontendProvider().then((p) => {
      if (!cancelled) setProvider(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return provider;
}
