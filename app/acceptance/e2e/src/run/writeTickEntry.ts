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

import { closeSync, fstatSync, ftruncateSync, openSync, writeFileSync } from "node:fs";

interface TickEntry extends Record<string, unknown> {
  uncommittedFileContents?: Record<string, string>;
  ignoredFileContents?: Record<string, string>;
}

export function appendTickEntrySync(filename: string, entry: TickEntry): void {
  const { uncommittedFileContents, ignoredFileContents, ...metadata } = entry;
  const encodedMetadata = JSON.stringify(metadata);
  const fd = openSync(filename, "a");
  const originalSize = fstatSync(fd).size;
  try {
    writeFileSync(fd, encodedMetadata.slice(0, -1));
    let hasFields = encodedMetadata !== "{}";
    // A forced final tick includes every captured file. Serialize each file
    // separately instead of allocating another complete JSON string and UTF-8
    // buffer for the entire bundle. The JSONL format and content stay intact.
    for (const [field, contents] of Object.entries({ uncommittedFileContents, ignoredFileContents })) {
      if (contents === undefined) continue;
      writeFileSync(fd, `${hasFields ? "," : ""}${JSON.stringify(field)}:{`);
      let first = true;
      for (const [file, content] of Object.entries(contents)) {
        writeFileSync(fd, `${first ? "" : ","}${JSON.stringify(file)}:${JSON.stringify(content)}`);
        first = false;
      }
      writeFileSync(fd, "}");
      hasFields = true;
    }
    writeFileSync(fd, "}\n");
  } catch (error) {
    // A failed append must not leave half a JSON record in front of later ticks.
    ftruncateSync(fd, originalSize);
    throw error;
  } finally {
    closeSync(fd);
  }
}
