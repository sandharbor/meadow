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

/**
 * Migration filename format: YY_MM_DD_HH_MM_SS_<random-12-chars>_<name>.ts
 * Example: 24_12_05_14_30_45_abc123def456_add_source_graph_subdirectory.ts
 */

export interface MigrationInfo {
  filename: string;
  timestamp: string; // YYYY-MM-DD HH:MM:SS format
  randomId: string; // 12 character random string
  name: string; // Human readable name (extracted from filename)
  completed: boolean;
}

export interface MigrationsYaml {
  completed_migrations: string[];
}

export interface Migration {
  name: string;
  description: string;
  run: () => Promise<void>;
}

