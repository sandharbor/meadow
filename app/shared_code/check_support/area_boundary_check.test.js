import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { checkAreaBoundaries, walkBoundarySources } from './area_boundary_check.js';
import { INTERFACE_GUIDANCE, appAreaSurfaces } from './area_boundary_policy.js';

const guidance = '/**\n' + INTERFACE_GUIDANCE.split('\n').map(line => ' * ' + line).join('\n') + '\n */\n';
test('source discovery skips generated test workspaces and caches, including transient symlinks', t => {
  const f = fixture(t);
  const source = f.write('app/contracts/types/areas/bundle/sourcing/identity.ts', 'export type Identity = string;');
  for (const folder of ['config_workspace', 'scratch_config_folder', 'expected_results', 'node_modules', '.linkrange-cache']) {
    const file = f.write(`app/test/${folder}/generated.ts`, 'export type Generated = string;');
    fs.symlinkSync(path.join(f.directory, 'deleted-test-output'), path.join(path.dirname(file), 'transient'));
  }
  assert.deepEqual(walkBoundarySources(path.join(f.directory, 'app')), [source]);
});
test('source discovery skips third-party renderers vendored for generated bundles, by name only', t => {
  const f = fixture(t);
  const shared = 'app/runtime/service/src/areas/bundle/generation/html/shared';
  for (const name of ['excalidraw-vendor.js', 'mermaid.min.js', 'pdf-vendor.js', 'pdf-worker.js']) {
    f.write(`${shared}/${name}`, 'import(location.href);');
  }
  const appScript = f.write(`${shared}/meadow-pdf.js`, 'window.MeadowPdf;');
  assert.deepEqual(walkBoundarySources(path.join(f.directory, 'app')), [appScript]);
});
function fixture(t) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'area-boundaries-')));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const write = (relative, content) => {
    const file = path.join(directory, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); return file;
  };
  write('src/areas/bundle/curation/internal.ts', 'export function assess() {}\nexport type Result = string;');
  const api = (content = "export { assess as sourcingQuerySensitivity } from './internal.js';") => write('src/areas/bundle/curation/exported.ts', guidance + content);
  api();
  const caller = (text, owner = 'areas/bundle/sourcing') => write(`src/${owner}/consumer.ts`, text);
  const check = (options = {}) => checkAreaBoundaries({ sourceRoot: path.join(directory, 'src'), ...options });
  const messages = options => check(options).map(result => result.message).join('\n');
  return { directory, write, api, caller, check, messages };
}

test('a named public query is available to its actual area caller, even under a local alias', t => {
  const f = fixture(t); f.caller("import { sourcingQuerySensitivity as assess } from '../curation/exported.js'; assess();");
  assert.deepEqual(f.check(), []);
});
test('same-area implementation and genuinely shared data imports remain private and usable', t => {
  const f = fixture(t); f.write('src/shared/record.ts', 'export const record = 1;');
  f.caller("import { assess } from './internal.js'; import { record } from '../../../shared/record.js';", 'areas/bundle/curation');
  assert.deepEqual(f.check(), []);
});
for (const owner of ['areas/bundle/sourcing', 'shared/app-shell', 'shared/helpers']) {
  test(`${owner} cannot import another area's private implementation`, t => {
    const f = fixture(t), prefix = owner.startsWith('areas/') ? '../curation' : '../../areas/bundle/curation';
    f.caller(`import { assess } from '${prefix}/internal.js';`, owner);
    assert.match(f.messages(), /Private bundle\/curation import/);
  });
}
test('shell is explicitly permitted only for its own public operations', t => {
  const f = fixture(t); f.api("export { assess as appShellQuerySensitivity } from './internal.js';");
  f.caller("import { appShellQuerySensitivity } from '../../areas/bundle/curation/exported';", 'shared/app-shell');
  assert.deepEqual(f.check(), []);
  f.caller("import { appShellQuerySensitivity as sourcingQuerySensitivity } from '../curation/exported.js';");
  assert.match(f.messages(), /not exported for caller 'sourcing'/);
});
test('shared code has no implicit caller permission', t => {
  const f = fixture(t); f.caller("import { sourcingQuerySensitivity } from '../../areas/bundle/curation/exported';", 'shared/helpers');
  assert.match(f.messages(), /no area-interface permission/);
});
for (const name of ['generalQuerySensitivity', 'genericQuerySensitivity', 'newAreaQuerySensitivity', 'sourcingSensitivity']) {
  test(`public operation ${name} is rejected by the closed naming vocabulary`, t => {
    const f = fixture(t); f.api(`export { assess as ${name} } from './internal.js';`);
    assert.match(f.messages(), /Invalid public name/);
  });
}
for (const declaration of [
  "import curation from '../curation/exported.js';",
  "import * as curation from '../curation/exported.js';",
  "import '../curation/exported.js';",
  "const curation = import('../curation/exported.js');",
  "type Curation = typeof import('../curation/exported.js');",
  "export { sourcingQuerySensitivity } from '../curation/exported.js';",
  "export * from '../curation/exported.js';",
]) {
  test(`cross-area access must be explicit: ${declaration}`, t => {
    const f = fixture(t); f.caller(declaration); assert.match(f.messages(), /requires named imports/);
  });
}
test('a renamed local binding cannot be re-exported to launder an area API', t => {
  const f = fixture(t); f.caller("import { sourcingQuerySensitivity as assess } from '../curation/exported.js'; export { assess as generalQuery }; ");
  assert.match(f.messages(), /Do not re-export/);
});
for (const declaration of ["export * from './internal.js';", 'export default function sourcingQuery() {}', 'export const sourcingQueryFoo = () => 1;']) {
  test(`public interfaces stay a small list of named declarations: ${declaration}`, t => {
    const f = fixture(t); f.api(declaration); assert.match(f.messages(), /only explicit named re-exports/);
  });
}
test('interfaces cannot expose shared or foreign implementation behind a caller alias', t => {
  const f = fixture(t); f.write('src/shared/data.ts', 'export const record = 1;');
  f.api("export { record as sourcingQueryRecord } from '../../../shared/data.js';");
  assert.match(f.messages(), /their own area implementation/);
});
test('public interfaces require architectural guidance even when no consumer imports them', t => {
  const f = fixture(t); f.write('src/areas/bundle/curation/exported.ts', "export { assess as sourcingQuerySensitivity } from './internal.js';");
  assert.match(f.messages(), /guidance comment/);
});
test('the line limit includes comments and reports architectural guidance', t => {
  const f = fixture(t); f.api('// explanatory line\n'.repeat(100));
  assert.match(f.messages(), /exceeds 100 lines.*Keep areas isolated/);
});
test('a compact one-line interface still cannot exceed 15 named exports', t => {
  const f = fixture(t); f.api(`export { ${Array.from({ length: 16 }, (_, i) => `assess as sourcingQueryCase${i}`).join(', ')} } from './internal.js';`);
  assert.match(f.messages(), /exceeds 15 named exports/);
});
test('the documented width limits accept exactly 100 lines and 15 exports', t => {
  const f = fixture(t); f.api(`export { ${Array.from({ length: 15 }, (_, i) => `assess as sourcingQueryCase${i}`).join(', ')} } from './internal.js';`);
  const file = path.join(f.directory, 'src/areas/bundle/curation/exported.ts');
  const text = fs.readFileSync(file, 'utf8'); fs.writeFileSync(file, text + '\n' + '// padding\n'.repeat(100 - text.split('\n').length));
  assert.equal(fs.readFileSync(file, 'utf8').trimEnd().split('\n').length, 100);
  assert.deepEqual(f.check(), []);
});
test('type exports retain caller ownership and require type imports', t => {
  const f = fixture(t); f.api("export type { Result as SourcingTypeSensitivity } from './internal.js';");
  f.caller("import type { SourcingTypeSensitivity as Result } from '../curation/exported.js';");
  assert.deepEqual(f.check(), []);
  f.caller("import { SourcingTypeSensitivity } from '../curation/exported.js';");
  assert.match(f.messages(), /with import type/);
});
test('UI components and state hooks have distinct caller-scoped names on the web surface', t => {
  const f = fixture(t); f.api("export { assess as AppShellComponentPanel, assess as useAppShellStatePanel } from './internal.js';");
  f.caller("import { AppShellComponentPanel, useAppShellStatePanel } from '../../areas/bundle/curation/exported.js';", 'shared/app-shell');
  assert.deepEqual(f.check({ web: true }), []);
  assert.match(f.messages({ web: false }), /Invalid public name/);
});
test('symlinked private files cannot masquerade as shared implementation', t => {
  const f = fixture(t); f.write('src/shared/placeholder.ts', '');
  fs.symlinkSync('../areas/bundle/curation/internal.ts', path.join(f.directory, 'src/shared/disguised.ts'));
  f.caller("import { assess } from '../../../shared/disguised.js';");
  assert.match(f.messages(), /Private bundle\/curation import/);
});
test('extensionless directory imports resolve private index files', t => {
  const f = fixture(t); f.write('src/areas/bundle/curation/secret/index.ts', 'export const secret = 1;');
  f.caller("import { secret } from '../curation/secret';"); assert.match(f.messages(), /Private bundle\/curation import/);
});
test('external production consumers in tsconfig are checked too', t => {
  const f = fixture(t); f.write('provider/consumer.ts', "import { assess } from '../src/areas/bundle/curation/internal.js';");
  f.write('tsconfig.json', JSON.stringify({ include: ['src', 'provider'] }));
  assert.match(f.messages(), /Private bundle\/curation import/);
});
test('inherited tsconfig aliases cannot conceal app-local imports', t => {
  const f = fixture(t); f.write('base.json', JSON.stringify({ compilerOptions: { paths: { 'private/*': ['./src/areas/*'] } } }));
  f.write('tsconfig.json', JSON.stringify({ extends: './base.json', include: ['src'] }));
  assert.match(f.messages(), /including inherited configuration/);
});
test('unregistered area directories do not gain caller permissions automatically', t => {
  const f = fixture(t); f.caller('export const value = 1;', 'areas/bundle/unregistered'); assert.match(f.messages(), /Unknown app area/);
});
for (const declaration of ["const x = require('../curation/internal.js');", "import x = require('../curation/internal.js');", 'const x = import(somePath);']) {
  test(`unsupported import syntax fails closed: ${declaration}`, t => {
    const f = fixture(t); f.caller(declaration); assert.notEqual(f.messages(), '');
  });
}

for (const exposed of ['export default assess;', 'export const alias = assess;', 'export const facade = { assess };']) {
  test(`consumer cannot expose an imported capability via ${exposed}`, t => {
    const f = fixture(t); f.caller("import { sourcingQuerySensitivity as assess } from '../curation/exported.js'; " + exposed);
    assert.match(f.messages(), /Do not expose/);
  });
}
test('JavaScript cannot bypass the interface through require', t => {
  const f = fixture(t); f.write('src/shared/escape.js', "const area = require('../areas/bundle/curation/internal.js');");
  assert.match(f.messages(), /instead of require/);
});
test('a production import of a test-named file still gets checked', t => {
  const f = fixture(t); f.write('lib/escape.test.ts', "import { assess } from '../src/areas/bundle/curation/internal.js';");
  f.caller("import '../../../../lib/escape.test.js';");
  assert.match(f.messages(), /Private bundle\/curation import/);
});

test('Vite globs cannot import private areas or bypass caller checks', t => {
  const f = fixture(t); f.caller("const modules = import.meta.glob('../curation/**/*.ts');");
  assert.match(f.messages(), /Glob imports are reserved/);
});

for (const consumer of ['sourcing', 'curation']) {
  test(`${consumer} can consume its named shared editor interface`, t => {
    const f = fixture(t);
    f.write('src/areas/bundle/shared-sourcing-curation/editor.ts', 'export function editor() {}');
    f.write('src/areas/bundle/shared-sourcing-curation/exported.ts', guidance
      + `export { editor as ${consumer}QueryEditor } from './editor.js';`);
    f.caller(`import { ${consumer}QueryEditor } from '../shared-sourcing-curation/exported.js';`, `areas/bundle/${consumer}`);
    assert.deepEqual(f.check(), []);
  });
}

for (const consumer of ['areas/bundle/generation', 'areas/bundle/review', 'areas/bundle/sharing', 'shared/app-shell', 'shared/helpers']) {
  test(`${consumer} cannot consume the shared sourcing and curation editor`, t => {
    const f = fixture(t);
    f.write('src/areas/bundle/shared-sourcing-curation/editor.ts', 'export function editor() {}');
    f.write('src/areas/bundle/shared-sourcing-curation/exported.ts', guidance
      + "export { editor as sourcingQueryEditor } from './editor.js';");
    const prefix = consumer.startsWith('areas/') ? '../shared-sourcing-curation' : '../../areas/bundle/shared-sourcing-curation';
    f.caller(`import { sourcingQueryEditor } from '${prefix}/exported.js';`, consumer);
    assert.match(f.messages(), /Only sourcing and curation/);
  });
}

for (const target of ['sourcing', 'curation']) {
  test(`shared editor cannot reverse-import the ${target} facade`, t => {
    const f = fixture(t);
    f.write(`src/areas/bundle/${target}/operation.ts`, 'export function command() {}');
    f.write(`src/areas/bundle/${target}/exported.ts`, guidance
      + "export { command as sharedSourcingCurationCommandEdit } from './operation.js';");
    f.caller(`import { sharedSourcingCurationCommandEdit } from '../${target}/exported.js';`, 'areas/bundle/shared-sourcing-curation');
    assert.match(f.messages(), /cannot import area implementations or facades/);
  });
}

function contractFixture(t) {
  const f = fixture(t);
  const appRoot = path.join(f.directory, 'app');
  const { roots, contractRoots } = appAreaSurfaces(appRoot);
  const write = (relative, content) => f.write(`app/${relative}`, content);
  const contract = write('contracts/types/areas/bundle/sourcing/identity.ts', 'export type Identity = string;');
  write('contracts/types/shared/bundle-graph/node.ts', 'export type Node = string;');
  const consumers = [];
  const caller = (relative, declaration, target = contract) => {
    const file = path.join(appRoot, relative);
    let specifier = path.relative(path.dirname(file), target).replace(/\.ts$/, '.js');
    if (!specifier.startsWith('.')) specifier = './' + specifier;
    consumers.push(write(relative, declaration.replaceAll('CONTRACT', specifier)));
  };
  const check = () => checkAreaBoundaries({
    sourceRoot: contractRoots[0], otherSourceRoots: roots.filter(root => root !== contractRoots[0]),
    contractRoots, contractsOnly: true, consumerFiles: consumers,
  });
  return { write, caller, check, messages: () => check().map(item => item.message).join('\n') };
}

test('contract ownership spans the registered service, web, and test surfaces', t => {
  const f = contractFixture(t);
  for (const surface of ['clients/web/src', 'runtime/service/src', 'clients/web/test', 'runtime/service/test']) {
    f.caller(`${surface}/areas/bundle/sourcing/consumer.ts`, "import type { Identity } from 'CONTRACT';");
  }
  assert.deepEqual(f.check(), []);
});
for (const owner of ['areas/bundle/curation', 'areas/bundle/generation', 'areas/bundle/review', 'areas/bundle/sharing', 'shared/app-shell', 'shared/helpers']) {
  test(`${owner} cannot consume a Sourcing contract`, t => {
    const f = contractFixture(t);
    f.caller(`clients/web/src/${owner}/consumer.ts`, "import type { Identity as LocalIdentity } from 'CONTRACT';");
    assert.match(f.messages(), /Private bundle\/sourcing contract/);
  });
}
for (const declaration of [
  "export type { Identity } from 'CONTRACT';", "export * from 'CONTRACT';",
  "type Identity = import('CONTRACT').Identity;", "import * as identities from 'CONTRACT';",
  "const types = await import('CONTRACT');", "const types = require('CONTRACT');",
  "import types = require('CONTRACT');",
]) {
  test(`contract boundaries also cover ${declaration}`, t => {
    const f = contractFixture(t);
    f.caller('contracts/types/shared/transport/barrel.ts', declaration);
    assert.match(f.messages(), /Private bundle\/sourcing contract/);
  });
}
test('unregistered code cannot gain contract ownership from an incidental areas folder', t => {
  const f = contractFixture(t);
  f.caller('tooling/unregistered/areas/bundle/sourcing/consumer.ts', "import type { Identity } from 'CONTRACT';");
  assert.match(f.messages(), /Private bundle\/sourcing contract/);
});
test('declaration files and JavaScript consumers cannot launder private contracts', t => {
  const f = contractFixture(t);
  f.caller('contracts/types/shared/transport/barrel.d.ts', "export type { Identity } from 'CONTRACT';");
  f.caller('tooling/consumer.js', "export * from 'CONTRACT';");
  assert.equal(f.check().filter(item => item.message.includes('Private bundle/sourcing contract')).length, 2);
});
test('shared contracts remain usable by areas and infrastructure', t => {
  const f = contractFixture(t);
  f.write('contracts/types/areas/bundle/sourcing/sharedUse.ts', "import type { Node } from '../../../shared/bundle-graph/node.js';");
  f.write('contracts/types/shared/transport/sharedUse.ts', "import type { Node } from '../bundle-graph/node.js';");
  assert.deepEqual(f.check(), []);
});
test('flat, unowned, unknown-area, and shared catch-all contract declarations fail', t => {
  const f = contractFixture(t);
  f.write('contracts/types/flat.ts', 'export type Flat = string;');
  f.write('contracts/types/misc/record.ts', 'export type Record = string;');
  f.write('contracts/types/shared/loose.ts', 'export type Loose = string;');
  f.write('contracts/types/areas/invented/record.ts', 'export type Record = string;');
  assert.match(f.messages(), /flat contract files are forbidden/);
  assert.match(f.messages(), /Shared contracts require a named owner folder/);
  assert.match(f.messages(), /Unknown app area 'invented'/);
});

for (const [consumer, allowed] of [
  ['areas/bundle/sourcing', true], ['areas/bundle/curation', true], ['areas/bundle/shared-sourcing-curation', true],
  ['areas/bundle/generation', false], ['areas/bundle/review', false], ['areas/bundle/sharing', false],
  ['areas/bundles', false], ['shared/app-shell', false], ['shared/helpers', false],
]) {
  test(`restricted Sourcing/Curation contracts ${allowed ? 'allow' : 'reject'} ${consumer}`, t => {
    const f = contractFixture(t);
    const contract = f.write('contracts/types/areas/bundle/shared-sourcing-curation/selection.ts', 'export type Selection = string;');
    f.caller(`clients/web/src/${consumer}/consumer.ts`, "import type { Selection } from 'CONTRACT';", contract);
    if (allowed) assert.deepEqual(f.check(), []);
    else assert.match(f.messages(), /Private bundle\/shared-sourcing-curation contract/);
  });
}

test('the restricted contract area cannot import private Sourcing contracts in reverse', t => {
  const f = contractFixture(t);
  f.caller('contracts/types/areas/bundle/shared-sourcing-curation/reverse.ts', "import type { Identity } from 'CONTRACT';");
  assert.match(f.messages(), /Private bundle\/sourcing contract/);
});

for (const [providerSurface, hostSurface, permitted] of [
  ['backend', 'runtime/service/src', true], ['frontend', 'clients/web/src', true],
  ['backend', 'clients/web/src', false], ['frontend', 'runtime/service/src', false],
]) {
  test(`provider ${providerSurface} Sharing implementation ${permitted ? 'joins' : 'cannot cross into'} ${hostSurface}`, t => {
    const f = fixture(t);
    const appRoot = path.join(f.directory, 'app');
    const target = f.write(`app/${hostSurface}/areas/bundle/sharing/providers/private.ts`, 'export const provider = {};');
    const consumer = f.write(`app/publishing_providers/Example/${providerSurface}/areas/bundle/sharing/index.ts`, '');
    fs.writeFileSync(consumer, `import { provider } from '${path.relative(path.dirname(consumer), target).replace(/\.ts$/, '.js')}';`);
    const { roots, contractRoots, implementationFamilies } = appAreaSurfaces(appRoot);
    const sourceRoot = path.join(appRoot, hostSurface);
    const violations = checkAreaBoundaries({ sourceRoot, otherSourceRoots: roots.filter(root => root !== sourceRoot), contractRoots, implementationFamilies, consumerFiles: [consumer] });
    if (permitted) assert.deepEqual(violations, []);
    else assert.ok(violations.some(item => item.message.includes('Private bundle/sharing import')));
  });
}
