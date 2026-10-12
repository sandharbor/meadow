/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { BundleNodeId } from '../../../../../../../contracts/types/shared/bundle-graph/bundleNodeConfig.js';
import type { GeneratedChangeEntry } from '../../../../../../../contracts/types/areas/bundle/review/generatedOutputComparison.js';
import type { GeneratedOutputOwnership, GeneratedOutputRole } from '../../../../../../../contracts/types/shared/generated-bundle-versioning/generatedOutputIdentity.js';

/** Files of one endpoint, keyed by path relative to its version root. */
export interface PairingEndpoint {
  /** Relative path → Git blob ID. */
  files: ReadonlyMap<string, string>;
  /** Recorded ownership, or null when this endpoint has no usable identity. */
  owners: readonly GeneratedOutputOwnership[] | null;
}

type Owner = { bundleNodeId: BundleNodeId; role: GeneratedOutputRole };

function ownerKey(owner: Owner): string {
  return `${owner.bundleNodeId}\u0000${owner.role}`;
}

/** Ownership by path and by logical identity, limited to files actually present. */
function indexOwners(endpoint: PairingEndpoint): { byPath: Map<string, Owner>; byKey: Map<string, string> } {
  const byPath = new Map<string, Owner>();
  const byKey = new Map<string, string>();
  for (const ownership of endpoint.owners ?? []) {
    if (!endpoint.files.has(ownership.path)) continue;
    byPath.set(ownership.path, { bundleNodeId: ownership.bundleNodeId, role: ownership.role });
    byKey.set(ownerKey(ownership), ownership.path);
  }
  return { byPath, byKey };
}

function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Compare two generated file sets. Recorded identity pairs outputs before any
 * path comparison; files without usable identity fall back to path and bytes.
 * No similarity or rename inference is ever applied.
 */
export function pairGeneratedOutputs(left: PairingEndpoint, right: PairingEndpoint): GeneratedChangeEntry[] {
  const identityPairing = left.owners !== null && right.owners !== null;
  const leftOwners = indexOwners(left);
  const rightOwners = indexOwners(right);
  const unmatchedLeft = new Set(left.files.keys());
  const unmatchedRight = new Set(right.files.keys());
  const entries: GeneratedChangeEntry[] = [];

  if (identityPairing) {
    for (const [key, leftPath] of leftOwners.byKey) {
      const rightPath = rightOwners.byKey.get(key);
      if (rightPath === undefined) continue;
      unmatchedLeft.delete(leftPath);
      unmatchedRight.delete(rightPath);
      const owner = leftOwners.byPath.get(leftPath)!;
      const beforeObjectId = left.files.get(leftPath)!;
      const afterObjectId = right.files.get(rightPath)!;
      const moved = leftPath !== rightPath;
      const modified = beforeObjectId !== afterObjectId;
      if (!moved && !modified) continue;
      entries.push({
        entryId: `owner:${owner.bundleNodeId}:${owner.role}`,
        kind: 'changed',
        moved,
        modified,
        before: { path: leftPath, objectId: beforeObjectId },
        after: { path: rightPath, objectId: afterObjectId },
        owner,
      });
    }
  }

  const ownerOf = (owners: Map<string, Owner>, relativePath: string): Owner | null =>
    identityPairing ? owners.get(relativePath) ?? null : null;

  for (const relativePath of [...new Set([...unmatchedLeft, ...unmatchedRight])].sort(comparePaths)) {
    const beforeObjectId = unmatchedLeft.has(relativePath) ? left.files.get(relativePath)! : undefined;
    const afterObjectId = unmatchedRight.has(relativePath) ? right.files.get(relativePath)! : undefined;
    const beforeOwner = ownerOf(leftOwners.byPath, relativePath);
    const afterOwner = ownerOf(rightOwners.byPath, relativePath);
    const sameOwner = (beforeOwner === null && afterOwner === null)
      || (beforeOwner !== null && afterOwner !== null && ownerKey(beforeOwner) === ownerKey(afterOwner));
    if (beforeObjectId !== undefined && afterObjectId !== undefined && sameOwner) {
      if (beforeObjectId === afterObjectId) continue;
      entries.push({
        entryId: `path:${relativePath}`,
        kind: 'changed',
        moved: false,
        modified: true,
        before: { path: relativePath, objectId: beforeObjectId },
        after: { path: relativePath, objectId: afterObjectId },
        owner: afterOwner,
      });
      continue;
    }
    // Different recorded identities at one path are two logical changes.
    if (beforeObjectId !== undefined) {
      entries.push({
        entryId: `deleted:${relativePath}`,
        kind: 'deleted',
        moved: false,
        modified: false,
        before: { path: relativePath, objectId: beforeObjectId },
        after: null,
        owner: beforeOwner,
      });
    }
    if (afterObjectId !== undefined) {
      entries.push({
        entryId: `added:${relativePath}`,
        kind: 'added',
        moved: false,
        modified: false,
        before: null,
        after: { path: relativePath, objectId: afterObjectId },
        owner: afterOwner,
      });
    }
  }

  return entries.sort((leftEntry, rightEntry) =>
    comparePaths(
      (leftEntry.after ?? leftEntry.before)!.path,
      (rightEntry.after ?? rightEntry.before)!.path,
    ) || comparePaths(leftEntry.entryId, rightEntry.entryId));
}

import type { ParticipatesIn, generationRecord } from '../../../../../../../concepts/index.js';
export type GeneratedOutputPairingMeadowConceptParticipations = [
  ParticipatesIn<typeof generationRecord, 'pair', typeof pairGeneratedOutputs>,
];
