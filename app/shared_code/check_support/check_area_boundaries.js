#!/usr/bin/env node
/** All production area consumers use narrow, caller-specific exported.ts APIs. */
import path from 'node:path';
import { checkAreaBoundaries } from './area_boundary_check.js';
import { appAreaSurfaces } from './area_boundary_policy.js';

const sourceRoot = path.resolve(process.argv[2] ?? 'src');
// Register both surfaces to prevent imports across service/web source roots.
const appRoot = path.resolve(sourceRoot, '../../..');
const { roots, contractRoots, implementationFamilies } = appAreaSurfaces(appRoot);
const otherSourceRoots = roots.filter(root => root !== sourceRoot);
const violations = checkAreaBoundaries({ sourceRoot, otherSourceRoots, contractRoots, implementationFamilies });
for (const { file, line, message } of violations) console.log(`${path.relative(process.cwd(), file)}:${line}: ${message}`);
if (violations.length) {
  console.log(`❌ ${violations.length} app-area boundary violation(s).`);
  process.exitCode = 1;
} else console.log('✅ App-area interfaces and caller boundaries passed (including shell and shared consumers).');
