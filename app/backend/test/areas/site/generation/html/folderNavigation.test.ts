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
import {
  buildFolderNavigationData,
  renderFolderNavigationDataScript,
} from '../../../../../src/areas/site/generation/html/folderNavigation.js';

describe('folder navigation', () => {
  const pages = [
    { directory: 'zeta', normalizedTitle: 'Normalized B', outputPath: 'zeta/Normalized B.html' },
    { directory: 'alpha/deeper', normalizedTitle: 'Normalized Current', outputPath: 'alpha/deeper/Normalized Current.html' },
    { directory: 'alpha', normalizedTitle: 'normalized z', outputPath: 'alpha/normalized z.html' },
    { directory: 'alpha', normalizedTitle: 'Normalized A', outputPath: 'alpha/Normalized A.html' },
    { directory: '', normalizedTitle: 'Root Page', outputPath: 'Root Page.html' },
  ];

  it('builds nested folders and post-normalization filenames alphabetically', () => {
    const data = buildFolderNavigationData(pages);

    expect(data.folders.map(folder => folder.name)).toEqual(['alpha', 'zeta']);
    expect(data.files).toEqual([{ name: 'Root Page.html', path: 'Root Page.html' }]);
    expect(data.folders[0].files).toEqual([
      { name: 'Normalized A.html', path: 'alpha/Normalized A.html' },
      { name: 'normalized z.html', path: 'alpha/normalized z.html' },
    ]);
    expect(data.folders[0].folders[0]).toMatchObject({
      name: 'deeper',
      path: 'alpha/deeper',
      files: [{
        name: 'Normalized Current.html',
        path: 'alpha/deeper/Normalized Current.html',
      }],
    });
  });

  it('serializes the shared tree as executable JavaScript data', () => {
    const script = renderFolderNavigationDataScript(pages);

    expect(script).toMatch(/^window\.MeadowFolderNavData=/);
    expect(script).toContain('"Normalized Current.html"');
    expect(script).toContain('"alpha\/deeper\/Normalized Current.html"');
  });
});
