/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import express from 'express';
import {
  BundleTrackingOperationError,
  trackBundleNodes,
} from '../services/bundleTrackingOperations.js';
import {
  BundleNodeOperationError,
  describeBundleNode,
  findBundleNode,
  mutateBundleNode,
  type BundleNodeMutation,
} from '../services/bundleNodeOperations.js';
import type { BundleNodeId } from '../../../../../../../contracts/types/bundleNodeConfig.js';
import type { BundleNodeLocator } from '../../../../../../../contracts/types/cliOperations.js';
import { WorkingGraphOperationError } from '../../../../shared/bundle-graph/workingGraphService.js';
import { runSerializedBundleNodeMutation } from '../services/bundleNodeMutationQueue.js';

const router = express.Router();

function parseNodeLocator(body: Record<string, unknown>): BundleNodeLocator {
  if ((body.nodeId === undefined) === (body.path === undefined)) {
    throw new BundleNodeOperationError('Provide exactly one of nodeId or path', 400);
  }
  if (typeof body.nodeId === 'string' && body.nodeId.length > 0) {
    return { kind: 'id', value: body.nodeId as BundleNodeId };
  }
  if (typeof body.path === 'string' && body.path.trim().length > 0) {
    return { kind: 'path', value: body.path };
  }
  throw new BundleNodeOperationError('Node identifiers must be non-empty strings', 400);
}

function sendNodeError(error: unknown, res: express.Response, next: express.NextFunction): void {
  if (
    error instanceof BundleNodeOperationError
    || error instanceof BundleTrackingOperationError
    || error instanceof WorkingGraphOperationError
  ) {
    res.status(error.statusCode).json({ error: error.message, ...error.details });
    return;
  }
  next(error);
}

router.post('/bundles/:bundleSlug/curation/node/describe', (req, res, next) => {
  void (async () => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    res.json(await describeBundleNode(req.params.bundleSlug, parseNodeLocator(body)));
  })().catch(error => sendNodeError(error, res, next));
});

router.post('/bundles/:bundleSlug/curation/node/find-in-bundles', (req, res, next) => {
  void (async () => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    res.json(await findBundleNode(req.params.bundleSlug, parseNodeLocator(body)));
  })().catch(error => sendNodeError(error, res, next));
});

router.post('/bundles/:bundleSlug/curation/node/:operation', (req, res, next) => {
  void (async () => {
    const operation = req.params.operation;
    const supported = new Set([
      'track',
      'untrack',
      'blacklist',
      'unblacklist',
      'mark-sensitive',
      'mark-not-sensitive',
      'set-depths',
    ]);
    if (!supported.has(operation)) {
      throw new BundleNodeOperationError(`Unsupported node operation '${operation}'`, 404);
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    let mutation: BundleNodeMutation;
    if (operation === 'set-depths') {
      const parseDepth = (field: 'outlinksDepth' | 'inlinksDepth'): number | null | undefined => {
        const value = body[field];
        if (value === undefined || value === null) return value;
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
          throw new BundleNodeOperationError(`${field} must be a non-negative integer or null`, 400);
        }
        return value;
      };
      const outlinksDepth = parseDepth('outlinksDepth');
      const inlinksDepth = parseDepth('inlinksDepth');
      if (outlinksDepth === undefined && inlinksDepth === undefined) {
        throw new BundleNodeOperationError('Provide outlinksDepth and/or inlinksDepth', 400);
      }
      mutation = { operation, outlinksDepth, inlinksDepth };
    } else {
      if (body.includeSensitive !== undefined && operation !== 'track') {
        throw new BundleNodeOperationError('includeSensitive is only valid for the track operation', 400);
      }
      if (body.includeSensitive !== undefined && typeof body.includeSensitive !== 'boolean') {
        throw new BundleNodeOperationError('includeSensitive must be a boolean', 400);
      }
      mutation = operation === 'track'
        ? { operation, includeSensitive: body.includeSensitive === true }
        : { operation: operation as Exclude<BundleNodeMutation['operation'], 'track' | 'set-depths'> };
    }
    const { bundleSlug } = req.params;
    res.json(await runSerializedBundleNodeMutation(
      bundleSlug,
      () => mutateBundleNode(bundleSlug, parseNodeLocator(body), mutation),
    ));
  })().catch(error => sendNodeError(error, res, next));
});

router.post('/bundles/:bundleSlug/curation/track-nodes', (req, res, next) => {
  void (async () => {
    const { bundleSlug } = req.params;
    const body = (req.body ?? {}) as { nodeKeys?: unknown; allSafe?: unknown; includeSensitive?: unknown };
    if (body.includeSensitive !== undefined) {
      return res.status(400).json({ error: '--include-sensitive is not valid for multi-node or safe-bulk tracking' });
    }
    if (body.allSafe === true && body.nodeKeys !== undefined) {
      return res.status(400).json({ error: 'Choose either allSafe or nodeKeys, not both' });
    }
    if (body.allSafe !== true && !Array.isArray(body.nodeKeys)) {
      return res.status(400).json({ error: 'Provide allSafe: true or a nodeKeys array' });
    }
    if (Array.isArray(body.nodeKeys) && !body.nodeKeys.every(key => typeof key === 'string' && key.length > 0)) {
      return res.status(400).json({ error: 'Every node key must be a non-empty string' });
    }
    try {
      const result = await runSerializedBundleNodeMutation(
        bundleSlug,
        () => trackBundleNodes(
          bundleSlug,
          body.allSafe === true
            ? { mode: 'all-safe' }
            : { mode: 'targeted', nodeKeys: body.nodeKeys as string[] },
        ),
      );
      res.json(result);
    } catch (error) {
      sendNodeError(error, res, next);
    }
  })().catch(next);
});

export default router;
