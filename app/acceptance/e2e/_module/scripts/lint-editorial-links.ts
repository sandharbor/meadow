/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { loadDocumentRegistry } from '../../../../concepts/loadRegistry.js';
import { editorialLinkIssues } from './editorial-links.js';
import { scenarioMetadataIssues } from './scenario-metadata.js';

const args = process.argv.slice(2);
const usage = 'Usage: lint-editorial-links.ts <spec.spec.ts or directory> [...paths]\nAudits selected specs for captured metadata and concept links in descriptions and every section.\nExit 1 means findings; link relevance, claims, and cohesion still require review.';
if (args.includes('--help')) {
  console.log(usage);
} else if (!args.length || args.some(arg => arg.startsWith('-'))) {
  console.error(usage);
  process.exitCode = 2;
} else {
  try {
    const specs = new Set<string>();
    for (const arg of args) {
      const selected = path.resolve(arg);
      if (statSync(selected).isDirectory()) {
        for (const file of readdirSync(selected, { recursive: true })) {
          if (typeof file === 'string' && file.endsWith('.spec.ts')) specs.add(path.join(selected, file));
        }
      } else if (selected.endsWith('.spec.ts')) specs.add(selected);
      else throw new Error(`Expected a .spec.ts file or directory: ${arg}`);
    }
    if (!specs.size) throw new Error('No .spec.ts files found in the selected paths.');
    const registry = await loadDocumentRegistry();
    const index = { exportNameToId: registry.exportNameToId, conceptIds: new Set(registry.concepts.map(concept => concept.id)) };
    let findings = 0;
    for (const file of [...specs].sort()) {
      const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
      const issues = [...scenarioMetadataIssues(source), ...editorialLinkIssues(source, index)];
      for (const issue of issues) console.error(`${path.relative(process.cwd(), file)}:${issue.line}: ${issue.message}`);
      findings += issues.length;
    }
    console.log(`${specs.size} selected spec(s), ${findings} finding(s). Presence checks only; review relevance, evidence, and cohesion separately.`);
    if (findings) process.exitCode = 1;
  } catch (error) {
    console.error(String(error));
    process.exitCode = 2;
  }
}
