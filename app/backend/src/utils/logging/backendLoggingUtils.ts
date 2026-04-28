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

import * as fs from 'fs';
import * as path from 'path';
import { LogLevel } from '../../../../shared_code/types/logging.js';

export { LogLevel };

let logDirectoryOverride: string | undefined;

/**
 * Sets a custom log directory override, e.g. from resources.local.yaml.
 * Call this at startup before any logging occurs.
 */
export function setLogDirectoryOverride(dir: string): void {
  logDirectoryOverride = dir;
}

/**
 * Gets the log directory path (~/Library/Logs/Meadow), or the override if set.
 */
export function getLogDirectory(): string {
  if (logDirectoryOverride) {
    return logDirectoryOverride;
  }
  const homedir = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(homedir, 'Library', 'Logs', 'Meadow');
}

/**
 * Ensures the log directory exists, creating it if necessary
 */
function ensureLogDirectory(): void {
  const logDir = getLogDirectory();
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

/**
 * Logger class that writes to both console and meadow.log file.
 *
 * Usage:
 *   import { logger } from './utils/logging/backendLoggingUtils.js';
 *   logger.info('[myModule] Something happened');
 *   logger.error('[myModule] Something failed', error);
 *
 * Or create a custom logger with a specific minimum level:
 *   const customLogger = new Logger('info');
 */
export class Logger {
  private minLevel: LogLevel;

  // Use string literals as keys to avoid enum initialization order issues
  private static levelPriority: Record<string, number> = {
    'debug': 0,
    'info': 1,
    'warn': 2,
    'error': 3,
  };

  constructor(minLevel: LogLevel = LogLevel.Info) {
    this.minLevel = minLevel;
  }

  /**
   * Update the minimum log level at runtime
   */
  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /**
   * Get the current minimum log level
   */
  getLevel(): LogLevel {
    return this.minLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    return Logger.levelPriority[level] >= Logger.levelPriority[this.minLevel];
  }

  private appendToLogFile(message: string): void {
    try {
      ensureLogDirectory();
      const logPath = path.join(getLogDirectory(), 'meadow.log');
      const timestamp = new Date().toISOString();
      fs.appendFileSync(logPath, `${timestamp} - ${message}\n`, 'utf8');
    } catch {
      // Never let logging crash the app
    }
  }

  private formatMessage(level: LogLevel, message: string, error?: unknown): string {
    const prefix = level.toUpperCase().padEnd(5);
    let formatted = `[${prefix}] ${message}`;
    if (error !== undefined) {
      let errorStr: string;
      if (error instanceof Error) {
        errorStr = error.message;
      } else if (typeof error === 'string') {
        errorStr = error;
      } else {
        try {
          errorStr = JSON.stringify(error);
        } catch {
          errorStr = '[object]';
        }
      }
      formatted += `: ${errorStr}`;
    }
    return formatted;
  }

  debug(message: string, error?: unknown): void {
    if (!this.shouldLog(LogLevel.Debug)) return;
    const formatted = this.formatMessage(LogLevel.Debug, message, error);
    console.debug(formatted);
    this.appendToLogFile(formatted);
  }

  info(message: string, error?: unknown): void {
    if (!this.shouldLog(LogLevel.Info)) return;
    const formatted = this.formatMessage(LogLevel.Info, message, error);
    console.info(formatted);
    this.appendToLogFile(formatted);
  }

  warn(message: string, error?: unknown): void {
    if (!this.shouldLog(LogLevel.Warn)) return;
    const formatted = this.formatMessage(LogLevel.Warn, message, error);
    console.warn(formatted);
    this.appendToLogFile(formatted);
  }

  error(message: string, error?: unknown): void {
    if (!this.shouldLog(LogLevel.Error)) return;
    const formatted = this.formatMessage(LogLevel.Error, message, error);
    console.error(formatted);
    this.appendToLogFile(formatted);
  }

  /**
   * Log a message at a specific level
   */
  log(level: LogLevel, message: string, error?: unknown): void {
    switch (level) {
      case LogLevel.Debug: this.debug(message, error); break;
      case LogLevel.Info: this.info(message, error); break;
      case LogLevel.Warn: this.warn(message, error); break;
      case LogLevel.Error: this.error(message, error); break;
    }
  }

  /**
   * Create a child logger with a prefix
   */
  child(prefix: string): PrefixedLogger {
    return new PrefixedLogger(this, prefix);
  }
}

/**
 * A logger that automatically prefixes all messages
 */
export class PrefixedLogger {
  private parent: Logger;
  private prefix: string;

  constructor(parent: Logger, prefix: string) {
    this.parent = parent;
    this.prefix = prefix;
  }

  debug(message: string, error?: unknown): void {
    this.parent.debug(`[${this.prefix}] ${message}`, error);
  }

  info(message: string, error?: unknown): void {
    this.parent.info(`[${this.prefix}] ${message}`, error);
  }

  warn(message: string, error?: unknown): void {
    this.parent.warn(`[${this.prefix}] ${message}`, error);
  }

  error(message: string, error?: unknown): void {
    this.parent.error(`[${this.prefix}] ${message}`, error);
  }
}

/**
 * Default logger instance.
 * Import this for most use cases.
 */
export const logger = new Logger();

/**
 * Create a logger with a specific minimum log level.
 * Use this when you need a logger that filters out lower-level messages.
 */
export function createLogger(minLevel?: LogLevel): Logger {
  return new Logger(minLevel);
}
