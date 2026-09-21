/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import YAML from 'yaml';
import { fixtureSourceLocation } from './fixtureSourceLocation.js';
import { textDocumentCodec, writeDurableDocument } from '../utils/durableDocument.js';
import { SOURCE_CHANGE_CATEGORIES, type SourceChangeCategory } from './sourceChangesTypes.js';
import type { SourceChangeDefinition, SourceChangeOperation, SourceChangeResult, SourceChangeStatus } from './sourceChangesTypes.js';

const SESSION_FILE = '.meadow-source-session.json';
type Session = { version: 1; sourceGraphs: string[] };
type FileState = Map<string, Buffer | null>;
type DirectoryMove = { from: string; to: string; entries: string[] };
type ChangePlan = { definition: SourceChangeDefinition; before: FileState; after: FileState; directoryMove?: DirectoryMove };

function directoryInventory(root: string, relative: string, authored = false): string[] {
  const directory = safePath(root, relative);
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (authored && (entry.name === '.DS_Store' || entry.name.endsWith('.nodespec.yaml'))) return [];
    safePath(root, `${relative}/${entry.name}`);
    if (entry.isDirectory()) return [`${entry.name}/`, ...directoryInventory(root, `${relative}/${entry.name}`, authored).map(child => `${entry.name}/${child}`)];
    if (!entry.isFile()) throw new Error(`Source changes require regular files: ${entry.name}`);
    return [entry.name];
  }).sort();
}

function directoryMoveMatches(root: string, move: DirectoryMove | undefined, after: boolean): boolean {
  if (!move) return true;
  const present = after ? move.to : move.from;
  const absent = after ? move.from : move.to;
  return !fs.existsSync(safePath(root, absent)) && fs.existsSync(safePath(root, present))
    && JSON.stringify(directoryInventory(root, present)) === JSON.stringify(move.entries);
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object');
  return value as Record<string, unknown>;
}

function fields(value: Record<string, unknown>, allowed: string[]): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`Unknown source-change field: ${key}`);
}

function text(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error('Expected a nonempty string');
  return value;
}

function relativePath(value: unknown): string {
  const result = text(value);
  if (result.includes('\\') || result.includes('\0') || result.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Expected a relative path within the source graph: ${result}`);
  }
  return result;
}

function graphName(value: unknown): string {
  const result = relativePath(value);
  if (result.includes('/')) throw new Error(`Expected a source graph name: ${result}`);
  return result;
}

/** Reject symlinks at every level, including nonexistent destinations' existing ancestors. */
function safePath(root: string, relative: string): string {
  const filename = path.resolve(root, relativePath(relative));
  let cursor = filename;
  while (true) {
    if (fs.existsSync(cursor) || fs.lstatSync(cursor, { throwIfNoEntry: false })) {
      const stat = fs.lstatSync(cursor);
      if (stat.isSymbolicLink()) throw new Error(`Source changes cannot follow symlinks: ${cursor}`);
      if (cursor !== filename && !stat.isDirectory()) throw new Error(`Source change destination is blocked by a file: ${cursor}`);
    }
    if (cursor === path.resolve(root)) break;
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return filename;
}

function sourceFixtureRoot(projectRoot: string, name: string): string {
  return safePath(path.join(projectRoot, 'app/shared_data/source_graphs'), graphName(name));
}

function readSession(sourceGraphsDir: string): Session {
  const value = record(JSON.parse(fs.readFileSync(safePath(sourceGraphsDir, SESSION_FILE), 'utf8')));
  if (value.version !== 1 || !Array.isArray(value.sourceGraphs)) throw new Error('Invalid source graph session');
  return { version: 1, sourceGraphs: value.sourceGraphs.map(graphName) };
}

function writeJson(filename: string, value: unknown): void {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(temporary, filename);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function assertSessionDestination(projectRoot: string, sourceGraphsDir: string): void {
  const canonical = fs.realpathSync(path.join(projectRoot, 'app/shared_data'));
  const canonicalDestination = (value: string): string => {
    if (fs.existsSync(value)) return fs.realpathSync(value);
    const parent = path.dirname(value);
    return path.join(canonicalDestination(parent), path.basename(value));
  };
  const destination = canonicalDestination(path.resolve(sourceGraphsDir));
  safePath(destination, SESSION_FILE);
  if (destination === canonical || destination.startsWith(`${canonical}${path.sep}`)
    || canonical.startsWith(`${destination}${path.sep}`)) {
    throw new Error('Source changes require an isolated session outside the checked-in shared data');
  }
}

/** Materialize one graph per session; bundles using the same graph share its mutable copy. */
export function materializeSourceGraph(options: {
  projectRoot: string;
  sourceGraphsDir: string;
  sourceGraph: string;
  /** Paths relative to this graph to omit when first creating its session copy. */
  excludeRelativePaths?: readonly string[];
}): string {
  const { projectRoot, sourceGraphsDir, sourceGraph } = options;
  const excludedPaths = new Set(options.excludeRelativePaths ?? []);
  assertSessionDestination(projectRoot, sourceGraphsDir);
  const source = sourceFixtureRoot(projectRoot, sourceGraph);
  const destination = safePath(sourceGraphsDir, sourceGraph);
  const manifest = safePath(sourceGraphsDir, SESSION_FILE);
  const session: Session = fs.existsSync(manifest) ? readSession(sourceGraphsDir) : { version: 1, sourceGraphs: [] };
  if (session.sourceGraphs.includes(sourceGraph)) {
    if (!fs.statSync(destination).isDirectory()) throw new Error('Source graph session directory is missing');
    return destination;
  }
  if (fs.existsSync(destination)) throw new Error(`Source graph destination already exists outside this session: ${destination}`);
  const copy = (from: string, to: string) => {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      if (entry.name === '.DS_Store' || entry.name.endsWith('.nodespec.yaml')) continue;
      if (entry.isSymbolicLink()) throw new Error(`Source graph fixture contains a symlink: ${entry.name}`);
      const input = path.join(from, entry.name);
      if (excludedPaths.has(path.relative(source, input).split(path.sep).join('/'))) continue;
      const output = path.join(to, entry.name);
      if (entry.isDirectory()) copy(input, output);
      else if (entry.isFile()) fs.writeFileSync(output, fs.readFileSync(input), { mode: fs.statSync(input).mode & 0o777 });
    }
  };
  try {
    copy(source, destination);
    session.sourceGraphs.push(sourceGraph);
    writeJson(manifest, session);
  } catch (error) {
    fs.rmSync(destination, { recursive: true, force: true });
    throw error;
  }
  return destination;
}

function parseOperation(input: unknown): SourceChangeOperation {
  const value = record(input);
  if (Object.keys(value).length !== 1) throw new Error('A source operation must have exactly one action');
  if ('move' in value) {
    const move = record(value.move);
    fields(move, ['from', 'to']);
    return { move: { from: relativePath(move.from), to: relativePath(move.to) } };
  }
  if ('delete' in value) return { delete: relativePath(value.delete) };
  if ('replaceText' in value) {
    const edit = record(value.replaceText);
    fields(edit, ['path', 'before', 'after', 'count']);
    if (typeof edit.after !== 'string') throw new Error('replaceText.after must be a string');
    const count = edit.count ?? 1;
    if (!Number.isInteger(count) || Number(count) < 1) throw new Error('replaceText.count must be a positive integer');
    return { replaceText: { path: relativePath(edit.path), before: text(edit.before), after: edit.after, count: Number(count) } };
  }
  if ('write' in value) {
    const write = record(value.write);
    fields(write, ['path', 'contentFile']);
    return { write: { path: relativePath(write.path), contentFile: relativePath(write.contentFile) } };
  }
  throw new Error('Unknown source-change operation');
}

function loadDefinition(directory: string, sourceGraph: string): SourceChangeDefinition {
  const value = record(YAML.parse(fs.readFileSync(safePath(directory, 'change.yaml'), 'utf8')));
  fields(value, ['id', 'label', 'description', 'categories', 'sourceGraph', 'operations']);
  const id = text(value.id);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id !== path.basename(directory)) throw new Error('Source-change id must match its directory');
  if (value.sourceGraph !== sourceGraph) throw new Error('Source-change graph must match its directory');
  if (!Array.isArray(value.operations) || value.operations.length === 0) throw new Error('Source change needs operations');
  if (!Array.isArray(value.categories) || value.categories.length === 0 || value.categories.some(category => !SOURCE_CHANGE_CATEGORIES.includes(category as SourceChangeCategory))) throw new Error('Source change needs valid categories');
  return { id, label: text(value.label), description: text(value.description), categories: [...new Set(value.categories as SourceChangeCategory[])], sourceGraph, operations: value.operations.map(parseOperation) };
}

export function loadSourceChanges(projectRoot: string, sourceGraph: string): SourceChangeDefinition[] {
  const root = safePath(path.join(projectRoot, 'app/shared_data/source_changes'), graphName(sourceGraph));
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory())
    .map(entry => loadDefinition(safePath(root, entry.name), sourceGraph)).sort((a, b) => a.id.localeCompare(b.id));
}

function planChange(projectRoot: string, definition: SourceChangeDefinition): ChangePlan {
  const before: FileState = new Map();
  const after: FileState = new Map();
  const sourceRoot = sourceFixtureRoot(projectRoot, definition.sourceGraph);
  let directoryMove: DirectoryMove | undefined;
  const get = (relative: string): Buffer | null => {
    if (!after.has(relative)) {
      const filename = safePath(sourceRoot, relative);
      const bytes = fs.existsSync(filename) ? fs.readFileSync(filename) : null;
      before.set(relative, bytes);
      after.set(relative, bytes);
    }
    return after.get(relative) ?? null;
  };
  const requireFile = (relative: string): Buffer => {
    const bytes = get(relative);
    if (bytes === null) throw new Error(`Source operation requires an existing file: ${relative}`);
    return bytes;
  };
  for (const operation of definition.operations) {
    if ('move' in operation) {
      const { from, to } = operation.move;
      const original = safePath(sourceRoot, from);
      if (fs.existsSync(original) && fs.statSync(original).isDirectory()) {
        if (definition.operations.length !== 1) throw new Error('A directory relocation must be a separate source change');
        if (to === from || to.startsWith(`${from}/`) || from.startsWith(`${to}/`) || fs.existsSync(safePath(sourceRoot, to))) throw new Error('Directory move destination must be separate and absent');
        const entries = directoryInventory(sourceRoot, from, true);
        directoryMove = { from, to, entries };
        for (const entry of entries.filter(entry => !entry.endsWith('/'))) {
          const bytes = requireFile(`${from}/${entry}`);
          get(`${to}/${entry}`);
          after.set(`${from}/${entry}`, null);
          after.set(`${to}/${entry}`, bytes);
        }
        continue;
      }
      const bytes = requireFile(from);
      if (get(to) !== null) throw new Error(`Move destination already exists: ${to}`);
      after.set(from, null);
      after.set(to, bytes);
    } else if ('delete' in operation) {
      requireFile(operation.delete);
      after.set(operation.delete, null);
    } else if ('replaceText' in operation) {
      const edit = operation.replaceText;
      const source = requireFile(edit.path).toString('utf8');
      const count = source.split(edit.before).length - 1;
      if (count !== (edit.count ?? 1)) throw new Error(`Expected ${edit.count ?? 1} text matches in ${edit.path}; found ${count}`);
      after.set(edit.path, Buffer.from(source.split(edit.before).join(edit.after)));
    } else {
      get(operation.write.path);
      const replacementRoot = safePath(path.join(projectRoot, 'app/shared_data/source_changes'), `${definition.sourceGraph}/${definition.id}`);
      after.set(operation.write.path, fs.readFileSync(safePath(replacementRoot, operation.write.contentFile)));
    }
  }
  return { definition, before, after, directoryMove };
}

function readState(root: string, expected: FileState): FileState {
  return new Map([...expected.keys()].map(relative => {
    const filename = safePath(root, relative);
    if (!fs.existsSync(filename)) return [relative, null];
    if (!fs.statSync(filename).isFile()) throw new Error(`Expected a file at ${relative}`);
    return [relative, fs.readFileSync(filename)];
  }));
}

function matches(left: FileState, right: FileState): boolean {
  return [...left].every(([relative, bytes]) => {
    const other = right.get(relative) ?? null;
    return bytes === null ? other === null : other !== null && bytes.equals(other);
  });
}

function sessionGraph(projectRoot: string, sourceGraphsDir: string, sourceGraph: string): string {
  assertSessionDestination(projectRoot, sourceGraphsDir);
  if (!readSession(sourceGraphsDir).sourceGraphs.includes(sourceGraph)) throw new Error('Source graph is not part of this isolated session');
  return safePath(sourceGraphsDir, graphName(sourceGraph));
}

export function listSourceChangeStatus(projectRoot: string, sourceGraphsDir: string, sourceGraph: string): SourceChangeStatus[] {
  const root = sessionGraph(projectRoot, sourceGraphsDir, sourceGraph);
  return loadSourceChanges(projectRoot, sourceGraph).map(definition => {
    try {
      const plan = planChange(projectRoot, definition);
      const current = readState(root, plan.before);
      const journal = safePath(sourceGraphsDir, '.source-changes.jsonl');
      const applied = fs.existsSync(journal) && fs.readFileSync(journal, 'utf8').trim().split('\n')
        .some(line => { const item = JSON.parse(line) as SourceChangeResult; return item.changeId === definition.id && item.sourceGraph === sourceGraph; });
      if (applied && matches(plan.after, current) && directoryMoveMatches(root, plan.directoryMove, true)) return { ...definition, state: 'applied' };
      if (matches(plan.before, current) && directoryMoveMatches(root, plan.directoryMove, false)) return { ...definition, state: 'available' };
      return { ...definition, state: 'conflict', reason: 'An affected file differs from this change’s starting state. Restart the fixture to restore its baseline.' };
    } catch (error) {
      return { ...definition, state: 'conflict', reason: error instanceof Error ? error.message : String(error) };
    }
  });
}

function writeState(root: string, state: FileState): void {
  for (const [relative, bytes] of state) {
    const filename = safePath(root, relative);
    if (bytes === null) fs.rmSync(filename, { force: true });
    else {
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      fs.writeFileSync(filename, bytes);
    }
  }
}

function digest(bytes: Buffer | null): string | null {
  return bytes === null ? null : createHash('sha256').update(bytes).digest('hex');
}

/** The only mutation entrypoint used by dev controls and automated scenarios. */
export function applySourceChange(options: {
  projectRoot: string; sourceGraphsDir: string; sourceGraph: string; changeId: string;
}): SourceChangeResult {
  const { projectRoot, sourceGraphsDir, sourceGraph, changeId } = options;
  const root = sessionGraph(projectRoot, sourceGraphsDir, sourceGraph);
  const definition = loadSourceChanges(projectRoot, sourceGraph).find(change => change.id === changeId);
  if (!definition) throw new Error(`Unknown source change: ${changeId}`);
  const plan = planChange(projectRoot, definition);
  const lock = safePath(sourceGraphsDir, '.source-change-lock');
  fs.mkdirSync(lock);
  try {
    const current = readState(root, plan.before);
    if (!matches(plan.before, current) || !directoryMoveMatches(root, plan.directoryMove, false)) throw new Error('Source change is already applied or its starting files have changed');
    const restore = () => {
      if (plan.directoryMove) {
        const destination = safePath(root, plan.directoryMove.to);
        if (fs.existsSync(destination)) fs.renameSync(destination, safePath(root, plan.directoryMove.from));
      } else writeState(root, current);
    };
    // Resolve every destination before the first write, including absent paths.
    for (const relative of plan.after.keys()) safePath(root, relative);
    try {
      for (const operation of definition.operations) {
        if ('move' in operation) {
          const destination = safePath(root, operation.move.to);
          fs.mkdirSync(path.dirname(destination), { recursive: true });
          fs.renameSync(safePath(root, operation.move.from), destination);
        } else if ('delete' in operation) fs.unlinkSync(safePath(root, operation.delete));
        else if ('replaceText' in operation) {
          const edit = operation.replaceText;
          const filename = safePath(root, edit.path);
          fs.writeFileSync(filename, fs.readFileSync(filename, 'utf8').split(edit.before).join(edit.after));
        } else {
          const filename = safePath(root, operation.write.path);
          fs.mkdirSync(path.dirname(filename), { recursive: true });
          const replacement = safePath(path.join(projectRoot, 'app/shared_data/source_changes', sourceGraph, changeId), operation.write.contentFile);
          fs.writeFileSync(filename, fs.readFileSync(replacement));
        }
      }
    } catch (error) {
      restore();
      throw error;
    }
    const result: SourceChangeResult = {
      changeId, sourceGraph, appliedAt: new Date().toISOString(),
      files: [...plan.before].map(([relative, bytes]) => ({
        path: relative, beforeDigest: digest(bytes), afterDigest: digest(plan.after.get(relative) ?? null),
      })),
    };
    const journal = safePath(sourceGraphsDir, '.source-changes.jsonl');
    try {
      const previous = fs.existsSync(journal) ? fs.readFileSync(journal, 'utf8') : '';
      writeDurableDocument({ path: journal, value: `${previous}${JSON.stringify(result)}\n`, codec: textDocumentCodec });
    } catch (error) { restore(); throw error; }
    return result;
  } finally {
    fs.rmdirSync(lock);
  }
}

import type { ParticipatesIn, sourceChange } from '../../concepts/index.js';
export type SourceChangeMeadowConceptParticipations = [ParticipatesIn<typeof sourceChange, "apply", typeof applySourceChange>];

export function fixtureSourceGraphs(projectRoot: string, fixtureName: string): string[] {
  if (!/^home_fixture_[a-z0-9_]+$/.test(fixtureName)) throw new Error('Invalid fixture name');
  const bundles = path.join(projectRoot, 'app/shared_data/home_fixtures', fixtureName, 'bundles');
  if (!fs.existsSync(bundles)) return [];
  return [...new Set(fs.readdirSync(bundles, { withFileTypes: true }).filter(entry => entry.isDirectory()).flatMap(entry => {
    const config = YAML.parse(fs.readFileSync(path.join(bundles, entry.name, 'config/bundle_config.yaml'), 'utf8')) as { sourceDirectory?: string; sources?: { directory: string }[] };
    return (config.sources?.map(source => source.directory) ?? [config.sourceDirectory!]).map(directory => fixtureSourceLocation(directory).graph);
  }))];
}
