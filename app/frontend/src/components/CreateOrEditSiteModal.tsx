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

/* global alert */
import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { API_BASE_URL } from '../utils/apiConfig';
import { FindInSitesOptions } from '../../../shared_code/types/findInSitesOptions';
import type { SourcePageFileInfo } from '../../../shared_code/types/sourcePageFileInfo';
import { logger } from '../utils/logger';

interface CreateSiteForm {
  slug: string;
  sourceDirectory: string;
  initialSitePageTitle: string;
  initialSitePageDirectory: string;
  initialSitePageFileType: string;
  siteNotes: string;
}

type SiteModalMode = 'create' | 'edit';

interface EditSiteDefaults {
  slug: string;
  sourceDirectory: string;
  initialSitePageTitle: string;
  initialSitePageDirectory?: string;
  siteNotes?: string;
}

interface MatchingPage {
  title: string;
  directory: string;
  file_type: string;
  fullPath: string;
  modifiedTimeMs?: number;
}

interface CreateOrEditSiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: SiteModalMode;
  onSuccess: (slug: string) => void;
  directories: string[];
  existingSlugs?: string[];
  findInSitesOptions?: FindInSitesOptions | null;
  editSite?: EditSiteDefaults | null;
}

// Find a unique slug by appending -1, -2, etc. if the base slug already exists
const findUniqueSlug = (baseSlug: string, existingSlugs: string[]): string => {
  const slugSet = new Set(existingSlugs);
  if (!slugSet.has(baseSlug)) return baseSlug;
  let counter = 1;
  while (slugSet.has(`${baseSlug}-${counter}`)) {
    counter++;
  }
  return `${baseSlug}-${counter}`;
};

// Normalize directory path: "/" and "" both represent the root directory
const normalizeDirectory = (dir: string): string => {
  return dir === '/' ? '' : dir;
};

// Find the most common source directory
const getMostCommonSourceDirectory = (directories: string[]): string => {
  if (directories.length === 0) return '';
  
  // Count occurrences of each directory
  const directoryCounts = directories.reduce((counts: Record<string, number>, dir) => {
    counts[dir] = (counts[dir] || 0) + 1;
    return counts;
  }, {});
  
  // Find the directory with the highest count
  return Object.entries(directoryCounts).reduce((mostCommon, [dir, count]) => {
    return count > (directoryCounts[mostCommon] || 0) ? dir : mostCommon;
  }, directories[0]);
};

const EMPTY_SLUGS: string[] = [];

const CreateOrEditSiteModal: React.FC<CreateOrEditSiteModalProps> = ({
  isOpen,
  onClose,
  mode,
  onSuccess,
  directories,
  existingSlugs = EMPTY_SLUGS,
  findInSitesOptions = null,
  editSite = null
}) => {
  // Form state
  const [form, setForm] = useState<CreateSiteForm>({
    slug: '',
    sourceDirectory: '',
    initialSitePageTitle: '',
    initialSitePageDirectory: '',
    initialSitePageFileType: '',
    siteNotes: ''
  });

  // Track which auto-generated fields are being manually edited
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  const [isSourceDirectoryManuallyEdited, setIsSourceDirectoryManuallyEdited] = useState(false);

  // Validation state
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [duplicatePages, setDuplicatePages] = useState<MatchingPage[]>([]);
  const [showDuplicatePicker, setShowDuplicatePicker] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [suggestionsLoadError, setSuggestionsLoadError] = useState<string | null>(null);
  const [typeaheadCandidates, setTypeaheadCandidates] = useState<SourcePageFileInfo[]>([]);
  const [typeaheadTotalCount, setTypeaheadTotalCount] = useState(0);
  const [isTitleFocused, setIsTitleFocused] = useState(false);
  const [selectedInitialPage, setSelectedInitialPage] = useState<SourcePageFileInfo | null>(null);
  const [isEditingInitialPage, setIsEditingInitialPage] = useState(false);
  const [initialPageEditBackup, setInitialPageEditBackup] = useState<{
    form: CreateSiteForm;
    selectedPage: SourcePageFileInfo | null;
  } | null>(null);
  
  // Slug conflict (shown when user manually edits to a taken slug)
  const [slugConflictError, setSlugConflictError] = useState<string | null>(null);

  // More details toggle
  const [showMoreDetails, setShowMoreDetails] = useState(false);

  // Reset and initialize form when modal opens
  useEffect(() => {
    if (isOpen) {
      const commonSourceDirectory = getMostCommonSourceDirectory(directories);
      const initialForm: CreateSiteForm =
        mode === 'edit' && editSite
          ? {
              slug: editSite.slug,
              sourceDirectory: editSite.sourceDirectory || '',
              initialSitePageTitle: editSite.initialSitePageTitle || '',
              initialSitePageDirectory: normalizeDirectory(editSite.initialSitePageDirectory || ''),
              initialSitePageFileType: '',
              siteNotes: editSite.siteNotes || ''
            }
          : {
              slug: '',
              sourceDirectory: commonSourceDirectory,
              initialSitePageTitle: '',
              initialSitePageDirectory: '',
              initialSitePageFileType: '',
              siteNotes: ''
            };

      if (mode === 'create' && findInSitesOptions) {
        const pageName = findInSitesOptions.pageName || findInSitesOptions.pageName || '';
        initialForm.initialSitePageTitle = pageName;
        // Use vault path as source directory when page is specified via find in sites
        // (only override if vaultPath is non-empty; otherwise keep commonSourceDirectory)
        if (findInSitesOptions.vaultPath) {
          initialForm.sourceDirectory = findInSitesOptions.vaultPath;
        }
        // Set the folder path as the initial site page directory (for nested pages)
        initialForm.initialSitePageDirectory = findInSitesOptions.folderPath;
        // Generate slug from the page name, auto-incrementing if taken
        const baseSlug = pageName
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');
        const slug = findUniqueSlug(baseSlug, existingSlugs);
        initialForm.slug = slug;
      }

      setForm(initialForm);
      setIsSlugManuallyEdited(false);
      
      // If there's no source directory to suggest, start in edit mode
      setIsSourceDirectoryManuallyEdited(
        mode === 'edit'
          ? false
          : (!commonSourceDirectory && !findInSitesOptions?.vaultPath)
      );
      
      // Reset validation state
      setValidationError(null);
      setSlugConflictError(null);
      setDuplicatePages([]);
      setShowDuplicatePicker(false);
      setTypeaheadCandidates([]);
      setTypeaheadTotalCount(0);
      setIsTitleFocused(false);
      setIsLoadingSuggestions(false);
      setSuggestionsLoadError(null);
      if (mode === 'edit' && editSite) {
        const dir = normalizeDirectory(editSite.initialSitePageDirectory || '');
        setSelectedInitialPage({
          title: editSite.initialSitePageTitle,
          directory: dir,
          file_type: 'md',
          fullPath: dir ? `${dir}/${editSite.initialSitePageTitle}.md` : `${editSite.initialSitePageTitle}.md`,
          modifiedTimeMs: 0
        });
      } else {
        setSelectedInitialPage(null);
      }
      setIsEditingInitialPage(false);
      setInitialPageEditBackup(null);
      setShowMoreDetails(mode === 'edit');

      if (mode === 'create' && findInSitesOptions) {
        const pageName = findInSitesOptions.pageName || findInSitesOptions.pageName || '';
        const dir = normalizeDirectory(findInSitesOptions.folderPath || '');
        setSelectedInitialPage({
          title: pageName,
          directory: dir,
          file_type: 'md',
          fullPath: dir ? `${dir}/${pageName}.md` : `${pageName}.md`,
          modifiedTimeMs: 0
        });
      }
    }
  }, [isOpen, directories, existingSlugs, findInSitesOptions, mode, editSite]);

  const slugFromTitle = (value: string): string => {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  };

  // Server-side typeahead: query source pages by title (debounced).
  useEffect(() => {
    if (!isOpen) return;
    
    // If the initial page is already locked in, no need to fetch suggestions.
    if (selectedInitialPage && !isEditingInitialPage) return;

    if (!form.sourceDirectory) {
      setTypeaheadCandidates([]);
      setTypeaheadTotalCount(0);
      setIsLoadingSuggestions(false);
      setSuggestionsLoadError(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    const typeaheadLimit = 25;

    const timeout = setTimeout(() => {
      (async () => {
        try {
          setIsLoadingSuggestions(true);
          setSuggestionsLoadError(null);

          const response = await fetch(
            `${API_BASE_URL}/search-source-pages?sourceDirectory=${encodeURIComponent(form.sourceDirectory)}&query=${encodeURIComponent(form.initialSitePageTitle)}&limit=${typeaheadLimit}`,
            { signal: controller.signal }
          );

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Failed to load suggestions');
          }

          const data = await response.json() as { count: number; pages: SourcePageFileInfo[] };
          if (cancelled) return;
          setTypeaheadCandidates(data.pages || []);
          setTypeaheadTotalCount(data.count || 0);
        } catch (err) {
          if (cancelled) return;
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setTypeaheadCandidates([]);
          setTypeaheadTotalCount(0);
          setSuggestionsLoadError(err instanceof Error ? err.message : 'Failed to load suggestions');
        } finally {
          if (!cancelled) {
            setIsLoadingSuggestions(false);
          }
        }
      })();
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [isOpen, form.sourceDirectory, form.initialSitePageTitle, selectedInitialPage, isEditingInitialPage]);

  const handleFormChange = (field: keyof CreateSiteForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));

    // Check for slug conflicts when manually editing
    if (field === 'slug') {
      if (existingSlugs.includes(value)) {
        setSlugConflictError(`A site config folder named "${value}" already exists.`);
      } else {
        setSlugConflictError(null);
      }
    }

    // Clear validation errors when source directory changes
    if (field === 'sourceDirectory') {
      setValidationError(null);
      setDuplicatePages([]);
      setShowDuplicatePicker(false);
      setTypeaheadCandidates([]);
      setTypeaheadTotalCount(0);
      setSuggestionsLoadError(null);
      setSelectedInitialPage(null);
      setIsEditingInitialPage(false);
      setInitialPageEditBackup(null);
    }
  };

  const handleInitialTitleChange = (value: string) => {
    setForm(prev => {
      const next: CreateSiteForm = {
        ...prev,
        initialSitePageTitle: value,
        // While typing, the page is not locked in; clear any previously locked directory/file_type.
        initialSitePageDirectory: '',
        initialSitePageFileType: ''
      };

      // Auto-generate slug if not manually edited
      if (mode === 'create' && !isSlugManuallyEdited) {
        next.slug = findUniqueSlug(slugFromTitle(value), existingSlugs);
      }

      return next;
    });

    // Clear validation errors when the user changes the title
    setValidationError(null);
    setDuplicatePages([]);
    setShowDuplicatePicker(false);
    setSelectedInitialPage(null);
    // Note: Don't clear typeaheadCandidates here - let them remain visible until
    // the debounced fetch returns new results to avoid flickering

    // slug handled in the setForm updater above
  };

  const handleSelectFolder = async () => {
    try {
      const result = await window.electronAPI?.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select Source Directory'
      });
      
      if (result && !result.canceled && result.filePaths.length > 0) {
        handleFormChange('sourceDirectory', result.filePaths[0]);
      }
    } catch (err) {
      logger.error('Failed to open folder dialog:', err);
    }
  };

  // Search for pages in source directory
  const searchPagesInSource = async (sourceDirectory: string, pageName: string): Promise<{ found: boolean; count: number; pages: MatchingPage[] }> => {
    const response = await fetch(
      `${API_BASE_URL}/search-pages-in-source?sourceDirectory=${encodeURIComponent(sourceDirectory)}&pageName=${encodeURIComponent(pageName)}`
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to search pages');
    }

    return response.json();
  };

  // Handle selecting a specific page from duplicates - auto-submit after selection
  const handleSelectDuplicatePage = async (page: MatchingPage) => {
    // Use the exact title, directory, and file_type from the selected page
    const updatedForm: CreateSiteForm = {
      ...form,
      initialSitePageTitle: page.title,
      initialSitePageDirectory: page.directory,
      initialSitePageFileType: page.file_type
    };

    if (!isSlugManuallyEdited) {
      updatedForm.slug = slugFromTitle(page.title);
    }

    setForm(updatedForm);
    setDuplicatePages([]);
    setShowDuplicatePicker(false);
    setValidationError(null);
    setSelectedInitialPage({
      title: page.title,
      directory: page.directory,
      file_type: 'md',
      fullPath: page.fullPath || (page.directory ? `${page.directory}/${page.title}.md` : `${page.title}.md`),
      modifiedTimeMs: page.modifiedTimeMs ?? 0
    });
    setIsEditingInitialPage(false);
    setInitialPageEditBackup(null);

    // Do not auto-submit; let the user review other fields.
  };

  // Handle selecting a specific page from typeahead candidates - auto-submit after selection
  const handleSelectCandidatePage = async (page: SourcePageFileInfo) => {
    const updatedForm: CreateSiteForm = {
      ...form,
      initialSitePageTitle: page.title,
      initialSitePageDirectory: page.directory,
      initialSitePageFileType: page.file_type
    };

    if (!isSlugManuallyEdited) {
      updatedForm.slug = slugFromTitle(page.title);
    }

    setForm(updatedForm);
    setTypeaheadCandidates([]);
    setIsTitleFocused(false);
    setValidationError(null);
    setSelectedInitialPage(page);
    setIsEditingInitialPage(false);
    setInitialPageEditBackup(null);

    // Do not auto-submit; let the user review other fields.
  };

  const startEditingInitialPage = () => {
    setInitialPageEditBackup({ form, selectedPage: selectedInitialPage });
    setSelectedInitialPage(null);
    setIsEditingInitialPage(true);
    setTypeaheadCandidates([]);
    setTypeaheadTotalCount(0);
    setDuplicatePages([]);
    setShowDuplicatePicker(false);
    setValidationError(null);
    setIsTitleFocused(false);
    setForm(prev => ({
      ...prev,
      initialSitePageTitle: '',
      initialSitePageDirectory: '',
      initialSitePageFileType: ''
    }));
  };

  const cancelEditingInitialPage = () => {
    if (!initialPageEditBackup) return;
    setForm(initialPageEditBackup.form);
    setSelectedInitialPage(initialPageEditBackup.selectedPage);
    setIsEditingInitialPage(false);
    setInitialPageEditBackup(null);
    setTypeaheadCandidates([]);
    setTypeaheadTotalCount(0);
    setDuplicatePages([]);
    setShowDuplicatePicker(false);
    setValidationError(null);
    setIsTitleFocused(false);
  };

  const getTitleHighlightParts = (title: string, query: string): Array<{ text: string; isMatch: boolean }> => {
    const q = query.trim();
    if (!q) return [{ text: title, isMatch: false }];

    // Highlight all whitespace-separated query parts (case-insensitive).
    const parts = q.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return [{ text: title, isMatch: false }];

    const titleLower = title.toLowerCase();
    const ranges: Array<{ start: number; end: number }> = [];

    for (const part of parts) {
      const needle = part.toLowerCase();
      if (!needle) continue;

      let from = 0;
      while (from < titleLower.length) {
        const idx = titleLower.indexOf(needle, from);
        if (idx === -1) break;
        ranges.push({ start: idx, end: idx + needle.length });
        from = idx + Math.max(1, needle.length);
      }
    }

    if (ranges.length === 0) return [{ text: title, isMatch: false }];

    // Merge overlapping ranges
    ranges.sort((a, b) => a.start - b.start || a.end - b.end);
    const merged: Array<{ start: number; end: number }> = [];
    for (const r of ranges) {
      const last = merged[merged.length - 1];
      if (!last || r.start > last.end) {
        merged.push({ ...r });
      } else {
        last.end = Math.max(last.end, r.end);
      }
    }

    const result: Array<{ text: string; isMatch: boolean }> = [];
    let cursor = 0;
    for (const r of merged) {
      if (cursor < r.start) {
        result.push({ text: title.slice(cursor, r.start), isMatch: false });
      }
      result.push({ text: title.slice(r.start, r.end), isMatch: true });
      cursor = r.end;
    }
    if (cursor < title.length) {
      result.push({ text: title.slice(cursor), isMatch: false });
    }
    return result;
  };

  const renderPagePickerButton = (
    page: { title: string; directory: string; file_type: string; fullPath: string },
    onSelect: () => void,
    highlightQuery?: string
  ) => {
    const titleParts = getTitleHighlightParts(page.title, highlightQuery || '');
    return (
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onSelect}
        className="w-full text-left p-2 bg-white border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-300 transition-colors"
      >
        <div className="font-medium text-gray-900">
          {titleParts.map((p, idx) => (
            p.isMatch ? (
              <span key={idx} className="bg-yellow-200 rounded px-0.5">
                {p.text}
              </span>
            ) : (
              <span key={idx}>{p.text}</span>
            )
          ))}
        </div>
        <div className="text-xs text-gray-500">
          {page.directory || '(root)'}
        </div>
      </button>
    );
  };

  // Create the site (after validation passes)
  const createSiteWithForm = async (formData: CreateSiteForm) => {
    try {
      // Normalize directory before sending to backend ("/" and "" both mean root)
      const normalizedFormData = {
        ...formData,
        initialSitePageDirectory: normalizeDirectory(formData.initialSitePageDirectory)
      };
      const response = await fetch(`${API_BASE_URL}/sites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalizedFormData)
      });
      
      if (response.ok) {
        const result = await response.json();
        onSuccess(result.slug);
      } else {
        const errorData = await response.json();
        alert(`Failed to create site: ${errorData.error}`);
      }
    } catch (err) {
      logger.error('Failed to create site:', err);
      alert('Failed to create site');
    }
  };

  const updateSiteWithForm = async (formData: CreateSiteForm) => {
    if (!editSite?.slug) {
      alert('No site selected to edit');
      return;
    }
    try {
      const normalizedBody = {
        sourceDirectory: formData.sourceDirectory,
        initialSitePageTitle: formData.initialSitePageTitle,
        initialSitePageDirectory: normalizeDirectory(formData.initialSitePageDirectory),
        siteNotes: formData.siteNotes
      };

      const response = await fetch(`${API_BASE_URL}/sites/${editSite.slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalizedBody)
      });

      if (response.ok) {
        onSuccess(editSite.slug);
      } else {
        const errorData = await response.json();
        alert(`Failed to update site: ${errorData.error}`);
      }
    } catch (err) {
      logger.error('Failed to update site:', err);
      alert('Failed to update site');
    }
  };

  const submitForm = async (formData: CreateSiteForm) => {
    if (mode === 'edit') {
      await updateSiteWithForm(formData);
    } else {
      await createSiteWithForm(formData);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Block submission if slug conflicts with an existing site
    if (slugConflictError) {
      return;
    }

    // Clear previous validation state
    setValidationError(null);
    setIsValidating(true);
    
    try {
      if (!selectedInitialPage && !form.initialSitePageTitle.trim()) {
        setValidationError('Please choose an initial site page.');
        setIsValidating(false);
        return;
      }

      // If the initial page is already locked in, trust it and proceed.
      if (selectedInitialPage) {
        setIsValidating(false);
        await submitForm(form);
        return;
      }

      // Search for the page in the source directory
      const searchResult = await searchPagesInSource(form.sourceDirectory, form.initialSitePageTitle);

      if (!searchResult.found) {
        // Page not found - show error and don't close
        setValidationError(`Page "${form.initialSitePageTitle}" was not found in the source directory. Please check the page name and try again.`);
        setIsValidating(false);
        return;
      }

      // Directory not yet specified - check for duplicates
      if (searchResult.count > 1) {
        // Multiple pages with same name - show picker
        setDuplicatePages(searchResult.pages);
        setShowDuplicatePicker(true);
        setValidationError(`Found ${searchResult.count} pages named "${form.initialSitePageTitle}". Please select which one you want to use:`);
        setIsValidating(false);
        return;
      }

      // Single page found - lock it in and proceed with creation
      const foundPage = searchResult.pages[0];
      const updatedForm = {
        ...form,
        initialSitePageTitle: foundPage.title,
        initialSitePageDirectory: foundPage.directory,
        initialSitePageFileType: foundPage.file_type
      };
      setForm(updatedForm);
      setSelectedInitialPage({
        title: foundPage.title,
        directory: foundPage.directory,
        file_type: 'md',
        fullPath: foundPage.fullPath || (foundPage.directory ? `${foundPage.directory}/${foundPage.title}.md` : `${foundPage.title}.md`),
        modifiedTimeMs: foundPage.modifiedTimeMs ?? 0
      });
      setIsEditingInitialPage(false);
      setInitialPageEditBackup(null);
      setIsValidating(false);

      // Pass the updated form directly since setForm is async
      await submitForm(updatedForm);

    } catch (err) {
      logger.error('Failed to validate page:', err);
      setValidationError(err instanceof Error ? err.message : 'Failed to validate page in source directory');
      setIsValidating(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'edit' ? 'Edit Site' : 'Create New Site'}
      className="w-2/3 max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Validation Error Message */}
        {validationError && (
          <div className={`p-3 rounded-md ${showDuplicatePicker ? 'bg-yellow-50 border border-yellow-200' : 'bg-red-50 border border-red-200'}`}>
            <p className={`text-sm ${showDuplicatePicker ? 'text-yellow-800' : 'text-red-700'}`}>
              {validationError}
            </p>
          </div>
        )}

        {/* Duplicate Page Picker */}
        {showDuplicatePicker && duplicatePages.length > 0 && (
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
            <p className="text-sm font-medium text-gray-700 mb-2">Select the correct page:</p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {duplicatePages.map((page, index) => (
                <div key={index}>
                  {renderPagePickerButton(page, () => handleSelectDuplicatePage(page), form.initialSitePageTitle)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Primary Fields */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Source Directory *
          </label>
          {!isSourceDirectoryManuallyEdited && form.sourceDirectory ? (
            <div className="flex items-center space-x-2">
              <div className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-700 truncate" title={form.sourceDirectory}>
                {form.sourceDirectory}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsSourceDirectoryManuallyEdited(true);
                }}
                className="text-blue-600 hover:text-blue-900"
                title="Edit manually"
              >
                ✏️
              </button>
            </div>
          ) : (
            <div>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={form.sourceDirectory}
                  onChange={(e) => handleFormChange('sourceDirectory', e.target.value)}
                  placeholder="Enter a custom directory path"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                  required
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectFolder();
                  }}
                  className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 text-gray-700 text-sm whitespace-nowrap"
                  title="Browse for folder"
                >
                  📁 Select
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Path to the directory containing your source files
              </p>
              {directories.length > 1 && (
                <div className="mt-2">
                  <label className="block text-xs text-gray-500 mb-1">
                    Or pick from existing directories:
                  </label>
                  <select
                    value=""
                    onChange={(e) => handleFormChange('sourceDirectory', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                  >
                    <option value="">Select an existing directory</option>
                    {directories.map((dir) => (
                      <option key={dir} value={dir}>
                        {dir}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Initial Site Page *
          </label>
          {selectedInitialPage && !isEditingInitialPage ? (
            <div className="flex items-start gap-2">
              <div className="flex-1 w-full text-left p-2 bg-white border border-gray-300 rounded">
                <div className="font-medium text-gray-900">{selectedInitialPage.title}</div>
                <div className="text-xs text-gray-500">
                  {selectedInitialPage.directory || '(root)'}
                </div>
              </div>
              <button
                type="button"
                onClick={startEditingInitialPage}
                className="text-blue-600 hover:text-blue-900 mt-1"
                title="Edit initial site page"
              >
                ✏️
              </button>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={form.initialSitePageTitle}
                  onChange={(e) => handleInitialTitleChange(e.target.value)}
                  onFocus={() => setIsTitleFocused(true)}
                  onBlur={() => {
                    // Delay hiding suggestions to allow click events on other modal elements
                    // to complete before the content shifts. Without this delay, clicking on
                    // elements like "More Details" would cause the modal to close because:
                    // 1. Blur fires immediately, setting isTitleFocused=false
                    // 2. React re-renders and removes suggestions, shrinking the modal
                    // 3. The click event fires but the target element has moved/shifted
                    // 4. The click hits the backdrop instead, closing the modal
                    setTimeout(() => setIsTitleFocused(false), 150);
                  }}
                  placeholder="Type to search…"
                  className={`flex-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 ${
                    validationError && !showDuplicatePicker ? 'border-red-300' : 'border-gray-300'
                  }`}
                />
                {isEditingInitialPage && (
                  <button
                    type="button"
                    onClick={cancelEditingInitialPage}
                    className="px-3 py-2 text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
                    title="Cancel and keep the previously chosen page"
                  >
                    Cancel
                  </button>
                )}
              </div>
              <div className="mt-1 flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  {isLoadingSuggestions
                    ? 'Loading suggestions…'
                    : (suggestionsLoadError
                      ? `Suggestions unavailable: ${suggestionsLoadError}`
                      : 'Type to see suggestions')}
                </p>
              </div>
              {/* Typeahead Candidate Picker */}
              {!showDuplicatePicker && isTitleFocused && typeaheadCandidates.length > 0 && (
                <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-md">
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    Suggestions{typeaheadTotalCount > 25 ? ' (limited to 25)' : ''}
                  </p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {typeaheadCandidates.map((page) => (
                      <div key={page.fullPath}>
                        {renderPagePickerButton(page, () => handleSelectCandidatePage(page), form.initialSitePageTitle)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* More Details Toggle */}
        <button
          type="button"
          onClick={() => setShowMoreDetails(!showMoreDetails)}
          className="flex items-center text-sm text-blue-600 hover:text-blue-800"
        >
          <span className="mr-1">{showMoreDetails ? '▼' : '▶'}</span>
          {showMoreDetails ? 'Hide details' : 'More details'}
        </button>

        {/* Collapsible Details Section */}
        {showMoreDetails && (
          <div className="space-y-4 pl-4 border-l-2 border-gray-200">
            {mode === 'create' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Site Config Folder Name *
                </label>
                {!isSlugManuallyEdited ? (
                  <div className="flex items-center space-x-2">
                    <div className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-700">
                      {form.slug || 'will-be-auto-generated-from-title'}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsSlugManuallyEdited(true);
                      }}
                      className="text-blue-600 hover:text-blue-900"
                      title="Edit manually"
                    >
                      ✏️
                    </button>
                  </div>
                ) : (
                  <div>
                    <input
                      type="text"
                      value={form.slug}
                      onChange={(e) => handleFormChange('slug', e.target.value)}
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-inset ${slugConflictError ? 'border-red-400 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'}`}
                      required
                      pattern="[a-z0-9\-]+"
                      title="Only lowercase letters, numbers, and dashes allowed"
                    />
                    {slugConflictError ? (
                      <p className="text-xs text-red-600 mt-1">{slugConflictError}</p>
                    ) : (
                      <p className="text-xs text-gray-500 mt-1">
                        Only lowercase letters, numbers, and dashes allowed
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                value={form.siteNotes}
                onChange={(e) => handleFormChange('siteNotes', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                placeholder="Enter any notes about this site..."
              />
            </div>
          </div>
        )}

        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
            disabled={isValidating}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-btn-confirm-normal text-btn-confirm-text rounded hover:bg-btn-confirm-hover disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isValidating || !!slugConflictError}
          >
            {isValidating ? 'Validating...' : (mode === 'edit' ? 'Update Site' : 'Create Site')}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default CreateOrEditSiteModal;

