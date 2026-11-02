/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import type { ExecutableLintRule } from '../lint-rule.js';
import { loadDocumentRegistry } from '../../../../../concepts/loadRegistry.js';
import { auditScenarioSpec } from '../spec-scenario-metadata.js';
import { auditBundleMode } from '../spec-bundle-mode.js';
import { auditDirectLocators } from '../spec-direct-locators.js';
import { auditRawData } from '../spec-raw-data.js';
import { auditCheckpointKeyFrames } from '../spec-checkpoint-keyframes.js';
import { auditFinalAssertions } from '../spec-final-assertion.js';
import { auditEditorialSource } from '../editorial-links.js';
import {
  singleTestPerSpecGuidance, bundleModeGuidance, noDirectLocatorsGuidance,
  noRawDataGuidance, checkpointKeyFramesGuidance, finalAssertionGuidance, editorialLinksGuidance,
} from './scenario-rule-definitions.js';

let registryPromise: ReturnType<typeof loadDocumentRegistry> | undefined;
const registry = () => registryPromise ??= loadDocumentRegistry();

export const scenarioRules: readonly ExecutableLintRule[] = [
  { guidance: singleTestPerSpecGuidance, checkExample: async ({ code }) => {
    const audit = auditScenarioSpec(code, await registry());
    return [...(audit.tests.length === 1 ? [] : [`Expected one test; found ${audit.tests.length}.`]), ...audit.issues.map(issue => issue.message)];
  } },
  { guidance: bundleModeGuidance, checkExample: ({ code }) => auditBundleMode(code).issues },
  { guidance: noDirectLocatorsGuidance, checkExample: ({ code }) => auditDirectLocators(code).map(issue => `Direct .locator() at ${issue.line}:${issue.column}.`) },
  { guidance: noRawDataGuidance, checkExample: ({ code }) => auditRawData(code).map(issue => issue.message) },
  { guidance: checkpointKeyFramesGuidance, checkExample: ({ code }) => auditCheckpointKeyFrames(code).map(issue => issue.message) },
  { guidance: finalAssertionGuidance, checkExample: ({ code }) => auditFinalAssertions(code).issues.map(issue => issue.message) },
  { guidance: editorialLinksGuidance, checkExample: async ({ code }) => {
    const documents = await registry();
    return auditEditorialSource(code, { exportNameToId: documents.exportNameToId, conceptIds: new Set(documents.concepts.map(concept => concept.id)) }).map(issue => issue.message);
  } },
];
