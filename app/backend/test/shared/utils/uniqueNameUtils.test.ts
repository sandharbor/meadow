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

import fc from 'fast-check';
import { describe, test, expect } from 'vitest';
import { findUniqueName } from '../../../src/shared/utils/uniqueNameUtils.js';

const slugCharArbitrary = fc.constantFrom(
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h',
  'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p',
  'q', 'r', 's', 't', 'u', 'v', 'w', 'x',
  'y', 'z', '0', '1', '2', '3', '4', '5',
  '6', '7', '8', '9', '-'
);

const slugArbitrary = fc
  .array(slugCharArbitrary, { minLength: 1, maxLength: 24 })
  .map((chars) => chars.join(''));

describe('findUniqueName', () => {
  test('returns base name when it does not exist', () => {
    const result = findUniqueName('my-site', () => false);
    expect(result).toBe('my-site');
  });

  test('appends -1 when base name exists', () => {
    const existing = new Set(['my-site']);
    const result = findUniqueName('my-site', (name) => existing.has(name));
    expect(result).toBe('my-site-1');
  });

  test('increments until a unique name is found', () => {
    const existing = new Set(['my-site', 'my-site-1', 'my-site-2']);
    const result = findUniqueName('my-site', (name) => existing.has(name));
    expect(result).toBe('my-site-3');
  });

  test('works with names that already end in a number', () => {
    const existing = new Set(['test-2']);
    const result = findUniqueName('test-2', (name) => existing.has(name));
    expect(result).toBe('test-2-1');
  });

  /*
   * For any base name and any occupied subset of the generated sequence
   * baseName, baseName-1, baseName-2, ... this should return the first
   * unoccupied candidate in that sequence.
   *
   * Example: if site and site-1 are occupied, it should return site-2.
   * Example: if notes is free, it should return notes even if notes-1 exists.
   */
  test('property: returns the first available generated name', () => {
    fc.assert(
      fc.property(
        slugArbitrary,
        fc.uniqueArray(fc.integer({ min: 0, max: 50 }), { maxLength: 51 }),
        (baseName, occupiedSuffixes) => {
          const occupiedSuffixSet = new Set(occupiedSuffixes);
          const existingNames = new Set(
            occupiedSuffixes.map((suffix) =>
              suffix === 0 ? baseName : `${baseName}-${suffix}`
            )
          );

          const result = findUniqueName(baseName, (name) => existingNames.has(name));

          let expected = baseName;
          if (occupiedSuffixSet.has(0)) {
            let counter = 1;
            while (occupiedSuffixSet.has(counter)) {
              counter++;
            }
            expected = `${baseName}-${counter}`;
          }

          expect(result).toBe(expected);
          expect(existingNames.has(result)).toBe(false);
        }
      ),
      { numRuns: 200 }
    );
  });
});
