/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { renderLintRule } from './lint-rule.js';
import { lintRuleGuidance } from './rule-guidance.js';

const requested = process.argv.slice(2);
if (requested.length === 1 && requested[0] === '--list') {
  for (const rule of lintRuleGuidance) console.log(`${rule.id}\t${rule.enforcement}\t${rule.title}`);
} else {
  const unknown = requested.filter(id => !lintRuleGuidance.some(rule => rule.id === id));
  if (unknown.length) {
    console.error(`Unknown rule(s): ${unknown.join(', ')}. Use --list to see the available rules.`);
    process.exitCode = 2;
  } else {
    console.log('E2E authoring rules — live reference\n');
    console.log('These definitions also supply lint failure guidance. Quickcheck executes their valid and invalid examples against the real validators.\n');
    for (const rule of lintRuleGuidance.filter(rule => !requested.length || requested.includes(rule.id))) {
      console.log(renderLintRule(rule));
      console.log('\n' + '─'.repeat(72) + '\n');
    }
    console.log('These are executable constraints. The E2E skill and its quality reference cover editorial judgment, including cohesion, useful checkpoints, link relevance, and sufficient evidence.');
  }
}
