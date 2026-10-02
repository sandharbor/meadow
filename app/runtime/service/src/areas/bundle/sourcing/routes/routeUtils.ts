/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type express from 'express';
import { getBundleDirectory } from '../../../../shared/bundle-config/bundleConfigPaths.js';
import { SourcingError } from '../../../../shared/source-snapshot/sourceSnapshots.js';
import { logger } from '../../../../shared/utils/logging/backendLoggingUtils.js';

export function directory(req: express.Request): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(req.params.bundleSlug)) throw new SourcingError('Invalid bundle slug', 400);
  return getBundleDirectory(req.params.bundleSlug);
}

export function handle(action: (req: express.Request) => unknown): express.RequestHandler {
  return (req, res, next) => {
    const startedAt = Date.now();
    void Promise.resolve().then(() => action(req)).then(result => res.json(result)).catch(error => {
      if (error instanceof SourcingError) {
        logger.warn(`[sourcing] ${req.method} ${req.path} failed after ${Date.now() - startedAt}ms (${error.statusCode})`, error);
        res.status(error.statusCode).json({ error: error.message, ...(error.code && { code: error.code }) });
      } else next(error);
    });
  };
}
