/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { SourceSnapshotAcceptance } from '../../../../../contracts/types/sourcing.js';
import { appShellCommandAcceptSourceSnapshot } from '../../areas/bundle/sourcing/exported.js';

/** Acceptance installs source material; tracking remains an explicit editor choice. */
export const sourceCurationWorkflow = {
  accept: async (directory: string, request: SourceSnapshotAcceptance) => appShellCommandAcceptSourceSnapshot(directory, request),
};
