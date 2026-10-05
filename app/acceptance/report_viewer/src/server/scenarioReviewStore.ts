/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { emptyReviews, findReview, type ReviewCapture, type ReviewData } from '../scenarioReviews.js';

/** Durable scenario review history, independent of disposable run artifacts. */
export class ScenarioReviewStore {
  constructor(private filename: string) {}
  read(): ReviewData {
    if (!existsSync(this.filename)) return emptyReviews();
    const data = JSON.parse(readFileSync(this.filename, 'utf8')) as ReviewData;
    if (data.version !== 1 || !Array.isArray(data.reviews) || !Array.isArray(data.events)) throw new Error('Invalid scenario review history');
    return data;
  }
  update(capture: ReviewCapture, action: 'TOREVIEW' | 'REVIEWED' | 'NOTE', note?: string): ReviewData {
    if (note !== undefined && (typeof note !== 'string' || note.length > 500)) throw new Error('Review notes must be at most 500 characters');
    const nextNote = note?.trim();
    const data = this.read();
    let review = findReview(data, capture);
    if (action === 'NOTE' && !review) throw new Error('Mark this scenario for review before adding a note');
    if (review && (review.status === action || action === 'NOTE') && (nextNote === undefined || nextNote === (review.note ?? ''))) return data;
    if (!review && action === 'REVIEWED') throw new Error('Mark this scenario for review before completing it');
    const timestamp = new Date().toISOString();
    if (!review) {
      review = { id: randomUUID(), scenarioId: capture.scenarioId, names: [capture.testName], status: action === 'REVIEWED' ? 'REVIEWED' : 'TOREVIEW', addedAt: timestamp };
      data.reviews.push(review);
    } else {
      review.scenarioId ??= capture.scenarioId;
      if (!review.names.includes(capture.testName)) review.names.push(capture.testName);
      if (action !== 'NOTE' && review.status !== action) {
        review.status = action;
        if (action === 'TOREVIEW') { review.addedAt = timestamp; delete review.completedAt; }
        else review.completedAt = timestamp;
      }
    }
    if (nextNote !== undefined) review.note = nextNote;
    data.events.push({ ...capture, note: review.note, id: randomUUID(), reviewId: review.id, action, timestamp });
    mkdirSync(path.dirname(this.filename), { recursive: true });
    const temporary = `${this.filename}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(data, null, 2));
    renameSync(temporary, this.filename);
    return data;
  }
}
