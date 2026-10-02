/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { isPlainObject, textDocumentCodec, writeDurableDocument, removeDurableDocument } from './durableDocument.js';

const bundleDocuments = {
  bundle: 'config/bundle_config.yaml', nodes: 'config/bundle_node_config.yaml',
  bundleFilters: 'config/custom_filters.json', state: 'raw/sourcing/state.json',
  proposal: 'raw/sourcing/proposal.json', tracking: 'raw/sourcing/tracking.json',
  acceptance: 'raw/sourcing/last-acceptance.json',
  acceptanceHistory: 'raw/sourcing/acceptance-history.json',
} as const;
const homeDocuments = { globalFilters: 'app/global_custom_filters.json', app: 'app/app_config.yaml' } as const;
export type SourcingTransactionDocument = keyof typeof bundleDocuments | keyof typeof homeDocuments;
export type SourcingTransactionUpdates = Partial<Record<SourcingTransactionDocument, string | null>>;
interface SourcingJournal { version: 1; bundleSlug: string; before: SourcingTransactionUpdates; }

function journalPath(home: string): string { return path.join(home, 'app/sourcing-transaction.json'); }
function documentPath(home: string, slug: string, key: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) throw new Error('Invalid bundle identity in sourcing transaction');
  if (Object.prototype.hasOwnProperty.call(bundleDocuments, key)) return path.join(home, 'bundles', slug, bundleDocuments[key as keyof typeof bundleDocuments]);
  if (Object.prototype.hasOwnProperty.call(homeDocuments, key)) return path.join(home, homeDocuments[key as keyof typeof homeDocuments]);
  throw new Error('Unknown document in sourcing transaction');
}

function install(home: string, slug: string, key: string, contents: string | null): void {
  const filename = documentPath(home, slug, key);
  if (contents === null) removeDurableDocument(filename);
  else writeDurableDocument({ path: filename, value: contents, codec: textDocumentCodec });
}

/** Run before reading accepted state, including shared policy belonging to other bundles. */
export function recoverSourcingTransaction(home: string): void {
  const filename = journalPath(home);
  if (!fs.existsSync(filename)) return;
  const value: unknown = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (!isPlainObject(value) || value.version !== 1 || typeof value.bundleSlug !== 'string' || !isPlainObject(value.before)) {
    throw new Error('Invalid sourcing transaction recovery record');
  }
  const journal = value as unknown as SourcingJournal;
  // Validate every target before restoring anything. Recovery records cannot name arbitrary files.
  for (const [key, contents] of Object.entries(journal.before)) {
    documentPath(home, journal.bundleSlug, key);
    if (contents !== null && typeof contents !== 'string') throw new Error('Invalid sourcing transaction document');
  }
  for (const [key, contents] of Object.entries(journal.before)) install(home, journal.bundleSlug, key, contents);
  removeDurableDocument(filename);
}

/** Synchronous application prevents service requests observing a partially installed proposal. */
export function applySourcingTransaction(home: string, bundleSlug: string, updates: SourcingTransactionUpdates,
  faults?: { beforeInstall?: (key: SourcingTransactionDocument) => void }): void {
  recoverSourcingTransaction(home);
  const before: SourcingTransactionUpdates = {};
  for (const key of Object.keys(updates) as SourcingTransactionDocument[]) {
    if (updates[key] === undefined) throw new Error('A sourcing transaction cannot write undefined');
    const filename = documentPath(home, bundleSlug, key);
    before[key] = fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8') : null;
  }
  const journal: SourcingJournal = { version: 1, bundleSlug, before };
  writeDurableDocument({ path: journalPath(home), value: JSON.stringify(journal), codec: textDocumentCodec });
  try {
    for (const [key, contents] of Object.entries(updates)) {
      faults?.beforeInstall?.(key as SourcingTransactionDocument);
      install(home, bundleSlug, key, contents);
    }
    removeDurableDocument(journalPath(home));
  } catch (error) {
    recoverSourcingTransaction(home);
    throw error;
  }
}

import type { ParticipatesIn, sourceReviewAcceptance } from '../../concepts/index.js';
export type SourcingTransactionMeadowConceptParticipations = [
  ParticipatesIn<typeof sourceReviewAcceptance, 'apply-transaction', typeof applySourcingTransaction>,
  ParticipatesIn<typeof sourceReviewAcceptance, 'recover-transaction', typeof recoverSourcingTransaction>,
];
