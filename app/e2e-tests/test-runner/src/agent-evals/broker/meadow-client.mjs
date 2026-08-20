#!/usr/bin/env node
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

import net from "node:net";

const socketPath = process.env.MEADOW_COMMAND_BROKER_SOCKET;
if (!socketPath) {
  process.stderr.write("Meadow command broker is not available in this session.\n");
  process.exit(78);
}

const socket = net.createConnection(socketPath);
let buffer = "";
let exited = false;

function finish(code) {
  if (exited) return;
  exited = true;
  socket.end();
  process.exitCode = code;
}

socket.on("connect", () => {
  socket.write(`${JSON.stringify({
    schemaVersion: 1,
    args: process.argv.slice(2),
    cwd: process.cwd(),
  })}\n`);
});

socket.on("data", chunk => {
  buffer += chunk.toString("utf8");
  while (buffer.includes("\n")) {
    const newline = buffer.indexOf("\n");
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      process.stderr.write("Invalid response from Meadow command broker.\n");
      finish(70);
      return;
    }
    if (event.type === "stdout" && typeof event.data === "string") process.stdout.write(event.data);
    else if (event.type === "stderr" && typeof event.data === "string") process.stderr.write(event.data);
    else if (event.type === "exit" && Number.isInteger(event.exitCode)) finish(event.exitCode);
    else if (event.type === "error") {
      process.stderr.write(`${String(event.message || "Meadow command broker failed")}\n`);
      finish(70);
    }
  }
});

socket.on("error", error => {
  process.stderr.write(`Unable to reach Meadow command broker: ${error.message}\n`);
  finish(69);
});

socket.on("close", () => {
  if (!exited) finish(70);
});
