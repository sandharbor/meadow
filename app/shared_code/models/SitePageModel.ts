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

import { ISitePage, LinkResolvedInfo } from '../types/ISitePage.js';
import { SitePageConfig } from '../types/sitePageConfig.js';
import { FileType } from '../types/FileType.js';

export class SitePageModel implements ISitePage {
  id: string;
  label: string;
  title: string;
  body?: string;
  tracked?: boolean;
  blacklisted?: boolean;
  sensitive?: boolean;
  offTopic?: boolean;
  sourceGraphSubdirectory: string;
  file_type: FileType;
  conf?: SitePageConfig;
  depth: number;
  remaining_depth: number;
  path?: string[];
  linkResolutionMap?: Record<string, LinkResolvedInfo>;
  isFrontierPage?: boolean;
  isFrontierImageExtension?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: Record<string, any>;

  constructor(
    id: string,
    label: string,
    title: string,
    body?: string,
    tracked?: boolean,
    blacklisted?: boolean,
    sensitive?: boolean,
    offTopic?: boolean,
    conf?: SitePageConfig,
    sourceGraphSubdirectory?: string,
    file_type?: FileType,
    depth: number = 0,
    remaining_depth: number = 0,
    path?: string[],
    linkResolutionMap?: Record<string, LinkResolvedInfo>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: Record<string, any>
  ) {
    this.id = id;
    this.label = label;
    this.title = title;
    this.body = body;
    this.tracked = tracked;
    this.blacklisted = blacklisted;
    this.sensitive = sensitive;
    this.offTopic = offTopic;
    this.conf = conf;
    this.sourceGraphSubdirectory = sourceGraphSubdirectory || '';
    this.file_type = file_type || 'md';
    this.depth = depth;
    this.remaining_depth = remaining_depth;
    this.path = path;
    this.linkResolutionMap = linkResolutionMap;
    this.data = data;
  }

  public getIdent(): string {
    return `${this.sourceGraphSubdirectory}---${this.title}---${this.file_type}`;
  }
}