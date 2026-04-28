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

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import DiffView from './DiffView';
import { ToolbarIconButton } from '../ToolbarIconButton';

type ViewTab = 'diff' | 'whole';
type ExplorerMode = 'normal' | 'dirLog' | 'commitViewer' | 'fileLog';

// Minimum width for the file tree panel
const MIN_FILE_TREE_WIDTH = 100;
const DEFAULT_FILE_TREE_WIDTH = 288; // w-72 equivalent
const MAX_FILE_TREE_WIDTH = 600;

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  gitStatus?: string;
}

export interface FileTreeResponse {
  tree: FileNode[];
  root: string;
}

export interface FileContentResponse {
  content: string;
  path: string;
  fileType?: 'text' | 'image' | 'binary';
  mimeType?: string;
}

export interface OriginalContentResponse {
  content: string | null;
  path: string;
  isNew?: boolean;
  fileType?: 'text' | 'image' | 'binary';
  mimeType?: string;
}

export interface DirLogCommit {
  sha: string;
  parent_sha: string | null;
  subject: string;
  author_name: string;
  author_time: number; // seconds since unix epoch
  files_changed_count: number;
}

export interface DirLogResponse {
  commits: DirLogCommit[];
}

export interface CommitViewerFileEntry {
  repoPath: string;
  path: string; // absolute path
  status: 'A' | 'M' | 'D';
  relFromContext: string;
  outsideContextDir: boolean;
}

export interface CommitFilesResponse {
  sha: string;
  parent_sha: string | null;
  files: CommitViewerFileEntry[];
}

export interface FileLogCommitEntry {
  sha: string;
  parent_sha: string | null;
  subject: string;
  author_name: string;
  author_time: number; // seconds since unix epoch
}

export interface FileLogResponse {
  commits: FileLogCommitEntry[];
}

export interface FetchTreeOptions {
  changedOnly?: boolean;
}

// API adapter interface - allows the component to work with different backends
export interface ConfigFileExplorerApi {
  fetchTree: (options?: FetchTreeOptions) => Promise<FileTreeResponse>;
  fetchContent: (path: string) => Promise<FileContentResponse>;
  fetchOriginal: (path: string) => Promise<OriginalContentResponse>;
  saveContent?: (path: string, content: string) => Promise<void>;
  // Optional git-history methods
  fetchDirLog?: (dirPath: string, limit?: number) => Promise<DirLogResponse>;
  fetchCommitFiles?: (sha: string, contextDir: string) => Promise<CommitFilesResponse>;
  fetchCommitFileContent?: (sha: string, path: string, contextDir?: string) => Promise<FileContentResponse>;
  fetchCommitFileOriginal?: (sha: string, path: string, parentSha?: string | null, contextDir?: string) => Promise<OriginalContentResponse>;
  fetchFileLog?: (path: string, limit?: number) => Promise<FileLogResponse>;
}

export interface ConfigFileExplorerProps {
  api: ConfigFileExplorerApi;
  title?: string;
  showPath?: boolean;
  showHeader?: boolean;
  /** When true, shows a compact header with icon-only buttons and no title */
  compactHeader?: boolean;
  /** Custom content to render on the left side of the header (only used when compactHeader is true) */
  headerLeftContent?: React.ReactNode;
  showLegend?: boolean;
  initialShowChangedOnly?: boolean;
  autoSelectFirstChangedFile?: boolean;
  autoExpandFolders?: boolean;
  height?: string;
  readOnly?: boolean;
  onFileSelect?: (path: string) => void;
  /** Optional callback to preview HTML files - if provided, shows an eye icon for .html files */
  onPreviewFile?: (path: string) => void;
  /** Optional initial file to select on mount (overrides autoSelectFirstChangedFile) */
  initialSelectedFile?: string;
}

interface TreeNodeProps {
  node: FileNode;
  depth: number;
  selectedPath: string | null;
  expandedPaths: Set<string>;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
  onPreviewFile?: (path: string) => void;
  scrollToSelected?: boolean;
}

// Simple symbolic eye icon
const PreviewIcon: React.FC = () => (
  <svg 
    width="14" 
    height="14" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
  >
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const GitStatusIcon: React.FC<{ status?: string }> = ({ status }) => {
  if (!status) return null;

  switch (status) {
    case 'new':
    case 'staged-new':
      return (
        <span className="ml-1.5 text-success-500 text-xs font-bold" title="New file">
          A
        </span>
      );
    case 'modified':
    case 'staged-modified':
      return (
        <span className="ml-1.5 text-warning-500 text-xs font-bold" title="Modified">
          M
        </span>
      );
    case 'deleted':
      return (
        <span className="ml-1.5 text-danger-500 text-xs font-bold" title="Deleted">
          D
        </span>
      );
    case 'has-changes':
      return (
        <span className="ml-1.5 text-info-400 text-base" title="Contains changes">
          •
        </span>
      );
    default:
      return null;
  }
};

const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  depth,
  selectedPath,
  expandedPaths,
  onSelect,
  onToggle,
  onPreviewFile,
  scrollToSelected,
}) => {
  const nodeRef = React.useRef<HTMLDivElement>(null);
  const isExpanded = expandedPaths.has(node.path);
  const isSelected = selectedPath === node.path;
  const isDirectory = node.type === 'directory';
  const isHtmlFile = !isDirectory && node.name.toLowerCase().endsWith('.html');

  // Scroll into view when selected and scrollToSelected is true
  React.useEffect(() => {
    if (isSelected && scrollToSelected && nodeRef.current) {
      nodeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isSelected, scrollToSelected]);

  const handleClick = () => {
    if (isDirectory) {
      onToggle(node.path);
    } else {
      onSelect(node.path);
    }
  };

  const handlePreviewClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onPreviewFile) {
      onPreviewFile(node.path);
    }
  };

  return (
    <div>
      <div
        ref={nodeRef}
        className={`flex items-center py-1 px-2 cursor-pointer rounded transition-colors ${
          isSelected
            ? 'bg-brand-100 text-brand-900'
            : 'hover:bg-neutral-100 text-neutral-700'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
      >
        {isDirectory ? (
          <span className="mr-1.5 text-neutral-400 w-4 text-center">
            {isExpanded ? '▼' : '▶'}
          </span>
        ) : (
          <span className="mr-1.5 w-4" />
        )}
        <span className={`mr-1.5 ${isDirectory ? 'text-brand-500' : 'text-neutral-400'}`}>
          {isDirectory ? '📁' : '📄'}
        </span>
        <span className="text-sm truncate flex-1">{node.name}</span>
        {/* Preview button for HTML files */}
        {isHtmlFile && onPreviewFile && (
          <button
            onClick={handlePreviewClick}
            className="mr-2 text-neutral-400 hover:text-brand-500 transition-colors"
            title="Preview in browser"
          >
            <PreviewIcon />
          </button>
        )}
        <GitStatusIcon status={node.gitStatus} />
      </div>
      {isDirectory && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              expandedPaths={expandedPaths}
              onSelect={onSelect}
              onToggle={onToggle}
              onPreviewFile={onPreviewFile}
              scrollToSelected={scrollToSelected}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Filter tree to only show nodes with git changes
const filterChangedNodes = (nodes: FileNode[]): FileNode[] => {
  return nodes
    .map((node) => {
      if (node.type === 'directory') {
        const filteredChildren = node.children ? filterChangedNodes(node.children) : [];
        // Include directory if it has changed children
        if (filteredChildren.length > 0) {
          return { ...node, children: filteredChildren };
        }
        return null;
      } else {
        // Include file if it has a git status (new, modified, deleted, etc.)
        if (node.gitStatus && node.gitStatus !== 'has-changes') {
          return node;
        }
        return null;
      }
    })
    .filter((node): node is FileNode => node !== null);
};

// Collect all directory paths from a tree
const collectDirectoryPaths = (nodes: FileNode[]): string[] => {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.type === 'directory') {
      paths.push(node.path);
      if (node.children) {
        paths.push(...collectDirectoryPaths(node.children));
      }
    }
  }
  return paths;
};

// Find the first changed file in the tree
const findFirstChangedFile = (nodes: FileNode[]): string | null => {
  for (const node of nodes) {
    if (node.type === 'file' && node.gitStatus && node.gitStatus !== 'has-changes') {
      return node.path;
    }
    if (node.type === 'directory' && node.children) {
      const found = findFirstChangedFile(node.children);
      if (found) return found;
    }
  }
  return null;
};

const ConfigFileExplorer: React.FC<ConfigFileExplorerProps> = ({
  api,
  title = 'Config File Explorer',
  showPath = true,
  showHeader = true,
  compactHeader = false,
  headerLeftContent,
  showLegend = true,
  initialShowChangedOnly = false,
  autoSelectFirstChangedFile = false,
  autoExpandFolders = false,
  height = 'calc(100vh-57px)',
  readOnly = false,
  onFileSelect,
  onPreviewFile,
  initialSelectedFile,
}) => {
  console.log('[ConfigFileExplorer] Component mounting/rendering', {
    title,
    initialShowChangedOnly,
    autoSelectFirstChangedFile,
    initialSelectedFile,
  });

  const [tree, setTree] = useState<FileNode[]>([]);
  const [rootPath, setRootPath] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ExplorerMode>('normal');

  // Directory log (change log) state
  const [dirLogLoading, setDirLogLoading] = useState(false);
  const [dirLogCommits, setDirLogCommits] = useState<DirLogCommit[]>([]);

  // Commit viewer state
  const [commitSha, setCommitSha] = useState<string | null>(null);
  const [commitParentSha, setCommitParentSha] = useState<string | null>(null);
  const [commitTree, setCommitTree] = useState<FileNode[]>([]);

  // File log state
  const [fileLogLoading, setFileLogLoading] = useState(false);
  const [fileLogCommits, setFileLogCommits] = useState<FileLogCommitEntry[]>([]);
  const [fileLogDiffs, setFileLogDiffs] = useState<Record<string, { current: FileContentResponse; original: OriginalContentResponse }>>({});
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [fileContent, setFileContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [committedContent, setCommittedContent] = useState<string | null>(null);
  const [isNewFile, setIsNewFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [showChangedOnly, setShowChangedOnly] = useState(initialShowChangedOnly);
  const [activeTab, setActiveTab] = useState<ViewTab>('whole');
  const [selectedFileGitStatus, setSelectedFileGitStatus] = useState<string | undefined>(undefined);
  const [hasAutoSelected, setHasAutoSelected] = useState(false);
  const [fileType, setFileType] = useState<'text' | 'image' | 'binary'>('text');
  const [originalFileType, setOriginalFileType] = useState<'text' | 'image' | 'binary'>('text');
  const [selectedFileLoading, setSelectedFileLoading] = useState(false);
  const fileLoadRequestIdRef = useRef(0);
  
  // Resizable panel state
  const [fileTreeWidth, setFileTreeWidth] = useState(DEFAULT_FILE_TREE_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchTree = useCallback(async (changedOnly = false) => {
    console.log('[ConfigFileExplorer] fetchTree called', { changedOnly });
    try {
      setLoading(true);
      console.log('[ConfigFileExplorer] Calling api.fetchTree...');
      const data = await api.fetchTree({ changedOnly });
      console.log('[ConfigFileExplorer] fetchTree response received', { 
        treeLength: data.tree?.length,
        root: data.root 
      });
      setTree(data.tree);
      setRootPath(data.root);
      setError(null);
      return data.tree;
    } catch (err) {
      console.error('[ConfigFileExplorer] fetchTree error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      return [];
    } finally {
      setLoading(false);
      console.log('[ConfigFileExplorer] fetchTree complete, loading set to false');
    }
  }, [api]);

  // Handle resize mouse events
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    // Prevent text selection and set cursor during resize
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;
      
      // Clamp the width within bounds
      const clampedWidth = Math.max(MIN_FILE_TREE_WIDTH, Math.min(MAX_FILE_TREE_WIDTH, newWidth));
      setFileTreeWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  const handleToggle = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // Helper to find a file's git status from the tree
  const findFileGitStatus = useCallback((nodes: FileNode[], targetPath: string): string | undefined => {
    for (const node of nodes) {
      if (node.path === targetPath) {
        return node.gitStatus;
      }
      if (node.children) {
        const found = findFileGitStatus(node.children, targetPath);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  }, []);

  // Helper to apply state for a deleted file (only has original/previous content, no current)
  const applyDeletedFileState = useCallback((originalData: OriginalContentResponse) => {
    const origFileType = originalData.fileType || 'text';
    setFileType(origFileType);
    setOriginalFileType(origFileType);
    setFileContent('');
    setOriginalContent('');
    setCommittedContent(originalData.content);
    setIsNewFile(false);
    setActiveTab(origFileType === 'text' ? 'diff' : 'whole');
  }, []);

  const resetSelectedFileState = useCallback(() => {
    setFileType('text');
    setOriginalFileType('text');
    setFileContent('');
    setOriginalContent('');
    setCommittedContent(null);
    setIsNewFile(false);
    setActiveTab('whole');
  }, []);

  // Select a file and load its content - takes tree as parameter to avoid stale closure
  const selectFile = useCallback(async (path: string, currentTree: FileNode[]) => {
    const requestId = ++fileLoadRequestIdRef.current;
    setSelectedPath(path);
    setSaveStatus('idle');
    setSelectedFileLoading(true);
    resetSelectedFileState();
    onFileSelect?.(path);

    // Find git status for this file
    const gitStatus = findFileGitStatus(currentTree, path);
    setSelectedFileGitStatus(gitStatus);

    try {
      // For deleted files, only fetch the original content (current doesn't exist)
      if (gitStatus === 'deleted') {
        const originalData = await api.fetchOriginal(path);
        if (requestId !== fileLoadRequestIdRef.current) return;
        applyDeletedFileState(originalData);
        return;
      }

      // Fetch current content and committed content in parallel
      const [contentData, originalData] = await Promise.all([
        api.fetchContent(path),
        api.fetchOriginal(path),
      ]);

      if (requestId !== fileLoadRequestIdRef.current) return;

      // Set file types
      const currentFileType = contentData.fileType || 'text';
      const origFileType = originalData.fileType || 'text';
      setFileType(currentFileType);
      setOriginalFileType(origFileType);

      setFileContent(contentData.content);
      setOriginalContent(contentData.content);

      // Handle committed content
      setCommittedContent(originalData.content);
      setIsNewFile(originalData.isNew === true);

      // Default to diff tab if file has git changes (for non-binary files), otherwise whole file
      const hasGitChanges = gitStatus && ['modified', 'staged-modified', 'new', 'staged-new'].includes(gitStatus);
      const isBinaryOrImage = currentFileType === 'binary' || currentFileType === 'image';
      setActiveTab(hasGitChanges && !isBinaryOrImage ? 'diff' : 'whole');
    } catch (err) {
      if (requestId !== fileLoadRequestIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      if (requestId === fileLoadRequestIdRef.current) {
        setSelectedFileLoading(false);
      }
    }
  }, [api, onFileSelect, findFileGitStatus, applyDeletedFileState, resetSelectedFileState]);

  const selectCommitFile = useCallback(async (path: string, currentTree: FileNode[]) => {
    if (!commitSha || !api.fetchCommitFileContent || !api.fetchCommitFileOriginal) return;

    const requestId = ++fileLoadRequestIdRef.current;
    setSelectedPath(path);
    setSaveStatus('idle');
    setSelectedFileLoading(true);
    resetSelectedFileState();
    onFileSelect?.(path);

    const gitStatus = findFileGitStatus(currentTree, path);
    setSelectedFileGitStatus(gitStatus);

    try {
      // For deleted files, only fetch the original content (file doesn't exist in this commit)
      if (gitStatus === 'deleted') {
        const originalData = await api.fetchCommitFileOriginal(commitSha, path, commitParentSha, rootPath);
        if (requestId !== fileLoadRequestIdRef.current) return;
        applyDeletedFileState(originalData);
        return;
      }

      const [contentData, originalData] = await Promise.all([
        api.fetchCommitFileContent(commitSha, path, rootPath),
        api.fetchCommitFileOriginal(commitSha, path, commitParentSha, rootPath),
      ]);

      if (requestId !== fileLoadRequestIdRef.current) return;

      const currentFileType = contentData.fileType || 'text';
      const origFileType = originalData.fileType || 'text';
      setFileType(currentFileType);
      setOriginalFileType(origFileType);

      setFileContent(contentData.content);
      setOriginalContent(contentData.content);

      setCommittedContent(originalData.content);
      setIsNewFile(originalData.isNew === true);

      const hasGitChanges = gitStatus && ['modified', 'new', 'deleted'].includes(gitStatus);
      const isBinaryOrImage = currentFileType === 'binary' || currentFileType === 'image';
      setActiveTab(hasGitChanges && !isBinaryOrImage ? 'diff' : 'whole');
    } catch (err) {
      if (requestId !== fileLoadRequestIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      if (requestId === fileLoadRequestIdRef.current) {
        setSelectedFileLoading(false);
      }
    }
  }, [api, commitSha, commitParentSha, rootPath, onFileSelect, findFileGitStatus, applyDeletedFileState, resetSelectedFileState]);

  const supportsDirLog = !!api.fetchDirLog && !!api.fetchCommitFiles;
  const supportsCommitContent = !!api.fetchCommitFileContent && !!api.fetchCommitFileOriginal;
  const supportsFileLog = !!api.fetchFileLog && supportsCommitContent;
  const effectiveReadOnly = readOnly || mode !== 'normal';
  const canSave = !effectiveReadOnly && api.saveContent;

  const backToFiles = useCallback(() => {
    fileLoadRequestIdRef.current += 1;
    setMode('normal');
    setCommitSha(null);
    setCommitParentSha(null);
    setCommitTree([]);
    setDirLogCommits([]);
    setFileLogCommits([]);
    setFileLogDiffs({});
    setSelectedFileLoading(false);
    setError(null);
  }, []);

  const backToDirLog = useCallback(() => {
    fileLoadRequestIdRef.current += 1;
    setMode('dirLog');
    setCommitSha(null);
    setCommitParentSha(null);
    setCommitTree([]);
    setSelectedPath(null);
    setSelectedFileGitStatus(undefined);
    setSelectedFileLoading(false);
    setFileContent('');
    setOriginalContent('');
    setCommittedContent(null);
    setIsNewFile(false);
  }, []);

  // Wrapper that uses current tree state - for use by click handlers
  const handleSelect = useCallback(async (path: string) => {
    if (mode === 'fileLog') {
      // Selecting another file exits file-log mode back to normal browsing.
      backToFiles();
      await selectFile(path, tree);
      return;
    }
    if (mode === 'commitViewer') {
      await selectCommitFile(path, commitTree);
      return;
    }
    await selectFile(path, tree);
  }, [mode, selectFile, tree, selectCommitFile, commitTree, backToFiles]);

  useEffect(() => {
    if (mode !== 'normal') return;
    // Pass showChangedOnly to optimize backend fetch when in "changed only" mode
    fetchTree(showChangedOnly).then((loadedTree) => {
      // Auto-expand folders if requested
      if (autoExpandFolders && loadedTree.length > 0) {
        const allPaths = collectDirectoryPaths(loadedTree);
        setExpandedPaths(new Set(allPaths));
      }
      
      // If initialSelectedFile is provided, use it (highest priority)
      if (initialSelectedFile && !hasAutoSelected) {
        setHasAutoSelected(true);
        selectFile(initialSelectedFile, loadedTree);
        return;
      }
      
      // Auto-select first changed file if requested and not already selected
      if (autoSelectFirstChangedFile && !hasAutoSelected && loadedTree.length > 0) {
        const firstChanged = findFirstChangedFile(loadedTree);
        if (firstChanged) {
          setHasAutoSelected(true);
          // Use selectFile directly with the just-loaded tree to avoid stale state
          selectFile(firstChanged, loadedTree);
        }
      }
    });
  }, [fetchTree, autoExpandFolders, autoSelectFirstChangedFile, hasAutoSelected, selectFile, initialSelectedFile, showChangedOnly, mode]);

  const handleSave = async () => {
    if (!selectedPath || !api.saveContent) return;

    setSaving(true);
    setSaveStatus('idle');

    try {
      await api.saveContent(selectedPath, fileContent);
      setOriginalContent(fileContent);
      setSaveStatus('success');
      // Refresh tree to update git status
      fetchTree(showChangedOnly);
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      setSaveStatus('error');
      console.error('Save error:', err);
    } finally {
      setSaving(false);
    }
  };

  const openDirLog = useCallback(async () => {
    if (!api.fetchDirLog) return;
    setMode('dirLog');
    setDirLogLoading(true);
    setError(null);
    try {
      const result = await api.fetchDirLog(rootPath, 50);
      setDirLogCommits(result.commits || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setDirLogLoading(false);
    }
  }, [api, rootPath]);

  const openCommitViewer = useCallback(async (commit: DirLogCommit) => {
    if (!api.fetchCommitFiles) return;
    setMode('commitViewer');
    setCommitSha(commit.sha);
    setCommitParentSha(commit.parent_sha);
    setDirLogLoading(false);
    setSelectedPath(null);
    setFileContent('');
    setOriginalContent('');
    setCommittedContent(null);
    setIsNewFile(false);
    setFileLogCommits([]);
    setFileLogDiffs({});
    setError(null);

    try {
      const result = await api.fetchCommitFiles(commit.sha, rootPath);
      const toGitStatus = (s: CommitViewerFileEntry['status']): string => {
        if (s === 'A') return 'new';
        if (s === 'D') return 'deleted';
        return 'modified';
      };
      const nodes: FileNode[] = (result.files || []).map((f) => ({
        name: f.outsideContextDir ? `${f.relFromContext} (outside folder)` : f.relFromContext,
        path: f.path,
        type: 'file',
        gitStatus: toGitStatus(f.status),
      }));
      setCommitTree(nodes);
      setExpandedPaths(new Set());
      setSelectedFileGitStatus(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [api, rootPath]);

  const openFileLog = useCallback(async () => {
    if (!supportsFileLog || !api.fetchFileLog || !selectedPath) return;
    setMode('fileLog');
    setFileLogLoading(true);
    setError(null);
    setFileLogCommits([]);
    setFileLogDiffs({});
    try {
      const result = await api.fetchFileLog(selectedPath, 50);
      setFileLogCommits(result.commits || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setFileLogLoading(false);
    }
  }, [api, selectedPath, supportsFileLog]);

  useEffect(() => {
    if (mode !== 'fileLog') return;
    if (!selectedPath) return;
    if (!api.fetchCommitFileContent || !api.fetchCommitFileOriginal) return;
    if (fileLogCommits.length === 0) return;

    let cancelled = false;
    (async () => {
      const next: Record<string, { current: FileContentResponse; original: OriginalContentResponse }> = {};
      await Promise.all(
        fileLogCommits.map(async (c) => {
          try {
            const [current, original] = await Promise.all([
              api.fetchCommitFileContent!(c.sha, selectedPath, rootPath),
              api.fetchCommitFileOriginal!(c.sha, selectedPath, c.parent_sha, rootPath),
            ]);
            next[c.sha] = { current, original };
          } catch {
            // Ignore individual failures; UI will show loading/blank for that entry.
          }
        })
      );
      if (!cancelled) setFileLogDiffs(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, selectedPath, api, fileLogCommits, rootPath]);

  const hasChanges = fileContent !== originalContent;
  const selectedFileName = selectedPath?.split('/').pop() || '';

  // Get the filtered tree for "changed only" mode
  const changedTree = useMemo(() => filterChangedNodes(tree), [tree]);

  // Expand all folders in the changed files tree
  const handleExpandFolders = useCallback(() => {
    const folderPaths = collectDirectoryPaths(changedTree);
    setExpandedPaths(new Set(folderPaths));
  }, [changedTree]);

  // Check if all folders are already expanded
  const allFoldersExpanded = useMemo(() => {
    const folderPaths = collectDirectoryPaths(changedTree);
    return folderPaths.length > 0 && folderPaths.every((path) => expandedPaths.has(path));
  }, [changedTree, expandedPaths]);

  // Collapse all folders
  const handleCollapseFolders = useCallback(() => {
    setExpandedPaths(new Set());
  }, []);

  const formatCommitTime = useCallback((epochSeconds: number): { relative: string; absolute: string } => {
    const date = new Date(epochSeconds * 1000);
    const absolute = date.toISOString();
    const diffMs = date.getTime() - Date.now();
    const diffSec = Math.round(diffMs / 1000);
    const absSec = Math.abs(diffSec);
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

    const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
      ['year', 60 * 60 * 24 * 365],
      ['month', 60 * 60 * 24 * 30],
      ['day', 60 * 60 * 24],
      ['hour', 60 * 60],
      ['minute', 60],
      ['second', 1],
    ];
    for (const [unit, secondsPerUnit] of units) {
      if (absSec >= secondsPerUnit || unit === 'second') {
        const value = Math.round(diffSec / secondsPerUnit);
        return { relative: rtf.format(value, unit), absolute };
      }
    }
    return { relative: absolute, absolute };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height }}>
      {/* Header */}
      {showHeader && (
        <div className={`bg-white border-b border-neutral-200 flex items-center justify-between ${compactHeader ? 'px-1 py-1' : 'px-6 py-3'}`}>
          {compactHeader ? (
            headerLeftContent && <div>{headerLeftContent}</div>
          ) : (
            <div>
              <h1 className="text-lg font-semibold text-neutral-900">{title}</h1>
              {showPath && <p className="text-xs text-neutral-500 font-mono">{rootPath}</p>}
              {mode === 'commitViewer' && commitSha && (
                <p className="mt-1 text-xs text-warning-700">
                  Viewing commit <span className="font-mono">{commitSha.slice(0, 10)}</span> (not the latest code)
                </p>
              )}
              {mode === 'fileLog' && selectedPath && (
                <p className="mt-1 text-xs text-warning-700">
                  File history for <span className="font-mono">{selectedPath}</span>
                </p>
              )}
            </div>
          )}
          <div className={`flex items-center ${compactHeader ? 'gap-1 ml-auto' : 'gap-3'}`}>
            {mode !== 'normal' ? (
              <>
                {mode === 'commitViewer' ? (
                  <button
                    onClick={backToDirLog}
                    className={compactHeader
                      ? "p-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded transition-colors"
                      : "px-3 py-1.5 text-sm bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg transition-colors"
                    }
                    title="Back to change log"
                  >
                    {compactHeader ? '←' : '← Change log'}
                  </button>
                ) : (
                  <button
                    onClick={backToFiles}
                    className={compactHeader
                      ? "p-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded transition-colors"
                      : "px-3 py-1.5 text-sm bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg transition-colors"
                    }
                    title="Back to files"
                  >
                    {compactHeader ? '←' : '← Files'}
                  </button>
                )}
                {mode === 'dirLog' && (
                  <button
                    onClick={openDirLog}
                    className={compactHeader
                      ? "p-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded transition-colors"
                      : "px-3 py-1.5 text-sm bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg transition-colors"
                    }
                    title="Refresh"
                  >
                    ↻{compactHeader ? '' : ' Refresh'}
                  </button>
                )}
              </>
            ) : (
              <>
                {supportsDirLog && (
                  compactHeader ? (
                    <ToolbarIconButton
                      onClick={openDirLog}
                      title="Show commit history for this folder"
                    >
                      ☰
                    </ToolbarIconButton>
                  ) : (
                    <button
                      onClick={openDirLog}
                      className="px-3 py-1.5 text-sm bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg transition-colors"
                      title="Show commit history for this folder"
                    >
                      ☰ Change log
                    </button>
                  )
                )}
                {!compactHeader && (
                  <button
                    onClick={() => setShowChangedOnly(!showChangedOnly)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      showChangedOnly
                        ? 'bg-brand-500 text-white'
                        : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
                    }`}
                  >
                    {showChangedOnly ? '✓ Changed Only' : 'Changed Only'}
                  </button>
                )}
                {!compactHeader && showChangedOnly && changedTree.length > 0 && (
                  <button
                    onClick={allFoldersExpanded ? handleCollapseFolders : handleExpandFolders}
                    className="px-3 py-1.5 text-sm bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg transition-colors"
                  >
                    {allFoldersExpanded ? '⊟ Collapse Folders' : '⊞ Expand Folders'}
                  </button>
                )}
                {compactHeader ? (
                  <ToolbarIconButton
                    onClick={() => fetchTree(showChangedOnly)}
                    title="Refresh"
                  >
                    ↻
                  </ToolbarIconButton>
                ) : (
                  <button
                    onClick={() => fetchTree(showChangedOnly)}
                    className="px-3 py-1.5 text-sm bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg transition-colors"
                    title="Refresh"
                  >
                    ↻ Refresh
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mx-6 mt-4 p-3 bg-danger-50 border border-danger-200 rounded-lg text-danger-800 text-sm">
          {error}
        </div>
      )}

      {/* Main content */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden">
        {mode === 'dirLog' ? (
          <div className="flex-1 overflow-auto bg-white">
            <div className="p-4 border-b border-neutral-200">
              <div className="text-sm font-medium text-neutral-800">Change log</div>
              <div className="text-xs text-neutral-500 mt-0.5">Commits that touched files under this folder.</div>
            </div>
            {dirLogLoading ? (
              <div className="flex items-center justify-center py-10">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-500 border-t-transparent" />
              </div>
            ) : dirLogCommits.length === 0 ? (
              <div className="p-6 text-sm text-neutral-500">No commits found for this folder.</div>
            ) : (
              <div className="divide-y divide-neutral-200">
                {dirLogCommits.map((c) => {
                  const t = formatCommitTime(c.author_time);
                  return (
                    <div key={c.sha} className="px-4 py-3 flex items-center gap-3 hover:bg-neutral-50">
                      <button
                        className="px-2 py-1 text-xs bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded"
                        title="View this commit"
                        onClick={() => openCommitViewer(c)}
                      >
                        View
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-neutral-900 truncate">{c.subject || '(no subject)'}</div>
                        <div className="text-xs text-neutral-500 mt-0.5 truncate">
                          <span className="font-mono">{c.sha.slice(0, 10)}</span>
                          <span className="mx-2">•</span>
                          <span>{c.author_name}</span>
                          <span className="mx-2">•</span>
                          <span title={t.absolute}>{t.relative}</span>
                          <span className="mx-2">•</span>
                          <span>{c.files_changed_count} file{c.files_changed_count === 1 ? '' : 's'}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <>
        {/* File tree */}
        <div 
          className="border-r border-neutral-200 bg-neutral-50 overflow-y-auto flex-shrink-0"
          style={{ width: `${fileTreeWidth}px`, minWidth: `${MIN_FILE_TREE_WIDTH}px` }}
        >
          <div className="py-2">
            {(() => {
              const displayTree = mode === 'commitViewer' ? commitTree : (showChangedOnly ? changedTree : tree);
              if (displayTree.length === 0) {
                return (
                  <div className="px-4 py-8 text-center text-neutral-500 text-sm">
                    {mode === 'commitViewer' ? 'No files in commit' : (showChangedOnly ? 'No changed files' : 'No files found')}
                  </div>
                );
              }
              return displayTree.map((node) => (
                <TreeNode
                  key={node.path}
                  node={node}
                  depth={0}
                  selectedPath={selectedPath}
                  expandedPaths={expandedPaths}
                  onSelect={handleSelect}
                  onToggle={handleToggle}
                  onPreviewFile={onPreviewFile}
                  scrollToSelected={!!initialSelectedFile}
                />
              ));
            })()}
          </div>
        </div>

        {/* Resize handle */}
        <div
          className={`w-1 cursor-col-resize flex-shrink-0 transition-colors ${
            isResizing ? 'bg-brand-400' : 'bg-transparent hover:bg-brand-300'
          }`}
          onMouseDown={handleResizeMouseDown}
          title="Drag to resize"
        />

        {/* File content */}
        <div className="flex-1 flex flex-col bg-white min-w-0">
          {mode === 'fileLog' ? (
            selectedPath ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-sm text-neutral-700 truncate">{selectedFileName}</span>
                    <span className="text-xs text-neutral-500">history</span>
                  </div>
                  <button
                    onClick={backToFiles}
                    className="px-3 py-1.5 text-sm bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg transition-colors"
                  >
                    ← Back
                  </button>
                </div>
                <div className="flex-1 overflow-auto p-4 space-y-6">
                  <div className="border border-neutral-200 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
                      <div className="text-sm font-medium text-neutral-800">Uncommitted changes</div>
                      <div className="text-xs text-neutral-500">working tree vs HEAD</div>
                    </div>
                    <div className="h-96">
                      {fileType === 'text' ? (
                        <DiffView
                          originalContent={committedContent}
                          currentContent={fileContent}
                          isNewFile={isNewFile}
                          filePath={selectedPath ?? undefined}
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-sm text-neutral-500">
                          History diffs are only shown for text files.
                        </div>
                      )}
                    </div>
                  </div>

                  {fileLogLoading && (
                    <div className="flex items-center gap-2 text-sm text-neutral-500">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-brand-500 border-t-transparent" />
                      Loading history…
                    </div>
                  )}

                  {fileLogCommits.map((c) => {
                    const t = formatCommitTime(c.author_time);
                    const diff = fileLogDiffs[c.sha];
                    return (
                      <div key={c.sha} className="border border-neutral-200 rounded-lg overflow-hidden">
                        <div className="px-3 py-2 bg-neutral-50 border-b border-neutral-200">
                          <div className="text-sm text-neutral-900">{c.subject || '(no subject)'}</div>
                          <div className="text-xs text-neutral-500 mt-0.5">
                            <span className="font-mono">{c.sha.slice(0, 10)}</span>
                            <span className="mx-2">•</span>
                            <span>{c.author_name}</span>
                            <span className="mx-2">•</span>
                            <span title={t.absolute}>{t.relative}</span>
                          </div>
                        </div>
                        <div className="h-96">
                          {diff ? (
                            diff.current.fileType === 'text' ? (
                              <DiffView
                                originalContent={diff.original.content}
                                currentContent={diff.current.content}
                                isNewFile={diff.original.isNew === true}
                                filePath={selectedPath ?? undefined}
                              />
                            ) : (
                              <div className="flex items-center justify-center h-full text-sm text-neutral-500">
                                History diffs are only shown for text files.
                              </div>
                            )
                          ) : (
                            <div className="flex items-center justify-center h-full text-sm text-neutral-500">
                              Loading diff…
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-neutral-400">
                <div className="text-center">
                  <div className="text-4xl mb-2">📂</div>
                  <p>Select a file to view history</p>
                </div>
              </div>
            )
          ) : selectedPath ? (
            <>
              {/* File header with tabs */}
              <div className="border-b border-neutral-200 bg-neutral-50">
                {/* File name and save controls */}
                <div className="px-4 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-neutral-700">{selectedFileName}</span>
                    {mode === 'normal' && supportsFileLog && (
                      <button
                        onClick={openFileLog}
                        className="px-2 py-0.5 text-xs bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded transition-colors"
                        title="Show history for this file"
                      >
                        Log
                      </button>
                    )}
                    {hasChanges && (
                      <span className="text-xs text-warning-600 font-medium">• Unsaved</span>
                    )}
                  </div>
                  {canSave && (
                    <div className="flex items-center gap-2">
                      {saveStatus === 'success' && (
                        <span className="text-xs text-success-600">✓ Saved</span>
                      )}
                      {saveStatus === 'error' && (
                        <span className="text-xs text-danger-600">Failed to save</span>
                      )}
                      <button
                        onClick={handleSave}
                        disabled={!hasChanges || saving}
                        className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                          hasChanges && !saving
                            ? 'bg-brand-500 hover:bg-brand-600 text-white'
                            : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                        }`}
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Tabs - only show for text files */}
                {fileType === 'text' && (
                  <div className="px-4 flex gap-1">
                    <button
                      onClick={() => setActiveTab('diff')}
                      className={`px-3 py-1.5 text-sm font-medium rounded-t-lg transition-colors ${
                        activeTab === 'diff'
                          ? 'bg-white text-brand-600 border border-b-0 border-neutral-200'
                          : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100'
                      }`}
                    >
                      Diff
                      {selectedFileGitStatus && ['modified', 'staged-modified', 'new', 'staged-new'].includes(selectedFileGitStatus) && (
                        <span className="ml-1.5 text-xs text-warning-500">●</span>
                      )}
                    </button>
                    <button
                      onClick={() => setActiveTab('whole')}
                      className={`px-3 py-1.5 text-sm font-medium rounded-t-lg transition-colors ${
                        activeTab === 'whole'
                          ? 'bg-white text-brand-600 border border-b-0 border-neutral-200'
                          : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100'
                      }`}
                    >
                      Whole File
                    </button>
                  </div>
                )}
              </div>

              {/* Content area */}
              <div className="flex-1 overflow-hidden">
                {selectedFileLoading ? (
                  <div className="flex h-full items-center justify-center text-neutral-500">
                    <div className="flex items-center gap-2 text-sm">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-brand-500 border-t-transparent" />
                      Loading file…
                    </div>
                  </div>
                ) : fileType === 'binary' ? (
                  // Binary file indicator
                  <div className="flex-1 flex items-center justify-center h-full text-neutral-500">
                    <div className="text-center">
                      <div className="text-5xl mb-3">📦</div>
                      <p className="font-medium text-lg">Binary File</p>
                      <p className="text-sm text-neutral-400 mt-1">Cannot display binary content</p>
                    </div>
                  </div>
                ) : fileType === 'image' ? (
                  // Image comparison view
                  <div className="h-full overflow-auto p-4">
                    <div className="flex gap-6 justify-center items-start">
                      {/* Original/Committed image */}
                      {committedContent && originalFileType === 'image' ? (
                        <div className="flex flex-col items-center">
                          <span className="text-xs font-medium text-neutral-500 mb-2">Committed</span>
                          <div className="border border-neutral-200 rounded-lg overflow-hidden bg-neutral-100 p-2">
                            <img
                              src={committedContent}
                              alt="Committed version"
                              className="max-w-64 max-h-64 object-contain"
                            />
                          </div>
                        </div>
                      ) : isNewFile ? (
                        <div className="flex flex-col items-center">
                          <span className="text-xs font-medium text-neutral-500 mb-2">Committed</span>
                          <div className="border border-neutral-200 rounded-lg bg-neutral-100 p-6 flex items-center justify-center w-64 h-64">
                            <span className="text-neutral-400 text-sm">New file</span>
                          </div>
                        </div>
                      ) : null}
                      
                      {/* Current image */}
                      <div className="flex flex-col items-center">
                        <span className="text-xs font-medium text-neutral-500 mb-2">Current</span>
                        <div className="border border-neutral-200 rounded-lg overflow-hidden bg-neutral-100 p-2">
                          <img
                            src={fileContent}
                            alt="Current version"
                            className="max-w-64 max-h-64 object-contain"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : activeTab === 'diff' ? (
                  <DiffView
                    originalContent={committedContent}
                    currentContent={fileContent}
                    isNewFile={isNewFile}
                    filePath={selectedPath ?? undefined}
                  />
                ) : (
                  <textarea
                    value={fileContent}
                    onChange={(e) => setFileContent(e.target.value)}
                    className="w-full h-full p-4 font-mono text-sm text-neutral-800 bg-white resize-none focus:outline-none border-none"
                    spellCheck={false}
                    readOnly={effectiveReadOnly}
                  />
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-neutral-400">
              <div className="text-center">
                <div className="text-4xl mb-2">📂</div>
                <p>Select a file to view {!effectiveReadOnly && 'and edit'}</p>
              </div>
            </div>
          )}
        </div>
          </>
        )}
      </div>

      {/* Git status legend */}
      {showLegend && (
        <div className="bg-neutral-50 border-t border-neutral-200 px-6 py-2 flex items-center gap-6 text-xs text-neutral-500">
          <span className="font-medium mr-2">Status:</span>
          <span className="flex items-center gap-1 mr-2">
            <span className="text-success-500 font-bold">A</span> New
          </span>
          <span className="flex items-center gap-1 mr-2">
            <span className="text-warning-500 font-bold">M</span>Modified
          </span>
          <span className="flex items-center gap-1 mr-2">
            <span className="text-danger-500 font-bold">D</span> Deleted
          </span>
          <span className="flex items-center gap-1 mr-2">
            <span className="text-info-400 text-base leading-none">•</span> Folder with changes
          </span>
        </div>
      )}
    </div>
  );
};

export default ConfigFileExplorer;
