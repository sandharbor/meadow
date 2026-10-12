/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { BlacklistShortcutUndo } from '../../../shared/sourcing/blacklistReview.js';
import type { ProposalConfiguration } from '../../../shared/sourcing/sourcingProposal.js';

export type BlacklistEditResult =
  | { mode: 'curation'; undo: BlacklistShortcutUndo }
  | { mode: 'sourcing'; pendingConfiguration?: ProposalConfiguration };
