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
import type { SitePageConfig } from '../../../shared_code/types/sitePageConfig.js';
import { sanitizeExcalidrawSource } from '../../src/utils/sourceScrubbingUtils.js';

function makeConfig(title: string, listType: 'whitelist' | 'blacklist', fileType?: string, dir?: string): SitePageConfig {
  return {
    title,
    file_type: fileType as SitePageConfig['file_type'],
    source_graph_subdirectory: dir || '',
    config: { list_type: listType },
  };
}

describe('sanitizeExcalidrawSource', () => {
  it('removes untracked embedded image files from sections and scene data', () => {
    const input = [
      '# Excalidraw Data',
      '',
      '## Embedded Files',
      'safeFile: [[tracked-sunflower.png]]',
      '',
      'unsafeFile: [[untracked-pink-flower.png]]',
      '',
      '%%',
      '## Drawing',
      '```json',
      JSON.stringify({
        type: 'excalidraw',
        elements: [
          { id: 'safeImage', type: 'image', fileId: 'safeFile' },
          { id: 'unsafeImage', type: 'image', fileId: 'unsafeFile' },
          { id: 'shape', type: 'rectangle' },
        ],
        files: {
          safeFile: { id: 'safeFile', dataURL: 'data:image/png;base64,c2FmZQ==', mimeType: 'image/png' },
          unsafeFile: { id: 'unsafeFile', dataURL: 'data:image/png;base64,dW5zYWZl', mimeType: 'image/png' },
        },
      }, null, 2),
      '```',
    ].join('\n');
    const configs = [
      makeConfig('tracked-sunflower', 'whitelist', 'png', 't006/images-used-in-excalidraw'),
    ];
    const linkResolutionMap = {
      'tracked-sunflower.png': {
        link_resolved_target_directory: 't006/images-used-in-excalidraw',
        link_resolved_target_path: 't006/images-used-in-excalidraw/tracked-sunflower.png',
      },
      'untracked-pink-flower.png': {
        link_resolved_target_directory: 't006/images-used-in-excalidraw',
        link_resolved_target_path: 't006/images-used-in-excalidraw/untracked-pink-flower.png',
      },
    };

    const output = sanitizeExcalidrawSource(input, configs, linkResolutionMap);

    expect(output).toContain('safeFile: [[tracked-sunflower.png]]');
    expect(output).not.toContain('unsafeFile:');
    expect(output).not.toContain('untracked-pink-flower.png');

    const json = output.match(/```json\n([\s\S]*?)\n```/)?.[1];
    expect(json).toBeTruthy();
    const scene = JSON.parse(json!);
    expect(scene.elements.map((el: { id: string }) => el.id)).toEqual(['safeImage', 'shape']);
    expect(scene.files).toHaveProperty('safeFile');
    expect(scene.files).not.toHaveProperty('unsafeFile');
  });
});
