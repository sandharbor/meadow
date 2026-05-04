/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
*/

// Ticker hands out monotonically-increasing tick indices paired with ISO
// timestamps from a fake clock. Every artifact item in the fixture scenario
// (logs, file contents, commit messages, snapshot labels) is stamped with
// the tickIndex returned here, so the report viewer's timeline cross-checks
// itself by eye: scrub to T<n> and every related item should say T<n>.

export interface TickStamp {
  tickIndex: number;
  atIso: string;
  atMs: number;
}

export class Ticker {
  private _index = -1;
  private _ms = 0;
  private readonly _epochMs: number;

  constructor(epochIso: string) {
    this._epochMs = new Date(epochIso).getTime();
  }

  // Advance the clock and bump the tick index. Default 100ms per tick — small
  // enough that a 5-second timeline yields ~50 ticks of headroom, large enough
  // that a few dozen events fit visually distinct on the scrubber.
  next(advanceMs = 100): TickStamp {
    this._index += 1;
    this._ms += advanceMs;
    return this.current();
  }

  current(): TickStamp {
    if (this._index < 0) {
      throw new Error("Ticker.current() called before any next() — call next() first.");
    }
    return { tickIndex: this._index, atIso: this.iso(), atMs: this._ms };
  }

  iso(offsetMs = 0): string {
    return new Date(this._epochMs + this._ms + offsetMs).toISOString();
  }

  startIso(): string {
    return new Date(this._epochMs).toISOString();
  }

  endIso(): string {
    return this.iso();
  }

  totalDurationMs(): number {
    return this._ms;
  }

  // Format helpers for stamping content with the current (or a specific) tick.
  static label(tick: TickStamp, prefix: "T" | "S" | "C" = "T"): string {
    return `${prefix}${tick.tickIndex}`;
  }
}
