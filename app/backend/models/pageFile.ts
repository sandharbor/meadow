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

import { ITraversalPage } from '../types/ITraversalPage.js';
import { FileType } from '../../shared_code/types/FileType.js';

export class PageFile implements ITraversalPage {
  public conf_outlinks_depth?: number;
  public conf_inlinks_depth?: number;
  public conf_is_blacklisted?: boolean;
  public is_sensitive: boolean;

  constructor(
    public directory: string,
    public title: string,
    public file_type: FileType,
    is_sensitive: boolean = false
  ) {
    this.is_sensitive = is_sensitive;
  }

  getIdent(): string {
    return `${this.directory}/${this.title}.${this.file_type}`;
  }
}
