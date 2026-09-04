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

import {
  GENERATED_BUNDLE_VERSION_ID_PATTERN,
  PUBLICATION_REVISION_ID_PATTERN,
  type ProviderPublicationRevisionState,
} from '../../contracts/types/generatedBundleVersioning.js';
import { isPlainObject, yamlDocumentCodec } from './durableDocument.js';

const REMOTE_STATES = new Set(['pending', 'present', 'deleted']);
const CONNECTIONS = new Set(['connected', 'disconnected']);
const CLEANUP_POLICIES = new Set(['keep', 'delete-after-success']);
const CLEANUP_STATES = new Set(['not-requested', 'scheduled', 'complete', 'failed']);

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function nullableString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

export function publicationRevisionStateCodec<T extends ProviderPublicationRevisionState>(
  expectedProviderInstanceId: string,
  validateIdentity: (value: unknown) => string | null,
) {
  return yamlDocumentCodec<T>(value => {
    if (!isPlainObject(value)) return { valid: false, diagnostic: '$ must be an object' };
    if (value.schemaVersion !== 2) return { valid: false, diagnostic: '$.schemaVersion must be 2' };
    if (value.providerInstanceId !== expectedProviderInstanceId) {
      return { valid: false, diagnostic: `$.providerInstanceId must be ${expectedProviderInstanceId}` };
    }
    const identityError = validateIdentity(value.destinationIdentity);
    if (identityError) return { valid: false, diagnostic: identityError };
    if (!nullableString(value.currentRevisionId) || !nullableString(value.pendingRevisionId)) {
      return { valid: false, diagnostic: '$.currentRevisionId and $.pendingRevisionId must be strings or null' };
    }
    if (!Array.isArray(value.revisions)) return { valid: false, diagnostic: '$.revisions must be an array' };
    const ids = new Set<string>();
    for (let index = 0; index < value.revisions.length; index += 1) {
      const revision = value.revisions[index];
      const prefix = `$.revisions[${index}]`;
      if (!isPlainObject(revision)) return { valid: false, diagnostic: `${prefix} must be an object` };
      if (typeof revision.publicationRevisionId !== 'string' || !PUBLICATION_REVISION_ID_PATTERN.test(revision.publicationRevisionId)) {
        return { valid: false, diagnostic: `${prefix}.publicationRevisionId is invalid` };
      }
      const foldedId = revision.publicationRevisionId.toLowerCase();
      if (ids.has(foldedId)) return { valid: false, diagnostic: `${prefix}.publicationRevisionId is duplicated` };
      ids.add(foldedId);
      if (typeof revision.generatedVersionId !== 'string' || !GENERATED_BUNDLE_VERSION_ID_PATTERN.test(revision.generatedVersionId)) {
        return { valid: false, diagnostic: `${prefix}.generatedVersionId is invalid` };
      }
      if (typeof revision.publishSlug !== 'string') return { valid: false, diagnostic: `${prefix}.publishSlug must be a string` };
      const predecessorPublicationRevisionId = revision.predecessorPublicationRevisionId;
      if (!nullableString(predecessorPublicationRevisionId)) {
        return { valid: false, diagnostic: `${prefix}.predecessorPublicationRevisionId must be a string or null` };
      }
      if (typeof predecessorPublicationRevisionId === 'string') {
        if (!PUBLICATION_REVISION_ID_PATTERN.test(predecessorPublicationRevisionId)) {
          return { valid: false, diagnostic: `${prefix}.predecessorPublicationRevisionId is invalid` };
        }
        if (predecessorPublicationRevisionId.toLowerCase() === foldedId) {
          return { valid: false, diagnostic: `${prefix}.predecessorPublicationRevisionId cannot reference itself` };
        }
        if (!ids.has(predecessorPublicationRevisionId.toLowerCase())) {
          return { valid: false, diagnostic: `${prefix}.predecessorPublicationRevisionId must reference an earlier revision` };
        }
      }
      if (!CONNECTIONS.has(String(revision.readerConnectionToPredecessor))) {
        return { valid: false, diagnostic: `${prefix}.readerConnectionToPredecessor is invalid` };
      }
      if (!CLEANUP_POLICIES.has(String(revision.predecessorCleanupPolicy))) {
        return { valid: false, diagnostic: `${prefix}.predecessorCleanupPolicy is invalid` };
      }
      if (!CLEANUP_STATES.has(String(revision.cleanupState))) {
        return { valid: false, diagnostic: `${prefix}.cleanupState is invalid` };
      }
      if (!REMOTE_STATES.has(String(revision.remoteState))) {
        return { valid: false, diagnostic: `${prefix}.remoteState is invalid` };
      }
      for (const field of ['createdAt']) {
        if (typeof revision[field] !== 'string' || Number.isNaN(Date.parse(revision[field] as string))) {
          return { valid: false, diagnostic: `${prefix}.${field} must be a timestamp` };
        }
      }
      for (const field of ['latestSuccessfulSavedGenerationId', 'publishedAt', 'deletedAt', 'remoteNamespace']) {
        if (!nullableString(revision[field])) return { valid: false, diagnostic: `${prefix}.${field} must be a string or null` };
      }
      for (const field of ['publicUrl', 'readerRouteIndex', 'entryPath', 'cleanupError']) {
        if (!optionalString(revision[field])) return { valid: false, diagnostic: `${prefix}.${field} must be a string` };
      }
      if (revision.remoteState === 'pending' && revision.publishedAt !== null) {
        return { valid: false, diagnostic: `${prefix}.publishedAt must be null while the revision is pending` };
      }
      if (revision.remoteState === 'present'
        && (revision.publishedAt === null || revision.remoteNamespace === null)) {
        return { valid: false, diagnostic: `${prefix} is missing successful publication metadata` };
      }
    }
    if (value.revisions.filter(revision => revision.remoteState === 'pending').length > 1) {
      return { valid: false, diagnostic: '$.revisions may contain only one never-published pending revision' };
    }
    for (const field of ['currentRevisionId', 'pendingRevisionId'] as const) {
      const id = value[field];
      if (id !== null && !ids.has(String(id).toLowerCase())) {
        return { valid: false, diagnostic: `$.${field} must reference a revision` };
      }
    }
    return { valid: true, value: value as unknown as T };
  });
}
