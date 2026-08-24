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
import { isPrivateMeadowHomePath } from '../../../../../shared_code/utils/privateMeadowHomePaths.js';

describe('private Meadow Home paths', () => {
  it.each([
    'app/secret_app_config.yaml',
    'app/publishing_providers/S3PublishingProvider/pp_secrets.yaml',
    'bundles/example/config/publishing_providers/provider/pp_secrets.yaml',
    'bundles\\example\\config\\publishing_providers\\provider\\pp_secrets.yaml',
    '.meadow-migration-recovery/checkpoint.json',
    '.meadow-migration-recovery/ignored-files/app/resources.local.yaml',
  ])('excludes %s contents from support artifacts', relativePath => {
    expect(isPrivateMeadowHomePath(relativePath)).toBe(true);
  });

  it.each([
    'app/app_config.yaml',
    'app/resources.local.yaml',
    'bundles/example/config/publishing_providers/provider/pp_config.yaml',
    'bundles/example/config/not_pp_secrets.yaml',
  ])('does not hide reviewable non-secret state at %s', relativePath => {
    expect(isPrivateMeadowHomePath(relativePath)).toBe(false);
  });
});
