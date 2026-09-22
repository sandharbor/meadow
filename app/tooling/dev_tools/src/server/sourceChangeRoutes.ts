/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import express from 'express';
import path from 'node:path';
import { applySourceChange, listSourceChangeStatus, loadSourceChanges, fixtureSourceGraphs, fixtureSourceLocations } from '../../../../shared_code/shared_dev/sourceChanges.js';
import { latestSourceChangeRuns } from './sourceChangeReports.js';

export function createSourceChangeRoutes(options: {
  projectRoot: string; configDir: string; getActiveFixture: () => string | null;
}): express.Router {
  const router = express.Router();
  const sourceGraphsDir = path.join(options.configDir, 'source_graphs');
  router.get('/config/fixtures/:fixtureName/source-changes', (req, res) => {
    try {
      const active = options.getActiveFixture() === req.params.fixtureName;
      const sourceLocations = fixtureSourceLocations(options.projectRoot, req.params.fixtureName);
      const graphs = [...new Set(sourceLocations.map(location => location.graph))];
      const changes = graphs.flatMap(graph => active
        ? listSourceChangeStatus(options.projectRoot, sourceGraphsDir, graph)
        : loadSourceChanges(options.projectRoot, graph).map(change => ({ ...change, state: 'conflict' as const, reason: 'Start this fixture to apply source changes.' })));
      const reports = latestSourceChangeRuns(changes.map(change => change.e2e));
      res.json({ active, changes: changes.map(change => ({ ...change, latestE2e: reports.get(change.e2e) })), sourceLocations });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  });
  router.post('/config/fixtures/:fixtureName/source-changes/:changeId', (req, res) => {
    try {
      if (options.getActiveFixture() !== req.params.fixtureName) throw new Error('Start this fixture before changing its source graph');
      const graphs = fixtureSourceGraphs(options.projectRoot, req.params.fixtureName);
      const sourceGraph = req.body?.sourceGraph as unknown;
      if (typeof sourceGraph !== 'string' || !graphs.includes(sourceGraph)) throw new Error('Source graph does not belong to this fixture');
      const result = applySourceChange({ projectRoot: options.projectRoot, sourceGraphsDir, sourceGraph, changeId: req.params.changeId });
      res.json(result);
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  });
  return router;
}

export { fixtureSourceGraphs } from "../../../../shared_code/shared_dev/sourceChanges.js";
