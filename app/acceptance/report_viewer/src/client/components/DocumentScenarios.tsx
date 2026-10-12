/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { renderConceptText, type DocumentText } from '../../../../../concepts/index.js';
import { scenarioDocumentMembership, type DocumentScenario } from '../../../../../concepts/scenarioMembership.js';
import type { DeclaredScenarioDocuments } from '../../../../e2e/src/artifacts/documentSnapshot.js';

type Scenario = DocumentScenario & { scenarioId?: string; slug: string; testName: string; nameText?: DocumentText; testBasename?: string; status: string };

/** Results belong to this run; declared examples absent from it remain visibly unrun. */
export default function DocumentScenarios({ runId, documentId }: { runId: string; documentId: string }) {
  const [evidence, setEvidence] = useState<{ results: Scenario[]; absent?: DeclaredScenarioDocuments[] } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new window.AbortController();
    const get = (url: string) => fetch(url, { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error('Could not load related scenarios.');
      return response.json();
    });
    setEvidence(null); setError('');
    void Promise.all([get(`/api/runs/${encodeURIComponent(runId)}`), get(`/api/documents?run=${encodeURIComponent(runId)}`)])
      .then(([run, catalog]) => {
        const matches = (scenario: DocumentScenario) => scenarioDocumentMembership(scenario, catalog.documents).includes(documentId);
        const scenarios = run.scenarios as Scenario[];
        const declared = catalog.scenarios as DeclaredScenarioDocuments[] | undefined;
        setEvidence({ results: scenarios.filter(matches), absent: declared?.filter(matches).filter(example => !scenarios.some(scenario =>
          example.scenarioId ? example.scenarioId === scenario.scenarioId : example.testFile.split('/').at(-1)?.replace(/\.spec\.ts$/, '') === scenario.testBasename)) });
      }).catch(error => { if (!controller.signal.aborted) setError(String(error)); });
    return () => controller.abort();
  }, [runId, documentId]);
  return <section aria-label="Scenario evidence" className="my-4 border-t pt-3">
    {error ? <p role="alert">{error}</p> : !evidence ? <p className="text-xs text-neutral-500">Loading related scenarios…</p>
      : <details>
        <summary className="cursor-pointer font-semibold">Related scenarios ({evidence.results.length})</summary>
        <p className="my-2 text-xs text-neutral-500">References connect the explanation to examples. The assertions and result in each scenario establish what was checked.</p>
        {evidence.results.length === 0 && <p>No results in this run.</p>}
        <ul className="space-y-2">{evidence.results.map(scenario => <li key={scenario.slug}>
          <Link className="text-brand-600 underline" to={`/${encodeURIComponent(runId)}/${encodeURIComponent(scenario.slug)}`}>{scenario.nameText ? renderConceptText(scenario.nameText) : scenario.testName}</Link>
          <span className="ml-2 text-xs text-neutral-500">{scenario.status === 'skipped' ? 'Not run (skipped)' : scenario.status}</span>
        </li>)}</ul>
        {evidence.absent === undefined ? <p className="mt-2 text-xs text-neutral-500">This older run has no captured declaration index.</p>
          : evidence.absent.length > 0 ? <div className="mt-3"><h3 className="font-medium">Declared, not run ({evidence.absent.length})</h3>
            <ul className="list-disc pl-5 text-xs text-neutral-500">{evidence.absent.map(example => <li key={example.testFile}>{example.testFile}</li>)}</ul></div>
          : evidence.results.length === 0 ? <p>No related scenarios were declared when this run began.</p> : null}
      </details>}
  </section>;
}
