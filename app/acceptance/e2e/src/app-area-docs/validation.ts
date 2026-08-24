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

interface ScenarioDocAreaMetadata {
  id: string;
  appAreaDocIds?: readonly string[] | null;
}

interface AppAreaDocMetadata {
  id: string;
}

export type ScenarioDocAppAreaAssignment = readonly string[] | null;

interface ScenarioDocAppAreaValidationOptions {
  baseScenarioDocs: readonly ScenarioDocAreaMetadata[];
  moduleScenarioDocs?: readonly ScenarioDocAreaMetadata[];
  appAreaDocs: readonly AppAreaDocMetadata[];
  baseAssignments: Readonly<Record<string, ScenarioDocAppAreaAssignment>>;
}

const hasOwn = (value: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

export function findScenarioDocAppAreaAssignmentErrors({
  baseScenarioDocs,
  moduleScenarioDocs = [],
  appAreaDocs,
  baseAssignments,
}: ScenarioDocAppAreaValidationOptions): string[] {
  const errors: string[] = [];
  const validAppAreaDocIds = new Set(appAreaDocs.map((doc) => doc.id));
  const baseScenarioDocIds = new Set(baseScenarioDocs.map((doc) => doc.id));
  const allScenarioDocs = [...baseScenarioDocs, ...moduleScenarioDocs];
  const seenScenarioDocIds = new Set<string>();

  for (const doc of allScenarioDocs) {
    if (seenScenarioDocIds.has(doc.id)) {
      errors.push(`scenario doc id "${doc.id}" is declared more than once`);
    }
    seenScenarioDocIds.add(doc.id);
  }

  for (const scenarioDocId of Object.keys(baseAssignments)) {
    if (!baseScenarioDocIds.has(scenarioDocId)) {
      errors.push(`app-area assignment references unknown base scenario doc "${scenarioDocId}"`);
    }
  }

  const validateAssignment = (
    scenarioDocId: string,
    assignment: ScenarioDocAppAreaAssignment | undefined,
  ) => {
    if (assignment === undefined) {
      errors.push(
        `scenario doc "${scenarioDocId}" has no app-area assignment; use null to explicitly declare no app area`,
      );
      return;
    }
    if (assignment === null) return;
    if (!Array.isArray(assignment)) {
      errors.push(`scenario doc "${scenarioDocId}" has an invalid app-area assignment`);
      return;
    }
    if (assignment.length === 0) {
      errors.push(
        `scenario doc "${scenarioDocId}" has an empty app-area assignment; use null to explicitly declare no app area`,
      );
      return;
    }

    const seenAppAreaDocIds = new Set<string>();
    for (const appAreaDocId of assignment) {
      if (seenAppAreaDocIds.has(appAreaDocId)) {
        errors.push(`scenario doc "${scenarioDocId}" repeats app area "${appAreaDocId}"`);
      }
      seenAppAreaDocIds.add(appAreaDocId);
      if (!validAppAreaDocIds.has(appAreaDocId)) {
        errors.push(`scenario doc "${scenarioDocId}" references unknown app area "${appAreaDocId}"`);
      }
    }
  };

  for (const doc of baseScenarioDocs) {
    const hasRegistryAssignment = hasOwn(baseAssignments, doc.id);
    const hasInlineAssignment = hasOwn(doc, "appAreaDocIds");
    if (hasRegistryAssignment && hasInlineAssignment) {
      errors.push(`base scenario doc "${doc.id}" has both registry and inline app-area assignments`);
      continue;
    }
    validateAssignment(
      doc.id,
      hasRegistryAssignment ? baseAssignments[doc.id] : doc.appAreaDocIds,
    );
  }

  for (const doc of moduleScenarioDocs) {
    validateAssignment(doc.id, hasOwn(doc, "appAreaDocIds") ? doc.appAreaDocIds : undefined);
  }

  return errors;
}

export function assertScenarioDocAppAreaAssignments(
  options: ScenarioDocAppAreaValidationOptions,
): void {
  const errors = findScenarioDocAppAreaAssignmentErrors(options);
  if (errors.length === 0) return;
  throw new Error(`Scenario app-area ownership is invalid:\n${errors.map((error) => `  - ${error}`).join("\n")}`);
}
