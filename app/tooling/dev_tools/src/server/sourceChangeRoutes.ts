/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import express from 'express';
import path from 'node:path';
import { applySourceChange, listSourceChangeStatus, loadSourceChanges, fixtureSourceGraphs, fixtureSourceLocations } from '../../../../shared_code/shared_dev/sourceChanges.js';
import type { SourceChangeCheckpoint, SourceChangeStatus } from '../../../../shared_code/shared_dev/sourceChangesTypes.js';
import { latestSourceChangeRuns } from './sourceChangeReports.js';
import { checkpointOptions } from './checkpointCatalog.js';

function latestCheckpoints(runId: string, slug: string | undefined): SourceChangeCheckpoint[] {
  if (!slug) return [];
  try {
    return checkpointOptions(runId, slug).map(option => ({
      index: option.index,
      message: option.message,
      openable: option.openable,
      ...(option.unavailableReason && { unavailableReason: option.unavailableReason }),
      hostedAvailable: option.hostedAvailable,
      ...(option.hostedUnavailableReason && { hostedUnavailableReason: option.hostedUnavailableReason }),
    }));
  } catch {
    // Runs recorded before checkpoints were restorable have none to list.
    return [];
  }
}

/**
 * Source changes are browsed per fixture menu but apply to whichever saved
 * state is open, as long as that home isolates the change's source graph.
 */
export function createSourceChangeRoutes(options: {
  projectRoot: string;
  openHome: () => string;
  openSourceGraphs: () => string[];
}): express.Router {
  const router = express.Router();
  router.get('/source-changes/:sourceGraph/:changeId', (req, res) => {
    try {
      const { sourceGraph, changeId } = req.params;
      if (!options.openSourceGraphs().includes(sourceGraph)) throw new Error('Open a saved state that includes this source graph to apply this change.');
      const change = listSourceChangeStatus(options.projectRoot, path.join(options.openHome(), 'source_graphs'), sourceGraph)
        .find(candidate => candidate.id === changeId);
      if (!change) return res.status(404).json({ error: 'This source change is unavailable in the current checkout.' });
      res.json({ change });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  });
  router.post('/source-changes/:sourceGraph/:changeId', (req, res) => {
    try {
      const { sourceGraph, changeId } = req.params;
      if (!options.openSourceGraphs().includes(sourceGraph)) throw new Error('The open saved state does not include this source graph');
      const definition = loadSourceChanges(options.projectRoot, sourceGraph).find(change => change.id === changeId);
      if (!definition) return res.status(404).json({ error: 'This source change is unavailable in the current checkout.' });
      if (JSON.stringify(definition.operations) !== JSON.stringify(req.body?.operations)) {
        throw new Error('This source change differs from the definition shown in the report. Open a report for the current checkout.');
      }
      res.json(applySourceChange({
        projectRoot: options.projectRoot,
        sourceGraphsDir: path.join(options.openHome(), 'source_graphs'),
        sourceGraph,
        changeId,
      }));
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  });
  router.get('/config/fixtures/:fixtureName/source-changes', (req, res) => {
    try {
      const sourceLocations = fixtureSourceLocations(options.projectRoot, req.params.fixtureName);
      const graphs = fixtureSourceGraphs(options.projectRoot, req.params.fixtureName);
      const openGraphs = options.openSourceGraphs();
      const sourceGraphsDir = path.join(options.openHome(), 'source_graphs');
      const changes: SourceChangeStatus[] = graphs.flatMap(graph => openGraphs.includes(graph)
        ? listSourceChangeStatus(options.projectRoot, sourceGraphsDir, graph)
        : loadSourceChanges(options.projectRoot, graph).map(change => ({
          ...change,
          state: 'conflict' as const,
          reason: 'Open a saved state that includes this source graph to apply source changes.',
        })));
      const reports = latestSourceChangeRuns(changes.map(change => change.e2e));
      res.json({
        active: graphs.some(graph => openGraphs.includes(graph)),
        changes: changes.map(change => {
          const latest = reports.get(change.e2e);
          return { ...change, latestE2e: latest && { ...latest, checkpoints: latestCheckpoints(latest.runId, latest.slug) } };
        }),
        sourceLocations,
      });
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  });
  router.post('/config/fixtures/:fixtureName/source-changes/:changeId', (req, res) => {
    try {
      const graphs = fixtureSourceGraphs(options.projectRoot, req.params.fixtureName);
      const sourceGraph = req.body?.sourceGraph as unknown;
      if (typeof sourceGraph !== 'string' || !graphs.includes(sourceGraph)) throw new Error('Source graph does not belong to this fixture');
      if (!options.openSourceGraphs().includes(sourceGraph)) throw new Error('The open saved state does not include this source graph');
      const result = applySourceChange({
        projectRoot: options.projectRoot,
        sourceGraphsDir: path.join(options.openHome(), 'source_graphs'),
        sourceGraph,
        changeId: req.params.changeId,
      });
      res.json(result);
    } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
  });
  return router;
}

export { fixtureSourceGraphs } from "../../../../shared_code/shared_dev/sourceChanges.js";
