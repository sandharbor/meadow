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
import * as yaml from 'js-yaml';
import { logger } from './logging/backendLoggingUtils.js';
import {
  textDocumentCodec,
  writeDurableDocument,
} from '../../../../../shared_code/utils/durableDocument.js';

interface FrontmatterParseResult {
  frontmatter: Record<string, unknown>;
  content: string;
  hasFrontmatter: boolean;
}

interface FrontmatterUpdateSource extends FrontmatterParseResult {
  /** How the note writes the frontmatter, so an update keeps it that way. */
  style: FrontmatterStyle;
}

interface FrontmatterStyle {
  byteOrderMark: string;
  lineEnding: '\n' | '\r\n';
}

export interface FrontmatterSplit extends FrontmatterStyle {
  /** The YAML between the delimiter lines. */
  yaml: string;
  /** The note after the closing line. */
  body: string;
}

/**
 * Splits a note's leading frontmatter from its body, or returns null when it
 * has none. Matching Obsidian and Linkrange: an optional byte order mark, a
 * first line of `---`, and the first later line of `---` or `...` closing it.
 * Lines may end in `\n` or `\r\n`, and the closing line may end the note. An
 * opening line that is never closed is not frontmatter.
 */
export function splitFrontmatter(text: string): FrontmatterSplit | null {
  const byteOrderMark = text.startsWith('\uFEFF') ? '\uFEFF' : '';
  const opening = /^---(\r?\n)/.exec(text.slice(byteOrderMark.length));
  if (!opening) return null;
  const yamlStart = byteOrderMark.length + opening[0].length;
  let lineStart = yamlStart;
  while (lineStart < text.length) {
    const newline = text.indexOf('\n', lineStart);
    const lineEnd = newline < 0 ? text.length : newline + 1;
    const line = text.slice(lineStart, lineEnd).replace(/\r?\n$/, '');
    if (line === '---' || line === '...') {
      return {
        byteOrderMark,
        lineEnding: opening[1] as '\n' | '\r\n',
        yaml: text.slice(yamlStart, lineStart),
        body: text.slice(lineEnd),
      };
    }
    lineStart = lineEnd;
  }
  return null;
}

export class FrontmatterUtils {
  
  /**
   * Parse frontmatter from markdown text
   */
  static parseFromText(markdownText: string): FrontmatterParseResult {
    const split = splitFrontmatter(markdownText);
    
    if (!split) {
      return {
        frontmatter: {},
        content: markdownText,
        hasFrontmatter: false
      };
    }
    
    const frontmatterText = split.yaml;
    const contentWithoutFrontmatter = split.body;
    
    try {
      const frontmatter = yaml.load(frontmatterText) as Record<string, unknown> || {};
      return {
        frontmatter,
        content: contentWithoutFrontmatter,
        hasFrontmatter: true
      };
    } catch (error) {
      logger.warn('Failed to parse frontmatter YAML:', error);
      return {
        frontmatter: {},
        content: markdownText,
        hasFrontmatter: false
      };
    }
  }

  /**
   * Parse frontmatter from a file
   */
  static parseFromFile(filePath: string): FrontmatterParseResult {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }
    
    const markdownText = fs.readFileSync(filePath, 'utf-8');
    return this.parseFromText(markdownText);
  }

  private static parseFromFileForUpdate(filePath: string): FrontmatterUpdateSource {
    if (!fs.existsSync(filePath)) throw new Error(`File does not exist: ${filePath}`);
    const markdownText = fs.readFileSync(filePath, 'utf8');
    const split = splitFrontmatter(markdownText);
    if (!split) {
      if (/^\uFEFF?---\r?\n/.test(markdownText)) {
        throw new Error(`Refusing to modify malformed frontmatter in ${filePath}`);
      }
      // A new frontmatter block follows the note's own line endings.
      const lineEnding = markdownText.includes('\r\n') ? '\r\n' : '\n';
      return { frontmatter: {}, content: markdownText, hasFrontmatter: false, style: { byteOrderMark: '', lineEnding } };
    }
    let parsed: unknown;
    try {
      parsed = yaml.load(split.yaml);
    } catch (error) {
      throw new Error(`Refusing to modify malformed frontmatter in ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (parsed !== undefined && (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))) {
      throw new Error(`Refusing to modify non-object frontmatter in ${filePath}`);
    }
    return {
      frontmatter: (parsed ?? {}) as Record<string, unknown>,
      content: split.body,
      hasFrontmatter: true,
      style: { byteOrderMark: split.byteOrderMark, lineEnding: split.lineEnding },
    };
  }
  
  /**
   * Combine frontmatter and content back into markdown text
   */
  static combineToText(
    frontmatter: Record<string, unknown>,
    content: string,
    style: FrontmatterStyle = { byteOrderMark: '', lineEnding: '\n' }
  ): string {
    if (Object.keys(frontmatter).length === 0) {
      return style.byteOrderMark + content;
    }
    
    const frontmatterYaml = yaml.dump(frontmatter, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
      sortKeys: true
    }).trim();
    
    const newline = style.lineEnding;
    return `${style.byteOrderMark}---${newline}${frontmatterYaml.replace(/\n/g, newline)}${newline}---${newline}${content}`;
  }
  
  /**
   * Update the meadow-sensitive property in a markdown file
   */
  static updateSensitiveProperty(filePath: string, isSensitive: boolean): void {
    const parseResult = this.parseFromFileForUpdate(filePath);
    
    // Update the frontmatter
    const updatedFrontmatter = { ...parseResult.frontmatter };
    
    if (isSensitive) {
      updatedFrontmatter['meadow-sensitive'] = true;
    } else {
      // Remove the property entirely if setting to false
      delete updatedFrontmatter['meadow-sensitive'];
    }
    
    // Combine back to markdown text
    const updatedMarkdown = this.combineToText(updatedFrontmatter, parseResult.content, parseResult.style);
    
    // Write back to file
    writeDurableDocument({
      path: filePath,
      value: updatedMarkdown,
      codec: textDocumentCodec,
      mode: fs.statSync(filePath).mode & 0o777,
    });
  }
  
  /**
   * Get the current meadow-sensitive value from a file
   */
  static getSensitiveProperty(filePath: string): boolean {
    try {
      const parseResult = this.parseFromFile(filePath);
      return parseResult.frontmatter['meadow-sensitive'] === true;
    } catch (error) {
      logger.warn(`Failed to read sensitive property from ${filePath}:`, error);
      return false;
    }
  }
  
  /**
   * Update any frontmatter property in a markdown file
   */
  static updateProperty(filePath: string, key: string, value: unknown): void {
    const parseResult = this.parseFromFileForUpdate(filePath);
    
    // Update the frontmatter
    const updatedFrontmatter = { ...parseResult.frontmatter };
    
    if (value === null || value === undefined) {
      delete updatedFrontmatter[key];
    } else {
      updatedFrontmatter[key] = value;
    }
    
    // Combine back to markdown text
    const updatedMarkdown = this.combineToText(updatedFrontmatter, parseResult.content, parseResult.style);
    
    // Write back to file
    writeDurableDocument({
      path: filePath,
      value: updatedMarkdown,
      codec: textDocumentCodec,
      mode: fs.statSync(filePath).mode & 0o777,
    });
  }
}
