/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useEffect, useState } from 'react';
import { scenarioDocumentMembership, type DocumentScenario } from '../../../../../concepts/scenarioMembership.js';
import ConceptExplorer from './ConceptExplorer.tsx';

export type ScenarioConceptReference = { id: string; name: string };
type ScenarioReference = DocumentScenario;

/** Shared concept window for a scenario's chips and linked prose. */
export function useScenarioConceptDetails(runId: string | undefined) {
  const [selected, setSelected] = useState<ScenarioConceptReference | null>(null);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  useEffect(() => { setSelected(null); setCounts(null); }, [runId]);
  useEffect(() => {
    if (!selected || !runId) return;
    const controller = new window.AbortController();
    void Promise.all([
      fetch(`/api/runs/${encodeURIComponent(runId)}`, { signal: controller.signal }).then(response => response.ok ? response.json() as Promise<{ scenarios: ScenarioReference[] }> : Promise.reject(new Error('Could not load related scenarios'))),
      fetch(`/api/app-areas?run=${encodeURIComponent(runId)}`, { signal: controller.signal }).then(response => response.ok ? response.json() as Promise<{ id: string; parentId?: string }[]> : []),
    ]).then(([run, areas]) => {
        if (controller.signal.aborted) return;
        const next: Record<string, number> = {};
        run.scenarios.forEach(scenario => scenarioDocumentMembership(scenario, areas)
          .forEach(id => { next[id] = (next[id] ?? 0) + 1; }));
        setCounts(next);
      }).catch(() => {});
    return () => controller.abort();
  }, [runId, selected]);
  return {
    openConcept: (concept: ScenarioConceptReference) => setSelected(concept),
    details: selected && runId ? <ConceptExplorer key={selected.id} concept={selected} selectedConceptIds={[]}
      scenario={{ runId, counts, onClose: () => setSelected(null) }} /> : null,
  };
}
