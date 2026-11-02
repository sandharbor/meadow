/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { auditCheckpointKeyFrames } from '../scripts/spec-checkpoint-keyframes.js';

test('reports the detached keyframe before a checkpoint with a useful source location', () => {
  const issues = auditCheckpointKeyFrames(`test('reorder', async ({ addKeyFrame, checkpoint }) => {
    await sourceCommand(() => addKeyFrame(filterMixing));
    await sourceCommand(() => checkpoint('Terms reversed.'));
  });`);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].line, 2);
  assert.equal(issues[0].column, 31);
  assert.match(issues[0].message, /checkpoint\(\) at line 3/);
  assert.match(issues[0].message, /keyFrames: \[\.\.\.\]/);
});

test('groups multiple adjacent captures, including multiple concepts and comments', () => {
  const issues = auditCheckpointKeyFrames(`await addKeyFrame(first, second);
    // All of these capture the checkpoint state.
    await sourceCommand(async () => { await addKeyFrame(third); });

    await checkpoint('Ready.', { keyFrames: [fourth] });`);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /Merge 2 preceding/);
  assert.match(issues[0].message, /Include every concept/);
});

test('finds captures inside nested steps, callbacks, branches, and helpers', () => {
  const issues = auditCheckpointKeyFrames(`async function capture() {
    await sourceCommand(async () => {
      await addKeyFrame(first);
      await addKeyFrame(second);
      await checkpoint('Ready.');
    });
  }
  test.step('phase', async () => {
    if (visible) {
      await addKeyFrame(first);
      await checkpoint('Visible.');
    }
  });`);
  assert.equal(issues.length, 2);
  assert.deepEqual(issues.map(issue => issue.line), [3, 10]);
});

test('recognizes destructured fixture aliases and transparent wrappers', () => {
  const issues = auditCheckpointKeyFrames(`test('case', async ({ addKeyFrame: capture, checkpoint: save, sourceCommand: command }) => {
    await command(async () => { return capture(first); });
    await (save('Ready.'));
  });`);
  assert.equal(issues.length, 1);
});

test('keeps intermediate captures when other work occurs before the checkpoint', () => {
  assert.deepEqual(auditCheckpointKeyFrames(`await addKeyFrame(first);
    await editor.close();
    await checkpoint('Closed.');
    await addKeyFrame(second);
    expect(count).toBe(1);
    await checkpoint('Verified.');
    await addKeyFrame(third);
    await sourceCommand(async () => { await editor.close(); await checkpoint('Closed.'); });`), []);
});

test('does not join separate branches or steps, or match prose and unrelated methods', () => {
  assert.deepEqual(auditCheckpointKeyFrames(`if (visible) { await addKeyFrame(first); }
    else { await checkpoint('Hidden.'); }
    await test.step('first', async () => { await addKeyFrame(first); });
    await test.step('next', async () => { await checkpoint('Next.'); });
    const prose = 'addKeyFrame(first); checkpoint("Ready.");';
    await gallery.addKeyFrame(first);
    await checkpoint('Ready.');`), []);
});

test('accepts checkpoint-owned keyframes and standalone intermediate captures', () => {
  assert.deepEqual(auditCheckpointKeyFrames(`await checkpoint('Ready.', { keyFrames: [first, second] });
    await sourceCommand(() => checkpoint('Done.', { keyFrames: [third] }));
    await addKeyFrame(fourth);`), []);
});
