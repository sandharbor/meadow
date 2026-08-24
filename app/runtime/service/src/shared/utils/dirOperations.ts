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

import fs from 'fs';
import { join } from 'path';

/**
 * Recursively delete the contents of a directory but leave the directory
 * itself in place. No-op if the directory doesn't exist.
 */
export function clearDirectory(dir: string): void {
  if (!fs.existsSync(dir)) return;

  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      clearDirectory(fullPath);
      fs.rmdirSync(fullPath);
    } else {
      fs.unlinkSync(fullPath);
    }
  }
}

/**
 * Recursively copy a directory's contents to a destination, creating the
 * destination directory if it doesn't already exist.
 */
export function copyDirectory(src: string, dest: string): void {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src);
  for (const entry of entries) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    const stat = fs.statSync(srcPath);

    if (stat.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
