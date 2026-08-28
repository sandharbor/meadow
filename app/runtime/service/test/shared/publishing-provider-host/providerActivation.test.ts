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

import { describe, expect, it } from 'vitest';
import type { RuntimeBuildPerspective } from '../../../../../contracts/types/runtime.js';
import {
  resolveActivePublishingProviders,
  type PublishingProviderActivationCandidate,
} from '../../../src/shared/publishing-provider-host/providerActivation.js';

function candidate(
  id: string,
  options: {
    configuredActivation?: boolean;
    defaults?: readonly RuntimeBuildPerspective[];
  } = {},
): PublishingProviderActivationCandidate {
  return {
    manifest: {
      id,
      displayName: id,
      publishTabLabel: `Publish with ${id}`,
      defaultForBuildPerspectives: options.defaults,
    },
    configuredActivation: options.configuredActivation,
  };
}

function ids(candidates: PublishingProviderActivationCandidate[]): string[] {
  return candidates.map(item => item.manifest.id);
}

describe('publishing provider activation', () => {
  it('uses the distribution default when no provider is explicitly active', () => {
    const resolved = resolveActivePublishingProviders([
      candidate('configurable-provider'),
      candidate('distribution-provider', { defaults: ['composed'] }),
    ], 'composed');

    expect(ids(resolved)).toEqual(['distribution-provider']);
  });

  it('lets an explicit activation override the distribution default', () => {
    const resolved = resolveActivePublishingProviders([
      candidate('configurable-provider', { configuredActivation: true }),
      candidate('distribution-provider', { defaults: ['composed'] }),
    ], 'composed');

    expect(ids(resolved)).toEqual(['configurable-provider']);
  });

  it('preserves multiple explicit activations so callers can report ambiguity', () => {
    const resolved = resolveActivePublishingProviders([
      candidate('first-provider', { configuredActivation: true }),
      candidate('second-provider', { configuredActivation: true, defaults: ['composed'] }),
    ], 'composed');

    expect(ids(resolved)).toEqual(['first-provider', 'second-provider']);
  });

  it('uses the sole eligible provider in a standalone distribution', () => {
    const resolved = resolveActivePublishingProviders([
      candidate('standalone-provider'),
    ], 'standalone');

    expect(ids(resolved)).toEqual(['standalone-provider']);
  });

  it('honors explicit deactivation when every provider is disabled', () => {
    const resolved = resolveActivePublishingProviders([
      candidate('first-provider', { configuredActivation: false }),
      candidate('second-provider', { configuredActivation: false, defaults: ['composed'] }),
    ], 'composed');

    expect(resolved).toEqual([]);
  });
});
