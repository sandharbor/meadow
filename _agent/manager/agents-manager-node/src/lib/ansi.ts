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

// ANSI escape code helpers for TUI rendering

export const ESC = "\x1b";

export const CLEAR_SCREEN = `${ESC}[2J${ESC}[H`;
export const HIDE_CURSOR = `${ESC}[?25l`;
export const SHOW_CURSOR = `${ESC}[?25h`;

export function moveTo(row: number, col: number): string {
  return `${ESC}[${row};${col}H`;
}

export function bold(text: string): string {
  return `${ESC}[1m${text}${ESC}[0m`;
}

export function dim(text: string): string {
  return `${ESC}[2m${text}${ESC}[0m`;
}

export function inverse(text: string): string {
  return `${ESC}[7m${text}${ESC}[0m`;
}

export function green(text: string): string {
  return `${ESC}[32m${text}${ESC}[0m`;
}

export function yellow(text: string): string {
  return `${ESC}[33m${text}${ESC}[0m`;
}

export function cyan(text: string): string {
  return `${ESC}[36m${text}${ESC}[0m`;
}

export function clearLine(): string {
  return `${ESC}[2K`;
}

export function eraseToEnd(): string {
  return `${ESC}[J`;
}
