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
import type { Expect, Page } from "@playwright/test";
import YAML from "yaml";

export async function installLocalExportZipMock(page: Page, backendPort: number, zipPath: string) {
  await page.addInitScript(({ backendPort: port, zipPath: targetZipPath }) => {
    const target = window as unknown as { electronAPI?: Record<string, unknown> };
    target.electronAPI = {
      ...(target.electronAPI || {}),
      getBackendPort: async () => port,
      getFrontendPort: async () => 0,
      getTargetPageInfo: async () => null,
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      showSaveDialog: async () => ({ canceled: false, filePath: targetZipPath }),
      openExternal: async () => undefined,
      openPath: async () => "",
      windowMinimize: async () => undefined,
      windowMaximize: async () => undefined,
      windowClose: async () => undefined,
      checkForUpdate: async () => undefined,
      downloadUpdate: async () => undefined,
      installUpdate: async () => undefined,
      getAppVersion: async () => "test",
      getUpdateState: async () => ({}),
      onUpdateStatus: () => undefined,
      offUpdateStatus: () => undefined,
      onOpenUpdateModal: () => undefined,
      offOpenUpdateModal: () => undefined,
    };
  }, { backendPort, zipPath });
}

export function readFileIfExists(filePath: string): string {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

export class OpenKnowledgeFormatBundle {
  readonly directory: string;

  constructor(
    bundleDir: string,
    private expect: Expect,
  ) {
    const manifest = YAML.parse(fs.readFileSync(
      path.join(bundleDir, "config", "generated_bundle_versions.yaml"),
      "utf8",
    )) as { versions?: Array<{ versionId?: string }> };
    const currentVersionId = manifest.versions?.at(-1)?.versionId;
    if (!currentVersionId) throw new Error("Generated bundle has no current version");
    this.directory = path.join(
      bundleDir,
      "html",
      "generated_bundle_versions",
      currentVersionId,
      "_mw_assets",
      "cust",
      "okf",
      "bundle",
    );
  }

  filePath(relativePath: string): string {
    return path.join(this.directory, ...relativePath.split("/"));
  }

  fileExists(relativePath: string): boolean {
    return fs.existsSync(this.filePath(relativePath));
  }

  readFile(relativePath: string): string {
    return readFileIfExists(this.filePath(relativePath));
  }

  async expectFileToContain(relativePath: string, expectedText: string, timeout = 15_000) {
    await this.expect.poll(() => this.readFile(relativePath), { timeout }).toContain(expectedText);
  }

  expectFileToBeAbsent(relativePath: string) {
    this.expect(this.fileExists(relativePath)).toBe(false);
  }
}
