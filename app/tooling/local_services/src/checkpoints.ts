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
import type { BundleSource } from "../../../contracts/types/bundleConfig.js";
import { editorViewSessionPrefix, isEditorViewCheckpoint, type EditorViewCheckpoint } from "../../../contracts/types/editorViewCheckpoint.js";
import { sourceConfigFingerprint, sourceInventory } from "../../../shared_code/utils/sourceSnapshotFingerprint.js";
import type { LocalServiceContainer, LocalServicePart } from "./parts.js";
import { hostedServiceReferences } from "./providerSeeding.js";
import type { checkpoint, checkpointViewRestoration, ParticipatesIn } from "../../../concepts/index.js";

/**
 * A checkpoint repository holds one commit per checkpoint:
 *
 *   checkpoint.json   metadata (parts, formats, code revision, ports)
 *   home/             the Meadow Home work tree, including ignored files
 *   home.git/         the home's own Git repository, without its objects
 *   home.git-objects  every object id in that repository (version 2)
 *   parts/<part>/     each Local Services part's partition state
 *
 * Version 2 stores the home's Git objects as objects of the checkpoint
 * repository rather than as copies of their compressed files, so they share
 * storage and deltas with everything else. Version 1 checkpoints kept the
 * whole .git directory as files and still restore.
 *
 * The home's live repository is never written during a scenario.
 */

export const CHECKPOINT_REPO_DIRECTORY = "checkpoint-state-repo";
const CHECKPOINT_REF_PREFIX = "refs/checkpoints/";
const HOME_GIT_OBJECTS_FILE = "home.git-objects";
/** Logs and disposable caches are not state worth restoring. */
const EXCLUDED_HOME_PATHS = ["logs", "cache/source-index", "cache/editor-view"];
// durableDocument publishes through PID/UUID siblings. They are in-progress
// writes, not saved state, and can vanish while Git reads a running home.
const DOCUMENT_SCRATCH_EXCLUDES = ['tmp', 'rollback', 'lock-owner'].map(purpose =>
  `:(glob,exclude)**/.*.${purpose}.[0-9]*.????????-????-????-????-????????????`);

export interface CheckpointMetadata {
  version: 1 | 2;
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
  editorView?: EditorViewCheckpoint;
}

export interface CheckpointSummary {
  index: number;
  commit: string;
  metadata: CheckpointMetadata;
}

function git(repo: string, args: string[], options: { env?: Record<string, string>; input?: string | Buffer } = {}): string {
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
    // An empty template leaves out sample hooks, which every repository would copy.
    execFileSync("git", ["init", "--bare", "--quiet", "--template=", repo], { stdio: "ignore" });
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
        git(repo, ["--work-tree", workTree, "add", "--all", "--force", "--", ".", ...excludes.map(exclude => `:(exclude)${exclude}`), ...DOCUMENT_SCRATCH_EXCLUDES], { env });
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

/**
 * Copy the home repository's objects into the checkpoint store, skipping
 * those it already holds, and return their ids. Every object is kept,
 * reachable or not, so a restored repository is the one captured.
 */
function storeHomeObjects(repo: string, homeGit: string, objectEnv: Record<string, string>): string {
  const ids = execFileSync("git", ["--git-dir", homeGit, "cat-file", "--batch-all-objects", "--batch-check=%(objectname)"], {
    encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"],
  }).trim().split("\n").filter(Boolean).sort();
  if (ids.length === 0) return "";
  const listing = `${ids.join("\n")}\n`;
  const missing = git(repo, ["cat-file", "--batch-check=%(objectname) %(objecttype)"], { env: objectEnv, input: listing })
    .split("\n").filter(line => line.endsWith(" missing")).map(line => line.split(" ")[0]);
  if (missing.length > 0) {
    const pack = execFileSync("git", ["--git-dir", homeGit, "pack-objects", "--stdout", "-q"], {
      input: `${missing.join("\n")}\n`, maxBuffer: 1024 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"],
    });
    execFileSync("git", ["--git-dir", repo, "unpack-objects", "-q"], {
      input: pack, env: { ...process.env, ...objectEnv }, stdio: ["pipe", "pipe", "pipe"],
    });
  }
  return listing;
}

/** Write a version 2 checkpoint's home objects into a restored repository. */
function restoreHomeObjects(repo: string, commit: string, gitDirectory: string): void {
  fs.mkdirSync(path.join(gitDirectory, "objects", "info"), { recursive: true });
  fs.mkdirSync(path.join(gitDirectory, "objects", "pack"), { recursive: true });
  const listing = execFileSync("git", ["--git-dir", repo, "show", `${commit}:${HOME_GIT_OBJECTS_FILE}`], {
    encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"],
  });
  if (!listing.trim()) return;
  const pack = execFileSync("git", ["--git-dir", repo, "pack-objects", "--stdout", "-q"], {
    input: listing, maxBuffer: 1024 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"],
  });
  execFileSync("git", ["--git-dir", gitDirectory, "unpack-objects", "-q"], { input: pack, stdio: ["pipe", "pipe", "pipe"] });
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
  editorView?: EditorViewCheckpoint;
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
      version: 2,
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
      ...(options.editorView && { editorView: options.editorView }),
    };
    fs.writeFileSync(path.join(staging, "checkpoint.json"), `${JSON.stringify(metadata, null, 2)}\n`);
    const homeGit = path.join(options.homeDirectory, ".git");
    if (fs.existsSync(homeGit)) {
      fs.writeFileSync(path.join(staging, HOME_GIT_OBJECTS_FILE), storeHomeObjects(options.repo, homeGit, objectEnv));
    }

    const stagingTree = treeOf(options.repo, staging, objectEnv);
    const homeTree = fs.existsSync(options.homeDirectory) ? treeOf(options.repo, options.homeDirectory, objectEnv, EXCLUDED_HOME_PATHS) : null;
    const homeGitTree = fs.existsSync(homeGit) ? treeOf(options.repo, homeGit, objectEnv, ["objects"]) : null;

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
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "meadow-checkpoint-archive-"));
  try {
    const archive = path.join(staging, "tree.tar");
    execFileSync("git", ["--git-dir", repo, "archive", "--format=tar", "--output", archive, treeish]);
    // tar may exit before consuming trailing archive padding from a pipe.
    // Reading a file avoids reporting EPIPE after a successful extraction.
    execFileSync("tar", ["-xf", archive, "-C", destination]);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  return true;
}

/**
 * Bundle configurations hold absolute source directories inside the captured
 * home's isolated source graphs. Point them at the restored copies; the
 * retained snapshots and pending proposals follow that same relocation.
 */
function sourceDirectoryRepoint(homeDirectory: string, capturedHome: string) {
  const prefixes = [...new Set([capturedHome, fs.existsSync(capturedHome) ? fs.realpathSync(capturedHome) : capturedHome])]
    .map(prefix => `${prefix.replace(/\/$/, "")}/`);
  return (directory: unknown): unknown => {
    if (typeof directory !== "string") return directory;
    const prefix = prefixes.find(candidate => directory.startsWith(candidate));
    return prefix ? path.join(homeDirectory, directory.slice(prefix.length)) : directory;
  };
}

function repointConfigurationValue(value: unknown, repoint: (directory: unknown) => unknown, field?: string): unknown {
  if (field === 'directory' || field === 'sourceDirectory') return repoint(value);
  if (Array.isArray(value)) return value.map(item => repointConfigurationValue(item, repoint));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, repointConfigurationValue(item, repoint, key)]));
  return value;
}

function relocateEditorView(view: EditorViewCheckpoint, homeDirectory: string, capturedHome: string): EditorViewCheckpoint {
  const repoint = sourceDirectoryRepoint(homeDirectory, capturedHome);
  return { ...view, session: Object.fromEntries(Object.entries(view.session).map(([key, serialized]) => {
    if (!key.startsWith(editorViewSessionPrefix)) return [key, serialized];
    const configuration = JSON.parse(serialized) as { bundle?: unknown };
    if (configuration.bundle) configuration.bundle = repointConfigurationValue(configuration.bundle, repoint);
    return [key, JSON.stringify(configuration)];
  })) };
}

function repointSourceDirectories(homeDirectory: string, capturedHome: string): void {
  const bundles = path.join(homeDirectory, "bundles");
  if (!fs.existsSync(bundles)) return;
  const repoint = sourceDirectoryRepoint(homeDirectory, capturedHome);
  for (const bundle of fs.readdirSync(bundles)) {
    const bundleDirectory = path.join(bundles, bundle);
    const beforeFingerprint = sourceConfigFingerprint(bundleDirectory);
    const configPath = path.join(bundles, bundle, "config", "bundle_config.yaml");
    if (!fs.existsSync(configPath)) continue;
    const config = YAML.parse(fs.readFileSync(configPath, "utf8")) as { sources?: { directory?: unknown }[]; sourceDirectory?: unknown };
    const before = JSON.stringify(config);
    if (Array.isArray(config.sources)) config.sources = config.sources.map(source => ({ ...source, directory: repoint(source.directory) }));
    if (config.sourceDirectory !== undefined) config.sourceDirectory = repoint(config.sourceDirectory);
    if (JSON.stringify(config) !== before) fs.writeFileSync(configPath, YAML.stringify(config), "utf8");

    const proposalPath = path.join(bundleDirectory, 'raw/sourcing/proposal.json');
    if (fs.existsSync(proposalPath)) {
      const proposal = JSON.parse(fs.readFileSync(proposalPath, 'utf8')) as {
        original: { bundle: typeof config }; proposed: { bundle: typeof config };
        resolutions: { path: string[]; original?: unknown; saved?: unknown; proposed?: unknown }[];
      };
      for (const configuration of [proposal.original, proposal.proposed]) {
        if (configuration.bundle.sourceDirectory !== undefined) configuration.bundle.sourceDirectory = repoint(configuration.bundle.sourceDirectory);
        if (configuration.bundle.sources) configuration.bundle.sources = configuration.bundle.sources.map(source => ({ ...source, directory: repoint(source.directory) }));
      }
      for (const resolution of proposal.resolutions) {
        if (resolution.path[0] !== 'bundle') continue;
        for (const side of ['original', 'saved', 'proposed'] as const) if (resolution[side] !== undefined) resolution[side] = repointConfigurationValue(resolution[side], repoint, resolution.path.at(-1));
      }
      fs.writeFileSync(proposalPath, `${JSON.stringify(proposal, null, 2)}\n`);
    }

    // Retained snapshots must describe the same relocated registry as the
    // bundle. Otherwise an unchanged refresh creates a content-free candidate.
    const snapshots = path.join(bundleDirectory, "raw/sourcing/snapshots");
    if (!fs.existsSync(snapshots)) continue;
    const repointSources = (sources: BundleSource[]) => sources.map(source => ({
      ...source, directory: repoint(source.directory) as string,
    }));
    for (const id of fs.readdirSync(snapshots)) {
      const snapshotPath = path.join(snapshots, id, "snapshot.json");
      if (!fs.existsSync(snapshotPath)) continue;
      const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8")) as {
        sources?: BundleSource[]; files: Record<string, { digest: string; size: number }>;
        directories: string[]; digest: string;
        sourceProposal?: { sources: BundleSource[]; baseConfigFingerprint: string };
      };
      const original = JSON.stringify(snapshot);
      if (snapshot.sources) {
        const sources = repointSources(snapshot.sources);
        if (JSON.stringify(sources) !== JSON.stringify(snapshot.sources)) {
          if (sourceInventory(snapshot.files, snapshot.directories, snapshot.sources).digest !== snapshot.digest) {
            throw new Error(`Cannot relocate corrupt source snapshot ${id}`);
          }
          snapshot.sources = sources;
          snapshot.digest = sourceInventory(snapshot.files, snapshot.directories, sources).digest;
        }
      }
      if (snapshot.sourceProposal) {
        snapshot.sourceProposal.sources = repointSources(snapshot.sourceProposal.sources);
        // Preserve stale proposals; only a proposal valid before relocation
        // may acquire the relocated configuration's fingerprint.
        if (snapshot.sourceProposal.baseConfigFingerprint === beforeFingerprint) {
          snapshot.sourceProposal.baseConfigFingerprint = sourceConfigFingerprint(bundleDirectory);
        }
      }
      if (JSON.stringify(snapshot) !== original) fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
    }
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
  const homeGit = path.join(options.homeDirectory, ".git");
  if (extractTree(options.repo, `${checkpoint.commit}:home.git`, homeGit) && checkpoint.metadata.version >= 2) {
    restoreHomeObjects(options.repo, checkpoint.commit, homeGit);
  }
  repointSourceDirectories(options.homeDirectory, checkpoint.metadata.homeDirectory);
  if (checkpoint.metadata.editorView) {
    if (!isEditorViewCheckpoint(checkpoint.metadata.editorView)) throw new Error('The checkpoint contains invalid presentation state');
    const filename = path.join(options.homeDirectory, 'cache', 'editor-view', 'checkpoint.json');
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, JSON.stringify({ id: `${checkpoint.commit}:${options.homeDirectory}`, view: relocateEditorView(checkpoint.metadata.editorView, options.homeDirectory, checkpoint.metadata.homeDirectory) }));
  }

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
  ParticipatesIn<typeof checkpointViewRestoration, "capture-view", typeof captureCheckpoint>,
  ParticipatesIn<typeof checkpoint, "restore", typeof restoreCheckpoint>,
];
