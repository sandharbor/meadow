/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { expect, test } from 'vitest';
import { setupTimelineBoundary } from './setupTimeline';

const base = { setupEndLine: 20, firstTestLine: 22, sourceCheckpoints: [], checkpoints: [] };

test('the first captured command after setup marks Section 1, including when a short command was missed', () => {
  expect(setupTimelineBoundary({ ...base, ticks: [
    { timestamp: '2026-10-30T12:00:01Z', sourceCommand: { line: 18 } },
    { timestamp: '2026-10-30T12:00:03Z', sourceCommand: { line: 27 } },
    { timestamp: '2026-10-30T12:00:05Z', sourceCommand: { line: 40 } },
  ] })).toBe(Date.parse('2026-10-30T12:00:03Z'));
});

test('a run that stops in setup stays muted throughout', () => {
  expect(setupTimelineBoundary({ ...base, ticks: [
    { timestamp: '2026-10-30T12:00:01Z', sourceCommand: { line: 18 } },
  ] })).toBe(Infinity);
});

test('legacy checkpoint timing distinguishes repeated messages in different phases', () => {
  expect(setupTimelineBoundary({ ...base, ticks: [],
    sourceCheckpoints: [{ line: 18, message: 'ready' }, { line: 30, message: 'ready' }],
    checkpoints: [{ timestamp: '2026-10-30T12:00:02Z', message: 'ready' }, { timestamp: '2026-10-30T12:00:05Z', message: 'ready' }],
  })).toBe(Date.parse('2026-10-30T12:00:02Z'));
});

test('recordings without setup or usable timing retain the original timeline', () => {
  expect(setupTimelineBoundary({ ...base, setupEndLine: undefined, ticks: [] })).toBeNull();
  expect(setupTimelineBoundary({ ...base, ticks: [] })).toBeNull();
});
