/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAllBackendProviders } from './providerRegistry.js';
import { PublishingProviderPaths } from '../../../../../../../shared_code/paths/publishingProviderPaths.js';
import type { MigrationScope } from '../../../../shared/migrations/runner.js';

export function getProviderMigrationScopes(configDir: string): MigrationScope[] {
  return getAllBackendProviders().flatMap(provider => {
    const providerId = provider.manifest.id;
    const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
      '../../../../../../../publishing_providers', providerId, 'backend/areas/bundle/sharing/migrations');
    const retiredMigrationIds = provider.retiredMigrationIds ?? [];
    if (!fs.existsSync(migrationsDir) && retiredMigrationIds.length === 0) return [];
    return [{ name: providerId, migrationsDir,
      ledgerPath: path.join(PublishingProviderPaths.getGlobalProviderDir(configDir, providerId), 'migrations.yaml'),
      retiredMigrationIds }];
  });
}
