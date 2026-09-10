/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { RequestJson } from './managementCommands.js';

export const SOURCING_HELP = `Usage:
  meadow bundle sources review <bundle-slug>
  meadow bundle sources refresh <bundle-slug>
  meadow bundle sources accept <bundle-slug> --snapshot <id> --review-token <token>

Review reads captured source state. Refresh captures current sources for review.
Accept uses the snapshot ID (candidate.id, or accepted.id) and reviewToken returned
by review or refresh. It accepts proposed renames and removes orphaned configuration;
source files are never deleted. Stale reviews are rejected. No browser is opened.

Refresh alone leaves curation and generation on the accepted snapshot. To include
edited source text in the next preview, inspect the refreshed candidate, then
accept it with the returned candidate.id and reviewToken before generating.
If the user explicitly keeps a changed private file included, track that same
file again with 'bundle node track --include-sensitive' after acceptance to
record the inclusion decision for its updated content, then generate.

Use meadow bundle open <bundle-slug> --source-review to open the modal.`;

export async function runSourcingCommand(args: string[], request: RequestJson): Promise<void> {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(SOURCING_HELP); return;
  }
  const [action, slug, ...options] = args;
  if (!['review', 'refresh', 'accept'].includes(action) || !slug || !/^[a-zA-Z0-9_-]+$/.test(slug)) throw new Error(SOURCING_HELP);
  const endpoint = `/bundles/${encodeURIComponent(slug)}/sourcing`;
  let result: unknown;
  if (action === 'accept') {
    const values = new Map<string, string>();
    for (let i = 0; i < options.length; i += 2) {
      const key = options[i]; const value = options[i + 1];
      if (!['--snapshot', '--review-token'].includes(key) || !value || value.startsWith('--') || values.has(key)) throw new Error(SOURCING_HELP);
      values.set(key, value);
    }
    if (values.size !== 2) throw new Error(SOURCING_HELP);
    result = await request(`${endpoint}/accept`, 'POST', {
      candidateId: values.get('--snapshot'), reviewToken: values.get('--review-token'), resolutions: {},
    });
  } else {
    if (options.length) throw new Error(SOURCING_HELP);
    result = action === 'refresh' ? await request(`${endpoint}/scan`, 'POST', { replaceCandidate: true }) : await request(endpoint);
  }
  console.log(JSON.stringify(result, null, 2));
}
