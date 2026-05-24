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

interface FrontmatterParseResult {
  frontmatter: Record<string, unknown>;
  content: string;
  hasFrontmatter: boolean;
}

export class FrontmatterUtils {
  private static readonly FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---\n/;
  
  /**
   * Parse frontmatter from markdown text
   */
  static parseFromText(markdownText: string): FrontmatterParseResult {
    const match = markdownText.match(this.FRONTMATTER_PATTERN);
    
    if (!match) {
      return {
        frontmatter: {},
        content: markdownText,
        hasFrontmatter: false
      };
    }
    
    const frontmatterText = match[1];
    const contentWithoutFrontmatter = markdownText.slice(match[0].length);
    
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
  
  /**
   * Combine frontmatter and content back into markdown text
   */
  static combineToText(frontmatter: Record<string, unknown>, content: string): string {
    if (Object.keys(frontmatter).length === 0) {
      return content;
    }
    
    const frontmatterYaml = yaml.dump(frontmatter, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
      sortKeys: true
    }).trim();
    
    return `---\n${frontmatterYaml}\n---\n${content}`;
  }
  
  /**
   * Update the meadow-sensitive property in a markdown file
   */
  static updateSensitiveProperty(filePath: string, isSensitive: boolean): void {
    const parseResult = this.parseFromFile(filePath);
    
    // Update the frontmatter
    const updatedFrontmatter = { ...parseResult.frontmatter };
    
    if (isSensitive) {
      updatedFrontmatter['meadow-sensitive'] = true;
    } else {
      // Remove the property entirely if setting to false
      delete updatedFrontmatter['meadow-sensitive'];
    }
    
    // Combine back to markdown text
    const updatedMarkdown = this.combineToText(updatedFrontmatter, parseResult.content);
    
    // Write back to file
    fs.writeFileSync(filePath, updatedMarkdown, 'utf-8');
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
    const parseResult = this.parseFromFile(filePath);
    
    // Update the frontmatter
    const updatedFrontmatter = { ...parseResult.frontmatter };
    
    if (value === null || value === undefined) {
      delete updatedFrontmatter[key];
    } else {
      updatedFrontmatter[key] = value;
    }
    
    // Combine back to markdown text
    const updatedMarkdown = this.combineToText(updatedFrontmatter, parseResult.content);
    
    // Write back to file
    fs.writeFileSync(filePath, updatedMarkdown, 'utf-8');
  }
} 