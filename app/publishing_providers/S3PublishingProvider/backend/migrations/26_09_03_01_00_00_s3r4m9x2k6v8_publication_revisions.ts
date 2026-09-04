/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
*/

import fs from 'fs';
import type { Migration } from '../../../../contracts/types/migrations.js';
import { getBundlesDirectory } from '../../../../runtime/service/src/shared/bundle-config/bundleConfigPaths.js';
import { loadGeneratedBundleVersionManifest } from '../../../../runtime/service/src/shared/generated-bundle-versioning/generatedBundleVersionManifestService.js';
import { loadS3PublicationState, s3PublicationStatePath, saveS3PublicationState } from '../internal/versioning/publicationStore.js';

const id = '26_09_03_01_00_00_s3r4m9x2k6v8_publication_revisions';

export const migration: Migration = {
  id,
  name: 'Migrate S3 publications to revisions',
  description: 'Preserves S3 addresses while moving provider history from version events to publication revisions.',
  async run(): Promise<void> {
    const bundlesDirectory = getBundlesDirectory();
    if (!fs.existsSync(bundlesDirectory)) return;
    for (const entry of fs.readdirSync(bundlesDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory() || !fs.existsSync(s3PublicationStatePath(entry.name))) continue;
      const state = loadS3PublicationState(entry.name);
      if (!state) continue;
      const generated = loadGeneratedBundleVersionManifest(`${bundlesDirectory}/${entry.name}`);
      const connections = new Map(generated.versions.map(version => [version.versionId, version.readerConnectionToPredecessor]));
      saveS3PublicationState(entry.name, {
        ...state,
        revisions: state.revisions.map(revision => {
          const predecessor = state.revisions.find(candidate =>
            candidate.publicationRevisionId === revision.predecessorPublicationRevisionId
          );
          return {
            ...revision,
            readerConnectionToPredecessor: predecessor
              ? predecessor.generatedVersionId === revision.generatedVersionId
                ? revision.readerConnectionToPredecessor
                : (connections.get(revision.generatedVersionId) ?? 'connected')
              : 'disconnected',
          };
        }),
      });
    }
  },
};
