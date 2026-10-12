#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAreaBoundaries, walkBoundarySources } from './area_boundary_check.js';
import { appAreaSurfaces } from './area_boundary_policy.js';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { roots, contractRoots } = appAreaSurfaces(appRoot);
const violations = checkAreaBoundaries({
  sourceRoot: contractRoots[0],
  otherSourceRoots: roots.filter(root => root !== contractRoots[0]),
  contractRoots,
  contractsOnly: true,
  consumerFiles: walkBoundarySources(appRoot),
});
for (const { file, line, message } of violations) console.log(`${path.relative(appRoot, file)}:${line}: ${message}`);
if (violations.length) {
  console.log(`❌ ${violations.length} contract ownership violation(s).`);
  process.exitCode = 1;
} else console.log('✅ Contract types belong to their own app area or a named shared owner.');
