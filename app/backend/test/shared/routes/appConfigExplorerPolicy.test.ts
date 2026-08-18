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
import path from 'path';
import {
  filterReviewableAppConfigTree,
  isReviewableAppConfigPath,
} from '../../../src/shared/routes/appConfigExplorerPolicy.js';
import type { FileNode } from '../../../src/shared/utils/configFileExplorerUtils.js';

const APP_DIR = path.resolve('/tmp/test-meadow-home/app');

describe('app config explorer allowlist', () => {
  it.each([
    'app_config.yaml',
    'resources.yaml',
    'global_custom_filters.json',
    'hooks/markdownProcessing.ts',
    'custom_assets/style.css',
    'publishing_providers/S3PublishingProvider/pp_config.yaml',
    'publishing_providers/S3PublishingProvider/pp_resources.yaml',
  ])('allows the reviewable file %s', (relative) => {
    expect(isReviewableAppConfigPath(APP_DIR, path.join(APP_DIR, relative))).toBe(true);
  });

  it.each([
    'secret_app_config.yaml',
    'resources.local.yaml',
    'logs/backend.log',
    'recovery/checkpoint.yaml',
    'publishing_providers/S3PublishingProvider/pp_secrets.yaml',
    'publishing_providers/S3PublishingProvider/pp_resources.local.yaml',
    'publishing_providers/S3PublishingProvider/migrations.yaml',
    '../outside.yaml',
    'arbitrary.txt',
  ])('rejects the non-reviewable file %s', (relative) => {
    expect(isReviewableAppConfigPath(APP_DIR, path.resolve(APP_DIR, relative))).toBe(false);
  });

  it('removes secret leaves and now-empty directories from listings', () => {
    const nodes: FileNode[] = [
      { name: 'app_config.yaml', path: path.join(APP_DIR, 'app_config.yaml'), type: 'file' },
      { name: 'secret_app_config.yaml', path: path.join(APP_DIR, 'secret_app_config.yaml'), type: 'file' },
      {
        name: 'recovery',
        path: path.join(APP_DIR, 'recovery'),
        type: 'directory',
        children: [{ name: 'checkpoint.yaml', path: path.join(APP_DIR, 'recovery/checkpoint.yaml'), type: 'file' }],
      },
    ];
    expect(filterReviewableAppConfigTree(APP_DIR, nodes)).toEqual([nodes[0]]);
  });
});
