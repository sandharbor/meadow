#!/usr/bin/env node
/**
 * Verifies that area-owned backend route files declare routes for their area.
 *
 * For example, files under `areas/site/curation/routes` may expose
 * `/curation/...` or `/sites/:siteSlug/curation/...` paths, while
 * `areas/site/review/routes` may expose review paths. This catches handlers
 * that drift into the wrong route file even when imports still respect area
 * boundaries.
 */
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const sourceRoot = path.resolve(process.argv[2] ?? 'src');
const areasRoot = path.join(sourceRoot, 'areas');
const sourceExtensions = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx']);
const routerMethods = new Set(['delete', 'get', 'patch', 'post', 'put']);

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

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

function formatLocation(sourceFile, node) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return {
    line: line + 1,
    column: character + 1,
  };
}

function stringLiteralText(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

function inspectRouterCalls(filePath, source) {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForPath(filePath),
  );
  const routes = [];
  const unsupported = [];

  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const receiver = node.expression.expression;
      const method = node.expression.name.text;

      if (ts.isIdentifier(receiver) && receiver.text === 'router' && routerMethods.has(method)) {
        const [routePathNode] = node.arguments;
        const routePath = stringLiteralText(routePathNode);

        if (routePath === null) {
          unsupported.push({
            method,
            ...formatLocation(sourceFile, node.expression.name),
            message: `router.${method}() must use a string literal route path`,
          });
        } else {
          routes.push({
            method,
            routePath,
            ...formatLocation(sourceFile, routePathNode),
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { routes, unsupported };
}

function routeSegments(routePath) {
  return routePath.split('/').filter(Boolean);
}

function routeMatchesArea(area, routePath) {
  const segments = routeSegments(routePath);

  if (area === 'sites') {
    return segments[0] === 'sites';
  }

  if (area.startsWith('site/')) {
    const expectedSegment = area.slice('site/'.length);
    return (
      segments[0] === expectedSegment ||
      (segments[0] === 'sites' && segments[2] === expectedSegment)
    );
  }

  return segments[0] === area;
}

if (!fs.existsSync(areasRoot)) {
  console.log(`No area folders found under ${path.relative(process.cwd(), areasRoot)}`);
  process.exit(0);
}

const violations = [];
const unsupportedRoutes = [];

for (const file of walkFiles(areasRoot)) {
  const area = getAreaForPath(file);
  if (!area) continue;

  const source = fs.readFileSync(file, 'utf8');
  const { routes, unsupported } = inspectRouterCalls(file, source);
  const relativeFile = toPosixPath(path.relative(process.cwd(), file));

  for (const unsupportedRoute of unsupported) {
    unsupportedRoutes.push({
      file: relativeFile,
      ...unsupportedRoute,
    });
  }

  for (const route of routes) {
    if (!routeMatchesArea(area, route.routePath)) {
      violations.push({
        file: relativeFile,
        area,
        ...route,
      });
    }
  }
}

if (unsupportedRoutes.length > 0) {
  console.log(`Found ${unsupportedRoutes.length} unsupported area route declaration(s):`);
  for (const route of unsupportedRoutes) {
    console.log(`${route.file}:${route.line}:${route.column}: ${route.message}`);
  }
  process.exit(1);
}

if (violations.length > 0) {
  console.log(`Found ${violations.length} route(s) declared from the wrong area:`);
  for (const violation of violations) {
    console.log(
      `${violation.file}:${violation.line}:${violation.column}: ${violation.area} declares ${violation.method.toUpperCase()} ${violation.routePath}`,
    );
  }
  process.exit(1);
}

console.log(`Area route check passed for ${path.relative(process.cwd(), sourceRoot)}`);
