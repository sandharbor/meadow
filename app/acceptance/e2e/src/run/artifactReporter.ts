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

import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export function getTestArtifactDirectory(title: string, outputDir = path.join(
  os.homedir(), "meadow-e2e-artifacts", "current", process.env.E2E_RUN_ID || "default"
)): string {
  const slug = title.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return path.join(outputDir, slug);
}

// The parent receives Playwright's final result even when a worker dies before
// its fixture teardown can write status, failure details, or an end time.
export default class ArtifactReporter implements Reporter {
  constructor(private readonly options: { outputDir?: string } = {}) {}

  onTestBegin(test: TestCase, result: TestResult): void {
    const directory = getTestArtifactDirectory(test.title, this.options.outputDir);
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, "test-file.txt"), test.location.file);
    writeFileSync(path.join(directory, "start-time.txt"), result.startTime.toISOString());
    writeFileSync(path.join(directory, "status.txt"), "running");
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const directory = getTestArtifactDirectory(test.title, this.options.outputDir);
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, "status.txt"), result.status);
    const endTimePath = path.join(directory, "end-time.txt");
    if (!existsSync(endTimePath)) writeFileSync(endTimePath, new Date().toISOString());

    if (result.errors.length > 0) {
      const failurePath = path.join(directory, "failure-reason.txt");
      const previous = existsSync(failurePath) ? readFileSync(failurePath, "utf8") : "";
      const errors = result.errors.map(error => error.stack || error.message || error.value || "Unknown test error");
      writeFileSync(failurePath, [...new Set([previous, ...errors].filter(Boolean))].join("\n"));
    }
  }
}
