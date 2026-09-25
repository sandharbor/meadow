/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import {
  CURRENT_MEADOW_HOME_FORMAT_VERSION,
  MEADOW_HOME_MANIFEST_FILENAME,
  OLDEST_UPGRADABLE_MEADOW_HOME_FORMAT_VERSION,
} from "../../../shared_code/utils/meadowHomeFormat.js";
import type { LocalServiceContainer, LocalServicePart } from "./parts.js";
import { hostedServiceReferences } from "./providerSeeding.js";
import type { checkpoint, ParticipatesIn } from "../../../concepts/index.js";

/**
 * A checkpoint repository holds one commit per checkpoint:
 *
 *   checkpoint.json   metadata (parts, formats, code revision, ports)
 *   home/             the Meadow Home work tree, including ignored files
 *   home.git/         the home's own Git repository
 *   parts/<part>/     each Local Services part's partition state
 *
 * The home's live repository is never written during a scenario.
 */

export const CHECKPOINT_REPO_DIRECTORY = "checkpoint-state-repo";
const CHECKPOINT_REF_PREFIX = "refs/checkpoints/";
/** Logs and disposable caches are not state worth restoring. */
const EXCLUDED_HOME_PATHS = ["logs", "cache/source-index"];

export interface CheckpointMetadata {
  version: 1;
  index: number;
  message: string;
  capturedAt: string;
  partition: string;
  /** Where the home lived when captured; restore re-points paths under it. */
  homeDirectory: string;
  parts: { id: string; displayName: string; hasState: boolean }[];
  home: { formatVersion: number | null; lastWrittenByAppVersion: string | null };
  codeRevision: string;
  uncommittedCode: boolean;
  /** Ports to prefer on restore so stored local URLs keep working. */
  ports: Record<string, number>;
  fixtureHome: string;
  scenario: string;
  /** The App Place the scenario's page was at, when it had one. */
  place?: string;
  /** Dialogs open at the checkpoint and whether places account for them. */
  openDialogs?: { name: string; classification: 'surface' | 'transient' | 'unaddressable' }[];
}

export interface CheckpointSummary {
  index: number;
  commit: string;
  metadata: CheckpointMetadata;
}

function git(repo: string, args: string[], options: { env?: Record<string, string>; input?: string } = {}): string {
  return execFileSync("git", ["--git-dir", repo, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...options.env },
    input: options.input,
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

/**
 * Scenario repositories in one run share an object store: every scenario
 * copies the same fixture source graphs, so storing them once keeps a full
 * run's checkpoints small. Readers find shared objects through alternates.
 */
function ensureRepository(repo: string, sharedObjectsDirectory?: string): Record<string, string> {
  if (!fs.existsSync(path.join(repo, "HEAD"))) {
    fs.mkdirSync(repo, { recursive: true });
    execFileSync("git", ["init", "--bare", "--quiet", repo], { stdio: "ignore" });
  }
  if (!sharedObjectsDirectory) return {};
  fs.mkdirSync(sharedObjectsDirectory, { recursive: true });
  const objects = path.join(repo, "objects");
  const alternates = path.join(objects, "info", "alternates");
  fs.mkdirSync(path.dirname(alternates), { recursive: true });
  fs.writeFileSync(alternates, `${path.relative(objects, sharedObjectsDirectory)}\n`);
  return { GIT_OBJECT_DIRECTORY: sharedObjectsDirectory, GIT_ALTERNATE_OBJECT_DIRECTORIES: objects };
}

/** Write a work tree's files, including ignored ones, into a tree object. */
function treeOf(repo: string, workTree: string, objectEnv: Record<string, string>, excludes: string[] = []): string {
  const index = path.join(os.tmpdir(), `meadow-checkpoint-index-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  try {
    const env = { ...objectEnv, GIT_INDEX_FILE: index };
    // The application keeps running while a checkpoint is captured, so a
    // generated file can vanish between listing and reading. Retry until one
    // pass sees a consistent tree.
    for (let attempt = 1; ; attempt++) {
      try {
        fs.rmSync(index, { force: true });
        git(repo, ["--work-tree", workTree, "add", "--all", "--force", "--", ".", ...excludes.map(exclude => `:(exclude)${exclude}`)], { env });
        return git(repo, ["write-tree"], { env });
      } catch (error) {
        const vanished = /unable to stat|No such file or directory|unable to index file/.test(String((error as { stderr?: unknown }).stderr ?? error));
        if (!vanished || attempt >= 5) throw error;
      }
    }
  } finally {
    fs.rmSync(index, { force: true });
  }
}

function readHomeFormat(homeDirectory: string): CheckpointMetadata["home"] {
  const manifestPath = path.join(homeDirectory, MEADOW_HOME_MANIFEST_FILENAME);
  if (!fs.existsSync(manifestPath)) return { formatVersion: null, lastWrittenByAppVersion: null };
  const manifest = YAML.parse(fs.readFileSync(manifestPath, "utf8")) as { formatVersion?: unknown; lastWrittenByAppVersion?: unknown };
  return {
    formatVersion: typeof manifest.formatVersion === "number" ? manifest.formatVersion : null,
    lastWrittenByAppVersion: typeof manifest.lastWrittenByAppVersion === "string" ? manifest.lastWrittenByAppVersion : null,
  };
}

export interface CaptureCheckpointOptions {
  repo: string;
  homeDirectory: string;
  parts: readonly LocalServicePart[];
  containers: Readonly<Record<string, LocalServiceContainer>>;
  partition: string;
  message: string;
  codeRevision: string;
  uncommittedCode: boolean;
  ports: Record<string, number>;
  fixtureHome: string;
  scenario: string;
  place?: string;
  openDialogs?: CheckpointMetadata['openDialogs'];
  /** Object store shared by every scenario repository in a run. */
  sharedObjectsDirectory?: string;
}

export async function captureCheckpoint(options: CaptureCheckpointOptions): Promise<CheckpointSummary> {
  const hosted = hostedServiceReferences(options.homeDirectory);
  if (hosted.length > 0) {
    throw new Error(`Checkpoints only capture homes wired to Local Services; found hosted settings: ${hosted.join(", ")}`);
  }
  const objectEnv = ensureRepository(options.repo, options.sharedObjectsDirectory);
  const existing = listCheckpoints(options.repo);
  const index = existing.length + 1;
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "meadow-checkpoint-"));
  try {
    const parts: CheckpointMetadata["parts"] = [];
    for (const part of options.parts) {
      const container = options.containers[part.id];
      if (!container) continue;
      const directory = path.join(staging, "parts", part.id);
      fs.mkdirSync(directory, { recursive: true });
      const hasState = await part.capture(container, options.partition, directory);
      // Git does not store empty directories; keep every captured part visible.
      fs.writeFileSync(path.join(directory, ".part"), `${part.id}\n`);
      parts.push({ id: part.id, displayName: part.displayName, hasState });
    }
    const metadata: CheckpointMetadata = {
      version: 1,
      index,
      message: options.message,
      capturedAt: new Date().toISOString(),
      partition: options.partition,
      homeDirectory: options.homeDirectory,
      parts,
      home: readHomeFormat(options.homeDirectory),
      codeRevision: options.codeRevision,
      uncommittedCode: options.uncommittedCode,
      ports: options.ports,
      fixtureHome: options.fixtureHome,
      scenario: options.scenario,
      ...(options.place && { place: options.place }),
      ...(options.openDialogs && { openDialogs: options.openDialogs }),
    };
    fs.writeFileSync(path.join(staging, "checkpoint.json"), `${JSON.stringify(metadata, null, 2)}\n`);

    const stagingTree = treeOf(options.repo, staging, objectEnv);
    const homeTree = fs.existsSync(options.homeDirectory) ? treeOf(options.repo, options.homeDirectory, objectEnv, EXCLUDED_HOME_PATHS) : null;
    const homeGit = path.join(options.homeDirectory, ".git");
    const homeGitTree = fs.existsSync(homeGit) ? treeOf(options.repo, homeGit, objectEnv) : null;

    const combinedIndex = path.join(staging, ".combined-index");
    const env = { ...objectEnv, GIT_INDEX_FILE: combinedIndex };
    git(options.repo, ["read-tree", stagingTree], { env });
    if (homeTree) git(options.repo, ["--work-tree", staging, "read-tree", "--prefix=home/", homeTree], { env });
    if (homeGitTree) git(options.repo, ["--work-tree", staging, "read-tree", "--prefix=home.git/", homeGitTree], { env });
    const tree = git(options.repo, ["write-tree"], { env });
    const parent = existing.at(-1)?.commit;
    const commitEnv = {
      GIT_AUTHOR_NAME: "meadow-checkpoint", GIT_AUTHOR_EMAIL: "checkpoint@meadow.invalid",
      GIT_COMMITTER_NAME: "meadow-checkpoint", GIT_COMMITTER_EMAIL: "checkpoint@meadow.invalid",
    };
    const commit = git(options.repo, ["commit-tree", tree, ...(parent ? ["-p", parent] : []), "-m", `CP${metadata.index}: ${options.message}`], { env: { ...objectEnv, ...commitEnv } });
    git(options.repo, ["update-ref", `${CHECKPOINT_REF_PREFIX}${String(metadata.index).padStart(4, "0")}`, commit]);
    git(options.repo, ["update-ref", "refs/heads/main", commit]);
    return { index: metadata.index, commit, metadata };
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

export function listCheckpoints(repo: string): CheckpointSummary[] {
  if (!fs.existsSync(path.join(repo, "HEAD"))) return [];
  const refs = git(repo, ["for-each-ref", "--format=%(refname) %(objectname)", CHECKPOINT_REF_PREFIX]);
  if (!refs) return [];
  return refs.split("\n").map(line => {
    const [, commit] = line.split(" ");
    const metadata = JSON.parse(git(repo, ["show", `${commit}:checkpoint.json`])) as CheckpointMetadata;
    return { index: metadata.index, commit, metadata };
  }).sort((a, b) => a.index - b.index);
}

export interface CheckpointCompatibility {
  openable: boolean;
  reason?: string;
  /** Set when normal startup will upgrade the home's format. */
  upgradeFromFormat?: number;
}

export function checkpointCompatibility(metadata: CheckpointMetadata): CheckpointCompatibility {
  const format = metadata.home.formatVersion;
  if (format === null) return { openable: true };
  if (format > CURRENT_MEADOW_HOME_FORMAT_VERSION) {
    return { openable: false, reason: `Home format ${format} is newer than this checkout supports (${CURRENT_MEADOW_HOME_FORMAT_VERSION}).` };
  }
  if (format < OLDEST_UPGRADABLE_MEADOW_HOME_FORMAT_VERSION) {
    return { openable: false, reason: `Home format ${format} is older than this checkout can upgrade.` };
  }
  return format < CURRENT_MEADOW_HOME_FORMAT_VERSION ? { openable: true, upgradeFromFormat: format } : { openable: true };
}

function extractTree(repo: string, treeish: string, destination: string): boolean {
  try {
    git(repo, ["rev-parse", "--verify", "--quiet", treeish]);
  } catch {
    return false;
  }
  fs.mkdirSync(destination, { recursive: true });
  const archive = execFileSync("git", ["--git-dir", repo, "archive", "--format=tar", treeish], { maxBuffer: 1024 * 1024 * 1024 });
  execFileSync("tar", ["-x", "-C", destination], { input: archive });
  return true;
}

/**
 * Bundle configurations hold absolute source directories inside the captured
 * home's isolated source graphs. Point them at the restored copies; the
 * application sees an ordinary local relocation of the same sources.
 */
function repointSourceDirectories(homeDirectory: string, capturedHome: string): void {
  const bundles = path.join(homeDirectory, "bundles");
  if (!fs.existsSync(bundles)) return;
  const prefixes = [...new Set([capturedHome, fs.existsSync(capturedHome) ? fs.realpathSync(capturedHome) : capturedHome])]
    .map(prefix => `${prefix.replace(/\/$/, "")}/`);
  const repoint = (directory: unknown): unknown => {
    if (typeof directory !== "string") return directory;
    const prefix = prefixes.find(candidate => directory.startsWith(candidate));
    return prefix ? path.join(homeDirectory, directory.slice(prefix.length)) : directory;
  };
  for (const bundle of fs.readdirSync(bundles)) {
    const configPath = path.join(bundles, bundle, "config", "bundle_config.yaml");
    if (!fs.existsSync(configPath)) continue;
    const config = YAML.parse(fs.readFileSync(configPath, "utf8")) as { sources?: { directory?: unknown }[]; sourceDirectory?: unknown };
    const before = JSON.stringify(config);
    if (Array.isArray(config.sources)) config.sources = config.sources.map(source => ({ ...source, directory: repoint(source.directory) }));
    if (config.sourceDirectory !== undefined) config.sourceDirectory = repoint(config.sourceDirectory);
    if (JSON.stringify(config) !== before) fs.writeFileSync(configPath, YAML.stringify(config), "utf8");
  }
}

export interface RestoreCheckpointOptions {
  repo: string;
  index: number;
  homeDirectory: string;
  parts: readonly LocalServicePart[];
  containers: Readonly<Record<string, LocalServiceContainer>>;
  partition: string;
  /** False restores only the home, for a checkpoint that held no service state. */
  restoreParts?: boolean;
}

/** Restore a checkpoint's home and every captured part into fresh destinations. */
export async function restoreCheckpoint(options: RestoreCheckpointOptions): Promise<CheckpointSummary> {
  const checkpoint = listCheckpoints(options.repo).find(candidate => candidate.index === options.index);
  if (!checkpoint) throw new Error(`Checkpoint ${options.index} not found in ${options.repo}`);
  const compatibility = checkpointCompatibility(checkpoint.metadata);
  if (!compatibility.openable) throw new Error(compatibility.reason);
  if (fs.existsSync(options.homeDirectory)) throw new Error(`Restore destination already exists: ${options.homeDirectory}`);

  extractTree(options.repo, `${checkpoint.commit}:home`, options.homeDirectory);
  extractTree(options.repo, `${checkpoint.commit}:home.git`, path.join(options.homeDirectory, ".git"));
  repointSourceDirectories(options.homeDirectory, checkpoint.metadata.homeDirectory);

  if (options.restoreParts === false) return checkpoint;
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "meadow-checkpoint-restore-"));
  try {
    for (const captured of checkpoint.metadata.parts) {
      const part = options.parts.find(candidate => candidate.id === captured.id);
      const container = options.containers[captured.id];
      if (!part || !container) {
        throw new Error(`Checkpoint needs ${captured.displayName}, which is not mounted in this checkout`);
      }
      const directory = path.join(staging, captured.id);
      extractTree(options.repo, `${checkpoint.commit}:parts/${captured.id}`, directory);
      fs.rmSync(path.join(directory, ".part"), { force: true });
      await part.restore(container, options.partition, directory);
    }
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  return checkpoint;
}

export type CheckpointMeadowConceptParticipations = [
  ParticipatesIn<typeof checkpoint, "capture", typeof captureCheckpoint>,
  ParticipatesIn<typeof checkpoint, "restore", typeof restoreCheckpoint>,
];
