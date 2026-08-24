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
import { fileURLToPath } from 'url';
import { AppConfigPaths } from '../../../../../shared_code/paths/appConfigPaths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const backendTestDir = path.resolve(__dirname, '../..');

export class TestBundleSetup {
  private readonly testBundleId: string;
  private readonly sourceFixturePath: string;
  private readonly destinationWorkspacePath: string;
  private readonly bundlesWorkspaceDir: string;
  private readonly uniqueTestDir: string;
  private readonly hooksFixtureName: string | undefined;

  /**
   * @param fixturePath - Fixture folder path relative to backend/test/
   * @param testBundleId - The bundle ID to use in the test
   * @param hooksFixtureName - Optional hooks fixture folder path relative to backend/test/
   */
  constructor(fixturePath: string, testBundleId: string = 'test-bundle', hooksFixtureName?: string) {
    this.testBundleId = testBundleId;
    this.hooksFixtureName = hooksFixtureName;
    
    // Create a unique directory for each test instance to avoid race conditions
    this.uniqueTestDir = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.sourceFixturePath = path.join(backendTestDir, fixturePath);
    
    // Create a test "bundles" directory structure within backend/test/
    this.bundlesWorkspaceDir = path.join(backendTestDir, 'config_workspace', this.uniqueTestDir);
    this.destinationWorkspacePath = path.join(this.bundlesWorkspaceDir, 'bundles', this.testBundleId);
  }

  /**
   * Sets up the test bundle by copying the fixture to the workspace
   */
  setUp(): void {
    // Clean up any existing test bundles directory
    if (fs.existsSync(this.bundlesWorkspaceDir)) {
      fs.rmSync(this.bundlesWorkspaceDir, { recursive: true, force: true });
    }

    // Create the bundles directory structure
    fs.mkdirSync(this.bundlesWorkspaceDir, { recursive: true });

    // Copy the test fixture to the workspace, excluding .DS_Store files
    fs.cpSync(this.sourceFixturePath, this.destinationWorkspacePath, { 
      recursive: true,
      filter: (src) => !src.includes('.DS_Store')
    });

    // Set environment variable to point to our test config directory
    const testConfigDir = path.join(backendTestDir, 'config_workspace', this.uniqueTestDir);
    process.env.MEADOW_HOME_DIRECTORY_OVERRIDE = testConfigDir;

    // Copy hooks if specified
    if (this.hooksFixtureName) {
      const sourceHooksPath = path.join(backendTestDir, this.hooksFixtureName);
      if (fs.existsSync(sourceHooksPath)) {
        const destHooksDir = AppConfigPaths.getGlobalHooksDir(testConfigDir);
        fs.mkdirSync(destHooksDir, { recursive: true });
        fs.cpSync(sourceHooksPath, destHooksDir, { 
          recursive: true,
          filter: (src) => !src.includes('.DS_Store')
        });
      }
    }
  }

  /**
   * Cleans up the test bundle after testing
   */
  tearDown(): void {
    if (fs.existsSync(this.bundlesWorkspaceDir)) {
      fs.rmSync(this.bundlesWorkspaceDir, { recursive: true, force: true });
    }

    // Clean up the entire unique test directory
    const testConfigDir = path.join(backendTestDir, 'config_workspace', this.uniqueTestDir);
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }
    
    // Clean up environment variable
    delete process.env.MEADOW_HOME_DIRECTORY_OVERRIDE;
  }

  /**
   * Gets the path to the test bundle in the workspace
   */
  getBundlePath(): string {
    return this.destinationWorkspacePath;
  }

  /**
   * Gets the path to a specific folder within the test bundle
   */
  getPathInBundle(relativePath: string): string {
    return path.join(this.destinationWorkspacePath, relativePath);
  }
}
