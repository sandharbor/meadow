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

import { FileType } from './FileType.js';

export type SitePageConfigConfig = {
  list_type: 'blacklist' | 'whitelist';
  outlinks_depth?: number;
  inlinks_depth?: number;
  tracked?: boolean;
};

export type SitePageConfig = {
  title: string;
  source_graph_subdirectory?: string; // The directory path within the source graph
  file_type?: FileType; // The file type (e.g., 'md', 'png', 'pdf')
  config: SitePageConfigConfig;
};