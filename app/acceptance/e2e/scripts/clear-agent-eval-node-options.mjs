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

// The relocated agent-eval package views need symlink preservation in this
// process so Node retains the E2E package's ESM boundary. Do not leak those
// resolver flags to npm, Codex, or Runtime child processes: Homebrew's npm
// launcher is itself a symlink and cannot resolve its library when preserved.
const childNodeOptions = (process.env.NODE_OPTIONS ?? "")
  .split(/\s+/)
  .filter(option => option && option !== "--preserve-symlinks" && option !== "--preserve-symlinks-main")
  .join(" ");

if (childNodeOptions) {
  process.env.NODE_OPTIONS = childNodeOptions;
} else {
  delete process.env.NODE_OPTIONS;
}
