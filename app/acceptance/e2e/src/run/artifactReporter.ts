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
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadDocumentRegistry, type DocumentRegistry } from '../../../../concepts/loadRegistry.js';
import { captureDocumentSnapshot, SCENARIO_DOCUMENTS_FILE, type DocumentSnapshot } from '../artifacts/documentSnapshot.js';
import { resolveScenarioDocuments } from '../artifacts/scenarioDocuments.js';
import { extractScenarioDescription } from "../artifacts/scenarioDescription.js";
import { collectReferencedSourceChanges } from "../artifacts/testSourceChanges.js";
import { renderConceptText, type ConceptText } from '../../../../concepts/types.js';

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

  private registry?: DocumentRegistry;
  private snapshot?: DocumentSnapshot;

  async onBegin(): Promise<void> {
    this.registry = await loadDocumentRegistry();
    const root = path.dirname(getTestArtifactDirectory('scenario', this.options.outputDir));
    this.snapshot = captureDocumentSnapshot(root, this.registry, path.resolve(import.meta.dirname, '../../tests'));
  }

  private captureDocuments(test: TestCase, directory: string): void {
    if (!this.registry) throw new Error('Document registry was not captured before the scenario.');
    const source = readFileSync(test.location.file, 'utf8');
    const id = test.annotations.find(annotation => annotation.type === 'scenario-id')?.description;
    const relativeFile = path.relative(path.resolve(import.meta.dirname, '../../tests'), test.location.file);
    const declared = this.snapshot?.scenarios.find(scenario => id ? scenario.scenarioId === id : scenario.testFile === relativeFile);
    const documents = declared ? { conceptIds: declared.conceptIds, bundleDocIds: declared.bundleDocIds,
      appAreaDocIds: declared.appAreaDocIds, subAreaDocIds: declared.subAreaDocIds, designPressureIds: declared.designPressureIds }
      : resolveScenarioDocuments(source, this.registry);
    writeFileSync(path.join(directory, SCENARIO_DOCUMENTS_FILE), JSON.stringify(documents));
  }

  onTestBegin(test: TestCase, result: TestResult): void {
    const directory = getTestArtifactDirectory(test.title, this.options.outputDir);
    mkdirSync(directory, { recursive: true });
    this.captureDocuments(test, directory);
    // Clear only a scenario that is actually executing. Reassembly of other
    // scenarios must retain their recordings after temporary output is cleaned.
    rmSync(path.join(directory, 'video.webm'), { force: true });
    writeFileSync(path.join(directory, "test-file.txt"), test.location.file);
    const source = readFileSync(test.location.file, "utf8");
    writeFileSync(path.join(directory, "test-source.ts"), source);
    writeFileSync(path.join(directory, "source-changes.json"), JSON.stringify(collectReferencedSourceChanges(source), null, 2));
    const sections = test.annotations.find(annotation => annotation.type === 'scenario-sections')?.description;
    writeFileSync(path.join(directory, 'sections.json'), sections ?? '[]');
    const nameText = test.annotations.find(annotation => annotation.type === 'scenario-name')?.description;
    if (nameText) writeFileSync(path.join(directory, 'name-text.json'), nameText);
    const descriptionText = test.annotations.find(annotation => annotation.type === 'scenario-description')?.description;
    if (descriptionText) writeFileSync(path.join(directory, 'description-text.json'), descriptionText);
    writeFileSync(path.join(directory, "description.txt"), descriptionText
      ? renderConceptText(JSON.parse(descriptionText) as ConceptText)
      : extractScenarioDescription(source, test.location.line, test.location.column));
    writeFileSync(path.join(directory, "start-time.txt"), result.startTime.toISOString());
    writeFileSync(path.join(directory, "status.txt"), "running");
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const directory = getTestArtifactDirectory(test.title, this.options.outputDir);
    mkdirSync(directory, { recursive: true });
    if (!existsSync(path.join(directory, SCENARIO_DOCUMENTS_FILE))) {
      this.captureDocuments(test, directory);
      writeFileSync(path.join(directory, 'test-file.txt'), test.location.file);
      writeFileSync(path.join(directory, 'test-source.ts'), readFileSync(test.location.file, 'utf8'));
    }
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
