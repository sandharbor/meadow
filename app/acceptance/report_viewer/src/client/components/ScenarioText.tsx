/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { Link } from 'react-router-dom';
import type { ConceptText } from '../../../../../concepts/types.js';
import { useScenarioConceptDetails, type ScenarioConceptReference } from './ScenarioConceptDetails.tsx';

export function scenarioPromptContext(slug: string, scenario: {
  testName: string; nameText?: ConceptText; description?: string; descriptionText?: ConceptText;
}) {
  const linked = (plain: string, rich?: ConceptText) => (rich
    ? rich.segments.map(segment => segment.kind === 'text' ? segment.text : `[[${segment.label}]]`).join('')
    : plain).replace(/\s+/g, ' ').trim();
  return `For context, here is the copied name and description from E2E scenario ${slug}\n\nName: ${linked(scenario.testName, scenario.nameText)}\n\nDescription: ${linked(scenario.description ?? '', scenario.descriptionText)}\n\n--\n\n`;
}

export function ScenarioText({ text: plainText, linkedText, runId, scenarioHref, onOpenConcept }: {
  text: string; linkedText?: ConceptText; runId: string; scenarioHref?: string;
  onOpenConcept?: (concept: ScenarioConceptReference) => void;
}) {
  const localDetails = useScenarioConceptDetails(runId);
  const openConcept = onOpenConcept ?? localDetails.openConcept;
  const text = (value: string, key?: number) => scenarioHref
    ? <Link key={key} to={scenarioHref} className="hover:text-brand-600 hover:underline">{value}</Link> : value;
  return <>
    <span>{linkedText ? linkedText.segments.map((segment, index) => segment.kind === 'text' ? text(segment.text, index)
      : <a key={index} href={`/concepts/${encodeURIComponent(segment.conceptId)}`} className="text-brand-600 underline"
        onClick={event => { event.preventDefault(); event.stopPropagation(); openConcept({ id: segment.conceptId, name: segment.label }); }}>{segment.label}</a>) : text(plainText)}</span>
    {!onOpenConcept && localDetails.details}
  </>;
}
