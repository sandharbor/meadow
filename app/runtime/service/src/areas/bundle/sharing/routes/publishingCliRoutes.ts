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

import { randomUUID } from 'crypto';
import express from 'express';
import {
  CLI_MUTATION_BEHAVIORS,
  CLI_OPERATION_SCHEMA_VERSION,
  type CliMutationBehavior,
  type PublishBundleCliResult,
} from '../../../../../../../contracts/types/cliOperations.js';
import {
  PublishingProviderOperationError,
} from '../../../../shared/publishing-provider-host/IPublishingProviderBackend.js';
import { getActiveBackendProviders } from '../../../../shared/publishing-provider-host/providerRegistry.js';
import { logger } from '../../../../shared/utils/logging/backendLoggingUtils.js';

const router = express.Router();

interface CliPublishingErrorBody {
  schemaVersion: typeof CLI_OPERATION_SCHEMA_VERSION;
  operation: 'bundle.publish';
  success: false;
  code: string;
  error: string;
  mutationBehavior: CliMutationBehavior;
  details?: string;
  nextActions: string[];
}

function sendError(
  res: express.Response,
  status: number,
  options: Omit<CliPublishingErrorBody, 'schemaVersion' | 'operation' | 'success' | 'mutationBehavior'>,
): void {
  res.status(status).json({
    schemaVersion: CLI_OPERATION_SCHEMA_VERSION,
    operation: 'bundle.publish',
    success: false,
    mutationBehavior: CLI_MUTATION_BEHAVIORS.publishGeneration,
    ...options,
  } satisfies CliPublishingErrorBody);
}

router.post('/bundles/:bundleSlug/sharing/publish', (req, res) => {
  void (async () => {
    const { bundleSlug } = req.params;
    const versionId = (req.body as { versionId?: unknown } | undefined)?.versionId;
    if (!bundleSlug || typeof versionId !== 'string' || versionId.trim().length === 0) {
      sendError(res, 400, {
        code: 'INVALID_PUBLISH_REQUEST',
        error: 'bundleSlug and versionId are required',
        nextActions: ["Run 'meadow bundle publish --help' for the required arguments."],
      });
      return;
    }

    const activeProviders = getActiveBackendProviders();
    if (activeProviders.length === 0) {
      sendError(res, 409, {
        code: 'NO_ACTIVE_PUBLISHING_PROVIDER',
        error: 'No publishing provider is active',
        nextActions: ['Activate and configure one publishing provider, then retry the command.'],
      });
      return;
    }
    if (activeProviders.length > 1) {
      sendError(res, 409, {
        code: 'MULTIPLE_ACTIVE_PUBLISHING_PROVIDERS',
        error: 'More than one publishing provider is active',
        details: `Active providers: ${activeProviders.map(provider => provider.manifest.id).join(', ')}`,
        nextActions: ['Leave exactly one publishing provider active, then retry the command.'],
      });
      return;
    }

    const provider = activeProviders[0];
    if (!provider.publishGeneratedBundle) {
      sendError(res, 409, {
        code: 'PUBLISHING_PROVIDER_CLI_UNSUPPORTED',
        error: `The active publishing provider '${provider.manifest.displayName}' does not support command-line publishing`,
        nextActions: ['Use the provider publishing interface or activate a provider that supports this command.'],
      });
      return;
    }

    try {
      const result = await provider.publishGeneratedBundle({
        bundleSlug,
        versionId,
        operationId: randomUUID(),
      });
      const response: PublishBundleCliResult = {
        schemaVersion: CLI_OPERATION_SCHEMA_VERSION,
        operation: 'bundle.publish',
        slug: bundleSlug,
        versionId: result.versionId,
        savedGenerationId: result.savedGenerationId,
        changed: result.changed,
        mutationBehavior: CLI_MUTATION_BEHAVIORS.publishGeneration,
        provider: {
          id: provider.manifest.id,
          instanceId: result.providerInstanceId,
        },
        url: result.url,
        identityCreated: result.identityCreated ?? false,
        remainingAllowance: result.remainingAllowance ?? null,
      };
      res.json(response);
    } catch (error) {
      if (error instanceof PublishingProviderOperationError) {
        sendError(res, error.statusCode, {
          code: error.code,
          error: error.message,
          ...(error.details ? { details: error.details } : {}),
          nextActions: error.nextActions ?? ['Correct the provider configuration or bundle state, then retry.'],
        });
        return;
      }
      logger.error('[publishing-cli] Provider publication failed:', error);
      sendError(res, 500, {
        code: 'PUBLISHING_PROVIDER_FAILED',
        error: 'The publishing provider failed unexpectedly',
        nextActions: ['Review the application logs, then retry.'],
      });
    }
  })();
});

export default router;
