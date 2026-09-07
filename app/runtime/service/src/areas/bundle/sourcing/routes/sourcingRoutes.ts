/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import express from 'express';
import { getBundleDirectory } from '../../../../shared/bundle-config/bundleConfigPaths.js';
import { acceptSourceSnapshot, scanSourceChanges, sourceComparison, sourcingReview } from '../services/sourceReview.js';
import { SourcingError } from '../../../../shared/source-snapshot/sourceSnapshots.js';
import type { SourceSnapshotAcceptance } from '../../../../../../../contracts/types/sourcing.js';

const router = express.Router();

function directory(req: express.Request): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(req.params.bundleSlug)) throw new SourcingError('Invalid bundle slug', 400);
  return getBundleDirectory(req.params.bundleSlug);
}

function handle(action: (req: express.Request) => unknown): express.RequestHandler {
  return (req, res, next) => {
    void Promise.resolve().then(() => action(req)).then(result => res.json(result)).catch(error => {
      if (error instanceof SourcingError) res.status(error.statusCode).json({ error: error.message });
      else next(error);
    });
  };
}

router.get('/bundles/:bundleSlug/sourcing', handle(req => sourcingReview(directory(req))));
router.post('/bundles/:bundleSlug/sourcing/scan', handle(req => {
  const body = req.body as { replaceCandidate?: unknown } | undefined;
  return scanSourceChanges(directory(req), body?.replaceCandidate === true);
}));
router.post('/bundles/:bundleSlug/sourcing/accept', handle(req => {
  const body = (req.body ?? {}) as Partial<SourceSnapshotAcceptance>;
  if (typeof body.candidateId !== 'string' || typeof body.reviewToken !== 'string'
    || !body.resolutions || typeof body.resolutions !== 'object' || Array.isArray(body.resolutions)
    || Object.values(body.resolutions).some(value => value !== null && typeof value !== 'string')
    || (body.orphanRemovals !== undefined && (!Array.isArray(body.orphanRemovals) || body.orphanRemovals.some(id => typeof id !== 'string')))) {
    throw new SourcingError('Expected a candidate snapshot, review token, and move resolutions', 400);
  }
  return acceptSourceSnapshot(directory(req), body as SourceSnapshotAcceptance);
}));
router.get('/bundles/:bundleSlug/sourcing/comparison', handle(req => {
  const { beforeId, afterId, beforePath, afterPath } = req.query;
  if (typeof beforeId !== 'string' || typeof afterId !== 'string' || typeof beforePath !== 'string' || typeof afterPath !== 'string') throw new SourcingError('Expected snapshot identities and file paths', 400);
  return sourceComparison(directory(req), beforeId, afterId, beforePath, afterPath);
}));

export default router;
