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
import path from 'path';
import YAML from 'yaml';
import {
  TEST_CONFIG_DIR,
  getFixturesPath,
  getSourceGraphsPath
} from './serverManager.js';
import { AppConfigPaths } from '../../shared_code/paths/appConfigPaths.js';
import { BundleConfigPaths } from '../../shared_code/paths/bundleConfigPaths.js';

interface ResolvedFixtureSourceGraph {
  sharedPath: string;
  relativePathWithinSourceGraphs: string;
}

function resolveFixtureSourceGraph(sourceDirectory: string): ResolvedFixtureSourceGraph | null {
  const normalizedSourceDirectory = path.normalize(sourceDirectory);

  if (path.isAbsolute(normalizedSourceDirectory)) {
    return {
      sharedPath: normalizedSourceDirectory,
      relativePathWithinSourceGraphs: path.basename(normalizedSourceDirectory),
    };
  }

  const segments = normalizedSourceDirectory
    .split(path.sep)
    .filter(segment => segment && segment !== '.');

  const sourceGraphsIndex = segments.indexOf('source_graphs');
  const relativeSegments = sourceGraphsIndex >= 0
    ? segments.slice(sourceGraphsIndex + 1)
    : segments;

  if (relativeSegments.length === 0) {
    return null;
  }

  return {
    sharedPath: path.join(getSourceGraphsPath(), ...relativeSegments),
    relativePathWithinSourceGraphs: path.join(...relativeSegments),
  };
}

/**
 * Helper class for setting up test bundles for system tests.
 * Creates bundles directly in the TEST_CONFIG_DIR/bundles/ directory
 * that the server is configured to use.
 */
export class SystemTestBundleSetup {
  private readonly testBundleSlug: string;
  private readonly sourceFixturePath: string;
  private readonly destinationBundlePath: string;
  private readonly fixtureFolderName: string;
  private hasHooks: boolean = false;
  private isolatedSourceGraphPath: string | null = null;

  constructor(
    fixtureFolderName: string, 
    baseBundleSlug: string = 'test-bundle',
    options: { bundleFolderName?: string } = {}
  ) {
    this.fixtureFolderName = fixtureFolderName;
    
    // Create a unique bundle slug to avoid conflicts between tests
    const uniqueId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.testBundleSlug = `${baseBundleSlug}-${uniqueId}`;
    
    // Allow specifying which bundle folder to use within the fixture
    const bundleFolderName = options.bundleFolderName || 'test-bundle';
    this.sourceFixturePath = path.join(getFixturesPath(), fixtureFolderName, 'bundles', bundleFolderName);
    
    // Bundle goes directly into the server's bundles directory
    this.destinationBundlePath = path.join(TEST_CONFIG_DIR, 'bundles', this.testBundleSlug);
  }

  /**
   * Sets up the test bundle by copying the fixture to the workspace
   * Updates the bundle config to point to the correct source_graphs path
   */
  setUp(): void {
    this.isolatedSourceGraphPath = null;

    // Ensure the bundles directory exists
    const bundlesDir = path.join(TEST_CONFIG_DIR, 'bundles');
    if (!fs.existsSync(bundlesDir)) {
      fs.mkdirSync(bundlesDir, { recursive: true });
    }

    // Clean up any existing test bundle with the same slug
    if (fs.existsSync(this.destinationBundlePath)) {
      fs.rmSync(this.destinationBundlePath, { recursive: true, force: true });
    }

    // Copy the test fixture to the workspace, excluding .DS_Store files
    fs.cpSync(this.sourceFixturePath, this.destinationBundlePath, {
      recursive: true,
      filter: (src) => !src.includes('.DS_Store')
    });

    // Update the bundle_config.yaml with an isolated copy of the source graph.
    const bundleYamlPath = BundleConfigPaths.getBundleConfigFile(this.destinationBundlePath);
    if (fs.existsSync(bundleYamlPath)) {
      const yamlContent = fs.readFileSync(bundleYamlPath, 'utf8');
      const config = YAML.parse(yamlContent) as Record<string, unknown>;

      if (config.sourceDirectory && typeof config.sourceDirectory === 'string') {
        const resolvedSourceGraph = resolveFixtureSourceGraph(config.sourceDirectory);
        if (!resolvedSourceGraph) {
          throw new Error(`Could not resolve fixture source graph path from "${config.sourceDirectory}"`);
        }
        if (!fs.existsSync(resolvedSourceGraph.sharedPath)) {
          throw new Error(`Fixture source graph path does not exist: ${resolvedSourceGraph.sharedPath}`);
        }

        this.isolatedSourceGraphPath = path.join(
          this.destinationBundlePath,
          'source_graphs',
          resolvedSourceGraph.relativePathWithinSourceGraphs
        );
        fs.mkdirSync(path.dirname(this.isolatedSourceGraphPath), { recursive: true });
        fs.cpSync(resolvedSourceGraph.sharedPath, this.isolatedSourceGraphPath, {
          recursive: true,
          filter: (src) => !src.includes('.DS_Store')
        });

        config.sourceDirectory = this.isolatedSourceGraphPath;
      }

      fs.writeFileSync(bundleYamlPath, YAML.stringify(config), 'utf8');
    }

    // Copy hooks if they exist in the fixture (check both root and app/hooks paths)
    // Note: hooks go into TEST_CONFIG_DIR/app/hooks to match where the backend expects them
    let sourceHooksPath = path.join(getFixturesPath(), this.fixtureFolderName, 'hooks');
    if (!fs.existsSync(sourceHooksPath)) {
      sourceHooksPath = AppConfigPaths.getGlobalHooksDir(path.join(getFixturesPath(), this.fixtureFolderName));
    }
    if (fs.existsSync(sourceHooksPath)) {
      const destHooksDir = AppConfigPaths.getGlobalHooksDir(TEST_CONFIG_DIR);
      if (!fs.existsSync(destHooksDir)) {
        fs.mkdirSync(destHooksDir, { recursive: true });
      }
      fs.cpSync(sourceHooksPath, destHooksDir, { 
        recursive: true,
        filter: (src) => !src.includes('.DS_Store')
      });
      this.hasHooks = true;
    }
  }

  /**
   * Cleans up the test bundle after testing
   */
  tearDown(): void {
    if (fs.existsSync(this.destinationBundlePath)) {
      fs.rmSync(this.destinationBundlePath, { recursive: true, force: true });
    }
    this.isolatedSourceGraphPath = null;
    
    // Clean up hooks if this fixture added them
    if (this.hasHooks) {
      const destHooksDir = AppConfigPaths.getGlobalHooksDir(TEST_CONFIG_DIR);
      if (fs.existsSync(destHooksDir)) {
        fs.rmSync(destHooksDir, { recursive: true, force: true });
      }
    }
  }

  /**
   * Gets the test bundle slug for API calls
   */
  getBundleSlug(): string {
    return this.testBundleSlug;
  }

  /**
   * Gets the path to the test bundle in the workspace
   */
  getBundlePath(): string {
    return this.destinationBundlePath;
  }

  /**
   * Gets the path to a specific folder within the test bundle
   */
  getPathInBundle(relativePath: string): string {
    return path.join(this.destinationBundlePath, relativePath);
  }

  /**
   * Gets the isolated source graph path for this test bundle.
   */
  getSourceGraphPath(): string {
    if (!this.isolatedSourceGraphPath) {
      throw new Error('This test bundle does not have an isolated source graph path');
    }
    return this.isolatedSourceGraphPath;
  }

  /**
   * Gets the path to a specific file within the isolated source graph.
   */
  getPathInSourceGraph(relativePath: string): string {
    return path.join(this.getSourceGraphPath(), relativePath);
  }

  /**
   * Returns true if this fixture has hooks that were set up
   */
  hasHooksSetup(): boolean {
    return this.hasHooks;
  }
}
