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

import { describe, it, expect } from 'vitest';
import { removeComments } from '../../../../../src/areas/bundle/generation/html/markdown.js';

describe('Obsidian comments', () => {
  it('removes an inline comment and a comment spanning lines', () => {
    expect(removeComments('a %%hidden%% b')).toBe('a  b');
    expect(removeComments('a\n%%\nhidden\nlines\n%%\nb')).toBe('a\n\nb');
  });

  it('hides the rest of the note after a comment that never closes', () => {
    expect(removeComments('shown\n%%\nhidden to the end')).toBe('shown\n');
  });

  it('keeps `\\%%` as text', () => {
    expect(removeComments('50\\%% and 60\\%%')).toBe('50\\%% and 60\\%%');
  });

  it('keeps `%%` inside code, but a comment may contain code', () => {
    expect(removeComments('`%%code%%` and\n```\n%%fenced%%\n```')).toBe('`%%code%%` and\n```\n%%fenced%%\n```');
    expect(removeComments('a %%hidden `code` here%% b')).toBe('a  b');
  });
});
