#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const sourceRoot = path.resolve(process.argv[2] ?? 'src');
const areasRoot = path.join(sourceRoot, 'areas');
const sourceExtensions = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx']);

function walkFiles(directory) {
  if (!fs.existsSync(directory)) return [];

  const results = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath));
    } else if (sourceExtensions.has(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }
  return results;
}

function areaForRelativePath(relativePath) {
  const parts = relativePath.split(path.sep);
  if (parts[0] === 'sites') return 'sites';
  if (parts[0] === 'site' && parts[1]) return `site/${parts[1]}`;
  return parts[0] || null;
}

function getAreaForPath(filePath) {
  const relativePath = path.relative(areasRoot, filePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return null;
  }
  return areaForRelativePath(relativePath);
}

function extractImportSpecifiers(source) {
  const specifiers = [];
  const staticImportPattern = /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const dynamicImportPattern = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (const pattern of [staticImportPattern, dynamicImportPattern]) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      specifiers.push(match[1]);
    }
  }

  return specifiers;
}

function resolveRelativeImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  return path.resolve(path.dirname(fromFile), specifier);
}

function listAreaNames() {
  const names = [];
  for (const entry of fs.readdirSync(areasRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'site') {
      const siteAreasRoot = path.join(areasRoot, entry.name);
      for (const siteArea of fs.readdirSync(siteAreasRoot, { withFileTypes: true })) {
        if (siteArea.isDirectory()) names.push(`site/${siteArea.name}`);
      }
    } else {
      names.push(entry.name);
    }
  }
  return names.sort();
}

if (!fs.existsSync(areasRoot)) {
  console.log(`✅ No area folders found under ${path.relative(process.cwd(), areasRoot)}`);
  process.exit(0);
}

const areaNames = listAreaNames();
const violations = [];

for (const file of walkFiles(areasRoot)) {
  const fromArea = getAreaForPath(file);
  if (!fromArea) continue;

  const source = fs.readFileSync(file, 'utf8');
  for (const specifier of extractImportSpecifiers(source)) {
    const resolvedPath = resolveRelativeImport(file, specifier);
    if (!resolvedPath) continue;

    const toArea = getAreaForPath(resolvedPath);
    if (toArea && toArea !== fromArea) {
      violations.push({
        file: path.relative(process.cwd(), file),
        fromArea,
        toArea,
        specifier,
      });
    }
  }
}

if (violations.length > 0) {
  console.log(`❌ Found ${violations.length} direct cross-area import(s):`);
  for (const violation of violations) {
    console.log(
      `${violation.file}: ${violation.fromArea} imports ${violation.toArea} via '${violation.specifier}'`,
    );
  }
  process.exit(1);
}

const areaLabel = areaNames.length === 1 ? 'area' : 'areas';
console.log(`✅ Area boundary check passed for ${path.relative(process.cwd(), sourceRoot)} (${areaNames.length} ${areaLabel})`);
