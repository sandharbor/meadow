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
import { PlatformPaths } from '../../../../shared_code/paths/platformPaths.js';
import { PublishingProviderPaths } from '../../../../shared_code/paths/publishingProviderPaths.js';
import {
  ensureAppConfigInitialized,
  getAppConfigPath,
  loadAppConfig,
  saveAppConfig,
} from '../../../../shared_code/utils/appConfigUtils.js';
import { getGlobalCustomFiltersPath, loadGlobalCustomFilters, saveGlobalCustomFilters } from '../../../../shared_code/utils/globalCustomFiltersUtils.js';
import { loadProviderConfig, loadProviderSecrets } from '../../../../shared_code/utils/publishingProviderConfigUtils.js';
import {
  ensureResourcesConfigInitialized,
  getResourcesConfigPath,
  getResourcesLocalConfigPath,
  loadResourcesConfig,
  saveResourcesLocalConfig,
} from '../../../../shared_code/utils/resourcesConfigUtils.js';
import { InvalidDurableDocumentError } from '../../../../shared_code/utils/durableDocument.js';
import { AppConfigGitUtils, GIT_AUTHORS } from '../../../../shared_code/utils/appConfigGitUtils.js';

class TestPlatformPaths extends PlatformPaths {
  constructor(
    readonly defaultConfigDirectory: string,
    readonly bootstrapConfigPath: string,
  ) {
    super();
  }
}

describe('startup-critical configuration persistence', () => {
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-config-persistence-'));
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('blocks app defaults and patches when app_config.yaml is invalid', () => {
    const target = getAppConfigPath(directory);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const invalid = Buffer.from('manageGitAutomatically: [broken\r\n', 'utf8');
    fs.writeFileSync(target, invalid);

    expect(() => loadAppConfig(directory)).toThrow(InvalidDurableDocumentError);
    expect(() => ensureAppConfigInitialized(directory)).toThrow(InvalidDurableDocumentError);
    expect(() => saveAppConfig({ manageGitAutomatically: true }, directory)).toThrow(
      InvalidDurableDocumentError,
    );
    expect(fs.readFileSync(target)).toEqual(invalid);
  });

  it('rejects malformed and unknown bootstrap data instead of selecting the default Home', () => {
    const bootstrap = path.join(directory, 'bootstrap_config.yaml');
    const platform = new TestPlatformPaths(path.join(directory, 'default-home'), bootstrap);
    fs.writeFileSync(bootstrap, 'meadowHomeDirectoryOverride: [broken\n');
    expect(() => platform.getConfigDirectory()).toThrow(InvalidDurableDocumentError);

    fs.writeFileSync(bootstrap, 'unexpectedHomeSelector: elsewhere\n');
    try {
      platform.getConfigDirectory();
      throw new Error('expected invalid bootstrap to be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidDurableDocumentError);
      expect((error as InvalidDurableDocumentError).result.diagnostic)
        .toBe('$.unexpectedHomeSelector is not supported');
    }
    expect(fs.existsSync(platform.defaultConfigDirectory)).toBe(false);
  });

  it('keeps local resource provenance out of the base file during initialization', () => {
    const basePath = getResourcesConfigPath(directory);
    const localPath = getResourcesLocalConfigPath(directory);
    fs.mkdirSync(path.dirname(basePath), { recursive: true });
    fs.writeFileSync(basePath, 'appUpdateDNSName: updates.example.test\n');
    fs.writeFileSync(localPath, 'backendPort: 43123\nlogDirectory: /private/local/logs\n');

    const initialized = ensureResourcesConfigInitialized(directory);
    expect(initialized.config).toMatchObject({
      appUpdateDNSName: 'updates.example.test',
      backendPort: 43123,
      frontendPort: 3000,
      logDirectory: '/private/local/logs',
    });
    const baseSource = fs.readFileSync(basePath, 'utf8');
    expect(baseSource).not.toContain('43123');
    expect(baseSource).not.toContain('/private/local/logs');
    expect(baseSource).toContain('backendPort: 3001');
  });

  it('blocks initialization and local patches when either resource layer is invalid', () => {
    const basePath = getResourcesConfigPath(directory);
    const localPath = getResourcesLocalConfigPath(directory);
    fs.mkdirSync(path.dirname(basePath), { recursive: true });
    fs.writeFileSync(basePath, 'backendPort: 3001\n');
    const invalid = Buffer.from('frontendPort: [broken\r\n');
    fs.writeFileSync(localPath, invalid);

    expect(() => loadResourcesConfig(directory)).toThrow(InvalidDurableDocumentError);
    expect(() => ensureResourcesConfigInitialized(directory)).toThrow(InvalidDurableDocumentError);
    expect(() => saveResourcesLocalConfig({ backendPort: 4000 }, directory)).toThrow(
      InvalidDurableDocumentError,
    );
    expect(fs.readFileSync(localPath)).toEqual(invalid);
    expect(fs.readFileSync(basePath, 'utf8')).toBe('backendPort: 3001\n');
  });

  it('blocks global-filter defaulting and preserves unknown extensible fields', () => {
    const target = getGlobalCustomFiltersPath(directory);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const invalid = Buffer.from('{"filters": [', 'utf8');
    fs.writeFileSync(target, invalid);
    expect(() => loadGlobalCustomFilters(directory)).toThrow(InvalidDurableDocumentError);
    expect(() => saveGlobalCustomFilters(directory, { filters: [], version: '1.0.0' })).toThrow(
      InvalidDurableDocumentError,
    );
    expect(fs.readFileSync(target)).toEqual(invalid);

    fs.unlinkSync(target);
    saveGlobalCustomFilters(directory, {
      filters: [],
      version: '1.0.0',
      futureMetadata: { keep: true },
    } as never);
    expect(loadGlobalCustomFilters(directory)).toMatchObject({ futureMetadata: { keep: true } });
  });

  it('does not interpret malformed provider config or secrets as absent', () => {
    const configPath = PublishingProviderPaths.getGlobalConfigFile(directory, 'test-provider');
    const secretsPath = PublishingProviderPaths.getGlobalSecretsFile(directory, 'test-provider');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, 'setting: [broken\n');
    fs.writeFileSync(secretsPath, 'token: [broken\n');

    expect(() => loadProviderConfig('test-provider', { configDir: directory })).toThrow(
      InvalidDurableDocumentError,
    );
    expect(() => loadProviderSecrets('test-provider', { configDir: directory })).toThrow(
      InvalidDurableDocumentError,
    );
  });

  it('updates a versioned private-path gitignore block without erasing user rules', () => {
    const gitignore = path.join(directory, '.gitignore');
    fs.writeFileSync(gitignore, 'my-user-rule/**\napp/publishing_providers/*/pp_secrets.yaml\n');
    const gitUtils = new AppConfigGitUtils(GIT_AUTHORS.MEADOW_APP, directory, {
      manageGitAutomatically: false,
    });
    gitUtils.createGitignore();
    gitUtils.createGitignore();

    const source = fs.readFileSync(gitignore, 'utf8');
    expect(source).toContain('my-user-rule/**');
    expect(source.match(/>>> Meadow managed private paths >>>/g)).toHaveLength(1);
    expect(source.match(/\.meadow-migration-recovery\//g)).toHaveLength(1);
    expect(source.match(/app\/publishing_providers\/\*\/pp_secrets\.yaml/g)).toHaveLength(1);
  });
});
