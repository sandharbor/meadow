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

import type { MigrationInfo, MigrationsYaml } from '../types/migrations.js';

/**
 * Generate a random string of lowercase letters and numbers
 */
export function generateRandomId(length: number = 12): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate a migration filename with the current timestamp
 * Format: YY_MM_DD_HH_MM_SS_<random-12-chars>_<name>.ts
 */
export function generateMigrationFilename(name: string): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  
  const timestamp = `${yy}_${mm}_${dd}_${hh}_${min}_${ss}`;
  const randomId = generateRandomId(12);
  const sanitizedName = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  
  return `${timestamp}_${randomId}_${sanitizedName}.ts`;
}

/**
 * Parse a migration filename to extract its components
 */
export function parseMigrationFilename(filename: string): MigrationInfo | null {
  // Match: YY_MM_DD_HH_MM_SS_<12-char-random>_<name>.ts
  const match = filename.match(/^(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_([a-z0-9]{12})_(.+)\.ts$/);
  
  if (!match) {
    return null;
  }
  
  const [, yy, mm, dd, hh, min, ss, randomId, namePart] = match;
  
  // Convert YY to YYYY (assume 20xx for years 00-99)
  const year = `20${yy}`;
  const timestamp = `${year}-${mm}-${dd} ${hh}:${min}:${ss}`;
  
  // Convert snake_case name to human readable
  const name = namePart.replace(/_/g, ' ');
  
  return {
    filename,
    timestamp,
    randomId,
    name,
    completed: false // Will be set when comparing with migrations.yaml
  };
}

/**
 * Sort migration infos by timestamp (oldest first for running, newest first for display)
 */
export function sortMigrationsByTimestamp(migrations: MigrationInfo[], newestFirst: boolean = true): MigrationInfo[] {
  return [...migrations].sort((a, b) => {
    const comparison = a.timestamp.localeCompare(b.timestamp);
    return newestFirst ? -comparison : comparison;
  });
}

/**
 * Get completed migrations from the migrations.yaml content
 */
export function getCompletedMigrations(migrationsYaml: MigrationsYaml | null): string[] {
  return migrationsYaml?.completed_migrations || [];
}

/**
 * Generate migration template content
 */
export function generateMigrationTemplate(name: string, description: string): string {
  return `import type { Migration } from '../../../../shared_code/types/migrations.js';

/**
 * Migration: ${name}
 * ${description}
 */

export const migration: Migration = {
  name: '${name}',
  description: '${description}',
  run: async () => {
    // TODO: Implement migration logic here
    throw new Error('Migration not implemented');
  }
};
`;
}

