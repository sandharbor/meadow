/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'fs';
import path from 'path';
import type { BundleNodeId } from '../../../../../../../contracts/types/bundleNodeConfig.js';
import type {
  GeneratedOutputOwnership,
  GeneratedOutputRole,
} from '../../../../../../../contracts/types/generatedOutputIdentity.js';
import { logger } from '../../../../shared/utils/logging/backendLoggingUtils.js';

interface Claim {
  bundleNodeId: BundleNodeId;
  role: GeneratedOutputRole;
}

/**
 * Records which source-backed node wrote each generated file, at the moment
 * it is written. A later write to the same path replaces the claim, so legacy
 * route collisions report their actual final writer. Repeated identical
 * claims are idempotent; files nobody claims remain unowned.
 */
export class EmittedOutputRecorder {
  private readonly claims = new Map<string, Claim>();

  constructor(private readonly outputDirectory: string) {}

  claim(relativePath: string, bundleNodeId: BundleNodeId, role: GeneratedOutputRole): void {
    this.claims.set(path.posix.normalize(relativePath.split(path.sep).join('/')), { bundleNodeId, role });
  }

  /**
   * Ownership of files actually present at the end of generation. A node
   * claiming one role at several paths has no stable discriminator, so those
   * outputs stay unowned rather than being paired by accident.
   */
  owners(): GeneratedOutputOwnership[] {
    const present = [...this.claims.entries()]
      .filter(([relativePath]) => fs.existsSync(path.join(this.outputDirectory, ...relativePath.split('/'))));
    const pathsByIdentity = new Map<string, string[]>();
    for (const [relativePath, claim] of present) {
      const identity = `${claim.bundleNodeId}\0${claim.role}`;
      pathsByIdentity.set(identity, [...(pathsByIdentity.get(identity) ?? []), relativePath]);
    }
    const ambiguous = new Set<string>();
    for (const [identity, paths] of pathsByIdentity) {
      if (paths.length < 2) continue;
      ambiguous.add(identity);
      logger.warn(`[generation] ${identity.replace('\0', ' ')} was emitted at ${paths.length} paths; leaving them unowned`);
    }
    return present
      .filter(([, claim]) => !ambiguous.has(`${claim.bundleNodeId}\0${claim.role}`))
      .map(([relativePath, claim]) => ({ path: relativePath, bundleNodeId: claim.bundleNodeId, role: claim.role }))
      .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  }

  /** Generated pages and the nodes whose output they actually are. */
  pageOwners(): Map<string, BundleNodeId> {
    return new Map(this.owners()
      .filter(owner => owner.role === 'page' && owner.path.toLowerCase().endsWith('.html'))
      .map(owner => [owner.path, owner.bundleNodeId]));
  }
}
