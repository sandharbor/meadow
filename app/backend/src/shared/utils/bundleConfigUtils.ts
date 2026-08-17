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
import * as yaml from 'js-yaml';
import { BundleConfig } from '../../../../shared_code/types/bundleConfig.js';
import { BundleConfigPaths } from '../../../../shared_code/paths/bundleConfigPaths.js';

export function loadBundleConfig(bundleDirectory: string): BundleConfig {
  const configPath = BundleConfigPaths.getBundleConfigFile(bundleDirectory);
  if (fs.existsSync(configPath)) {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    return yaml.load(configContent) as BundleConfig || {};
  }
  return {};
}

export function saveBundleConfig(bundleDirectory: string, config: BundleConfig): void {
  const configPath = BundleConfigPaths.getBundleConfigFile(bundleDirectory);
  const configContent = yaml.dump(config, { quotingType: '"' });
  fs.writeFileSync(configPath, configContent);
}

export function loadBundleConfigFromPath(configPath: string): BundleConfig {
  if (fs.existsSync(configPath)) {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    return yaml.load(configContent) as BundleConfig || {};
  }
  return {};
}

export function saveBundleConfigToPath(configPath: string, config: BundleConfig): void {
  const configContent = yaml.dump(config, { quotingType: '"' });
  fs.writeFileSync(configPath, configContent);
}

export function loadYamlFromPath<T = Record<string, unknown>>(configPath: string): T {
  if (fs.existsSync(configPath)) {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    return yaml.load(configContent) as T || {} as T;
  }
  return {} as T;
}

export function saveYamlToPath<T = Record<string, unknown>>(configPath: string, data: T): void {
  const configContent = yaml.dump(data, { quotingType: '"' });
  fs.writeFileSync(configPath, configContent);
}

export function updateBundleConfig(bundleDirectory: string, updates: Partial<BundleConfig>): BundleConfig {
  const config = loadBundleConfig(bundleDirectory);
  const updatedConfig = { ...config, ...updates };
  saveBundleConfig(bundleDirectory, updatedConfig);
  return updatedConfig;
}
