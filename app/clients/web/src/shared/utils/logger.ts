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

// Browser-compatible logger for frontend
// This mirrors the API of shared_code/utils/loggingUtils.ts but without Node.js dependencies

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const levelPriority: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Default to 'debug' level - all messages will be logged
// In production builds, Vite tree-shaking and minification handle optimization
const minLevel: LogLevel = 'debug';

function shouldLog(level: LogLevel): boolean {
  return levelPriority[level] >= levelPriority[minLevel];
}

function formatMessage(level: LogLevel, message: string, error?: unknown): string {
  const prefix = level.toUpperCase().padEnd(5);
  let formatted = `[${prefix}] ${message}`;
  if (error !== undefined) {
    const errorStr = error instanceof Error ? error.message : String(error);
    formatted += `: ${errorStr}`;
  }
  return formatted;
}

export const logger = {
  debug(message: string, error?: unknown): void {
    if (!shouldLog('debug')) return;
    const formatted = formatMessage('debug', message, error);
    console.debug(formatted);
  },

  info(message: string, error?: unknown): void {
    if (!shouldLog('info')) return;
    const formatted = formatMessage('info', message, error);
    console.info(formatted);
  },

  warn(message: string, error?: unknown): void {
    if (!shouldLog('warn')) return;
    const formatted = formatMessage('warn', message, error);
    console.warn(formatted);
  },

  error(message: string, error?: unknown): void {
    if (!shouldLog('error')) return;
    const formatted = formatMessage('error', message, error);
    console.error(formatted);
  },

  log(level: LogLevel, message: string, error?: unknown): void {
    switch (level) {
      case 'debug': this.debug(message, error); break;
      case 'info': this.info(message, error); break;
      case 'warn': this.warn(message, error); break;
      case 'error': this.error(message, error); break;
    }
  },

  child(prefix: string) {
    return {
      debug: (message: string, error?: unknown) => logger.debug(`[${prefix}] ${message}`, error),
      info: (message: string, error?: unknown) => logger.info(`[${prefix}] ${message}`, error),
      warn: (message: string, error?: unknown) => logger.warn(`[${prefix}] ${message}`, error),
      error: (message: string, error?: unknown) => logger.error(`[${prefix}] ${message}`, error),
    };
  },
};
