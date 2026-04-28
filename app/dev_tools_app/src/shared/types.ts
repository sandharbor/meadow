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
 * Shared types for dev_tools_app client and server
 */

export enum ConfigMode {
  Normal = "normal",
  MissingConf = "missing-conf",
  TestFixture = "test-fixture",
}

export interface ConfigFixture {
  /** The full folder name (e.g., "home_fixture_big_and_small") */
  folderName: string;
  /** The display name with prefix stripped (e.g., "big_and_small") */
  displayName: string;
}

export interface PublishingProviderConfProfile {
  /** Folder name under app/dev_tools_app/publishing_provider_confs (used as both id and display) */
  name: string;
  /** ProviderClassName subfolders this profile would write into MeadowHome */
  providerClassNames: string[];
}
