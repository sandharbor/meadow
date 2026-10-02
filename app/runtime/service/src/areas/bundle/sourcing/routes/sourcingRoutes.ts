/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import express from 'express';
import type { StartingSelection } from '../../../../../../../contracts/types/startingSelection.js';
import { cancelSourceCandidate, setIgnoredSource, sourceRegistryStatus } from '../services/sourceRegistryReview.js';
import { saveProposalSourceRegistry } from '../services/proposalSources.js';
import type { BundleSource } from '../../../../../../../contracts/types/bundleConfig.js';
import { reviewWithTrackingAssessment, scanWithTrackingAssessment } from '../services/reviewWithTrackingAssessment.js';
import { sourceComparison, sourceSnapshotImage, sourceSnapshotContent, sourceSnapshotHistory } from '../services/sourceReview.js';
import { SourcingError } from '../../../../shared/source-snapshot/sourceSnapshots.js';
import type { SourceSnapshotAcceptance, SourceSnapshotAcceptanceResult } from '../../../../../../../contracts/types/sourcing.js';
import { directory, handle } from './routeUtils.js';
import { createProposalRoutes } from './proposalRoutes.js';

export function createSourcingRoutes(workflow: {
  accept: (directory: string, request: SourceSnapshotAcceptance) => Promise<SourceSnapshotAcceptanceResult>;
}) {
  const router = express.Router();
  router.use(createProposalRoutes());
  router.get('/bundles/:bundleSlug/sourcing', handle(req => reviewWithTrackingAssessment(directory(req))));
  router.get('/bundles/:bundleSlug/sourcing/sources', handle(req => sourceRegistryStatus(directory(req))));
  router.post('/bundles/:bundleSlug/sourcing/sources', handle(async req => {
    const body = req.body as { sources?: unknown; startingSelections?: unknown; proposalRevision?: unknown };
    if (!Array.isArray(body?.sources)) throw new SourcingError('Expected a source registry', 400);
    if (body.startingSelections !== undefined && !Array.isArray(body.startingSelections)) throw new SourcingError('Expected starting selections', 400);
    const pendingProposal = await saveProposalSourceRegistry(directory(req), body.sources as BundleSource[], body.startingSelections as StartingSelection[] | undefined, typeof body.proposalRevision === 'number' ? body.proposalRevision : undefined);
    return { ...await reviewWithTrackingAssessment(directory(req)), pendingProposal };
  }));
  router.post('/bundles/:bundleSlug/sourcing/cancel', handle(async req => {
    await cancelSourceCandidate(directory(req));
    return reviewWithTrackingAssessment(directory(req));
  }));
  router.post('/bundles/:bundleSlug/sourcing/ignore', handle(async req => {
    const body = req.body as { name?: unknown; ignored?: unknown };
    if (typeof body?.name !== 'string' || typeof body?.ignored !== 'boolean') throw new SourcingError('Expected a source name and acknowledgement', 400);
    await setIgnoredSource(directory(req), body.name, body.ignored);
    return { ok: true };
  }));
  router.get('/bundles/:bundleSlug/sourcing/history', handle(req => sourceSnapshotHistory(directory(req))));
  router.post('/bundles/:bundleSlug/sourcing/scan', handle(req => {
    const body = req.body as { replaceCandidate?: unknown; rebuildIndex?: unknown } | undefined;
    return scanWithTrackingAssessment(directory(req), body?.replaceCandidate === true, body?.rebuildIndex === true);
  }));
  router.post('/bundles/:bundleSlug/sourcing/accept', handle(req => {
    const body = (req.body ?? {}) as Partial<SourceSnapshotAcceptance>;
    if ('orphanKeeps' in body) throw new SourcingError('Unreachable configuration must be cleaned at acceptance.', 400);
    if (typeof body.candidateId !== 'string' || typeof body.reviewToken !== 'string'
      || (body.trackNewPages !== undefined && typeof body.trackNewPages !== 'boolean')
      || !body.resolutions || typeof body.resolutions !== 'object' || Array.isArray(body.resolutions)
      || Object.values(body.resolutions).some(value => value !== null && typeof value !== 'string')
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

  router.get('/bundles/:bundleSlug/sourcing/content/:filename', (req, res, next) => {
    try {
      const { snapshotId } = req.query;
      if (typeof snapshotId !== 'string') throw new SourcingError('Expected a retained snapshot', 400);
      const content = sourceSnapshotContent(directory(req), snapshotId, req.params.filename);
      res.set({ 'Content-Type': content.type, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'private, no-store' }).send(content.bytes);
    } catch (error) {
      if (error instanceof SourcingError) res.status(error.statusCode).json({ error: error.message });
      else next(error);
    }
  });
  return router;
}
