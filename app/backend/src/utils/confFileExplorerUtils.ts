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
import { runGitStatusNative, runGitCatFileNative } from './configDirectory/gitUtils/gitStatusUtils.js';
import { SiteConfigPaths } from '../../../shared_code/paths/siteConfigPaths.js';
import { logger } from './logging/backendLoggingUtils.js';

// Image file extensions we can display thumbnails for
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp']);

// Binary file extensions (non-image)
const BINARY_EXTENSIONS = new Set([
  '.woff', '.woff2', '.ttf', '.otf', '.eot',  // fonts
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',   // documents
  '.zip', '.tar', '.gz', '.rar', '.7z',       // archives
  '.mp3', '.wav', '.ogg', '.m4a',             // audio
  '.mp4', '.avi', '.mov', '.mkv', '.webm',    // video
  '.exe', '.dll', '.so', '.dylib',            // executables
  '.bin', '.dat',                              // generic binary
]);

/**
 * Detect file type based on extension and content analysis.
 */
export function detectFileType(filePath: string): 'text' | 'image' | 'binary' {
  const ext = path.extname(filePath).toLowerCase();
  
  if (IMAGE_EXTENSIONS.has(ext)) {
    return 'image';
  }
  
  if (BINARY_EXTENSIONS.has(ext)) {
    return 'binary';
  }
  
  // For unknown extensions, check if the file contains null bytes (binary indicator)
  try {
    if (fs.existsSync(filePath)) {
      const buffer = fs.readFileSync(filePath);
      // Check first 8KB for null bytes
      const checkLength = Math.min(buffer.length, 8192);
      for (let i = 0; i < checkLength; i++) {
        if (buffer[i] === 0) {
          // Check if it's an image by magic bytes
          if (isImageByMagicBytes(buffer)) {
            return 'image';
          }
          return 'binary';
        }
      }
    }
  } catch {
    // If we can't read the file, assume it's text
  }
  
  return 'text';
}

/**
 * Check if a buffer starts with known image magic bytes.
 */
function isImageByMagicBytes(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return true;
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return true;
  }
  // GIF: 47 49 46 38
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return true;
  }
  // WEBP: 52 49 46 46 ... 57 45 42 50
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 && buffer.length >= 12) {
    if (buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
      return true;
    }
  }
  // BMP: 42 4D
  if (buffer[0] === 0x42 && buffer[1] === 0x4D) {
    return true;
  }
  
  return false;
}

/**
 * Get the MIME type for a file based on extension.
 */
export function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.bmp': 'image/bmp',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Read file content, handling binary files appropriately.
 * Returns content info including whether it's binary/image and base64 data for images.
 */
export function readFileContent(filePath: string): {
  content: string;
  fileType: 'text' | 'image' | 'binary';
  mimeType?: string;
} {
  const fileType = detectFileType(filePath);
  
  if (fileType === 'binary') {
    return {
      content: '',
      fileType: 'binary',
    };
  }
  
  if (fileType === 'image') {
    const buffer = fs.readFileSync(filePath);
    const base64 = buffer.toString('base64');
    const mimeType = getMimeType(filePath);
    return {
      content: `data:${mimeType};base64,${base64}`,
      fileType: 'image',
      mimeType,
    };
  }
  
  // Text file
  const content = fs.readFileSync(filePath, 'utf-8');
  return {
    content,
    fileType: 'text',
  };
}

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  gitStatus?: string; // 'new' | 'modified' | 'deleted' | 'has-changes'
}

export interface FileTreeResponse {
  tree: FileNode[];
  root: string;
}

/**
 * Find the git root directory by walking up from a starting path.
 */
export function findGitRoot(startPath: string): string | null {
  let currentPath = startPath;
  while (currentPath !== path.dirname(currentPath)) {
    const gitDir = path.join(currentPath, '.git');
    if (fs.existsSync(gitDir)) {
      return currentPath;
    }
    currentPath = path.dirname(currentPath);
  }
  return null;
}

/**
 * Get git status for all files in a directory using the fast_git_ops native binary.
 */
export async function getGitStatusMap(dir: string): Promise<Map<string, string>> {
  if (!fs.existsSync(dir) || !findGitRoot(dir)) {
    return new Map<string, string>();
  }
  try {
    return await runGitStatusNative(dir);
  } catch (error) {
    logger.error('Error getting git status via fast_git_ops:', error);
    return new Map<string, string>();
  }
}

/**
 * Recursively build file tree for a directory.
 */
export function buildFileTree(dir: string, gitStatusMap: Map<string, string>): FileNode[] {
  const nodes: FileNode[] = [];
  
  if (!fs.existsSync(dir)) {
    return nodes;
  }

  try {
    const entries = fs.readdirSync(dir);
    
    for (const entry of entries) {
      // Skip hidden files/folders (except .git is already excluded)
      if (entry.startsWith('.')) continue;
      
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        const children = buildFileTree(fullPath, gitStatusMap);
        // Check if any children have git status (to bubble up status to folders)
        const hasChanges = children.some(c => 
          c.gitStatus || (c.children && c.children.some(cc => cc.gitStatus))
        );
        nodes.push({
          name: entry,
          path: fullPath,
          type: 'directory',
          children,
          gitStatus: hasChanges ? 'has-changes' : undefined,
        });
      } else {
        nodes.push({
          name: entry,
          path: fullPath,
          type: 'file',
          gitStatus: gitStatusMap.get(fullPath),
        });
      }
    }
  } catch (error) {
    logger.error('Error reading directory:', error);
  }

  // Sort: directories first, then alphabetically
  nodes.sort((a, b) => {
    if (a.type === 'directory' && b.type === 'file') return -1;
    if (a.type === 'file' && b.type === 'directory') return 1;
    return a.name.localeCompare(b.name);
  });

  return nodes;
}

/**
 * Build a minimal file tree from ONLY the changed files.
 * This is much faster than traversing the entire directory when we only need changed files.
 */
export function buildChangedFilesTree(rootDir: string, gitStatusMap: Map<string, string>): FileNode[] {
  // Filter to only files within the rootDir
  const changedFilesInDir: Array<{ fullPath: string; status: string }> = [];
  
  for (const [fullPath, status] of gitStatusMap.entries()) {
    if (fullPath.startsWith(rootDir + path.sep)) {
      changedFilesInDir.push({ fullPath, status });
    }
  }
  
  if (changedFilesInDir.length === 0) {
    return [];
  }
  
  // Build a tree structure from the changed files
  // We need to create directory nodes for parent directories
  const nodeMap = new Map<string, FileNode>();
  
  for (const { fullPath, status } of changedFilesInDir) {
    // Create the file node
    const fileName = path.basename(fullPath);
    const fileNode: FileNode = {
      name: fileName,
      path: fullPath,
      type: 'file',
      gitStatus: status,
    };
    nodeMap.set(fullPath, fileNode);
    
    // Create parent directory nodes up to rootDir
    let currentDir = path.dirname(fullPath);
    while (currentDir.length >= rootDir.length && currentDir !== rootDir) {
      if (!nodeMap.has(currentDir)) {
        const dirName = path.basename(currentDir);
        const dirNode: FileNode = {
          name: dirName,
          path: currentDir,
          type: 'directory',
          children: [],
          gitStatus: 'has-changes',
        };
        nodeMap.set(currentDir, dirNode);
      }
      currentDir = path.dirname(currentDir);
    }
  }
  
  // Now link children to parents
  for (const [nodePath, node] of nodeMap.entries()) {
    const parentPath = path.dirname(nodePath);
    if (parentPath !== rootDir && nodeMap.has(parentPath)) {
      const parentNode = nodeMap.get(parentPath)!;
      if (!parentNode.children) {
        parentNode.children = [];
      }
      parentNode.children.push(node);
    }
  }
  
  // Collect root-level nodes (direct children of rootDir)
  const rootNodes: FileNode[] = [];
  for (const [nodePath, node] of nodeMap.entries()) {
    if (path.dirname(nodePath) === rootDir) {
      rootNodes.push(node);
    }
  }
  
  // Sort all children recursively
  const sortNodes = (nodes: FileNode[]): void => {
    nodes.sort((a, b) => {
      if (a.type === 'directory' && b.type === 'file') return -1;
      if (a.type === 'file' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.children) {
        sortNodes(node.children);
      }
    }
  };
  
  sortNodes(rootNodes);
  return rootNodes;
}

/**
 * Get the original (committed) content of a file using the fast_git_ops native binary.
 */
export async function getOriginalContent(filePath: string): Promise<{
  content: string | null;
  isNew: boolean;
  fileType: 'text' | 'image' | 'binary';
  mimeType?: string;
}> {
  const fileType = detectFileType(filePath);
  const gitRoot = findGitRoot(filePath);

  if (!gitRoot) {
    return { content: null, isNew: true, fileType };
  }

  const relativePath = path.relative(gitRoot, filePath);

  try {
    const result = await runGitCatFileNative(gitRoot, 'HEAD', relativePath);

    if (!result.found || !result.data_base64) {
      return { content: null, isNew: true, fileType };
    }

    const buffer = Buffer.from(result.data_base64, 'base64');

    if (fileType === 'binary') {
      return { content: null, isNew: false, fileType: 'binary' };
    }

    if (fileType === 'image') {
      const base64 = buffer.toString('base64');
      const mimeType = getMimeType(filePath);
      return {
        content: `data:${mimeType};base64,${base64}`,
        isNew: false,
        fileType: 'image',
        mimeType,
      };
    }

    const content = buffer.toString('utf-8');
    return { content, isNew: false, fileType: 'text' };
  } catch {
    return { content: null, isNew: true, fileType };
  }
}

/**
 * Get the file tree for a site's conf directory.
 * @param changedOnly - If true, only return files with git changes (much faster for large directories)
 */
export async function getConfFileTree(siteDirectory: string, changedOnly = false): Promise<FileTreeResponse> {
  const confDir = path.join(siteDirectory, 'conf');
  const gitStatusMap = await getGitStatusMap(confDir);
  
  // Use optimized path when only showing changed files
  const tree = changedOnly 
    ? buildChangedFilesTree(confDir, gitStatusMap)
    : buildFileTree(confDir, gitStatusMap);
  
  return {
    root: confDir,
    tree,
  };
}

/**
 * Get the file tree for a site's preview directory.
 * @param changedOnly - If true, only return files with git changes (much faster for large directories)
 */
export async function getPreviewFileTree(siteDirectory: string, changedOnly = false): Promise<FileTreeResponse> {
  const previewDir = SiteConfigPaths.getPreviewDir(siteDirectory);
  const gitStatusMap = await getGitStatusMap(previewDir);

  // Use optimized path when only showing changed files
  const tree = changedOnly
    ? buildChangedFilesTree(previewDir, gitStatusMap)
    : buildFileTree(previewDir, gitStatusMap);

  return {
    root: previewDir,
    tree,
  };
}

