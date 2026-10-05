/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SourceCommandTracker } from '../../src/run/SourceCommandTracker.js';

test('source commands retain their position, repeated execution identity, result, and completion status', async () => {
  const tracker = new SourceCommandTracker(import.meta.filename);
  const sourceCommand = tracker.run;
  for (let index = 0; index < 2; index++) {
    const result = await sourceCommand(async () => {
      assert.equal(tracker.current?.status, 'running');
      return 42;
    });
    assert.equal(result, 42);
    assert.equal(tracker.current?.id, index);
    assert.equal(tracker.current?.status, 'completed');
    assert.equal(tracker.current?.file, import.meta.filename);
    assert.equal(tracker.current?.line, 10);
    assert.match(tracker.current?.text ?? '', /return 42/);
  }
});

test('failed commands retain their source marker and propagate their original error', async () => {
  const tracker = new SourceCommandTracker(import.meta.filename);
  const sourceCommand = tracker.run;
  const failure = new Error('command failed');
  await assert.rejects(sourceCommand(() => { throw failure; }), error => error === failure);
  assert.equal(tracker.current?.status, 'failed');
});
