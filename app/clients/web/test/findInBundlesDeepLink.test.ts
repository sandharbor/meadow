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
import { parseFindInBundlesDeepLink } from '../../../contracts/types/findInBundlesOptions';

describe('parseFindInBundlesDeepLink', () => {
  it('decodes a complete Find in Bundles target', () => {
    const result = parseFindInBundlesDeepLink(
      'meadow://find-in-bundles?vaultPath=%2FUsers%2Fexample%2FMy%20Vault' +
      '&folderPath=research%2Fideas&pageName=A%20useful%20note'
    );

    expect(result).toEqual({
      vaultPath: '/Users/example/My Vault',
      folderPath: 'research/ideas',
      pageName: 'A useful note',
    });
  });

  it('accepts a page at the vault root', () => {
    const result = parseFindInBundlesDeepLink(
      'meadow://find-in-bundles?vaultPath=%2FUsers%2Fexample%2FVault&folderPath=&pageName=Home'
    );

    expect(result?.folderPath).toBe('');
  });

  it.each([
    'https://find-in-bundles?vaultPath=%2Fvault&folderPath=&pageName=Home',
    'meadow://other?vaultPath=%2Fvault&folderPath=&pageName=Home',
    'meadow://find-in-bundles?vaultPath=relative&folderPath=&pageName=Home',
    'meadow://find-in-bundles?vaultPath=%2Fvault&folderPath=..%2Foutside&pageName=Home',
    'meadow://find-in-bundles?vaultPath=%2Fvault&folderPath=&pageName=Home.md',
    'meadow://find-in-bundles?vaultPath=%2Fvault&folderPath=',
  ])('rejects an invalid or incomplete target: %s', value => {
    expect(parseFindInBundlesDeepLink(value)).toBeNull();
  });
});
