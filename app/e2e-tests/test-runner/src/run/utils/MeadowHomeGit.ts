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

import { execSync } from "child_process";
import { existsSync } from "fs";
import path from "path";
import type { Expect } from "@playwright/test";

/**
 * Utility for asserting git state of the MeadowHome config directory.
 *
 * The MeadowHome repo is managed by the backend via fast_git_ops (gitoxide),
 * which creates repos that appear bare to regular git. This utility uses the
 * same fast_git_ops binary to query status.
 */
export class MeadowHomeGit {
  private binaryPath: string;

  constructor(
    private configDir: string,
    private expect: Expect,
  ) {
    this.binaryPath = resolveFastGitOpsBinary();
  }

  /** Run fast_git_ops status and return the list of uncommitted files. */
  private getUncommittedFiles(): { path: string; status: string }[] {
    const output = execSync(`"${this.binaryPath}" status "${this.configDir}"`, {
      encoding: "utf8",
      timeout: 30_000,
    }).trim();
    return output ? JSON.parse(output) : [];
  }

  /**
   * Assert that the given directory within the MeadowHome repo has no
   * uncommitted or untracked files. Retries with a short delay to allow the
   * backend's async git commit to land.
   *
   * @param dirPath — absolute path to a directory within configDir to check
   */
  async expectDirFullyCommitted(dirPath: string, { retries = 10, delayMs = 1000 } = {}) {
    let uncommitted: { path: string; status: string }[] = [];
    for (let attempt = 0; attempt <= retries; attempt++) {
      const all = this.getUncommittedFiles();
      uncommitted = all.filter((f) => f.path.startsWith(dirPath));
      if (uncommitted.length === 0) break;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    const summary = uncommitted.map((f) => `${f.status} ${f.path}`).join("\n");
    this.expect(
      uncommitted.length,
      `Expected no uncommitted files under ${dirPath} but found:\n${summary}`,
    ).toBe(0);
  }
}

export function resolveFastGitOpsBinary(): string {
  // utils → run → src → test-runner → e2e-tests → app → repo root
  const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..", "..", "..", "..");
  const crateRoot = path.join(repoRoot, "app", "native_utils", "fast_git_ops", "fast_git_ops_code");
  const releasePath = path.join(crateRoot, "target", "release", "fast_git_ops_bin");
  const debugPath = path.join(crateRoot, "target", "debug", "fast_git_ops_bin");
  if (existsSync(releasePath)) return releasePath;
  if (existsSync(debugPath)) return debugPath;
  return releasePath;
}
