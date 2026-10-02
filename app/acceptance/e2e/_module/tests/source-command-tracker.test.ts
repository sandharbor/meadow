/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SourceCommandTracker } from '../../src/run/SourceCommandTracker.js';

test('source commands retain the scenario callsite and identify repeated executions', async () => {
  const tracker = new SourceCommandTracker(import.meta.filename);
  const sourceCommand = tracker.run;
  const locations: number[] = [];
  for (let iteration = 0; iteration < 2; iteration++) {
    const result = await sourceCommand(() => {
      assert.equal(tracker.current?.status, 'running');
      assert.equal(tracker.current?.id, iteration);
      locations.push(tracker.current!.line);
      assert.ok(tracker.current!.endLine > tracker.current!.line);
      return iteration;
    });
    assert.equal(result, iteration);
    assert.equal(tracker.current?.status, 'completed');
  }
  assert.equal(locations[0], locations[1]);
  await assert.rejects(sourceCommand(() => { throw new Error('expected failure'); }), /expected failure/);
  assert.equal(tracker.current?.status, 'failed');
});
