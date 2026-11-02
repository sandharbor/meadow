/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

export interface LintRuleExample {
  name: string;
  code: string;
  expected: 'pass' | 'fail';
}

/** Authoring advice and failure guidance share these source-owned definitions. */
export interface LintRuleGuidance {
  id: string;
  title: string;
  script: string;
  enforcement: 'quickcheck' | 'selected-spec';
  why: string;
  requirements: readonly string[];
  repair: string;
  examples: readonly LintRuleExample[];
}

export interface ExecutableLintRule {
  guidance: LintRuleGuidance;
  /** Exercise the same validator called by the lint, using the displayed input. */
  checkExample: (example: LintRuleExample) => readonly string[] | Promise<readonly string[]>;
}

export function renderLintRule(rule: LintRuleGuidance): string {
  return [
    `${rule.title} (${rule.id})`,
    `Enforcement: ${rule.enforcement === 'quickcheck' ? 'workspace quickcheck' : 'selected-spec editorial audit'}`,
    `Checker: ${rule.script}`,
    '', 'Why', rule.why,
    '', 'Requirements', ...rule.requirements.map(requirement => `- ${requirement}`),
    '', 'How to fix', rule.repair,
    ...rule.examples.flatMap(example => ['', `${example.expected === 'pass' ? 'Valid' : 'Invalid'} example: ${example.name}`, example.code]),
  ].join('\n');
}
