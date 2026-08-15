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
import { sourceDirectorySuggestions } from '../../../src/areas/bundles/services/sourceDirectorySuggestions.js';

describe('sourceDirectorySuggestions', () => {
  it('prefers the latest user source and omits generated examples', () => {
    expect(sourceDirectorySuggestions([
      {
        slug: 'older-bundle',
        sourceDirectory: '/notes/older',
        bundleCreatedAt: '2026-08-10T00:00:00.000Z',
      },
      {
        slug: 'example-bundle',
        sourceDirectory: '/meadow-home/example_bundle_source_graph',
        bundleCreatedAt: '2026-08-15T00:00:00.000Z',
      },
      {
        slug: 'newer-bundle',
        sourceDirectory: '/notes/newer',
        bundleCreatedAt: '2026-08-14T00:00:00.000Z',
      },
      {
        slug: 'marked-example',
        sourceDirectory: '/somewhere/example',
        bundleCreatedAt: '2026-08-16T00:00:00.000Z',
        createdFromExample: true,
      },
    ], '/meadow-home')).toEqual(['/notes/newer', '/notes/older']);
  });

  it('deduplicates directories at their most recent position', () => {
    expect(sourceDirectorySuggestions([
      {
        slug: 'old-use',
        sourceDirectory: '/notes/shared',
        bundleCreatedAt: '2026-08-10T00:00:00.000Z',
      },
      {
        slug: 'other',
        sourceDirectory: '/notes/other',
        bundleCreatedAt: '2026-08-12T00:00:00.000Z',
      },
      {
        slug: 'new-use',
        sourceDirectory: '/notes/shared',
        bundleCreatedAt: '2026-08-14T00:00:00.000Z',
      },
    ], '/meadow-home')).toEqual(['/notes/shared', '/notes/other']);
  });
});
