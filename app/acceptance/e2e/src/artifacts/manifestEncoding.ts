/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

// On disk, a manifest leaves out what readers can rebuild: tick listings
// repeated from the previous tick, file listings that follow from each
// tick's added and removed files, and captured file contents, which live as
// git blobs in the scenario's Meadow Home state repository (and so in the
// run's shared object store, where scenarios share one copy). The report
// viewer expands a manifest back to its full form before serving it.

import { execFileSync } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { writeLooseBlob } from "../run/stateRepoCompaction.ts";

export const COMPACT_MANIFEST_ENCODING = 1;

const CONTENT_FIELDS = [
  ["uncommittedFileContents", "uncommittedFileContentBlobs"],
  ["ignoredFileContents", "ignoredFileContentBlobs"],
] as const;
const CARRIED_TICK_FIELDS = ["uncommittedFiles", "ignoredFiles"] as const;
// Placeholders and tiny files are cheaper inline than as objects.
const MIN_BLOB_CHARACTERS = 256;

type Tick = Record<string, unknown> & { addedFiles?: string[]; removedFiles?: string[]; tickIndex?: number };
type ManifestLike = {
  ticks?: object[];
  tickFileListing?: Record<number, string[]>;
  manifestEncoding?: number;
  tickFileListingFromDeltas?: boolean;
  firstTickAddsListing?: boolean;
  homeCommits?: unknown;
  homeCommitMeta?: unknown;
  homeCommitMetaIsHomeCommits?: boolean;
};

type FileStatus = { path: string; status: string };
/** Statuses that left the list, and entries that arrived or changed. */
type StatusDelta = { removed: string[]; upserted: FileStatus[] };

function statusDelta(before: FileStatus[], after: FileStatus[]): StatusDelta {
  const beforeByPath = new Map(before.map(entry => [entry.path, entry.status]));
  const afterPaths = new Set(after.map(entry => entry.path));
  return {
    removed: before.filter(entry => !afterPaths.has(entry.path)).map(entry => entry.path),
    upserted: after.filter(entry => beforeByPath.get(entry.path) !== entry.status),
  };
}

/** Status lists are sorted by path, so a rebuilt list sorts the same way. */
function applyStatusDelta(before: FileStatus[], delta: StatusDelta): FileStatus[] {
  const byPath = new Map(before.map(entry => [entry.path, entry]));
  for (const removed of delta.removed) byPath.delete(removed);
  for (const entry of delta.upserted) byPath.set(entry.path, entry);
  return [...byPath.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** The git directory holding a scenario's content blobs. */
export function contentBlobGitDir(scenarioDirectory: string): string {
  return path.join(scenarioDirectory, "meadowHome-state-repo", ".git");
}

function rebuildTickFileListing(ticks: Tick[], first: string[]): Record<number, string[]> {
  const listing: Record<number, string[]> = {};
  if (ticks.length === 0) return listing;
  let current = new Set(first);
  listing[ticks[0].tickIndex ?? 0] = first;
  for (const tick of ticks.slice(1)) {
    const added = tick.addedFiles ?? [];
    const removed = tick.removedFiles ?? [];
    if (added.length === 0 && removed.length === 0) continue;
    current = new Set(current);
    for (const file of removed) current.delete(file);
    for (const file of added) current.add(file);
    listing[tick.tickIndex ?? 0] = [...current].sort();
  }
  return listing;
}

function sameListing(a: Record<number, string[]>, b: Record<number, string[]>): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every(key => {
    const left = a[Number(key)];
    const right = b[Number(key)];
    return right !== undefined && left.length === right.length && left.every((file, i) => file === right[i]);
  });
}

/**
 * The on-disk form of a manifest. `objectsDirectory` receives content blobs;
 * without one, contents stay inline.
 */
export function compactManifest<M extends ManifestLike>(manifest: M, objectsDirectory: string | null): M {
  const ticks = (manifest.ticks ?? []) as Tick[];
  const compactTicks: Tick[] = [];
  const previous = new Map<string, string>();
  let previousStatuses: FileStatus[] | null = null;
  for (const tick of ticks) {
    const compact: Tick = { ...tick };
    for (const field of CARRIED_TICK_FIELDS) {
      if (compact[field] === undefined) continue;
      const encoded = JSON.stringify(compact[field]);
      if (compactTicks.length > 0 && previous.get(field) === encoded) delete compact[field];
      previous.set(field, encoded);
    }
    // A changed status list is usually a few entries away from the last one.
    const statuses = tick.uncommittedFiles as FileStatus[] | undefined;
    if (compact.uncommittedFiles !== undefined && statuses && previousStatuses) {
      const delta = statusDelta(previousStatuses, statuses);
      if (JSON.stringify(applyStatusDelta(previousStatuses, delta)) === JSON.stringify(statuses)
        && JSON.stringify(delta).length < JSON.stringify(statuses).length) {
        delete compact.uncommittedFiles;
        compact.uncommittedFilesDelta = delta;
      }
    }
    if (statuses) previousStatuses = statuses;
    if (objectsDirectory) {
      for (const [field, blobField] of CONTENT_FIELDS) {
        const contents = compact[field] as Record<string, string> | undefined;
        if (!contents) continue;
        const inline: Record<string, string> = {};
        const blobs: Record<string, string> = {};
        for (const [filePath, content] of Object.entries(contents)) {
          if (content.length < MIN_BLOB_CHARACTERS) inline[filePath] = content;
          else blobs[filePath] = writeLooseBlob(objectsDirectory, Buffer.from(content, "utf8"));
        }
        compact[field] = inline;
        if (Object.keys(blobs).length > 0) compact[blobField] = blobs;
      }
    }
    compactTicks.push(compact);
  }

  let tickFileListing = manifest.tickFileListing;
  let tickFileListingFromDeltas = false;
  if (tickFileListing && ticks.length > 0) {
    const first = tickFileListing[ticks[0].tickIndex ?? 0];
    // Only drop listings when they rebuild exactly.
    if (first && sameListing(rebuildTickFileListing(ticks, first), tickFileListing)) {
      tickFileListing = { [ticks[0].tickIndex ?? 0]: first };
      tickFileListingFromDeltas = true;
    }
  }
  // The first tick adds every file in the first listing.
  const firstListing = tickFileListing?.[ticks[0]?.tickIndex ?? 0];
  const firstTickAddsListing = firstListing !== undefined
    && JSON.stringify(ticks[0].addedFiles) === JSON.stringify(firstListing);
  if (firstTickAddsListing) delete compactTicks[0].addedFiles;

  // Home commit metadata is computed exactly like the home commits.
  const homeCommitMetaIsHomeCommits = manifest.homeCommits !== undefined
    && JSON.stringify(manifest.homeCommitMeta) === JSON.stringify(manifest.homeCommits);

  const compact: M = {
    ...manifest,
    manifestEncoding: COMPACT_MANIFEST_ENCODING,
    ticks: compactTicks,
    ...(tickFileListing && { tickFileListing }),
    ...(tickFileListingFromDeltas && { tickFileListingFromDeltas }),
    ...(firstTickAddsListing && { firstTickAddsListing }),
    ...(homeCommitMetaIsHomeCommits && { homeCommitMetaIsHomeCommits }),
  };
  if (homeCommitMetaIsHomeCommits) delete compact.homeCommitMeta;
  return compact;
}

function readBlobs(gitDir: string, ids: string[]): Map<string, string> {
  const blobs = new Map<string, string>();
  if (ids.length === 0 || !existsSync(gitDir)) return blobs;
  const output = execFileSync("git", ["--git-dir", gitDir, "cat-file", "--batch"], {
    input: ids.map(id => `${id}\n`).join(""),
    maxBuffer: 2 * 1024 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let offset = 0;
  while (offset < output.length) {
    const lineEnd = output.indexOf(0x0a, offset);
    if (lineEnd < 0) break;
    const [id, type, size] = output.subarray(offset, lineEnd).toString("utf8").split(" ");
    offset = lineEnd + 1;
    if (type === "missing" || size === undefined) continue;
    const length = Number(size);
    blobs.set(id, output.subarray(offset, offset + length).toString("utf8"));
    offset += length + 1;
  }
  return blobs;
}

/** The full form of a manifest, whether or not it was stored compactly. */
export function expandManifest<M extends ManifestLike>(manifest: M, scenarioDirectory: string): M {
  if (manifest.manifestEncoding !== COMPACT_MANIFEST_ENCODING) return manifest;
  const ticks = (manifest.ticks ?? []) as Tick[];
  const ids = new Set<string>();
  for (const tick of ticks) {
    for (const [, blobField] of CONTENT_FIELDS) {
      for (const id of Object.values((tick[blobField] as Record<string, string> | undefined) ?? {})) ids.add(id);
    }
  }
  const blobs = readBlobs(contentBlobGitDir(scenarioDirectory), [...ids]);

  const carried = new Map<string, unknown>();
  const expandedTicks = ticks.map(tick => {
    const expanded: Tick = { ...tick };
    if (expanded.uncommittedFilesDelta !== undefined) {
      expanded.uncommittedFiles = applyStatusDelta(
        (carried.get("uncommittedFiles") as FileStatus[] | undefined) ?? [],
        expanded.uncommittedFilesDelta as StatusDelta,
      );
      delete expanded.uncommittedFilesDelta;
    }
    for (const field of CARRIED_TICK_FIELDS) {
      if (expanded[field] === undefined) {
        if (carried.has(field)) expanded[field] = carried.get(field);
      } else {
        carried.set(field, expanded[field]);
      }
    }
    for (const [field, blobField] of CONTENT_FIELDS) {
      const references = expanded[blobField] as Record<string, string> | undefined;
      if (!references) continue;
      const contents = { ...((expanded[field] as Record<string, string> | undefined) ?? {}) };
      for (const [filePath, id] of Object.entries(references)) {
        const content = blobs.get(id);
        if (content !== undefined) contents[filePath] = content;
      }
      expanded[field] = contents;
      delete expanded[blobField];
    }
    return expanded;
  });

  const first = manifest.tickFileListing?.[ticks[0]?.tickIndex ?? 0];
  if (manifest.firstTickAddsListing && first && expandedTicks.length > 0) {
    expandedTicks[0] = { ...expandedTicks[0], addedFiles: first };
  }
  const expanded: ManifestLike = { ...manifest, ticks: expandedTicks };
  delete expanded.manifestEncoding;
  delete expanded.tickFileListingFromDeltas;
  delete expanded.firstTickAddsListing;
  delete expanded.homeCommitMetaIsHomeCommits;
  if (manifest.homeCommitMetaIsHomeCommits) expanded.homeCommitMeta = structuredClone(manifest.homeCommits);
  if (manifest.tickFileListingFromDeltas && first) {
    expanded.tickFileListing = rebuildTickFileListing(expandedTicks, first);
  }
  return expanded as M;
}
