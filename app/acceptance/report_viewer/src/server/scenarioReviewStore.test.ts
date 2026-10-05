/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { afterEach, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ScenarioReviewStore } from './scenarioReviewStore.js';
import { findReview } from '../scenarioReviews.js';
const directories: string[] = [];
afterEach(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })));
function store() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'scenario-review-'));
  directories.push(directory);
  const filename = path.join(directory, 'reviews.json');
  return { filename, reviews: new ScenarioReviewStore(filename) };
}
test('review history survives restarts, new runs, renamed titles, and reopening a completed review', () => {
  const { filename, reviews } = store();
  const capture = { scenarioId: 'stable-id', testName: 'Original title', slug: 'original-title', runId: 'first-run', codeRevision: 'revision-a' };
  const added = reviews.update(capture, 'TOREVIEW');
  expect(added.reviews[0].status).toBe('TOREVIEW');
  expect(reviews.update(capture, 'TOREVIEW').events).toHaveLength(1);
  const restarted = new ScenarioReviewStore(filename);
  const renamed = { ...capture, testName: 'Renamed title', runId: 'later-run', codeRevision: 'revision-b' };
  const completed = restarted.update(renamed, 'REVIEWED');
  expect(completed.reviews).toHaveLength(1);
  expect(findReview(completed, renamed)?.completedAt).toBeTruthy();
  expect(completed.events.map(event => [event.testName, event.runId, event.codeRevision])).toEqual([
    ['Original title', 'first-run', 'revision-a'], ['Renamed title', 'later-run', 'revision-b'],
  ]);
  const reopened = restarted.update(renamed, 'TOREVIEW');
  expect(reopened.reviews[0].completedAt).toBeUndefined();
  expect(reopened.events.map(event => event.action)).toEqual(['TOREVIEW', 'REVIEWED', 'TOREVIEW']);
});
test('older title-based reviews adopt the stable scenario identity', () => {
  const { reviews } = store();
  const old = { testName: 'Title', slug: 'title', runId: 'old-run' };
  reviews.update(old, 'TOREVIEW');
  const completed = reviews.update({ ...old, scenarioId: 'stable-id', runId: 'new-run' }, 'REVIEWED');
  expect(findReview(completed, { testName: 'New title', scenarioId: 'stable-id' })?.status).toBe('REVIEWED');
  expect(completed.reviews).toHaveLength(1);
});
test('completing an unmarked scenario does not create a misleading review record', () => {
  const { reviews } = store();
  expect(() => reviews.update({ testName: 'Title', slug: 'title', runId: 'run' }, 'REVIEWED')).toThrow(/before completing/);
  expect(reviews.read().events).toEqual([]);
});
test('short notes persist across runs and completion without changing review dates when edited', () => {
  const { filename, reviews } = store();
  const capture = { scenarioId: 'stable-id', testName: 'Title', slug: 'title', runId: 'run' };
  const added = reviews.update(capture, 'TOREVIEW', ' Check the removed filters ');
  const completed = reviews.update(capture, 'REVIEWED');
  const edited = new ScenarioReviewStore(filename).update({ ...capture, runId: 'later-run' }, 'NOTE', 'Looks right now');
  expect(edited.reviews[0]).toMatchObject({ status: 'REVIEWED', note: 'Looks right now', addedAt: added.reviews[0].addedAt, completedAt: completed.reviews[0].completedAt });
  expect(edited.events.map(event => event.note)).toEqual(['Check the removed filters', 'Check the removed filters', 'Looks right now']);
  expect(reviews.update(capture, 'NOTE', 'Looks right now').events).toHaveLength(3);
  expect(reviews.update(capture, 'TOREVIEW').reviews[0].note).toBe('Looks right now');
  expect(reviews.update(capture, 'NOTE', '').reviews[0].note).toBe('');
  expect(() => reviews.update(capture, 'NOTE', 'x'.repeat(501))).toThrow(/500 characters/);
});
