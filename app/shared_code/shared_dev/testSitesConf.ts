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
 * Utility functions for setting up meadow test sites configuration.
 * Used by dev_cli/mw.ts and potentially backend tests.
 */

import { existsSync, mkdirSync, cpSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";

export interface SetupTestSitesOptions {
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
 * Copies a single test site from a fixture to the target home directory.
 * - Excludes the 'raw' folder so the application creates it as needed
 * - Updates site_config.yaml to point to the correct sourceDirectory
 *
 * @param fixtureName - Name of the fixture folder (e.g., "home_fixture_big_and_small")
 * @param sourceSiteSlug - The slug of the site within the fixture (e.g., "meadow-test-site-big")
 * @param targetSiteSlug - The slug to use for the site in the target (e.g., "meadow-test-site-big")
 * @param options - Setup options including paths
 */
export function copyTestSiteFixture(
  fixtureName: string,
  sourceSiteSlug: string,
  targetSiteSlug: string,
  options: SetupTestSitesOptions
): void {
  const fixturesPath = getHomeFixturesPath(options.projectRoot);
  const sourceGraphsPath = getSourceGraphsPath(options.projectRoot);
  
  // Source fixture path - the site folder inside the fixture (now uses the actual site slug)
  const fixtureDir = join(fixturesPath, fixtureName, "sites", sourceSiteSlug);
  
  // Target path in the meadow config
  const targetSiteDir = join(options.targetConfigDir, "sites", targetSiteSlug);
  
  if (!existsSync(fixtureDir)) {
    throw new Error(`Test site fixture not found: ${fixtureDir}`);
  }
  
  // Ensure the target sites directory exists
  const sitesDir = join(options.targetConfigDir, "sites");
  if (!existsSync(sitesDir)) {
    mkdirSync(sitesDir, { recursive: true });
  }
  
  // Copy the fixture to the target, excluding .DS_Store and raw folder
  cpSync(fixtureDir, targetSiteDir, {
    recursive: true,
    filter: (src: string) => {
      // Exclude .DS_Store files
      if (src.includes(".DS_Store")) return false;
      // Exclude the raw folder (we want the app to create it)
      if (src.endsWith("/raw") || src.includes("/raw/")) return false;
      return true;
    }
  });
  
  // Update the site_config.yaml to point to the correct source graph directory
  const siteYamlPath = join(targetSiteDir, "conf", "site_config.yaml");
  if (existsSync(siteYamlPath)) {
    let yamlContent = readFileSync(siteYamlPath, "utf8");
    
    // Extract the source graph name from the fixture's sourceDirectory
    // Fixtures use relative paths like: sourceDirectory: ./source_graphs/meadow-test-site-for-hooks
    const sourceDirectoryMatch = yamlContent.match(/sourceDirectory:\s*\.\/source_graphs\/([^\s]+)/);
    if (sourceDirectoryMatch) {
      const sourceGraphName = sourceDirectoryMatch[1];
      const sourceGraphDir = join(sourceGraphsPath, sourceGraphName);
      yamlContent = yamlContent.replace(
        /sourceDirectory:.*$/m,
        `sourceDirectory: ${sourceGraphDir}`
      );
      writeFileSync(siteYamlPath, yamlContent, "utf8");
    }
  }
  
  console.log(`  ✓ Copied ${sourceSiteSlug} → ${targetSiteSlug}`);
}

/**
 * Sets up both big and small test sites in the target home directory.
 * - Creates the necessary directory structure
 * - Copies fixtures excluding raw folders
 * - Updates site_config.yaml files to point to the correct sourceDirectory
 */
export function setupTestSites(options: SetupTestSitesOptions): void {
  const { targetConfigDir } = options;

  // Create the base home directory if it doesn't exist
  if (!existsSync(targetConfigDir)) {
    mkdirSync(targetConfigDir, { recursive: true });
    console.log(`Created home directory: ${targetConfigDir}`);
  }

  console.log("Setting up test sites...");

  // The fixture name for the combined big and small sites
  const fixtureName = "home_fixture_big_and_small";

  // Copy both test sites from the combined fixture
  copyTestSiteFixture(fixtureName, "meadow-test-site-big", "meadow-test-site-big", options);
  copyTestSiteFixture(fixtureName, "meadow-test-site-small", "meadow-test-site-small", options);

  console.log("✓ Test sites setup complete");
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

