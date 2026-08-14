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

import fs from 'fs';
import { join } from 'path';
import { AppConfigGitUtils, GIT_AUTHORS } from '../../../../shared_code/utils/appConfigGitUtils.js';
import { getDefaultConfigDirectory } from '../../../../shared_code/utils/appConfigUtils.js';
import { logger } from '../utils/logging/backendLoggingUtils.js';

async function initGitRepo(dir: string): Promise<void> {
  try {
    const gitUtils = new AppConfigGitUtils(GIT_AUTHORS.MEADOW_APP, dir);
    await gitUtils.initRepo();
  } catch (error) {
    logger.error('Error initializing git repository:', error);
  }
}

function getConfigDir(): string {
  const configDir = getDefaultConfigDirectory();

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
    void initGitRepo(configDir);
  }

  const bundlesDir = join(configDir, 'bundles');
  if (!fs.existsSync(bundlesDir)) {
    fs.mkdirSync(bundlesDir, { recursive: true });
  }

  const appDir = join(configDir, 'app');
  if (!fs.existsSync(appDir)) {
    fs.mkdirSync(appDir, { recursive: true });
  }

  return configDir;
}

export const getConfigDirectory = () => getConfigDir();

export const getBundlesDirectory = () => {
  return join(getConfigDir(), 'bundles');
};

export const getBundleDirectory = (bundleSlug: string) => {
  return join(getConfigDir(), 'bundles', bundleSlug);
};

export const getBundleConfigPath = (bundleSlug: string, filename: string = 'bundle_config.yaml') => {
  return join(getConfigDir(), 'bundles', bundleSlug, 'config', filename);
};

export const getBundleRawDirectory = (bundleSlug: string) => {
  return join(getConfigDir(), 'bundles', bundleSlug, 'raw');
};

export const getBundleHtmlDirectory = (bundleSlug: string) => {
  return join(getConfigDir(), 'bundles', bundleSlug, 'html');
};
