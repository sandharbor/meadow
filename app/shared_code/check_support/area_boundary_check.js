import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { AREA_CALLERS, INTERFACE_GUIDANCE, WIDTH_MESSAGE, canonical, inside, ownership, publicName, resolveLocal, isAppAlias } from './area_boundary_policy.js';

const extensions = /\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/;
const excludedFolders = new Set(['node_modules', 'dist', 'build', '.git']);
const isTest = file => /(?:^|\/)(?:test|tests|__tests__)\/|\.(?:test|spec)\.[^.]+$/.test(file);
const isSource = file => extensions.test(file) && !file.endsWith('.d.ts') && !file.split(path.sep).some(part => excludedFolders.has(part));
function walk(directory, seen = new Set()) {
  if (!fs.existsSync(directory)) return [];
  const real = canonical(directory);
  if (seen.has(real)) return [];
  seen.add(real);
  return fs.readdirSync(directory).flatMap(name => {
    if (excludedFolders.has(name)) return [];
    const file = path.join(directory, name);
    return fs.statSync(file).isDirectory() ? walk(file, seen) : isSource(file) ? [canonical(file)] : [];
  });
}

/** Check source, configured production consumers, and their local import closure. */
export function checkAreaBoundaries({ sourceRoot, otherSourceRoots = [], consumerFiles = [], tsconfigPath = path.join(sourceRoot, '../tsconfig.json'), web = sourceRoot.includes('/clients/web/') }) {
  sourceRoot = canonical(sourceRoot);
  const roots = [sourceRoot, ...otherSourceRoots.map(canonical)];
  const violations = [], parsed = new Map(), interfaces = new Map();
  const report = (file, node, message) => {
    const source = parsed.get(file);
    const line = source && node ? source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 : 1;
    violations.push({ file, line, message });
  };
  const parse = file => {
    if (!parsed.has(file)) parsed.set(file, ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true));
    return parsed.get(file);
  };
  let configFiles = [];
  if (fs.existsSync(tsconfigPath)) {
    const read = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (read.error) report(tsconfigPath, null, ts.flattenDiagnosticMessageText(read.error.messageText, '\n'));
    else {
      const config = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(tsconfigPath));
      configFiles = config.fileNames;
      if (config.options.baseUrl || Object.keys(config.options.paths ?? {}).length) report(tsconfigPath, null, 'Area imports must stay relative; baseUrl and paths aliases are forbidden, including inherited configuration.');
    }
  }
  function interfaceExports(file, owner) {
    if (interfaces.has(file)) return interfaces.get(file);
    const entries = new Map();
    interfaces.set(file, entries);
    const source = parse(file);
    const guidance = source.text.match(/\/\*\*[\s\S]*?\*\//g)?.some(comment => comment.replace(/^\s*\* ?/gm, '').includes(INTERFACE_GUIDANCE));
    if (!guidance) report(file, null, 'exported.ts must include the narrow-interface guidance comment (see area_boundary_policy.js).');
    if (source.text.trimEnd().split(/\r?\n/).length > 100) report(file, null, `exported.ts exceeds 100 lines. ${WIDTH_MESSAGE}`);
    let count = 0;
    for (const statement of source.statements) {
      if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)
        || !statement.exportClause || !ts.isNamedExports(statement.exportClause)) {
        report(file, statement, 'exported.ts permits only explicit named re-exports from owned implementation files; no implementation, imports, defaults, or wildcard exports.');
        continue;
      }
      const target = resolveLocal(file, statement.moduleSpecifier.text);
      const targetOwner = target && ownership(target, roots);
      if (!target || !fs.existsSync(target) || targetOwner?.root !== owner.root || targetOwner?.area !== owner.area || target === file) report(file, statement, 'Public interfaces must re-export their own area implementation, never shared code or another interface.');
      for (const element of statement.exportClause.elements) {
        count++;
        const name = element.name.text, typeOnly = statement.isTypeOnly || element.isTypeOnly;
        const caller = publicName(name, typeOnly, web);
        if (!caller) report(file, element, `Invalid public name '${name}': use an allowed caller followed by Command/Query; types use CallerType, web UI uses CallerComponent/useCallerState, and shell routers use appShellRouter. No general prefix.`);
        if (entries.has(name)) report(file, element, `Duplicate public export '${name}'.`);
        entries.set(name, { caller, typeOnly });
      }
    }
    if (count > 15) report(file, null, `exported.ts exceeds 15 named exports (${count}). ${WIDTH_MESSAGE}`);
    return entries;
  }
  const queue = [...walk(sourceRoot), ...configFiles, ...consumerFiles].filter(file => isSource(file) && (inside(sourceRoot, file) || !isTest(file)));
  const visited = new Set();
  for (let file of queue) {
    file = canonical(file);
    if (visited.has(file) || !fs.existsSync(file)) continue;
    visited.add(file);
    const owner = ownership(file, roots), source = parse(file);
    if (owner.area && !AREA_CALLERS.has(owner.area)) report(file, null, `Unknown app area '${owner.area}'; callers require an explicit entry in the closed area registry.`);
    if (file === owner.interface) interfaceExports(file, owner);
    const foreignBindings = new Set();
    function reference(node, specifier) {
      if (isAppAlias(specifier)) report(file, node, `App-local imports must be relative, not '${specifier}'.`);
      const target = resolveLocal(file, specifier);
      if (!target) return;
      if (isSource(target)) queue.push(target);
      const destination = ownership(target, roots);
      if (!destination.area || (owner.area === destination.area && owner.root === destination.root)) return;
      if (target !== destination.interface) { report(file, node, `Private ${destination.area} import: callers must use that area's exported.ts.`); return; }
      if (!fs.existsSync(target)) { report(file, node, 'Missing area exported.ts.'); return; }
      const api = interfaceExports(target, destination);
      if (!owner.caller || owner.root !== destination.root) {
        report(file, node, 'This caller has no area-interface permission. Only registered areas and shared/app-shell may call area APIs; genuinely shared capabilities belong in shared.'); return;
      }
      if (!ts.isImportDeclaration(node) || node.importClause?.name || !node.importClause?.namedBindings || !ts.isNamedImports(node.importClause.namedBindings)) {
        report(file, node, 'Cross-area access requires named imports; no default, namespace, side-effect, dynamic/type-import expressions, or re-exports.'); return;
      }
      for (const element of node.importClause.namedBindings.elements) {
        const name = (element.propertyName ?? element.name).text;
        foreignBindings.add(element.name.text);
        const exported = api.get(name);
        if (!exported || exported.caller !== owner.caller) report(file, element, `'${name}' is not exported for caller '${owner.caller}'. Local aliases cannot change the permitted caller.`);
        if (exported?.typeOnly && !(node.importClause.isTypeOnly || element.isTypeOnly)) report(file, element, `Import '${name}' with import type.`);
      }
    }
    function visit(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) reference(node, node.moduleSpecifier.text);
      else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) reference(node, node.argument.literal.text);
      else if (ts.isImportEqualsDeclaration(node)) report(file, node, 'Use named ES module imports instead of import = require().');
      else if (ts.isCallExpression(node)) {
        if (ts.isPropertyAccessExpression(node.expression) && node.expression.expression.getText(source) === 'import.meta'
          && node.expression.name.text.startsWith('glob')) {
          const pattern = node.arguments[0];
          // The sole reviewed glob discovers providers; their source files are
          // checked through tsconfig. It cannot be widened to include areas.
          if (!(file === path.join(sourceRoot, 'shared/publishing-provider-host/providerRegistry.ts')
            && node.expression.name.text === 'glob' && pattern && ts.isStringLiteral(pattern)
            && pattern.text === '../../../../../publishing_providers/*/frontend/index.tsx')) {
            report(file, node, 'Glob imports are reserved for provider discovery; app areas require named static imports.');
          }
        }
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          const argument = node.arguments[0];
          if (argument && ts.isStringLiteral(argument)) reference(node, argument.text);
          else if (!(file === path.join(sourceRoot, 'shared/module-loading/importExtensionModule.ts') && node.getText(source) === 'import(moduleUrl.href)')) report(file, node, 'Dynamic import() must use a string literal so its boundary can be checked.');
        } else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') report(file, node, 'Use ES module imports instead of require().');
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    function containsForeignValue(node) {
      // Calling an operation inside a workflow is legitimate orchestration;
      // exposing the imported function itself (including in an object) is not.
      if (ts.isFunctionLike(node) || ts.isCallExpression(node)) return false;
      if (ts.isIdentifier(node) && foreignBindings.has(node.text)) return true;
      return ts.forEachChild(node, containsForeignValue) ?? false;
    }
    for (const statement of source.statements) {
      if ((ts.isExportAssignment(statement) && containsForeignValue(statement.expression))
        || (ts.isVariableStatement(statement) && statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
          && statement.declarationList.declarations.some(declaration => declaration.initializer && containsForeignValue(declaration.initializer)))) {
        report(file, statement, 'Do not expose another area’s API as a default, alias, or object property.');
      }
      if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          if (foreignBindings.has((element.propertyName ?? element.name).text)) report(file, element, 'Do not re-export another area’s API from a consumer.');
        }
      }
    }
  }
  return violations;
}
