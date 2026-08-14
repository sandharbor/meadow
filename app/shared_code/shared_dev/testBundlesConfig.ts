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

/**
 * Utility functions for setting up meadow test bundles configuration.
 * Used by dev_cli/mw.ts and potentially backend tests.
 */

import { existsSync, mkdirSync, cpSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";

export interface SetupTestBundlesOptions {
  /** The target meadow home directory (e.g., ~/Library/Application Support/Meadow) */
  targetConfigDir: string;
  /** The project root directory containing shared_data */
  projectRoot: string;
}

/**
 * Gets the path to the home_fixtures directory
 */
export function getHomeFixturesPath(projectRoot: string): string {
  return join(projectRoot, "app", "shared_data", "home_fixtures");
}

/**
 * @deprecated Use getHomeFixturesPath instead
 */
export function getConfigFixturesPath(projectRoot: string): string {
  return getHomeFixturesPath(projectRoot);
}

/**
 * Gets the path to the source_graphs directory
 */
export function getSourceGraphsPath(projectRoot: string): string {
  return join(projectRoot, "app", "shared_data", "source_graphs");
}

/**
 * Copies a single test bundle from a fixture to the target home directory.
 * - Excludes the 'raw' folder so the application creates it as needed
 * - Updates bundle_config.yaml to point to the correct sourceDirectory
 *
 * @param fixtureName - Name of the fixture folder (e.g., "home_fixture_big_and_small")
 * @param sourceBundleSlug - The slug of the bundle within the fixture (e.g., "meadow-test-bundle-big")
 * @param targetBundleSlug - The slug to use for the bundle in the target (e.g., "meadow-test-bundle-big")
 * @param options - Setup options including paths
 */
export function copyTestBundleFixture(
  fixtureName: string,
  sourceBundleSlug: string,
  targetBundleSlug: string,
  options: SetupTestBundlesOptions
): void {
  const fixturesPath = getHomeFixturesPath(options.projectRoot);
  const sourceGraphsPath = getSourceGraphsPath(options.projectRoot);
  
  // Source fixture path - the bundle folder inside the fixture (now uses the actual bundle slug)
  const fixtureDir = join(fixturesPath, fixtureName, "bundles", sourceBundleSlug);
  
  // Target path in the meadow config
  const targetBundleDir = join(options.targetConfigDir, "bundles", targetBundleSlug);
  
  if (!existsSync(fixtureDir)) {
    throw new Error(`Test bundle fixture not found: ${fixtureDir}`);
  }
  
  // Ensure the target bundles directory exists
  const bundlesDir = join(options.targetConfigDir, "bundles");
  if (!existsSync(bundlesDir)) {
    mkdirSync(bundlesDir, { recursive: true });
  }
  
  // Copy the fixture to the target, excluding .DS_Store and raw folder
  cpSync(fixtureDir, targetBundleDir, {
    recursive: true,
    filter: (src: string) => {
      // Exclude .DS_Store files
      if (src.includes(".DS_Store")) return false;
      // Exclude the raw folder (we want the app to create it)
      if (src.endsWith("/raw") || src.includes("/raw/")) return false;
      return true;
    }
  });
  
  // Update the bundle_config.yaml to point to the correct source graph directory
  const bundleYamlPath = join(targetBundleDir, "config", "bundle_config.yaml");
  if (existsSync(bundleYamlPath)) {
    let yamlContent = readFileSync(bundleYamlPath, "utf8");
    
    // Extract the source graph name from the fixture's sourceDirectory
    // Fixtures use relative paths like: sourceDirectory: ./source_graphs/meadow-test-bundle-for-hooks
    const sourceDirectoryMatch = yamlContent.match(/sourceDirectory:\s*\.\/source_graphs\/([^\s]+)/);
    if (sourceDirectoryMatch) {
      const sourceGraphName = sourceDirectoryMatch[1];
      const sourceGraphDir = join(sourceGraphsPath, sourceGraphName);
      yamlContent = yamlContent.replace(
        /sourceDirectory:.*$/m,
        `sourceDirectory: ${sourceGraphDir}`
      );
      writeFileSync(bundleYamlPath, yamlContent, "utf8");
    }
  }
  
  console.log(`  ✓ Copied ${sourceBundleSlug} → ${targetBundleSlug}`);
}

/**
 * Sets up both big and small test bundles in the target home directory.
 * - Creates the necessary directory structure
 * - Copies fixtures excluding raw folders
 * - Updates bundle_config.yaml files to point to the correct sourceDirectory
 */
export function setupTestBundles(options: SetupTestBundlesOptions): void {
  const { targetConfigDir } = options;

  // Create the base home directory if it doesn't exist
  if (!existsSync(targetConfigDir)) {
    mkdirSync(targetConfigDir, { recursive: true });
    console.log(`Created home directory: ${targetConfigDir}`);
  }

  console.log("Setting up test bundles...");

  // The fixture name for the combined big and small bundles
  const fixtureName = "home_fixture_big_and_small";

  // Copy both test bundles from the combined fixture
  copyTestBundleFixture(fixtureName, "meadow-test-bundle-big", "meadow-test-bundle-big", options);
  copyTestBundleFixture(fixtureName, "meadow-test-bundle-small", "meadow-test-bundle-small", options);

  console.log("✓ Test bundles setup complete");
}

/**
 * Finds the project root by looking for app/shared_data/home_fixtures.
 * Walks up from the given starting directory.
 */
export function findProjectRoot(startDir: string): string | null {
  let current = startDir;

  while (current !== "/") {
    const fixturesPath = join(current, "app", "shared_data", "home_fixtures");
    if (existsSync(fixturesPath)) {
      return current;
    }
    current = dirname(current);
  }

  return null;
}
