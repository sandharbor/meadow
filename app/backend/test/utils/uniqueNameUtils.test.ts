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

import { describe, test, expect } from 'vitest';
import { findUniqueName } from '../../src/utils/uniqueNameUtils.js';

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
});
