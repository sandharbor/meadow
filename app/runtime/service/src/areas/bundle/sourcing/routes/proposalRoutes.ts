/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import express from 'express';
import path from 'node:path';
import { isPlainObject } from '../../../../../../../shared_code/utils/durableDocument.js';
import { SourcingError } from '../../../../shared/source-snapshot/sourceSnapshots.js';
import { runSerializedBundleNodeMutation } from '../../../../shared/bundle-node/bundleNodeMutationQueue.js';
import { discardSourceProposal, validateProposalConfiguration } from '../services/proposalStore.js';
import { reviewSourceProposal } from '../services/proposalReview.js';
import { updateSourceProposalCapture, checkSourceProposalUpdates } from '../services/proposalCapture.js';
import { acceptSourceProposal } from '../services/proposalAcceptance.js';
import { chooseProposalAdditionTracking, chooseProposalIdentities, chooseProposalTracking, resolveProposalConflicts } from '../services/proposalDecisions.js';
import { directory, handle } from './routeUtils.js';
import { sourceProposalComparison } from '../services/proposalComparison.js';
import { applyBlacklistEdit, undoBlacklistEdit } from '../services/blacklistReview.js';
import { parseBundleNodeConfig } from '../../../../../../../shared_code/utils/bundleNodeConfigUtils.js';

function nodes(value: unknown) {
  if (!Array.isArray(value)) throw new SourcingError('Expected page settings', 400);
  try { return parseBundleNodeConfig(JSON.stringify({ nodes: value })); }
  catch { throw new SourcingError('Invalid page settings', 400); }
}

function revision(req: express.Request): number {
  const value = body(req).revision;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new SourcingError('Expected a proposal revision', 400);
  return value;
}

function body(req: express.Request): Record<string, unknown> {
  const value: unknown = req.body;
  if (!isPlainObject(value)) throw new SourcingError('Expected a proposal operation', 400);
  return value;
}

export function createProposalRoutes() {
  const router = express.Router();
  router.post('/bundles/:bundleSlug/sourcing/blacklist', handle(req => {
    const changes = nodes(body(req).changes);
    if (!changes.length || changes.some(node => node.bundleNodeKind === 'collection')) throw new SourcingError('Choose a page or folder to exclude or include', 400);
    const bundle = directory(req);
    return runSerializedBundleNodeMutation(path.basename(bundle), () => applyBlacklistEdit(bundle, changes));
  }));
  router.post('/bundles/:bundleSlug/sourcing/blacklist/undo', handle(async req => {
    const undo = body(req);
    if (typeof undo.acceptedSnapshotId !== 'string') throw new SourcingError('Expected the accepted snapshot for this edit', 400);
    const value = { acceptedSnapshotId: undo.acceptedSnapshotId, original: nodes(undo.original), applied: nodes(undo.applied) };
    const bundle = directory(req);
    await runSerializedBundleNodeMutation(path.basename(bundle), () => undoBlacklistEdit(bundle, value));
    return { undone: true };
  }));
  router.post('/bundles/:bundleSlug/sourcing/proposal/begin', handle(req => reviewSourceProposal(directory(req))));
  router.get('/bundles/:bundleSlug/sourcing/proposal', handle(req => reviewSourceProposal(directory(req))));
  router.get('/bundles/:bundleSlug/sourcing/proposal/graph', handle(req => sourceProposalComparison(directory(req), Number(req.query.frontierDepth ?? 0))));
  router.post('/bundles/:bundleSlug/sourcing/proposal/configuration', handle(async req => {
    const value = body(req).configuration;
    validateProposalConfiguration(value);
    await updateSourceProposalCapture(directory(req), revision(req), { configuration: value, incorporateNewerSources: body(req).incorporateNewerSources === true });
    return reviewSourceProposal(directory(req));
  }));
  router.post('/bundles/:bundleSlug/sourcing/proposal/refresh', handle(async req => {
    await updateSourceProposalCapture(directory(req), revision(req), { refresh: true });
    return reviewSourceProposal(directory(req));
  }));
  router.post('/bundles/:bundleSlug/sourcing/proposal/check', handle(async req => {
    await checkSourceProposalUpdates(directory(req));
    return reviewSourceProposal(directory(req));
  }));
  router.post('/bundles/:bundleSlug/sourcing/proposal/identities', handle(async req => {
    const choices = body(req).choices;
    if (!isPlainObject(choices) || Object.values(choices).some(value => value !== null && typeof value !== 'string')) throw new SourcingError('Expected page identity choices', 400);
    await chooseProposalIdentities(directory(req), revision(req), choices as Record<string, string | null>);
    return reviewSourceProposal(directory(req));
  }));
  router.post('/bundles/:bundleSlug/sourcing/proposal/conflicts', handle(async req => {
    const { choices, reviewToken } = body(req);
    if (typeof reviewToken !== 'string') throw new SourcingError('Expected the reviewed conflict alternatives', 400);
    if (!Array.isArray(choices) || choices.some(value => !isPlainObject(value) || !Array.isArray(value.path)
      || value.path.some(part => typeof part !== 'string') || !['saved', 'proposed'].includes(String(value.choice)))) throw new SourcingError('Expected conflict choices', 400);
    await resolveProposalConflicts(directory(req), revision(req), choices as Array<{ path: string[]; choice: 'saved' | 'proposed' }>, reviewToken);
    return reviewSourceProposal(directory(req));
  }));
  router.post('/bundles/:bundleSlug/sourcing/proposal/tracking', handle(async req => {
    const { nodeKeys, track, confirmSensitive, incorporateNewerSources } = body(req);
    if (!Array.isArray(nodeKeys) || nodeKeys.some(key => typeof key !== 'string') || typeof track !== 'boolean') throw new SourcingError('Expected pages and a tracking choice', 400);
    const result = await chooseProposalTracking(directory(req), revision(req), nodeKeys as string[], track, confirmSensitive === true, incorporateNewerSources === true);
    return { ...await reviewSourceProposal(directory(req)), skippedTrackingKeys: result.skipped };
  }));
  router.post('/bundles/:bundleSlug/sourcing/proposal/track-additions', handle(async req => {
    const { enabled } = body(req);
    if (typeof enabled !== 'boolean') throw new SourcingError('Expected whether to track added pages', 400);
    await chooseProposalAdditionTracking(directory(req), revision(req), enabled);
    return reviewSourceProposal(directory(req));
  }));
  router.post('/bundles/:bundleSlug/sourcing/proposal/discard', handle(async req => {
    await discardSourceProposal(directory(req), revision(req));
    return { discarded: true };
  }));
  router.post('/bundles/:bundleSlug/sourcing/proposal/accept', handle(req => {
    const { reviewToken } = body(req);
    if (typeof reviewToken !== 'string') throw new SourcingError('Expected a reviewed proposal token', 400);
    const bundle = directory(req);
    return runSerializedBundleNodeMutation(path.basename(bundle), () => acceptSourceProposal(bundle, reviewToken));
  }));
  return router;
}
