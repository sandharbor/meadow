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

import { describe, it, expect } from 'vitest';
import type { SourcePageFileInfo } from '../../../shared_code/types/sourcePageFileInfo.js';
import { rankSourcePageCandidates } from '../../../shared_code/utils/sourcePageSearchUtils.js';

function p(
  title: string,
  modifiedTimeMs: number,
  fullPath: string,
  directory: string = ''
): SourcePageFileInfo {
  return {
    title,
    directory,
    file_type: 'md',
    fullPath,
    modifiedTimeMs,
  };
}

describe('rankSourcePageCandidates', () => {
  it('is case-insensitive and sorts newest->oldest within a bucket', () => {
    const pages: SourcePageFileInfo[] = [
      p('Alpha', 1000, 'Alpha.md'),
      p('alpha beta', 5000, 'alpha beta.md'),
      p('ALPHABET', 3000, 'ALPHABET.md'),
    ];

    const results = rankSourcePageCandidates('alpHa', pages, 25);
    expect(results.map(r => r.title)).toEqual([
      'alpha beta', // 5000
      'ALPHABET',   // 3000
      'Alpha',      // 1000
    ]);
    expect(results.every(r => r.bucket === 1)).toBe(true);
  });

  it('when query contains spaces: bucket 1 = full substring (including spaces after normalization)', () => {
    const pages: SourcePageFileInfo[] = [
      p('Foo Bar Baz', 1000, 'Foo Bar Baz.md'),
      p('Foo   Bar Quux', 9000, 'Foo   Bar Quux.md'), // multiple spaces in title
      p('Bar then Foo', 8000, 'Bar then Foo.md'),
      p('Foo only', 7000, 'Foo only.md'),
      p('Bar only', 6000, 'Bar only.md'),
    ];

    const results = rankSourcePageCandidates('  fOo   bAr  ', pages, 25);

    // Bucket 1: full substring "foo bar" (after space normalization) - newest first.
    // Bucket 2: both parts present somewhere (order-independent).
    // Bucket 3: only one part present.
    expect(results.map(r => `${r.bucket}:${r.title}`)).toEqual([
      '1:Foo   Bar Quux',
      '1:Foo Bar Baz',
      '2:Bar then Foo',
      '3:Foo only',
      '3:Bar only',
    ]);
  });

  it('when query contains spaces: bucket 2 requires all parts, bucket 3 allows any part', () => {
    const pages: SourcePageFileInfo[] = [
      p('alpha beta gamma', 1000, 'alpha beta gamma.md'),
      p('alpha something', 9000, 'alpha something.md'),
      p('something beta', 8000, 'something beta.md'),
      p('neither here', 7000, 'neither here.md'),
    ];

    const results = rankSourcePageCandidates('alpha beta', pages, 25);
    expect(results.map(r => `${r.bucket}:${r.title}`)).toEqual([
      '1:alpha beta gamma', // contains full substring "alpha beta"
      '3:alpha something',  // only one part
      '3:something beta',   // only one part
    ]);
  });

  it('respects the limit (default 25)', () => {
    const pages: SourcePageFileInfo[] = [];
    for (let i = 0; i < 40; i++) {
      pages.push(p(`hello ${i}`, 1000 + i, `hello ${i}.md`));
    }

    const results = rankSourcePageCandidates('hello', pages); // default 25
    expect(results).toHaveLength(25);
    // Newest first
    expect(results[0].title).toBe('hello 39');
    expect(results[24].title).toBe('hello 15');
  });
});
