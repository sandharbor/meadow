/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { fixtureSourceLocation } from './fixtureSourceLocation.js';
import { materializeSourceGraph } from './sourceChanges.js';
import type { ParticipatesIn, savedState } from '../../concepts/index.js';

/**
 * Saved states are the starting points shared by Dev Tools and E2E scenarios.
 * Opening one only writes files: the application establishes Git and the
 * home's first commit itself, exactly as it does on a user's first launch.
 */

/** A fresh install: the home folder does not exist yet. */
export const EMPTY_HOME = 'empty';

const FIXTURE_PREFIX = 'home_fixture_';
/** Authored fixture metadata. It describes the fixture and is never copied into a home. */
export const HOME_FIXTURE_METADATA_FILE = 'fixture.yaml';

export interface HomeFixtureMetadata {
  /** Source graphs available to the home even when no bundle references them yet. */
  sourceGraphs: string[];
}

export function homeFixturesDirectory(projectRoot: string): string {
  return path.join(projectRoot, 'app', 'shared_data', 'home_fixtures');
}

export function isHomeFixtureName(name: string): boolean {
  return /^home_fixture_[a-z0-9_]+$/.test(name);
}

export function listHomeFixtures(projectRoot: string): string[] {
  const root = homeFixturesDirectory(projectRoot);
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && isHomeFixtureName(entry.name))
    .map(entry => entry.name)
    .sort();
}

export function homeFixtureDisplayName(fixtureName: string): string {
  return fixtureName.startsWith(FIXTURE_PREFIX) ? fixtureName.slice(FIXTURE_PREFIX.length) : fixtureName;
}

function homeFixtureDirectory(projectRoot: string, fixtureName: string): string {
  if (!isHomeFixtureName(fixtureName)) throw new Error(`Invalid home fixture name: ${fixtureName}`);
  const directory = path.join(homeFixturesDirectory(projectRoot), fixtureName);
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    throw new Error(`Home fixture not found: ${fixtureName}`);
  }
  return directory;
}

export function readHomeFixtureMetadata(projectRoot: string, fixtureName: string): HomeFixtureMetadata {
  const metadataPath = path.join(homeFixtureDirectory(projectRoot, fixtureName), HOME_FIXTURE_METADATA_FILE);
  if (!fs.existsSync(metadataPath)) return { sourceGraphs: [] };
  const parsed = YAML.parse(fs.readFileSync(metadataPath, 'utf8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${fixtureName}/${HOME_FIXTURE_METADATA_FILE} must be a mapping`);
  }
  const { sourceGraphs = [], ...unknownFields } = parsed as Record<string, unknown>;
  const unknownKeys = Object.keys(unknownFields);
  if (unknownKeys.length > 0) throw new Error(`Unknown ${HOME_FIXTURE_METADATA_FILE} field: ${unknownKeys[0]}`);
  if (!Array.isArray(sourceGraphs) || sourceGraphs.some(graph => typeof graph !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(graph))) {
    throw new Error(`${fixtureName}/${HOME_FIXTURE_METADATA_FILE} sourceGraphs must list source graph names`);
  }
  return { sourceGraphs: sourceGraphs as string[] };
}

export interface OpenHomeFixtureOptions {
  projectRoot: string;
  /** A home fixture folder name, or EMPTY_HOME. */
  fixtureName: string;
  homeDirectory: string;
  /** Per-graph relative paths to leave out of the isolated copy. */
  sourceGraphExclusions?: Readonly<Record<string, readonly string[]>>;
}

export interface OpenedHome {
  homeDirectory: string;
  /** Isolated source graphs owned by this home. */
  sourceGraphsDirectory: string;
}

function copyAuthoredFiles(from: string, to: string, isRoot: boolean): void {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    if (isRoot && entry.name === HOME_FIXTURE_METADATA_FILE) continue;
    if (entry.isSymbolicLink()) throw new Error(`Home fixtures cannot contain symlinks: ${path.join(from, entry.name)}`);
    const input = path.join(from, entry.name);
    const output = path.join(to, entry.name);
    if (entry.isDirectory()) copyAuthoredFiles(input, output, false);
    else if (entry.isFile()) {
      if (fs.existsSync(output)) throw new Error(`Opening a home fixture would overwrite ${output}`);
      fs.writeFileSync(output, fs.readFileSync(input), { mode: fs.statSync(input).mode & 0o777 });
    }
  }
}

/**
 * Open a home fixture (or the Empty Home) into a home directory. Machine-local
 * runtime files, such as resources.local.yaml or logs, may already exist there;
 * authored fixture files never overwrite them.
 */
export function openHomeFixture(options: OpenHomeFixtureOptions): OpenedHome {
  const { projectRoot, fixtureName, homeDirectory } = options;
  const sourceGraphsDirectory = path.join(homeDirectory, 'source_graphs');
  if (fixtureName === EMPTY_HOME) {
    if (fs.existsSync(homeDirectory)) throw new Error(`The Empty Home must not exist yet: ${homeDirectory}`);
    return { homeDirectory, sourceGraphsDirectory };
  }

  const fixtureDirectory = homeFixtureDirectory(projectRoot, fixtureName);
  const metadata = readHomeFixtureMetadata(projectRoot, fixtureName);
  copyAuthoredFiles(fixtureDirectory, homeDirectory, true);

  const materialize = (graph: string): string => materializeSourceGraph({
    projectRoot,
    sourceGraphsDir: sourceGraphsDirectory,
    sourceGraph: graph,
    excludeRelativePaths: options.sourceGraphExclusions?.[graph] ?? [],
  });
  for (const graph of metadata.sourceGraphs) materialize(graph);

  const bundlesDirectory = path.join(homeDirectory, 'bundles');
  if (fs.existsSync(bundlesDirectory)) {
    for (const entry of fs.readdirSync(bundlesDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const bundleConfigPath = path.join(bundlesDirectory, entry.name, 'config', 'bundle_config.yaml');
      if (!fs.existsSync(bundleConfigPath)) continue;
      const config = YAML.parse(fs.readFileSync(bundleConfigPath, 'utf8')) as Record<string, unknown>;
      const resolve = (directory: string): string => {
        const { graph, subdirectory } = fixtureSourceLocation(directory);
        return path.join(materialize(graph), subdirectory);
      };
      if (Array.isArray(config.sources)) {
        config.sources = config.sources.map((source: { directory: string }) => ({ ...source, directory: resolve(source.directory) }));
      } else if (typeof config.sourceDirectory === 'string') {
        config.sourceDirectory = resolve(config.sourceDirectory);
      }
      fs.writeFileSync(bundleConfigPath, YAML.stringify(config), 'utf8');
    }
  }
  return { homeDirectory, sourceGraphsDirectory };
}

/**
 * Home fixture files must be authored, never generated or machine-local.
 * Returns one message per violation; an empty list means the fixture is valid.
 */
export function homeFixtureViolations(projectRoot: string, fixtureName: string): string[] {
  const root = homeFixtureDirectory(projectRoot, fixtureName);
  const violations: string[] = [];
  const allowed = [
    /^fixture\.yaml$/,
    /^app\/app_config\.yaml$/,
    /^app\/hooks\/[^/]+\.(ts|js|mjs)$/,
    /^bundles\/[^/]+\/config\/(bundle_config\.yaml|bundle_node_config\.yaml|custom_filters\.json|generated_bundle_versions\.yaml)$/,
  ];
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (entry.name === '.DS_Store') continue;
      if (entry.isSymbolicLink()) violations.push(`${fixtureName}/${relative}: symlinks are not allowed`);
      else if (entry.isDirectory()) walk(absolute);
      else if (!allowed.some(pattern => pattern.test(relative))) {
        violations.push(`${fixtureName}/${relative}: home fixtures may only contain authored configuration (generated data, Git metadata, local resources, secrets, and logs belong to an opened home)`);
      }
    }
  };
  walk(root);
  try {
    readHomeFixtureMetadata(projectRoot, fixtureName);
  } catch (error) {
    violations.push(error instanceof Error ? error.message : String(error));
  }
  return violations;
}

export type SavedStateMeadowConceptParticipations = [
  ParticipatesIn<typeof savedState, "open-fixture", typeof openHomeFixture>,
];
