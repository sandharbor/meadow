#!/usr/bin/env node
/**
 * Verifies that app areas stay partitioned from each other.
 *
 * The check walks `<sourceRoot>/areas`, assigns every source file to an area
 * based on its path (`bundles` or `bundle/<name>`), and rejects relative imports
 * that resolve into a different area. Shared code sits outside `areas`, so
 * area-to-shared imports are allowed.
 *
 * For TypeScript files, it also enforces a narrow import dialect: app-local
 * imports from areas must be relative ES module imports. It rejects import
 * aliases, CommonJS `require()`, TypeScript `import = require()`, computed
 * dynamic imports, and project config that would enable path aliases.
 */
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const sourceRoot = path.resolve(process.argv[2] ?? 'src');
const areasRoot = path.join(sourceRoot, 'areas');
const sourceExtensions = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx']);
const strictImportDialectExtensions = new Set(['.ts', '.tsx']);
const unsupportedAppLocalImportPrefixes = [
  '/',
  '@/',
  '~/',
  '@app/',
  '@areas/',
  '@shared/',
  '@src/',
  '#app/',
  '#areas/',
  '#shared/',
  '#src/',
  'app/',
  'areas/',
  'shared/',
  'src/',
];

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
  if (parts[0] === 'bundles') return 'bundles';
  if (parts[0] === 'bundle' && parts[1]) return `bundle/${parts[1]}`;
  return parts[0] || null;
}

function getAreaForPath(filePath) {
  const relativePath = path.relative(areasRoot, filePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return null;
  }
  return areaForRelativePath(relativePath);
}

function extractImportSpecifiersWithRegex(source) {
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

function scriptKindForPath(filePath) {
  switch (path.extname(filePath)) {
    case '.tsx':
      return ts.ScriptKind.TSX;
    case '.jsx':
      return ts.ScriptKind.JSX;
    case '.js':
    case '.mjs':
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}

function isStrictImportDialectFile(filePath) {
  return strictImportDialectExtensions.has(path.extname(filePath));
}

function formatLocation(sourceFile, node) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return {
    line: line + 1,
    column: character + 1,
  };
}

function isAppLocalAliasSpecifier(specifier) {
  if (specifier.startsWith('.')) return false;
  return unsupportedAppLocalImportPrefixes.some((prefix) => specifier.startsWith(prefix));
}

function inspectStrictImportDialect(filePath, source) {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForPath(filePath),
  );
  const specifiers = [];
  const unsupportedSyntax = [];

  function addSpecifier(node, specifier) {
    specifiers.push({
      specifier,
      ...formatLocation(sourceFile, node),
    });
  }

  function addUnsupportedSyntax(node, message) {
    unsupportedSyntax.push({
      message,
      ...formatLocation(sourceFile, node),
    });
  }

  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      if (ts.isStringLiteral(node.moduleSpecifier)) {
        addSpecifier(node.moduleSpecifier, node.moduleSpecifier.text);
      }
    } else if (ts.isImportEqualsDeclaration(node)) {
      addUnsupportedSyntax(node, 'use ES module import syntax instead of TypeScript import = require()');
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const [specifierNode] = node.arguments;
        if (specifierNode && ts.isStringLiteral(specifierNode)) {
          addSpecifier(specifierNode, specifierNode.text);
        } else {
          addUnsupportedSyntax(node, 'dynamic import() must use a single or double quoted string literal');
        }
      } else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
        addUnsupportedSyntax(node, 'use ES module import syntax instead of require()');
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return { specifiers, unsupportedSyntax };
}

function inspectImports(filePath, source) {
  if (isStrictImportDialectFile(filePath)) {
    return inspectStrictImportDialect(filePath, source);
  }

  return {
    specifiers: extractImportSpecifiersWithRegex(source).map((specifier) => ({ specifier })),
    unsupportedSyntax: [],
  };
}

function resolveRelativeImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  return path.resolve(path.dirname(fromFile), specifier);
}

function listAreaNames() {
  const names = [];
  for (const entry of fs.readdirSync(areasRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'bundle') {
      const bundleAreasRoot = path.join(areasRoot, entry.name);
      for (const bundleArea of fs.readdirSync(bundleAreasRoot, { withFileTypes: true })) {
        if (bundleArea.isDirectory()) names.push(`bundle/${bundleArea.name}`);
      }
    } else {
      names.push(entry.name);
    }
  }
  return names.sort();
}

function checkUnsupportedProjectImportConfig() {
  const tsconfigPath = path.join(process.cwd(), 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) return [];

  const parsed = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (parsed.error) return [];

  const compilerOptions = parsed.config?.compilerOptions ?? {};
  const violations = [];

  if (compilerOptions.baseUrl !== undefined) {
    violations.push({
      file: path.relative(process.cwd(), tsconfigPath),
      message: 'compilerOptions.baseUrl enables non-relative app imports; area imports must stay relative',
    });
  }

  if (compilerOptions.paths && Object.keys(compilerOptions.paths).length > 0) {
    violations.push({
      file: path.relative(process.cwd(), tsconfigPath),
      message: 'compilerOptions.paths enables import aliases; area imports must stay relative',
    });
  }

  return violations;
}

if (!fs.existsSync(areasRoot)) {
  console.log(`✅ No area folders found under ${path.relative(process.cwd(), areasRoot)}`);
  process.exit(0);
}

const areaNames = listAreaNames();
const violations = [];
const unsupportedImportSyntax = checkUnsupportedProjectImportConfig();

for (const file of walkFiles(areasRoot)) {
  const fromArea = getAreaForPath(file);
  if (!fromArea) continue;

  const source = fs.readFileSync(file, 'utf8');
  const imports = inspectImports(file, source);

  for (const syntaxViolation of imports.unsupportedSyntax) {
    unsupportedImportSyntax.push({
      file: path.relative(process.cwd(), file),
      ...syntaxViolation,
    });
  }

  for (const importReference of imports.specifiers) {
    if (isStrictImportDialectFile(file) && isAppLocalAliasSpecifier(importReference.specifier)) {
      unsupportedImportSyntax.push({
        file: path.relative(process.cwd(), file),
        line: importReference.line,
        column: importReference.column,
        message: `app-local imports from areas must be relative, not '${importReference.specifier}'`,
      });
      continue;
    }

    const resolvedPath = resolveRelativeImport(file, importReference.specifier);
    if (!resolvedPath) continue;

    const toArea = getAreaForPath(resolvedPath);
    if (toArea && toArea !== fromArea) {
      violations.push({
        file: path.relative(process.cwd(), file),
        fromArea,
        toArea,
        specifier: importReference.specifier,
      });
    }
  }
}

if (unsupportedImportSyntax.length > 0) {
  console.log(`❌ Found ${unsupportedImportSyntax.length} unsupported area import pattern(s):`);
  for (const violation of unsupportedImportSyntax) {
    const location = violation.line ? `:${violation.line}:${violation.column}` : '';
    console.log(`${violation.file}${location}: ${violation.message}`);
  }
  process.exit(1);
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
