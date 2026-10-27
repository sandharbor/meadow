/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import type { RequestJson } from './managementCommands.js';
import type { CustomFilterConfig, CommandFilterExecution } from '../../../contracts/types/shared/curation/customFilters.js';

export function showFilterManagementHelp() {
  console.log(`Usage: meadow bundle filters <bundle-slug> [operation] [filter-id] [options]

With no operation, list the filter catalog. Operations:
  create --name NAME --command EXECUTABLE [--arg VALUE ...]
  show ID | edit ID [options] | enable ID | disable ID | delete ID
  run ID | status ID | pause ID | resume ID | rerun ID
  wait ID [--timeout-ms 120000]

Definition options: --id ID, --scope bundle|global, --name NAME, --note TEXT,
--command EXECUTABLE, --arg VALUE (repeatable), --cwd DIRECTORY,
--batch-size 4, --concurrency 4, --timeout-ms 120000,
--action highlight|mark_sensitive|fade (repeatable), --combine union|intersection,
--selectors JSON (the complete selector array, including ordinary text selectors).
Edit preserves unspecified settings. Defaults are batch size 4 and concurrency 4.
Execution timeout is per invocation, 120000 ms by default (maximum 3600000).
Executable/arguments run directly; explicitly invoke a shell for shell syntax.
Relative executable/script paths resolve from cwd, defaulting to Meadow Home.
Bare executable names resolve on the Runtime's PATH; absolute paths work reliably
for Desktop launches. Internal Runtime and transient terminal variables are
removed from the inherited program environment; cwd supplies PWD.

The command reads one version-1 JSON request on stdin, including bundle.name,
bundle.initialNodes, and nodes with id, name, path, folder, kind, source and
content (null when unavailable). Return {"version":1,"results":[{"id":"...",
"selected":true}]} on stdout and exit 0. Every submitted node needs one boolean
result. Write diagnostics to stderr. Limits: 32 MiB input, 1 MiB stdout,
16 KiB retained diagnostics, batch size 1–256 and concurrency 1–32.

Successful exact invocations are cached locally, including batch peers and
inspectable executable/script identities. Remote models, external state and
indirect dependencies need explicit rerun to refresh. Action/name edits reuse
classification. Pending/failed sensitivity assessments block automatic tracking
and generation. Wait prints terminal JSON and exits unsuccessfully on failure,
pause, or timeout; a successful negative decision is a completed result.`);
}

/** Help flags inside option values (including program arguments) are literal data. */
export function isFilterManagementHelp(args: string[]): boolean {
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--help' || args[index] === '-h') return true;
    if (args[index].startsWith('--')) index++;
  }
  return false;
}

export async function runFilterManagement(args: string[], request: RequestJson): Promise<void> {
  if (isFilterManagementHelp(args)) { showFilterManagementHelp(); return; }
  const [slug, operation, ...rest] = args;
  if (!slug || !operation) throw new Error('Expected a bundle slug and filter operation.');
  const root = `/bundles/${encodeURIComponent(slug)}/curation`;
  const values = new Map<string, string[]>();
  const positionals: string[] = [];
  const allowed = new Set(['id', 'scope', 'name', 'note', 'command', 'arg', 'cwd', 'batch-size', 'concurrency', 'timeout-ms', 'action', 'combine', 'selectors']);
  for (let index = 0; index < rest.length; index++) {
    const item = rest[index];
    if (!item.startsWith('--')) { positionals.push(item); continue; }
    const key = item.slice(2);
    if (!allowed.has(key) || rest[index + 1] === undefined) throw new Error(`Unknown option or missing value: ${item}`);
    values.set(key, [...values.get(key) ?? [], rest[++index]]);
  }
  const get = (key: string) => values.get(key)?.at(-1);
  const print = (value: unknown) => console.log(JSON.stringify(value, null, 2));
  const numeric = (key: string, fallback: number) => {
    const value = get(key) === undefined ? fallback : Number(get(key));
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`--${key} needs a positive integer.`);
    return value;
  };
  const effective = await request(`${root}/custom-filters`) as { filters: CustomFilterConfig[] };
  const global = await request('/curation/custom-filters/global') as { filters: CustomFilterConfig[] };
  const filters = [...global.filters, ...effective.filters.filter(filter => filter.scope === 'bundle')];
  const id = operation === 'create' ? get('id') ?? randomUUID() : positionals[0];
  const filter = filters.find(item => item.id === id || `custom-${item.id}` === id);
  if (operation === 'create' && filter) throw new Error(`A filter with ID ${id} already exists.`);
  if (operation !== 'create' && !filter) throw new Error(`Unknown custom filter: ${id ?? '(missing ID)'}`);
  if (positionals.length > (operation === 'create' ? 0 : 1)) throw new Error('Unexpected positional arguments.');
  const filterId = filter?.id ?? id;
  if (operation === 'show') { print(filter); return; }
  if (operation === 'delete') {
    print(await request(`${root}/custom-filters/${encodeURIComponent(filterId)}?scope=${filter!.scope}`, 'DELETE')); return;
  }
  if (['status', 'wait', 'run', 'pause', 'resume', 'rerun'].includes(operation)) {
    if (operation !== 'status' && operation !== 'wait') await request(`${root}/command-filters/${encodeURIComponent(filterId)}/${operation}`, 'POST', {});
    const deadline = Date.now() + numeric('timeout-ms', 120000);
    while (true) {
      const response = await request(`${root}/command-filters`) as { evaluations: CommandFilterExecution[] };
      const evaluations = response.evaluations.filter(item => item.filterId === filterId);
      if (!evaluations.length) throw new Error('This filter has no enabled command selectors.');
      const completed = evaluations.every(item => item.status === 'completed');
      const stopped = evaluations.some(item => item.status === 'failed' || item.status === 'paused');
      const timedOut = Date.now() >= deadline;
      if (operation !== 'wait' || completed || stopped || timedOut) {
        print({ status: completed ? 'completed' : stopped ? evaluations.some(item => item.status === 'failed') ? 'failed' : 'paused' : timedOut ? 'incomplete' : 'running', evaluations });
        if (operation === 'wait' && !completed) process.exitCode = 1;
        return;
      }
      await setTimeout(200);
    }
  }
  if (!['create', 'edit', 'enable', 'disable'].includes(operation)) throw new Error(`Unknown filter operation: ${operation}`);
  const now = new Date().toISOString();
  const definition: CustomFilterConfig = filter ? globalThis.structuredClone(filter) : {
    id: filterId, name: '', scope: 'bundle', selectors: [], selectorApplicationCriteria: 'union', actions: [{ type: 'highlight', color: '#FFD700' }], enabled: true, createdAt: now, updatedAt: now,
  };
  if (get('name') !== undefined) definition.name = get('name')!;
  if (get('note') !== undefined) definition.note = get('note');
  if (get('scope') !== undefined) definition.scope = get('scope') as CustomFilterConfig['scope'];
  if (get('combine') !== undefined) definition.selectorApplicationCriteria = get('combine') as CustomFilterConfig['selectorApplicationCriteria'];
  if (get('action') !== undefined) definition.actions = values.get('action')!.map(type => ({ type: type as CustomFilterConfig['actions'][number]['type'] }));
  if (get('selectors') !== undefined) definition.selectors = JSON.parse(get('selectors')!) as CustomFilterConfig['selectors'];
  if (['command', 'arg', 'cwd', 'batch-size', 'concurrency', 'timeout-ms'].some(key => values.has(key))) {
    const previous = definition.selectors.find(item => item.field === 'command')?.command;
    const command = { executable: get('command') ?? previous?.executable ?? '', args: values.get('arg') ?? previous?.args ?? [],
      ...(get('cwd') !== undefined || previous?.cwd !== undefined ? { cwd: get('cwd') ?? previous?.cwd } : {}),
      batchSize: numeric('batch-size', previous?.batchSize ?? 4), maxConcurrency: numeric('concurrency', previous?.maxConcurrency ?? 4), timeoutMs: numeric('timeout-ms', previous?.timeoutMs ?? 120000) };
    const index = definition.selectors.findIndex(item => item.field === 'command');
    const selector = { field: 'command' as const, matchType: 'substring' as const, value: '', command };
    if (index < 0) definition.selectors.push(selector); else definition.selectors[index] = selector;
  }
  if (!definition.name.trim() || !definition.selectors.length) throw new Error('Provide a name and at least one selector.');
  if (operation === 'enable' || operation === 'disable') definition.enabled = operation === 'enable';
  await request(`${root}/custom-filters`, 'POST', { filter: definition });
  print(definition);
}
