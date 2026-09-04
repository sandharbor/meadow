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
 * Ports used by the bundle-rename workflow when it crosses app-area
 * boundaries. The app shell wires the concrete area implementations once at
 * startup; individual areas depend only on this shared contract.
 */
export interface BundleRenameGenerationOperations {
  refreshTrackedContent(bundleDirectory: string, sourceDirectory: string): Promise<void>;
  generateHtml(bundleDirectory: string, outputDirectory: string): Promise<void>;
}

export interface BundleRenameWorkflowOperations {
  hasPendingRename(bundleSlug: string): boolean;
  undoPendingRename(bundleSlug: string): Promise<{ slug: string; versionId: string | null }>;
}

let generationOperations: BundleRenameGenerationOperations | null = null;
let workflowOperations: BundleRenameWorkflowOperations | null = null;

export function configureBundleRenameGenerationOperations(
  operations: BundleRenameGenerationOperations,
): void {
  generationOperations = operations;
}

export function requireBundleRenameGenerationOperations(): BundleRenameGenerationOperations {
  if (!generationOperations) throw new Error('Bundle rename generation operations are not configured');
  return generationOperations;
}

export function configureBundleRenameWorkflowOperations(
  operations: BundleRenameWorkflowOperations,
): void {
  workflowOperations = operations;
}

export function requireBundleRenameWorkflowOperations(): BundleRenameWorkflowOperations {
  if (!workflowOperations) throw new Error('Bundle rename workflow operations are not configured');
  return workflowOperations;
}
