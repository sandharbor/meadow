/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { scenarioRuleGuidance } from './rules/scenario-rule-definitions.js';
import { projectRuleGuidance } from './rules/project-rule-definitions.js';

/** Data-only projection: reading authoring advice never executes the validators. */
export const lintRuleGuidance = [...scenarioRuleGuidance, ...projectRuleGuidance];
