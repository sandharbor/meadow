import * as fs from 'fs';
import * as path from 'path';
import type { Migration } from '../../../../../shared_code/types/migrations.js';
import {
  extensibleObjectValidation,
  readDurableDocument,
  requireValidDocument,
  writeDurableDocument,
  yamlDocumentCodec,
} from '../../../../../shared_code/utils/durableDocument.js';
import { getConfigDirectory } from '../../bundle-config/bundleConfigPaths.js';

type SecretDocument = Record<string, unknown>;
const secretCodec = yamlDocumentCodec<SecretDocument>(value =>
  extensibleObjectValidation<SecretDocument>(value),
);

function secretFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  const found: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...secretFiles(fullPath));
    else if (entry.isFile() && entry.name === 'pp_secrets.yaml') found.push(fullPath);
  }
  return found.sort();
}

export function hardenProviderSecretFiles(configDirectory: string): void {
  for (const secretPath of secretFiles(configDirectory)) {
    const secrets = requireValidDocument(
      readDurableDocument(secretPath, secretCodec),
      (): SecretDocument => ({}),
    );
    writeDurableDocument({ path: secretPath, value: secrets, codec: secretCodec, mode: 0o600 });
    if ((fs.statSync(secretPath).mode & 0o777) !== 0o600) {
      throw new Error(`Failed to apply mode 0600 to provider secret document ${secretPath}`);
    }
  }
}

export const migration: Migration = {
  id: '26_08_17_11_00_00_r4m8v2k7c5x1_harden_provider_secret_files',
  name: 'Harden provider secret files',
  description:
    'Validates and atomically rewrites every existing provider secret document with mode 0600. The migration runner checkpoint preserves the original plaintext bytes before replacement.',
  run: () => {
    hardenProviderSecretFiles(getConfigDirectory());
    return Promise.resolve();
  },
};
