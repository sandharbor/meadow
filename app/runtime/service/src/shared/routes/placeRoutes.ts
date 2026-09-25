/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import express from 'express';
import type { PlaceArrival } from '../../../../../contracts/places/index.js';
import { parseAppPlace } from '../../../../../contracts/places/index.js';

/**
 * The web client reports each place it arrives at by link. Whoever sent the
 * link (the CLI, Dev Tools) reads back what was actually reached, so a
 * shortfall is visible without scraping the page.
 */
const MAX_ARRIVALS = 50;

function validPlace(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 4_000) return false;
  try {
    parseAppPlace(value);
    return true;
  } catch {
    return false;
  }
}

export function createPlaceRoutes(now: () => number = Date.now): express.Router {
  const router = express.Router();
  const arrivals: PlaceArrival[] = [];

  router.post('/places/arrivals', (req, res) => {
    const { requested, reached, notice } = (req.body ?? {}) as Record<string, unknown>;
    if (!validPlace(requested) || !validPlace(reached) || (notice !== undefined && typeof notice !== 'string')) {
      res.status(400).json({ error: 'An arrival needs valid requested and reached places' });
      return;
    }
    arrivals.push({ requested, reached, ...(notice ? { notice } : {}), arrivedAt: new Date(now()).toISOString() });
    arrivals.splice(0, Math.max(0, arrivals.length - MAX_ARRIVALS));
    res.status(204).end();
  });

  router.get('/places/arrivals', (req, res) => {
    const since = typeof req.query.since === 'string' ? Date.parse(req.query.since) : Number.NaN;
    res.json({ arrivals: Number.isNaN(since) ? arrivals : arrivals.filter(arrival => Date.parse(arrival.arrivedAt) >= since) });
  });

  return router;
}
