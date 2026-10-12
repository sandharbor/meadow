/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import ts from 'typescript';

export function isScenarioTestCall(node: ts.Node): node is ts.CallExpression {
  if (!ts.isCallExpression(node) || node.arguments.length < 2) return false;
  const callback = node.arguments.at(-1)!;
  if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) return false;
  const callee = node.expression;
  return ts.isIdentifier(callee) ? callee.text === 'test'
    : ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === 'test'
      && ['only', 'skip', 'fixme'].includes(callee.name.text);
}

/** Check authored metadata and its actual connection to the captured test annotations. */
export function scenarioMetadataIssues(source: ts.SourceFile): { line: number; message: string }[] {
  const issues: { line: number; message: string }[] = [];
  const report = (node: ts.Node, message: string) => issues.push({ line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, message });
  const imports = new Map<string, string>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)
      || !statement.moduleSpecifier.text.endsWith('/concepts/index.js') || statement.importClause?.isTypeOnly) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) for (const entry of bindings.elements) {
      if (!entry.isTypeOnly) imports.set(entry.name.text, entry.propertyName?.text ?? entry.name.text);
    }
  }
  const declarations = new Map<string, ts.VariableDeclaration>();
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement) || !(statement.declarationList.flags & ts.NodeFlags.Const)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) declarations.set(declaration.name.text, declaration);
    }
  }
  const metadata = (variable: string, helper: string, test: ts.Node) => {
    const declaration = declarations.get(variable);
    const call = declaration?.initializer;
    if (!declaration || !call || !ts.isCallExpression(call) || !ts.isIdentifier(call.expression)
      || imports.get(call.expression.text) !== helper || declaration.getStart(source) > test.getStart(source)) {
      report(test, `Declare const ${variable} = ${helper}(conceptText\`…\`) before the test, importing the helper from concepts/index.js.`);
      return;
    }
    const text = call.arguments[0];
    if (call.arguments.length !== 1 || !text || !ts.isTaggedTemplateExpression(text) || !ts.isIdentifier(text.tag)
      || imports.get(text.tag.text) !== 'conceptText'
      || (ts.isNoSubstitutionTemplateLiteral(text.template) && !text.template.text.trim())) {
      report(declaration, `${helper} requires non-empty typed conceptText prose.`);
    }
  };
  const importedIdentifiers = (node: ts.Expression | undefined) => !!node && ts.isArrayLiteralExpression(node)
    && node.elements.every(element => ts.isIdentifier(element) && imports.has(element.text));
  const areas = (test: ts.Node) => {
    const declaration = declarations.get('areas');
    const call = declaration?.initializer;
    if (!declaration || !call || !ts.isCallExpression(call) || !ts.isIdentifier(call.expression)
      || imports.get(call.expression.text) !== 'scenarioAreas' || declaration.getStart(source) > test.getStart(source)) {
      report(test, 'Declare const areas = scenarioAreas([...app areas], { subAreas: [...] }) before the test, importing the helper from concepts/index.js; use [] for a scenario outside every app area.');
      return;
    }
    const [appAreas, options, ...rest] = call.arguments;
    const subAreas = options && ts.isObjectLiteralExpression(options) && options.properties.length === 1
      && ts.isPropertyAssignment(options.properties[0]) && options.properties[0].name.getText(source) === 'subAreas'
      ? options.properties[0].initializer : undefined;
    if (rest.length || !importedIdentifiers(appAreas) || (options && !importedIdentifiers(subAreas))) {
      report(declaration, 'scenarioAreas takes a literal list of app area concepts and an optional { subAreas: [...] } list, all imported from concepts/index.js.');
    }
  };
  const property = (node: ts.Node | undefined, variable: string, member: string) => !!node && ts.isPropertyAccessExpression(node)
    && ts.isIdentifier(node.expression) && node.expression.text === variable && node.name.text === member;
  const visit = (node: ts.Node) => {
    if (isScenarioTestCall(node)) {
      metadata('name', 'linkedScenarioName', node);
      metadata('description', 'linkedScenarioDescription', node);
      areas(node);
      if (declarations.has('pressures') || [...imports.values()].includes('scenarioDesignPressures')) {
        const declaration = declarations.get('pressures');
        const call = declaration?.initializer;
        if (!declaration || !call || !ts.isCallExpression(call) || !ts.isIdentifier(call.expression)
          || imports.get(call.expression.text) !== 'scenarioDesignPressures' || call.arguments.length !== 1
          || !importedIdentifiers(call.arguments[0]) || declaration.getStart(source) > node.getStart(source)) {
          report(node, 'Declare const pressures = scenarioDesignPressures([...imported design pressures]) before the test.');
        }
      }
      const name = declarations.get('name'), description = declarations.get('description');
      if (name && description && name.getStart(source) > description.getStart(source)) report(description, 'Declare the scenario name before its description.');
      if (!property(node.arguments[0], 'name', 'name')) report(node, 'Use name.name as the test title.');
      const options = node.arguments[1];
      const annotation = ts.isObjectLiteralExpression(options)
        ? options.properties.find((entry): entry is ts.PropertyAssignment => ts.isPropertyAssignment(entry) && entry.name.getText(source) === 'annotation')?.initializer : undefined;
      for (const variable of ['name', 'description', 'areas', ...(declarations.has('pressures') ? ['pressures'] : [])]) {
        if (!annotation || !ts.isArrayLiteralExpression(annotation) || !annotation.elements.some(entry => property(entry, variable, 'annotation'))) {
          report(node, `Include ${variable}.annotation in the test's annotation array.`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return issues;
}
