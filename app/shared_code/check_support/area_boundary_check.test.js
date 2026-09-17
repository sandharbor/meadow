import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { checkAreaBoundaries } from './area_boundary_check.js';
import { INTERFACE_GUIDANCE } from './area_boundary_policy.js';

const guidance = '/**\n' + INTERFACE_GUIDANCE.split('\n').map(line => ' * ' + line).join('\n') + '\n */\n';
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
