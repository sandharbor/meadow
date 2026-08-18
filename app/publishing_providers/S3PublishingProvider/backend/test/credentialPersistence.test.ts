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
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PublishingProviderPaths } from '../../../../shared_code/paths/publishingProviderPaths.js';
import { InvalidDurableDocumentError } from '../../../../shared_code/utils/durableDocument.js';
import {
  loadS3Secrets,
  saveS3Secrets,
  S3_PROVIDER_ID,
} from '../internal/s3Config.js';

describe('S3 credential persistence', () => {
  let directory: string;
  let previousOverride: string | undefined;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-s3-secrets-'));
    previousOverride = process.env.MEADOW_HOME_DIRECTORY_OVERRIDE;
    process.env.MEADOW_HOME_DIRECTORY_OVERRIDE = directory;
  });

  afterEach(() => {
    if (previousOverride === undefined) delete process.env.MEADOW_HOME_DIRECTORY_OVERRIDE;
    else process.env.MEADOW_HOME_DIRECTORY_OVERRIDE = previousOverride;
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('uses mode 0600 and replacing one credential preserves the other and unknown fields', () => {
    saveS3Secrets({ s3AccessKeyId: 'FAKE-ACCESS', futureSecretMetadata: 'keep' });
    saveS3Secrets({ s3SecretAccessKey: 'FAKE-SECRET' });

    expect(loadS3Secrets()).toMatchObject({
      s3AccessKeyId: 'FAKE-ACCESS',
      s3SecretAccessKey: 'FAKE-SECRET',
      futureSecretMetadata: 'keep',
    });
    const target = PublishingProviderPaths.getGlobalSecretsFile(directory, S3_PROVIDER_ID);
    expect(fs.statSync(target).mode & 0o777).toBe(0o600);
  });

  it('blocks a credential patch when the existing secret document is malformed', () => {
    const target = PublishingProviderPaths.getGlobalSecretsFile(directory, S3_PROVIDER_ID);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const invalid = Buffer.from('s3AccessKeyId: [broken\r\n', 'utf8');
    fs.writeFileSync(target, invalid, { mode: 0o600 });

    expect(() => saveS3Secrets({ s3SecretAccessKey: 'FAKE-REPLACEMENT' })).toThrow(
      InvalidDurableDocumentError,
    );
    expect(fs.readFileSync(target)).toEqual(invalid);
  });
});
