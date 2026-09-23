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

import fs from "fs";
import path from "path";
import YAML from "yaml";
import type { Expect } from "@playwright/test";
import type { BundleConfig } from '../../../../../contracts/types/bundleConfig.js';
import type { BundleNodeConfig } from '../../../../../contracts/types/bundleNodeConfig.js';
import { BundleConfigPaths } from '../../../../../shared_code/paths/bundleConfigPaths.js';
import { parseBundleNodeConfig } from '../../../../../shared_code/utils/bundleNodeConfigUtils.js';

type NodeQuery = Partial<Pick<BundleNodeConfig,
  'bundleNodeId' | 'bundleNodeName' | 'sourceId' | 'sourceGraphSubdirectory' | 'bundleNodeKind' | 'fileType'
>>;

/**
 * Read a bundle's configuration and configured nodes from a MeadowHome.
 * Each read loads the current persisted state, so acceptance tests can compare
 * configuration before and after a user action without knowing the file layout.
 */
export class MeadowHomeBundleConfig {
  constructor(
    private configDir: string,
    private bundleSlug: string,
    private expect: Expect,
  ) {}

  private bundleDirectory(): string {
    return path.join(this.configDir, "bundles", this.bundleSlug);
  }

  private readFile(filePath: string): string {
    this.expect(
      fs.existsSync(filePath),
      `Expected bundle configuration at ${filePath}`,
    ).toBe(true);
    return fs.readFileSync(filePath, "utf8");
  }

  /** Read the exact serialized configuration for assertions that no write occurred. */
  readText(): string {
    return this.readFile(BundleConfigPaths.getBundleConfigFile(this.bundleDirectory()));
  }

  /** Parse and return the bundle_config.yaml. Fails the test if absent or invalid. */
  read(): BundleConfig {
    const parsed = YAML.parse(this.readText()) as
      | BundleConfig
      | null;
    return parsed ?? {};
  }

  readNodesText(): string {
    return this.readFile(BundleConfigPaths.getBundleNodeConfigFile(this.bundleDirectory()));
  }

  /** Read and validate the current committed node configuration. */
  readNodes(): BundleNodeConfig[] {
    const filePath = BundleConfigPaths.getBundleNodeConfigFile(this.bundleDirectory());
    return parseBundleNodeConfig(this.readFile(filePath), filePath);
  }

  /** A missing node is allowed; an ambiguous lookup must be made more specific. */
  findNode(query: NodeQuery): BundleNodeConfig | undefined {
    const matches = this.readNodes().filter(node =>
      Object.entries(query).every(([field, value]) => node[field as keyof NodeQuery] === value));
    this.expect(matches.length, `Ambiguous node in ${this.bundleSlug}: ${JSON.stringify(query)}`).toBeLessThanOrEqual(1);
    return matches[0];
  }

  requireNode(query: NodeQuery): BundleNodeConfig {
    const node = this.findNode(query);
    this.expect(node, `Expected configured node in ${this.bundleSlug}: ${JSON.stringify(query)}`).toBeDefined();
    return node!;
  }
}
