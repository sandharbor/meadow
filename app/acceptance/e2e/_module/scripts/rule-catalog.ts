/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { scenarioRules } from './rules/scenario-rules.js';
import { projectRules } from './rules/project-rules.js';

export const lintRules = [...scenarioRules, ...projectRules];
