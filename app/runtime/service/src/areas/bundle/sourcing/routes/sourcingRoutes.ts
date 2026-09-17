/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import express from 'express';
import { getBundleDirectory } from '../../../../shared/bundle-config/bundleConfigPaths.js';
import { sourceComparison, sourceSnapshotImage, sourceSnapshotHistory } from '../services/sourceReview.js';
import { SourcingError } from '../../../../shared/source-snapshot/sourceSnapshots.js';
import type { SourceSnapshotAcceptance, SourceSnapshotAcceptanceResult, SourcingReview } from '../../../../../../../contracts/types/sourcing.js';
import { logger } from '../../../../shared/utils/logging/backendLoggingUtils.js';


function directory(req: express.Request): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(req.params.bundleSlug)) throw new SourcingError('Invalid bundle slug', 400);
  return getBundleDirectory(req.params.bundleSlug);
}

function handle(action: (req: express.Request) => unknown): express.RequestHandler {
  return (req, res, next) => {
    const startedAt = Date.now();
    void Promise.resolve().then(() => action(req)).then(result => res.json(result)).catch(error => {
      if (error instanceof SourcingError) {
        logger.warn(`[sourcing] ${req.method} ${req.path} failed after ${Date.now() - startedAt}ms (${error.statusCode})`, error);
        res.status(error.statusCode).json({ error: error.message });
      }
      else next(error);
    });
  };
}

export function createSourcingRoutes(workflow: {
  review: (directory: string) => Promise<SourcingReview>;
  scan: (directory: string, replaceCandidate: boolean, rebuildIndex: boolean) => Promise<SourcingReview>;
  accept: (directory: string, request: SourceSnapshotAcceptance) => Promise<SourceSnapshotAcceptanceResult>;
}) {
  const router = express.Router();
  router.get('/bundles/:bundleSlug/sourcing', handle(req => workflow.review(directory(req))));
  router.get('/bundles/:bundleSlug/sourcing/history', handle(req => sourceSnapshotHistory(directory(req))));
  router.post('/bundles/:bundleSlug/sourcing/scan', handle(req => {
    const body = req.body as { replaceCandidate?: unknown; rebuildIndex?: unknown } | undefined;
    return workflow.scan(directory(req), body?.replaceCandidate === true, body?.rebuildIndex === true);
  }));
  router.post('/bundles/:bundleSlug/sourcing/accept', handle(req => {
    const body = (req.body ?? {}) as Partial<SourceSnapshotAcceptance>;
    if (typeof body.candidateId !== 'string' || typeof body.reviewToken !== 'string'
      || (body.trackNewPages !== undefined && typeof body.trackNewPages !== 'boolean')
      || !body.resolutions || typeof body.resolutions !== 'object' || Array.isArray(body.resolutions)
      || Object.values(body.resolutions).some(value => value !== null && typeof value !== 'string')
      || (body.orphanKeeps !== undefined && (!Array.isArray(body.orphanKeeps) || body.orphanKeeps.some(id => typeof id !== 'string')))
      || (body.orphanRemovals !== undefined && (!Array.isArray(body.orphanRemovals) || body.orphanRemovals.some(id => typeof id !== 'string')))) {
      throw new SourcingError('Expected a candidate snapshot, review token, and move resolutions', 400);
    }
    return workflow.accept(directory(req), body as SourceSnapshotAcceptance);
  }));
  router.get('/bundles/:bundleSlug/sourcing/comparison', handle(req => {
    const { beforeId, afterId, beforePath, afterPath } = req.query;
    if (typeof beforeId !== 'string' || typeof afterId !== 'string' || typeof beforePath !== 'string' || typeof afterPath !== 'string') throw new SourcingError('Expected snapshot identities and file paths', 400);
    return sourceComparison(directory(req), beforeId, afterId, beforePath, afterPath);
  }));

  router.get('/bundles/:bundleSlug/sourcing/image', (req, res, next) => {
    try {
      const { snapshotId, path: filename } = req.query;
      if (typeof snapshotId !== 'string' || typeof filename !== 'string') throw new SourcingError('Expected a snapshot and image path', 400);
      const image = sourceSnapshotImage(directory(req), snapshotId, filename);
      res.set({ 'Content-Type': image.type, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'private, no-store' }).send(image.bytes);
    } catch (error) {
      if (error instanceof SourcingError) res.status(error.statusCode).json({ error: error.message });
      else next(error);
    }
  });

  return router;
}
