/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import type { PendingSourceProposal } from '../../../../../contracts/types/sourcingProposal.js';
import type { TestServer } from '../test-fixtures.js';

/** Reads persisted proposal state independently of the browser workspace. */
export class SourcingProposalState {
  readonly relativePath: string;
  private readonly filename: string;

  constructor(testServer: Pick<TestServer, 'configDir'>, bundleSlug: string) {
    this.relativePath = `bundles/${bundleSlug}/raw/sourcing/proposal.json`;
    this.filename = path.join(testServer.configDir, this.relativePath);
  }

  /** Each access reads fresh state; retaining the result captures that revision. */
  get current(): PendingSourceProposal {
    return JSON.parse(fs.readFileSync(this.filename, 'utf8')) as PendingSourceProposal;
  }

  get exists(): boolean {
    return fs.existsSync(this.filename);
  }

  /** Exact bytes for rollback assertions, including the absence of a proposal. */
  get serialized(): string | null {
    return this.exists ? fs.readFileSync(this.filename, 'utf8') : null;
  }
}
