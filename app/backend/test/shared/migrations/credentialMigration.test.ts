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

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import YAML from 'yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PublishingProviderPaths } from '../../../../shared_code/paths/publishingProviderPaths.js';
import { hardenProviderSecretFiles } from '../../../src/shared/migrations/versions/26_08_17_11_00_00_r4m8v2k7c5x1_harden_provider_secret_files.js';

describe('provider secret hardening migration', () => {
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-credential-migration-'));
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('validates and hardens every provider secret file idempotently', () => {
    const globalSecret = PublishingProviderPaths.getGlobalSecretsFile(directory, 'S3PublishingProvider');
    const bundleSecret = PublishingProviderPaths.getBundleSecretsFile(
      directory,
      'example',
      'FutureProvider',
    );
    for (const target of [globalSecret, bundleSecret]) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, YAML.stringify({ unmistakablyFakeSecret: 'FAKE-TEST-VALUE' }), {
        mode: 0o644,
      });
    }

    hardenProviderSecretFiles(directory);
    const first = [globalSecret, bundleSecret].map(target => fs.readFileSync(target));
    hardenProviderSecretFiles(directory);
    for (const [index, target] of [globalSecret, bundleSecret].entries()) {
      expect(fs.statSync(target).mode & 0o777).toBe(0o600);
      expect(fs.readFileSync(target)).toEqual(first[index]);
    }
  });

});
