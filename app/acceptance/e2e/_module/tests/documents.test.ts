/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { conceptDocument, documentBacklinks, documentPassages, validateDocuments, type MeadowDocument } from '../../../../concepts/documents.js';
import { allCoreConcepts, conceptLink, conceptText, customize, hooks, htmlGeneration, localExport,
  sensitive, preventAccidentalSharing, scenarioDesignPressures, validateConceptRegistry, type AnyMeadowConcept } from '../../../../concepts/index.js';
import { loadDocumentRegistry } from '../../../../concepts/loadRegistry.js';
import { scenarioDocumentMembership } from '../../../../concepts/scenarioMembership.js';
import { captureDocumentSnapshot, readDocumentSnapshot, readScenarioDocuments, SCENARIO_DOCUMENTS_FILE } from '../../src/artifacts/documentSnapshot.js';
import { resolveScenarioDocuments } from '../../src/artifacts/scenarioDocuments.js';
import { scenarioMetadataIssues } from '../scripts/scenario-metadata.js';

const registry = await loadDocumentRegistry();

test('workflow sub-areas have one owner and an acyclic hierarchy within that owner', () => {
  assert.deepEqual(validateConceptRegistry(allCoreConcepts), []);
  const replace = (concept: AnyMeadowConcept) =>
    allCoreConcepts.map(original => original.id === concept.id ? concept : original);
  assert.ok(validateConceptRegistry(allCoreConcepts.map(concept => concept.id === htmlGeneration.id
    ? { ...htmlGeneration, subAreas: customize.subAreas } : concept))
    .some(error => error.includes('contained within exactly one app area')));
  assert.ok(validateConceptRegistry(replace({ ...hooks, parentId: localExport.id }))
    .some(error => error.includes('same owning area')));
  assert.ok(validateConceptRegistry(replace({ ...customize, parentId: hooks.id }))
    .some(error => error.includes('cycle')));
});
const source = `
import { sensitive, bundleSourcing, sourceReviewWorkspace, scenarioAreas, scenarioDesignPressures as associate,
  preventAccidentalSharing as pressure, conceptText, linkedScenarioName, linkedScenarioDescription } from '../../../concepts/index.js';
const name = linkedScenarioName(conceptText\`Sensitive additions\`);
const description = linkedScenarioDescription(conceptText\`Review skipped pages.\`);
const areas = scenarioAreas([bundleSourcing], { subAreas: [sourceReviewWorkspace] });
const pressures = associate([pressure]);
test.skip(name.name, { annotation: [{ type: 'scenario-id', description: 'stable-scenario' }, name.annotation, description.annotation, areas.annotation, pressures.annotation] }, async () => {});
`;

test('shared sections preserve canonical identity and derive contextual backlinks once per passage', () => {
  assert.equal(conceptDocument(sensitive).id, sensitive.id);
  const note: MeadowDocument = { id: 'test-note', name: 'Test note', documentKind: 'fixture',
    description: conceptText`A short note.`, sections: [{ id: 'examples', heading: 'Examples', blocks: [
      { kind: 'paragraph', text: conceptText`See ${conceptLink(sensitive.id, sensitive.name)}.` },
      { kind: 'list', items: [conceptText`Read ${conceptLink(sensitive.id, sensitive.name)} and ${conceptLink(sensitive.id, 'it again')}.`] },
    ] }] };
  assert.equal(documentPassages(note).length, 3);
  const links = documentBacklinks(sensitive.id, [note]);
  assert.equal(links.length, 2);
  assert.equal(links[1].heading, 'Examples');
  assert.equal(links[1].itemIndex, 0);
  assert.equal(links[1].documentName, 'Test note');
  assert.deepEqual(validateDocuments([...registry.documents, note]), []);
  assert.ok(validateDocuments([...registry.documents, { ...note, id: sensitive.id }]).some(error => error.includes('more than once')));
  assert.ok(validateDocuments([{ ...note, description: { segments: [{ kind: 'concept-link', conceptId: 'missing', label: 'Missing' }] } }]).some(error => error.includes('unknown document')));
  assert.ok(validateDocuments([{ ...note, documentKind: 'design-pressure' }]).some(error => error.includes('requires section "motivation"')));
  assert.ok(validateDocuments([...registry.documents, { ...note, aliases: [sensitive.name] }]).some(error => error.includes('belongs to both')));
});

test('pressure associations are explicit, alias-aware, checked, and retained for skipped scenarios', () => {
  const result = resolveScenarioDocuments(source, registry);
  assert.deepEqual(result.designPressureIds, [preventAccidentalSharing.id]);
  assert.ok(!result.conceptIds.includes(preventAccidentalSharing.id));
  assert.deepEqual(result.appAreaDocIds, ['bundle/sourcing']);
  assert.deepEqual(resolveScenarioDocuments(source.replace('const pressures = associate([pressure]);', ''), registry).designPressureIds, []);
  assert.throws(() => resolveScenarioDocuments(source.replace('associate([pressure])', 'associate([sensitive])'), registry), /not a design pressure/);
  assert.throws(() => resolveScenarioDocuments(source.replace('associate([pressure])', 'associate([pressure, pressure])'), registry), /Duplicate/);
  assert.throws(() => resolveScenarioDocuments(source.replace('associate([pressure])', 'associate(dynamic)'), registry), /literal list/);
  assert.deepEqual(scenarioDesignPressures([preventAccidentalSharing]).ids, result.designPressureIds);
  const lint = (text: string) => scenarioMetadataIssues(ts.createSourceFile('test.ts', text, ts.ScriptTarget.Latest, true));
  assert.deepEqual(lint(source), []);
  assert.ok(lint(source.replace(', pressures.annotation', '')).some(issue => issue.message.includes('pressures.annotation')));
});

test('run capture survives renamed exports and edited documents, while missing and corrupt captures differ', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'meadow-document-history-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, 'scenario.spec.ts'), source);
  assert.equal(readDocumentSnapshot(root), undefined);
  const original = captureDocumentSnapshot(root, registry, root);
  assert.deepEqual(original.scenarios[0].designPressureIds, [preventAccidentalSharing.id]);
  const bytes = readFileSync(path.join(root, 'documents.json'), 'utf8');
  const changed = { ...registry, exportNameToId: new Map(), documents: registry.documents.map(document => ({ ...document, name: `Changed ${document.name}` })) };
  assert.deepEqual(captureDocumentSnapshot(root, changed, root), original);
  assert.equal(readFileSync(path.join(root, 'documents.json'), 'utf8'), bytes);
  assert.equal(readScenarioDocuments(root), undefined);
  const metadata = resolveScenarioDocuments(source, registry);
  writeFileSync(path.join(root, SCENARIO_DOCUMENTS_FILE), JSON.stringify(metadata));
  assert.deepEqual(readScenarioDocuments(root), metadata);
  writeFileSync(path.join(root, 'documents.json'), '{corrupt');
  assert.throws(() => readDocumentSnapshot(root));
  assert.throws(() => captureDocumentSnapshot(root, registry, root));
});

test('related counts and document filters share deduplicated direct membership and area ancestors', () => {
  const membership = scenarioDocumentMembership({ conceptIds: ['sensitive'], appAreaDocIds: ['bundle/sourcing'],
    subAreaDocIds: ['source-review-workspace'], designPressureIds: ['prevent-accidental-sharing'], bundleDocIds: ['fixture'] },
  [{ id: 'bundle/sourcing', parentId: 'bundle' }, { id: 'bundle' }]);
  assert.deepEqual(new Set(membership), new Set(['sensitive', 'bundle/sourcing', 'bundle', 'source-review-workspace', 'prevent-accidental-sharing', 'fixture']));
  assert.ok(!membership.includes('bundle/curation'));
  assert.ok(!scenarioDocumentMembership({ conceptIds: ['sensitive'] }, []).includes(preventAccidentalSharing.id));
});


test('semantic titles participate in checked passages, backlinks, and immutable run captures', t => {
  const title = conceptText`${conceptLink(sensitive.id, sensitive.name)} changes.`;
  const document: MeadowDocument = { id: 'semantic-example', name: 'Readable English title', documentKind: 'fixture',
    semanticTitle: title, description: conceptText`An example.`, sections: [] };
  assert.deepEqual(validateDocuments([...registry.documents, document]), []);
  assert.equal(documentPassages(document)[0].heading, 'AKA');
  assert.equal(documentBacklinks(sensitive.id, [document])[0].sectionId, 'semantic-title');
  assert.ok(validateDocuments([...registry.documents, { ...document, semanticTitle: { segments: [
    { kind: 'concept-link', conceptId: 'missing-document', label: 'Missing' },
  ] } }]).some(error => error.includes('unknown document')));
  const root = mkdtempSync(path.join(os.tmpdir(), 'meadow-semantic-title-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const captured = captureDocumentSnapshot(root, { ...registry, documents: [...registry.documents, document] }, root);
  assert.deepEqual(captured.documents.find(item => item.id === document.id)?.semanticTitle, title);
  assert.deepEqual(readDocumentSnapshot(root), captured);
});
