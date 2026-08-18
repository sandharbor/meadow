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
  type ProviderDestinationRecord,
} from '../types/generatedBundleVersioning.js';
import { isPlainObject, yamlDocumentCodec } from './durableDocument.js';

const EVENT_TYPES = new Set([
  'imported-publication',
  'publication-success',
  'republish-success',
  'successor-manifest-sync-success',
  'verification-success',
  'remote-deletion-success',
]);

export function providerPublicationStateCodec<T extends ProviderDestinationRecord>(
  expectedProviderInstanceId: string,
  validateDestination: (value: unknown) => string | null,
) {
  return yamlDocumentCodec<T>(value => {
    if (!isPlainObject(value)) return { valid: false, diagnostic: '$ must be an object' };
    if (value.schemaVersion !== 1) return { valid: false, diagnostic: '$.schemaVersion must be 1' };
    if (value.providerInstanceId !== expectedProviderInstanceId) {
      return {
        valid: false,
        diagnostic: `$.providerInstanceId must be ${expectedProviderInstanceId}`,
      };
    }
    const destinationError = validateDestination(value.destination);
    if (destinationError) return { valid: false, diagnostic: destinationError };
    if (!Array.isArray(value.events)) return { valid: false, diagnostic: '$.events must be an array' };
    for (let index = 0; index < value.events.length; index += 1) {
      const event = value.events[index];
      const prefix = `$.events[${index}]`;
      if (!isPlainObject(event)) return { valid: false, diagnostic: `${prefix} must be an object` };
      if (!EVENT_TYPES.has(String(event.eventType))) {
        return { valid: false, diagnostic: `${prefix}.eventType is invalid` };
      }
      if (event.providerInstanceId !== expectedProviderInstanceId) {
        return {
          valid: false,
          diagnostic: `${prefix}.providerInstanceId must be ${expectedProviderInstanceId}`,
        };
      }
      for (const field of ['versionId', 'savedGenerationId', 'timestamp', 'remoteNamespace']) {
        if (typeof event[field] !== 'string') {
          return { valid: false, diagnostic: `${prefix}.${field} must be a string` };
        }
      }
      if (!GENERATED_BUNDLE_VERSION_ID_PATTERN.test(String(event.versionId))) {
        return { valid: false, diagnostic: `${prefix}.versionId is invalid` };
      }
      for (const field of ['publicUrl', 'readerRouteIndex', 'entryPath']) {
        if (event[field] !== undefined && typeof event[field] !== 'string') {
          return { valid: false, diagnostic: `${prefix}.${field} must be a string` };
        }
      }
    }
    return { valid: true, value: value as unknown as T };
  });
}
