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

export const RUNTIME_NODE_PAYLOAD_PATH = "bin/node";

export const RUNTIME_NATIVE_COMPONENTS = Object.freeze([
  Object.freeze({
    projectPath: "source_page_search_by_title/source_page_search_by_title_code",
    executableName: "source_page_search_by_title_bin",
    payloadPath: "native/source_page_search_by_title_bin",
  }),
  Object.freeze({
    projectPath: "fast_git_ops/fast_git_ops_code",
    executableName: "fast_git_ops_bin",
    payloadPath: "native/fast_git_ops_bin",
  }),
  Object.freeze({
    projectPath: "working_graph/working_graph_code",
    executableName: "working_graph_bin",
    payloadPath: "native/working_graph_bin",
  }),
]);

export const RUNTIME_PAYLOAD_EXECUTABLE_PATHS = Object.freeze([
  RUNTIME_NODE_PAYLOAD_PATH,
  ...RUNTIME_NATIVE_COMPONENTS.map(component => component.payloadPath),
]);

export const RUNTIME_PAYLOAD_CRITICAL_FILES = Object.freeze([
  ...RUNTIME_PAYLOAD_EXECUTABLE_PATHS,
  "service/dist/runtime/service/src/shared/app-shell/index.js",
  "supervisor/meadow-runtime-supervisor.cjs",
  "web/index.html",
  "web/server.js",
]);
