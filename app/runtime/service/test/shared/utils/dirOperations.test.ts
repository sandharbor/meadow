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

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  DirectoryRebuild,
  copyFileUnlessCurrent,
  discardDirectory,
  finishDiscardedDirectories,
} from '../../../src/shared/utils/dirOperations.js';

describe('directory operations', () => {
  const tempDirectories: string[] = [];

  const makeTempDirectory = () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-dir-operations-'));
    tempDirectories.push(directory);
    return directory;
  };

  const tree = (root: string) => fs.readdirSync(root, { recursive: true }).map(String).sort()
    .map(name => fs.statSync(path.join(root, name)).isDirectory() ? `${name}/` : `${name}: ${fs.readFileSync(path.join(root, name), 'utf8')}`);

  afterEach(() => {
    for (const directory of tempDirectories.splice(0)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  describe('DirectoryRebuild', () => {
    it('leaves the directory holding exactly what was written, as removing and recreating it would', () => {
      const parent = makeTempDirectory();
      const source = path.join(parent, 'source.png');
      fs.writeFileSync(source, 'image bytes');
      const root = path.join(parent, 'rebuilt');
      fs.mkdirSync(path.join(root, 'stale', 'nested'), { recursive: true });
      fs.writeFileSync(path.join(root, 'stale', 'nested', 'old.md'), 'old');
      fs.writeFileSync(path.join(root, 'kept.md'), 'previous');
      fs.mkdirSync(path.join(root, 'becomes-file'));
      fs.writeFileSync(path.join(root, 'becomes-directory'), 'file');

      const rebuild = new DirectoryRebuild(root);
      rebuild.writeFile(path.join(root, 'kept.md'), 'current');
      rebuild.writeFile(path.join(root, 'becomes-file'), 'now a file');
      rebuild.writeFile(path.join(root, 'becomes-directory', 'page.md'), 'inside');
      rebuild.copyFile(source, path.join(root, 'images', 'copy.png'));
      rebuild.mkdir(path.join(root, 'empty'));
      rebuild.finish();

      expect(tree(root)).toEqual([
        'becomes-directory/',
        'becomes-directory/page.md: inside',
        'becomes-file: now a file',
        'empty/',
        'images/',
        'images/copy.png: image bytes',
        'kept.md: current',
      ]);
    });

    it('leaves a file untouched when its bytes and mode are unchanged', () => {
      const parent = makeTempDirectory();
      const source = path.join(parent, 'source.png');
      fs.writeFileSync(source, 'image bytes');
      const root = path.join(parent, 'rebuilt');
      const build = () => {
        const rebuild = new DirectoryRebuild(root);
        rebuild.writeFile(path.join(root, 'page.md'), 'same text');
        rebuild.copyFile(source, path.join(root, 'copy.png'));
        rebuild.finish();
      };
      const stamp = (name: string) => {
        const stats = fs.statSync(path.join(root, name), { bigint: true });
        return [stats.ino, stats.mtimeNs, stats.ctimeNs];
      };

      build();
      const before = [stamp('page.md'), stamp('copy.png')];
      build();
      expect([stamp('page.md'), stamp('copy.png')]).toEqual(before);
    });

    it('writes a file again when its bytes or mode differ from what the rebuild writes', () => {
      const parent = makeTempDirectory();
      const source = path.join(parent, 'source.png');
      fs.writeFileSync(source, 'image bytes');
      const root = path.join(parent, 'rebuilt');
      const build = () => {
        const rebuild = new DirectoryRebuild(root);
        rebuild.writeFile(path.join(root, 'page.md'), 'same text');
        rebuild.copyFile(source, path.join(root, 'copy.png'));
        rebuild.finish();
      };

      build();
      fs.writeFileSync(path.join(root, 'page.md'), 'edited elsewhere');
      fs.chmodSync(source, 0o600);
      build();

      expect(fs.readFileSync(path.join(root, 'page.md'), 'utf8')).toBe('same text');
      expect(fs.statSync(path.join(root, 'copy.png')).mode & 0o777).toBe(0o600);
    });
  });

  describe('copyFileUnlessCurrent', () => {
    it('copies again when the destination or source changed since its last copy', () => {
      const directory = makeTempDirectory();
      const source = path.join(directory, 'source.png');
      const destination = path.join(directory, 'destination.png');
      fs.writeFileSync(source, 'first');

      copyFileUnlessCurrent(source, destination);
      fs.writeFileSync(destination, 'overwritten');
      copyFileUnlessCurrent(source, destination);
      expect(fs.readFileSync(destination, 'utf8')).toBe('first');

      fs.writeFileSync(source, 'second');
      copyFileUnlessCurrent(source, destination);
      expect(fs.readFileSync(destination, 'utf8')).toBe('second');
    });
  });

  describe('discardDirectory', () => {
    it('frees the path at once and deletes the directory before finishing', async () => {
      const parent = makeTempDirectory();
      const directory = path.join(parent, 'output');
      const marker = `page-${path.basename(parent)}.html`;
      fs.mkdirSync(path.join(directory, 'nested'), { recursive: true });
      fs.writeFileSync(path.join(directory, 'nested', marker), 'page');

      discardDirectory(directory);
      expect(fs.existsSync(directory)).toBe(false);
      await finishDiscardedDirectories();

      const stillAside = fs.readdirSync(os.tmpdir())
        .filter(name => name.startsWith('meadow-discarded-'))
        .filter(name => fs.existsSync(path.join(os.tmpdir(), name, 'nested', marker)));
      expect(stillAside).toEqual([]);
    });
  });
});
