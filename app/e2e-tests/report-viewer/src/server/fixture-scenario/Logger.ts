/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
*/

import { appendFileSync, writeFileSync } from "fs";
import path from "path";
import { TickStamp } from "./Ticker.js";

// Frontend log format expected by parseFrontendLog():
//   <ISO> [level] <message>
// Backend log format expected by parseBackendLog():
//   <ISO> - [LEVEL ] <message>
// Frontend levels are lowercase (e.g. "log", "error", "warning"); the
// assembler normalizes "warning" → "WARN".

export type FrontendLevel = "log" | "info" | "error" | "warning" | "debug";
export type BackendLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

export class Logger {
  private readonly frontendPath: string;
  private readonly backendPath: string;

  constructor(testDir: string) {
    this.frontendPath = path.join(testDir, "frontend.log");
    this.backendPath = path.join(testDir, "backend.log");
    writeFileSync(this.frontendPath, "");
    writeFileSync(this.backendPath, "");
  }

  // Always prefix the message body with "T<n>:" so the log line is
  // self-describing — the user can grep/scrub to T<n> and see all the lines
  // that belong to that tick at a glance.
  frontend(tick: TickStamp, level: FrontendLevel, message: string): void {
    const line = `${tick.atIso} [${level}] T${tick.tickIndex}: ${message}\n`;
    appendFileSync(this.frontendPath, line);
  }

  backend(tick: TickStamp, level: BackendLevel, message: string): void {
    // Pad the level field to width 5 so logs align visually (matches the
    // live backend's "[INFO ]"/"[ERROR]"/"[WARN ]" formatting).
    const padded = level.padEnd(5);
    const line = `${tick.atIso} - [${padded}] T${tick.tickIndex}: ${message}\n`;
    appendFileSync(this.backendPath, line);
  }
}
