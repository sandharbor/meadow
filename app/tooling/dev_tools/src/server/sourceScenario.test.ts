/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareSourceScenario } from '../../../../shared_code/shared_dev/sourceScenario.js';
import { runSourcingCommand } from '../../../../clients/cli/src/sourcingCommands.js';

test('a rejected baseline stops before modifying the source graph', async () => {
  let changed = false;
  await assert.rejects(prepareSourceScenario(async args => {
    if (args[2] === 'accept') throw new Error('This review is stale');
    return JSON.stringify({ accepted: { id: 'accepted' }, candidate: { id: 'candidate' }, reviewToken: 'token' });
  }, 'bundle', async () => { changed = true; }), /stale/);
  assert.equal(changed, false);
});

test('Command acceptance requires both a snapshot identity and review token before writing', async () => {
  for (const options of [[], ['--snapshot', 'id'], ['--review-token', 'token'], ['--snapshot', 'id', '--review-token', 'token', '--snapshot', 'other']]) {
    let requested = false;
    await assert.rejects(runSourcingCommand(['accept', 'bundle', ...options], async () => { requested = true; }), /Usage/);
    assert.equal(requested, false);
  }
});
