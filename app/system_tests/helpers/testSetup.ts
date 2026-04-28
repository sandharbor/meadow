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
import { SiteConfigPaths } from '../../shared_code/paths/siteConfigPaths.js';

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
 * Helper class for setting up test sites for system tests.
 * Creates sites directly in the TEST_CONFIG_DIR/sites/ directory
 * that the server is configured to use.
 */
export class SystemTestSiteSetup {
  private readonly testSiteSlug: string;
  private readonly sourceFixturePath: string;
  private readonly destinationSitePath: string;
  private readonly fixtureFolderName: string;
  private hasHooks: boolean = false;
  private isolatedSourceGraphPath: string | null = null;

  constructor(
    fixtureFolderName: string, 
    baseSiteSlug: string = 'test-site',
    options: { siteFolderName?: string } = {}
  ) {
    this.fixtureFolderName = fixtureFolderName;
    
    // Create a unique site slug to avoid conflicts between tests
    const uniqueId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.testSiteSlug = `${baseSiteSlug}-${uniqueId}`;
    
    // Allow specifying which site folder to use within the fixture
    const siteFolderName = options.siteFolderName || 'test-site';
    this.sourceFixturePath = path.join(getFixturesPath(), fixtureFolderName, 'sites', siteFolderName);
    
    // Site goes directly into the server's sites directory
    this.destinationSitePath = path.join(TEST_CONFIG_DIR, 'sites', this.testSiteSlug);
  }

  /**
   * Sets up the test site by copying the fixture to the workspace
   * Updates the site config to point to the correct source_graphs path
   */
  setUp(): void {
    this.isolatedSourceGraphPath = null;

    // Ensure the sites directory exists
    const sitesDir = path.join(TEST_CONFIG_DIR, 'sites');
    if (!fs.existsSync(sitesDir)) {
      fs.mkdirSync(sitesDir, { recursive: true });
    }

    // Clean up any existing test site with the same slug
    if (fs.existsSync(this.destinationSitePath)) {
      fs.rmSync(this.destinationSitePath, { recursive: true, force: true });
    }

    // Copy the test fixture to the workspace, excluding .DS_Store files
    fs.cpSync(this.sourceFixturePath, this.destinationSitePath, { 
      recursive: true,
      filter: (src) => !src.includes('.DS_Store')
    });

    // Update the site_config.yaml with an isolated copy of the source graph.
    const siteYamlPath = SiteConfigPaths.getSiteConfigFile(this.destinationSitePath);
    if (fs.existsSync(siteYamlPath)) {
      const yamlContent = fs.readFileSync(siteYamlPath, 'utf8');
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
          this.destinationSitePath,
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

      fs.writeFileSync(siteYamlPath, YAML.stringify(config), 'utf8');
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
   * Cleans up the test site after testing
   */
  tearDown(): void {
    if (fs.existsSync(this.destinationSitePath)) {
      fs.rmSync(this.destinationSitePath, { recursive: true, force: true });
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
   * Gets the test site slug for API calls
   */
  getSiteSlug(): string {
    return this.testSiteSlug;
  }

  /**
   * Gets the path to the test site in the workspace
   */
  getSitePath(): string {
    return this.destinationSitePath;
  }

  /**
   * Gets the path to a specific folder within the test site
   */
  getPathInSite(relativePath: string): string {
    return path.join(this.destinationSitePath, relativePath);
  }

  /**
   * Gets the isolated source graph path for this test site.
   */
  getSourceGraphPath(): string {
    if (!this.isolatedSourceGraphPath) {
      throw new Error('This test site does not have an isolated source graph path');
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
