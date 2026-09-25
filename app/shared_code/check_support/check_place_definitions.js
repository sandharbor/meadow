#!/usr/bin/env node
// Place definitions under contracts/places mirror app-area ownership:
// areas/<area>.ts belongs to that area and shared/<folder>.ts to that shared
// owner. Owner files import only the shared place types, and every other
// caller reaches them through contracts/places/index.ts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const placesRoot = path.join(appRoot, 'contracts/places');
const ownerDirectories = [path.join(placesRoot, 'areas'), path.join(placesRoot, 'shared')];
const violations = [];

function walk(directory, visit) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git'].includes(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, visit);
    else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) visit(full);
  }
}

function imports(file) {
  const source = fs.readFileSync(file, 'utf8');
  return [...source.matchAll(/(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)]
    .map(match => match[1] ?? match[2])
    .filter(specifier => specifier.startsWith('.'))
    .map(specifier => path.resolve(path.dirname(file), specifier.replace(/\.js$/, '.ts')));
}

function expectedOwner(file) {
  const relative = path.relative(placesRoot, file).replace(/\.ts$/, '').split(path.sep);
  if (relative[0] === 'shared') return relative[1] === 'app-shell' ? 'appShell' : relative[1];
  return relative[1] === 'bundle' ? relative[2] : relative[1];
}

for (const directory of ownerDirectories) {
  walk(directory, file => {
    const owner = /owner:\s*'([^']+)'/.exec(fs.readFileSync(file, 'utf8'))?.[1];
    if (owner !== expectedOwner(file)) violations.push(`${path.relative(appRoot, file)}: owner must be '${expectedOwner(file)}'`);
    for (const target of imports(file)) {
      if (target !== path.join(placesRoot, 'types.ts')) violations.push(`${path.relative(appRoot, file)}: place owners import only ../types.js`);
    }
  });
}

for (const top of ['clients', 'runtime', 'tooling', 'acceptance', 'contracts', 'shared_code', 'hosts']) {
  const root = path.join(appRoot, top);
  if (!fs.existsSync(root)) continue;
  walk(root, file => {
    if (file === path.join(placesRoot, 'index.ts')) return;
    for (const target of imports(file)) {
      if (ownerDirectories.some(directory => target.startsWith(directory + path.sep))) {
        violations.push(`${path.relative(appRoot, file)}: import places from contracts/places/index.js, not an owner's definitions`);
      }
    }
  });
}

if (violations.length > 0) {
  console.log(violations.join('\n'));
  console.log(`❌ ${violations.length} place definition violation(s).`);
  process.exitCode = 1;
} else console.log('✅ Place definitions follow app-area ownership.');
