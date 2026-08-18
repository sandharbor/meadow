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

export type StartupFailureCategory =
  | 'invalid-syntax'
  | 'invalid-schema'
  | 'unsupported-home-format'
  | 'incomplete-migration'
  | 'checkpoint-failure'
  | 'startup-failure';

export interface StartupFailureDiagnostic {
  schemaVersion: 1;
  category: StartupFailureCategory;
  title: string;
  summary: string;
  selectedHomePath: string;
  bootstrapPath: string;
  relevantPath: string | null;
  appVersion: string;
  supportedHomeFormatMinimum: number;
  supportedHomeFormatMaximum: number;
  lastSuccessfulMigration: string | null;
  checkpointId: string | null;
  checkpointPath: string | null;
  checkpointAvailable: boolean;
}
