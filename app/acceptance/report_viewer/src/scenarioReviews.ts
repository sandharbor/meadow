/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
export interface ReviewCapture {
  scenarioId?: string;
  testName: string;
  slug: string;
  runId: string;
  testFile?: string;
  codeRevision?: string;
  uncommittedCode?: boolean;
}
export interface ScenarioReview {
  note?: string;
  id: string;
  scenarioId?: string;
  names: string[];
  status: 'TOREVIEW' | 'REVIEWED';
  addedAt: string;
  completedAt?: string;
}
export interface ReviewEvent extends ReviewCapture {
  note?: string;
  id: string;
  reviewId: string;
  action: 'TOREVIEW' | 'REVIEWED' | 'NOTE';
  timestamp: string;
}
export interface ReviewData { version: 1; reviews: ScenarioReview[]; events: ReviewEvent[] }
export const emptyReviews = (): ReviewData => ({ version: 1, reviews: [], events: [] });
export function findReview(data: ReviewData, scenario: { scenarioId?: string; testName: string }) {
  return data.reviews.find(review => scenario.scenarioId && review.scenarioId === scenario.scenarioId)
    ?? data.reviews.find(review => review.names.includes(scenario.testName));
}
