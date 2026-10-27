/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { setTimeout, clearTimeout } from 'node:timers';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import type { BundleConfig } from '../../../../../contracts/types/shared/bundle-config/bundleConfig.js';
import type { IBundleNode } from '../../../../../contracts/types/shared/bundle-graph/IBundleNode.js';
import type { CommandFilterExecution, CommandFilterDiagnostic, CommandSelectorConfig, CustomFilterConfig } from '../../../../../contracts/types/shared/curation/customFilters.js';
import { commandSelectorKey } from '../../../../../shared_code/utils/filterSelectors.js';
import { bundleNodeKeySourceGraphPath } from '../../../../../shared_code/utils/bundleNodeKey.js';
import { getConfigDirectory } from '../bundle-config/bundleConfigPaths.js';

interface InputNode {
  id: string; name: string; path: string | null; folder: string | null; kind: string;
  source: { id: string; name: string; rootFolder: string } | null;
  content: string | null;
}
interface Request {
  version: 1;
  bundle: { name: string; initialNodes: InputNode[] };
  nodes: InputNode[];
}
interface Batch { fingerprint: string; epoch: number; request: Request; state: 'pending' | 'running' | 'completed' | 'failed'; cached: boolean; results?: Record<string, boolean>; diagnostic?: CommandFilterDiagnostic }
interface Run {
  key: string; concurrencyKey: string; directory: string; filterId: string; selectorKey: string; revision: string;
  command: Required<CommandSelectorConfig>; batches: Batch[]; paused: boolean; superseded: boolean;
}
const children = new Set<import('node:child_process').ChildProcess>();
const volatileEnvironment = new Set(['PORT', 'TERM_SESSION_ID', 'SHLVL', 'OLDPWD', '_', 'PWD', 'XPC_SERVICE_NAME', 'LaunchInstanceID', '__CFBundleIdentifier', 'ITERM_SESSION_ID', 'TERM_PROGRAM_VERSION', 'SECURITYSESSIONID', 'TMUX_PANE', 'WINDOWID']);
const commandEnvironment = (cwd: string) => ({ ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(MEADOW_|VITE_)/.test(key) && !volatileEnvironment.has(key))), PWD: cwd });
const runs = new Map<string, Run>();
const scopes = new Map<string, Set<string>>();
const cacheEpochs = new Map<string, number>();
let globalConfigurationEpoch = 0;
const configurationEpochs = new Map<string, number>();
export const commandFilterConfigurationEpoch = (directory: string) => `${globalConfigurationEpoch}:${configurationEpochs.get(directory) ?? 0}`;
const active = new Map<string, number>();
const identities = new Map<string, { stat: string; digest: string }>();
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const cacheDirectory = () => path.join(getConfigDirectory(), 'cache', 'command-filters', 'v1');
const cachePath = (fingerprint: string) => path.join(cacheDirectory(), `${fingerprint}.json`);
function writeJson(filename: string, value: unknown) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
  fs.renameSync(temporary, filename);
}
function pausePath(directory: string, filterId: string) { return path.join(cacheDirectory(), `pause-${digest(`${directory}:${filterId}`)}.json`); }
function generationPath(directory: string, filterId: string) { return path.join(cacheDirectory(), `generation-${digest(`${directory}:${filterId}`)}.json`); }
function rerunGeneration(directory: string, filterId: string): string {
  try { return fs.readFileSync(generationPath(directory, filterId), 'utf8'); } catch { return 'initial'; }
}
function isPaused(directory: string, filterId: string): boolean {
  try { return JSON.parse(fs.readFileSync(pausePath(directory, filterId), 'utf8')) === true; } catch { return false; }
}
function fileIdentity(filename: string) {
  try {
    const stat = fs.statSync(filename);
    if (!stat.isFile()) return null;
    const key = `${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
    const previous = identities.get(filename);
    if (previous?.stat === key) return previous.digest;
    const value = digest(fs.readFileSync(filename));
    identities.set(filename, { stat: key, digest: value });
    return value;
  } catch { return null; }
}
function resolveExecutable(executable: string, cwd: string): string {
  if (executable.includes('/') || executable.includes('\\')) return path.resolve(cwd, executable);
  for (const directory of (process.env.PATH ?? '').split(path.delimiter)) {
    const candidate = path.resolve(cwd, directory || '.', executable);
    try { fs.accessSync(candidate, fs.constants.X_OK); return candidate; } catch { /* Continue PATH resolution. */ }
  }
  return executable;
}
function inputNode(node: IBundleNode, config: BundleConfig): InputNode {
  const source = config.sources?.find(item => item.id === node.sourceId) ?? (node.bundleNodeKind !== 'collection' && config.sourceDirectory
    ? { id: node.sourceId ?? 'default', name: path.basename(config.sourceDirectory), directory: config.sourceDirectory } : undefined);
  return { id: node.bundleNodeKey, name: node.bundleNodeName,
    path: node.bundleNodeKind === 'collection' ? null : bundleNodeKeySourceGraphPath(node.bundleNodeKey),
    folder: node.sourceGraphSubdirectory ?? null, kind: node.bundleNodeKind === 'file' ? node.fileType : node.bundleNodeKind,
    source: source ? { id: source.id, name: source.name, rootFolder: source.directory } : null,
    // Ordinary frontier material is a live display aid, outside the captured candidate content.
    content: node.isFrontierNode && !node.isFrontierImageExtension ? null : node.body ?? null };
}
function decisions(value: unknown, request: Request): Record<string, boolean> {
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 || !('results' in value) || !Array.isArray(value.results)) {
    throw new Error('Expected version 1 and a results array.');
  }
  const expected = new Set(request.nodes.map(node => node.id));
  const result: Record<string, boolean> = {};
  for (const entry of value.results as unknown[]) {
    const item = entry as { id?: unknown; selected?: unknown } | null;
    if (!item || typeof item.id !== 'string' || !expected.delete(item.id) || typeof item.selected !== 'boolean') {
      throw new Error('Each submitted node needs exactly one boolean selected decision; duplicate, unknown, or malformed result.');
    }
    result[item.id] = item.selected;
  }
  if (expected.size) throw new Error(`Missing decisions for ${expected.size} submitted nodes.`);
  return result;
}
async function invoke(command: Required<CommandSelectorConfig>, request: Request): Promise<{ results?: Record<string, boolean>; diagnostic?: CommandFilterDiagnostic }> {
  return new Promise(resolve => {
    let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0), failure = '';
    let settled = false;
    let terminationTimer: ReturnType<typeof setTimeout> | undefined;
    const child = spawn(command.executable, command.args, { cwd: command.cwd, env: commandEnvironment(command.cwd), detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    children.add(child);
    const stop = (reason: string) => {
      failure ||= reason;
      terminationTimer ??= setTimeout(() => {
        child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
        finish(null, 'SIGKILL');
      }, 250);
      // Only this newly spawned process group belongs to this invocation.
      try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch { /* Process already exited. */ }
    };
    const timeout = setTimeout(() => stop(`Command timed out after ${command.timeoutMs} ms.`), command.timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.length + chunk.length > 1048576) stop('Command stdout exceeds the 1 MiB limit.');
      else stdout = Buffer.concat([stdout, chunk]);
    });
    child.stderr.on('data', (chunk: Buffer) => { if (stderr.length < 16384) stderr = Buffer.concat([stderr, chunk]).subarray(0, 16384); });
    child.on('error', error => { failure ||= `Unable to start command: ${error.message}`; });
    child.stdin.on('error', error => { if (!('code' in error) || error.code !== 'EPIPE') failure ||= error.message; });
    const finish = (code: number | null, signal: string | null) => {
      if (settled) return;
      settled = true;
      children.delete(child);
      clearTimeout(timeout);
      if (terminationTimer) clearTimeout(terminationTimer);
      try {
        if (failure) throw new Error(failure);
        if (code !== 0) throw new Error(`Command exited with ${signal ? `signal ${signal}` : `status ${code}`}.`);
        const results = decisions(JSON.parse(stdout.toString('utf8')), request);
        resolve({ results });
      } catch (error) {
        resolve({ diagnostic: { nodeIds: request.nodes.map(node => node.id), message: error instanceof Error ? error.message : String(error),
          stdout: stdout.toString('utf8').slice(0, 16384), stderr: stderr.toString('utf8'), exitCode: code } });
      }
    };
    child.on('close', finish);
    const input = JSON.stringify(request);
    if (Buffer.byteLength(input) > 33554432) { stop('Command input exceeds the 32 MiB limit.'); child.stdin.end(); }
    else child.stdin.end(input);
  });
}
function dispatch(run: Run) {
  if (run.superseded || run.paused) return;
  for (const batch of run.batches) {
    if ((active.get(run.concurrencyKey) ?? 0) >= run.command.maxConcurrency) break;
    if (batch.state !== 'pending') continue;
    batch.state = 'running';
    active.set(run.concurrencyKey, (active.get(run.concurrencyKey) ?? 0) + 1);
    void invoke(run.command, batch.request).then(result => {
      batch.results = result.results; batch.diagnostic = result.diagnostic;
      batch.state = result.results ? 'completed' : 'failed';
      if (result.results && batch.epoch === (cacheEpochs.get(batch.fingerprint) ?? 0)) {
        try { writeJson(cachePath(batch.fingerprint), { version: 1, results: Object.entries(result.results).map(([id, selected]) => ({ id, selected })) }); }
        catch (error) { batch.diagnostic = { nodeIds: batch.request.nodes.map(node => node.id), message: `Cache write failed: ${String(error)}`, stderr: '', stdout: '', exitCode: 0 }; }
      }
    }).finally(() => {
      active.set(run.concurrencyKey, Math.max(0, (active.get(run.concurrencyKey) ?? 1) - 1));
      for (const current of runs.values()) if (current.concurrencyKey === run.concurrencyKey) dispatch(current);
    });
  }
}
function execution(run: Run): CommandFilterExecution {
  const nodes: CommandFilterExecution['nodes'] = {};
  for (const batch of run.batches) for (const node of batch.request.nodes) nodes[node.id] = {
    state: batch.state, revision: run.revision,
    ...(batch.results && { selected: batch.results[node.id] }), ...(batch.cached && { cached: true }),
    ...(batch.diagnostic && { error: batch.diagnostic.message }),
  };
  const count = (state: string) => Object.values(nodes).filter(node => node.state === state).length;
  const pending = count('pending'), running = count('running'), failed = count('failed');
  return { filterId: run.filterId, selectorKey: run.selectorKey, revision: run.revision,
    executable: run.command.executable, args: run.command.args, paused: run.paused,
    status: run.paused && pending > 0 ? 'paused' : running ? 'running' : pending ? 'pending' : failed ? 'failed' : 'completed',
    total: Object.keys(nodes).length, completed: count('completed'), cached: Object.values(nodes).filter(node => node.cached).length,
    pending, running, failed, nodes, diagnostics: run.batches.flatMap(batch => batch.diagnostic ? [batch.diagnostic] : []) };
}

/** Reconcile immutable captured material. Display filtering never changes this input. */
export function reconcileCommandFilters(directory: string, config: BundleConfig, nodes: IBundleNode[], filters: CustomFilterConfig[], context = 'accepted', expectedEpoch = commandFilterConfigurationEpoch(directory)): CommandFilterExecution[] {
  if (expectedEpoch !== commandFilterConfigurationEpoch(directory)) {
    for (const node of nodes) delete node.commandFilterResults;
    return [];
  }
  const scope = `${directory}:${context}`;
  const wanted = new Set<string>();
  const states: CommandFilterExecution[] = [];
  for (const filter of filters) {
    if (!filter.enabled) continue;
    for (const [selectorIndex, selector] of filter.selectors.entries()) {
      if (selector.field !== 'command' || !selector.command) continue;
      const selectorKey = commandSelectorKey(selector, filter.id);
      const concurrencyKey = `${directory}:${filter.id}:${selectorIndex}`;
      const cwd = path.resolve(getConfigDirectory(), selector.command.cwd ?? '.');
      const command: Required<CommandSelectorConfig> = { executable: resolveExecutable(selector.command.executable, cwd), args: selector.command.args ?? [], cwd,
        batchSize: selector.command.batchSize ?? 4, maxConcurrency: selector.command.maxConcurrency ?? 4, timeoutMs: selector.command.timeoutMs ?? 120000 };
      const inputs = nodes.map(node => inputNode(node, config)).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      const initialIds = new Set(nodes.filter(node => node.depth === 0 || (config.entryBundleNodeId !== undefined && node.bundleNodeId === config.entryBundleNodeId) || (config.defaultTraversalBundleNodeId !== undefined && node.bundleNodeId === config.defaultTraversalBundleNodeId)).map(node => node.bundleNodeKey));
      const bundle = { name: path.basename(directory), initialNodes: inputs.filter(node => initialIds.has(node.id as IBundleNode['bundleNodeKey'])) };
      const identity = { generation: rerunGeneration(directory, filter.id), command, environment: digest(JSON.stringify(Object.entries(commandEnvironment(cwd)).sort())),
        executable: fileIdentity(command.executable), arguments: command.args.map(arg => fileIdentity(path.resolve(cwd, arg))) };
      const batches: Batch[] = [];
      for (let index = 0; index < inputs.length; index += command.batchSize) {
        const request: Request = { version: 1, bundle, nodes: inputs.slice(index, index + command.batchSize) };
        const fingerprint = digest(JSON.stringify({ identity, request }));
        batches.push({ request, fingerprint, epoch: cacheEpochs.get(fingerprint) ?? 0, state: 'pending', cached: false });
      }
      const revision = digest(JSON.stringify(batches.map(batch => batch.fingerprint)));
      const key = `${concurrencyKey}:${selectorKey}:${revision}`;
      wanted.add(key);
      let run = runs.get(key);
      if (!run || run.revision !== revision || run.superseded) {
        if (run) run.superseded = true;
        for (const batch of batches) {
          try {
            batch.results = decisions(JSON.parse(fs.readFileSync(cachePath(batch.fingerprint), 'utf8')), batch.request);
            batch.state = 'completed'; batch.cached = true;
          } catch { /* Missing/corrupt cache is recomputed, independently of authored configuration. */ }
        }
        run = { key, concurrencyKey, directory, filterId: filter.id, selectorKey, revision, command, batches, paused: isPaused(directory, filter.id), superseded: false };
        runs.set(key, run);
      }
      dispatch(run);
      const state = execution(run);
      states.push(state);
      for (const node of nodes) {
        node.commandFilterResults ??= {};
        node.commandFilterResults[selectorKey] = state.nodes[node.bundleNodeKey];
      }
    }
  }
  scopes.set(scope, wanted);
  const referenced = new Set([...scopes.values()].flatMap(keys => [...keys]));
  for (const [key, run] of runs) if (!referenced.has(key)) { run.superseded = true; runs.delete(key); }
  return states;
}

export function controlCommandFilter(directory: string, filterId: string, action: 'pause' | 'resume' | 'rerun') {
  const affected = [...runs.values()].filter(run => run.directory === directory && run.filterId === filterId && !run.superseded);
  if (action !== 'rerun') writeJson(pausePath(directory, filterId), action === 'pause');
  if (action === 'rerun') {
    // A persisted generation invalidates every input variant, including ones not loaded since restart.
    writeJson(generationPath(directory, filterId), randomUUID());
    writeJson(pausePath(directory, filterId), false);
    for (const run of affected) {
      run.superseded = true;
      runs.delete(run.key);
      for (const batch of run.batches) cacheEpochs.set(batch.fingerprint, (cacheEpochs.get(batch.fingerprint) ?? 0) + 1);
    }
    return;
  }
  for (const run of affected) { run.paused = action === 'pause'; dispatch(run); }
}

/** Configuration edits/deletion stop future dispatch in every bundle affected by a global filter. */
export function stopCommandFilter(directory: string, filterId: string, global = false) {
  if (global) globalConfigurationEpoch++;
  else configurationEpochs.set(directory, (configurationEpochs.get(directory) ?? 0) + 1);
  for (const [key, run] of runs) if (run.filterId === filterId && (global || run.directory === directory)) { run.superseded = true; runs.delete(key); }
}

/** Runtime shutdown owns only subprocesses spawned by this evaluator. */
export function stopCommandFilterProcesses() {
  for (const run of runs.values()) run.superseded = true;
  for (const child of children) {
    try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch { /* Already exited. */ }
  }
}

/** An isolated proposal edit releases its obsolete input scope without stopping accepted evaluations. */
export function invalidateCommandFilterContext(directory: string, context: string) {
  configurationEpochs.set(directory, (configurationEpochs.get(directory) ?? 0) + 1);
  scopes.delete(`${directory}:${context}`);
  const referenced = new Set([...scopes.values()].flatMap(keys => [...keys]));
  for (const [key, run] of runs) if (!referenced.has(key)) { run.superseded = true; runs.delete(key); }
}
