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

import type { PublishingProviderManifest } from '../../../../../contracts/interfaces/IPublishingProvider.js';
import type { RuntimeBuildPerspective } from '../../../../../contracts/types/runtime.js';

export interface PublishingProviderActivationCandidate {
  manifest: PublishingProviderManifest;
  configuredActivation?: boolean;
}

/**
 * Resolve effective provider activation without mutating user configuration.
 * Explicit activation wins over distribution defaults. If no default applies,
 * every provider that was not explicitly disabled remains active so callers
 * can report a genuine ambiguous configuration instead of choosing silently.
 */
export function resolveActivePublishingProviders<
  Candidate extends PublishingProviderActivationCandidate,
>(
  candidates: readonly Candidate[],
  perspective: RuntimeBuildPerspective,
): Candidate[] {
  const explicitlyActive = candidates.filter(
    candidate => candidate.configuredActivation === true,
  );
  if (explicitlyActive.length > 0) return explicitlyActive;

  const eligible = candidates.filter(
    candidate => candidate.configuredActivation !== false,
  );
  const distributionDefaults = eligible.filter(candidate =>
    candidate.manifest.defaultForBuildPerspectives?.includes(perspective),
  );
  return distributionDefaults.length > 0 ? distributionDefaults : eligible;
}
