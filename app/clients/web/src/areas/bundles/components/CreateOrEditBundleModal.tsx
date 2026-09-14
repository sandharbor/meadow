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
import React, { useState, useEffect, useRef } from 'react';
import Modal from '../../../shared/components/Modal';
import { Spinner } from '../../../shared/components/Spinner';
import { DisabledTooltip } from '../../../shared/components/DisabledTooltip';
import { useFolderSelectionValidation } from './useFolderSelectionValidation';
import { createBundleModalViewModel, findUniqueSlug, normalizeDirectory, slugFromTitle, sourcePageFallbackPath } from './bundleModalViewModel';
import { apiRequest } from '../../../shared/utils/apiClient';
import type { SourcePageFileInfo } from '../../../../../../contracts/types/sourcePageFileInfo';
import { logger } from '../../../shared/utils/logger';
import FolderBundleFields from './FolderBundleFields';
import PagePickerButton from './PagePickerButton';
import {
  EntryStrategyPicker,
  BundleNameField,
  MoreBundleDetails,
  BundleTraversalDefaultsFields,
  SourceDirectoryField,
  type CreateOrEditBundleModalProps,
  type CreateBundleForm,
  type EntryStrategy,
} from './BundleCreationBasics';

interface MatchingPage {
  title: string;
  directory: string;
  file_type: string;
  fullPath: string;
  modifiedTimeMs?: number;
}

interface FolderBundlePreflight {
  fingerprint: string;
  plan: {
    sourceDirectory: string;
    normalizedSelectedFolders: string[];
    folderBundleNodeIds: string[];
    collectionBundleNodeId?: string;
    entryBundleNodeId: string;
    defaultOutlinksDepth: number;
    defaultInlinksDepth: number;
  };
  supportedSeedFileCount: number;
}

const EMPTY_SLUGS: string[] = [];

const BundleModalSession: React.FC<CreateOrEditBundleModalProps> = ({
  isOpen,
  onClose,
  mode,
  onSuccess,
  directories,
  existingSlugs = EMPTY_SLUGS,
  findInBundlesOptions = null,
  editBundle = null
}) => {
  const [viewModel] = useState(() => createBundleModalViewModel({
    mode, directories, existingSlugs, findInBundlesOptions, editBundle,
  }));
  const [form, setForm] = useState<CreateBundleForm>(viewModel.form);

  // Track which auto-generated fields are being manually edited
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  const [isSourceDirectoryManuallyEdited, setIsSourceDirectoryManuallyEdited] = useState(viewModel.isSourceDirectoryManuallyEdited);

  // Validation state
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionInProgress = useRef(false);
  const [duplicatePages, setDuplicatePages] = useState<MatchingPage[]>([]);
  const [showDuplicatePicker, setShowDuplicatePicker] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [suggestionsLoadError, setSuggestionsLoadError] = useState<string | null>(null);
  const [typeaheadCandidates, setTypeaheadCandidates] = useState<SourcePageFileInfo[]>([]);
  const [typeaheadTotalCount, setTypeaheadTotalCount] = useState(0);
  const [isTitleFocused, setIsTitleFocused] = useState(false);
  const [selectedInitialPage, setSelectedInitialPage] = useState<SourcePageFileInfo | null>(viewModel.selectedInitialPage);
  const [isEditingInitialPage, setIsEditingInitialPage] = useState(false);
  const [initialPageEditBackup, setInitialPageEditBackup] = useState<{
    form: CreateBundleForm;
    selectedPage: SourcePageFileInfo | null;
  } | null>(null);
  
  // Slug conflict (shown when user manually edits to a taken slug)
  const [slugConflictError, setSlugConflictError] = useState<string | null>(null);

  // More details toggle
  const [showMoreDetails, setShowMoreDetails] = useState(viewModel.showMoreDetails);
  const [entryStrategy, setEntryStrategy] = useState<EntryStrategy>(viewModel.entryStrategy);
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [isFolderTitleManuallyEdited, setIsFolderTitleManuallyEdited] = useState(false);
  const [defaultOutlinksDepth, setDefaultOutlinksDepth] = useState(viewModel.defaultOutlinksDepth);
  const [defaultInlinksDepth, setDefaultInlinksDepth] = useState(viewModel.defaultInlinksDepth);
  const folderValidation = useFolderSelectionValidation(isOpen && mode === 'create' && entryStrategy === 'folders', form.sourceDirectory, selectedFolders);
  const submitDisabledReason = isSubmitting ? 'Please wait while your bundle is saved.' : slugConflictError || folderValidation.disabledReason;

  // Server-side typeahead: query source pages by title (debounced).
  useEffect(() => {
    if (!isOpen || entryStrategy === 'folders') return;
    
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

          const response = await apiRequest(
            `bundles/source-pages/search?sourceDirectory=${encodeURIComponent(form.sourceDirectory)}&query=${encodeURIComponent(form.entryBundleNodeName)}&limit=${typeaheadLimit}`,
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
  }, [isOpen, form.sourceDirectory, form.entryBundleNodeName, selectedInitialPage, isEditingInitialPage, entryStrategy]);

  const handleFormChange = (field: keyof CreateBundleForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));

    // Check for slug conflicts when manually editing
    if (field === 'slug') {
      if (existingSlugs.includes(value)) {
        setSlugConflictError(`A bundle named "${value}" already exists.`);
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
      const next: CreateBundleForm = {
        ...prev,
        entryBundleNodeName: value,
        // While typing, the page is not locked in; clear any previously locked directory/file_type.
        entrySourceGraphSubdirectory: '',
        entryFileType: ''
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

  const handleAddSelectedFolders = async () => {
    try {
      const result = await window.electronAPI?.showOpenDialog({
        properties: ['openDirectory', 'multiSelections'],
        title: 'Select folders for this bundle'
      });
      if (!result || result.canceled || result.filePaths.length === 0) return;
      updateSelectedFolders([...new Set([...selectedFolders, ...result.filePaths])]);
    } catch (err) {
      logger.error('Failed to select bundle folders:', err);
    }
  };

  const updateSelectedFolders = (folders: string[]) => {
    setSelectedFolders(folders);
    if (!isFolderTitleManuallyEdited || folders.length <= 1) {
      const name = folders[0]?.split(/[\\/]/).filter(Boolean).pop() || '';
      handleInitialTitleChange(name);
      setIsFolderTitleManuallyEdited(false);
    }
  };

  const removeSelectedFolder = (index: number) => {
    updateSelectedFolders(selectedFolders.filter((_folder, candidateIndex) => candidateIndex !== index));
  };

  const moveSelectedFolder = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= selectedFolders.length) return;
    const next = [...selectedFolders];
    [next[index], next[target]] = [next[target], next[index]];
    updateSelectedFolders(next);
  };

  const handleDefaultOutlinksDepthChange = (value: string) => {
    setDefaultOutlinksDepth(value);
  };

  const handleDefaultInlinksDepthChange = (value: string) => {
    setDefaultInlinksDepth(value);
  };

  const parsedTraversalDefaults = (): { defaultOutlinksDepth: number; defaultInlinksDepth: number } => {
    const outlinks = Number(defaultOutlinksDepth);
    const inlinks = Number(defaultInlinksDepth);
    if (defaultOutlinksDepth.trim() === '' || !Number.isInteger(outlinks) || outlinks < 0) {
      throw new Error('Default outlink depth must be a non-negative integer.');
    }
    if (defaultInlinksDepth.trim() === '' || !Number.isInteger(inlinks) || inlinks < 0) {
      throw new Error('Default inlink depth must be a non-negative integer.');
    }
    return { defaultOutlinksDepth: outlinks, defaultInlinksDepth: inlinks };
  };

  // Search for pages in source directory
  const searchPagesInSource = async (sourceDirectory: string, pageName: string): Promise<{ found: boolean; count: number; pages: MatchingPage[] }> => {
    const response = await apiRequest(
      `bundles/source-pages/exact-search?sourceDirectory=${encodeURIComponent(sourceDirectory)}&pageName=${encodeURIComponent(pageName)}`
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
    const updatedForm: CreateBundleForm = {
      ...form,
      entryBundleNodeName: page.title,
      entrySourceGraphSubdirectory: page.directory,
      entryFileType: page.file_type
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
      file_type: page.file_type as SourcePageFileInfo['file_type'],
      fullPath: page.fullPath || sourcePageFallbackPath(page),
      modifiedTimeMs: page.modifiedTimeMs ?? 0
    });
    setIsEditingInitialPage(false);
    setInitialPageEditBackup(null);

    // Do not auto-submit; let the user review other fields.
  };

  // Handle selecting a specific page from typeahead candidates - auto-submit after selection
  const handleSelectCandidatePage = async (page: SourcePageFileInfo) => {
    const updatedForm: CreateBundleForm = {
      ...form,
      entryBundleNodeName: page.title,
      entrySourceGraphSubdirectory: page.directory,
      entryFileType: page.file_type
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
      entryBundleNodeName: '',
      entrySourceGraphSubdirectory: '',
      entryFileType: ''
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

  // Create the bundle (after validation passes)
  const createBundleWithForm = async (formData: CreateBundleForm) => {
    try {
      const traversalDefaults = parsedTraversalDefaults();
      // Normalize directory before sending to backend ("/" and "" both mean root)
      const normalizedFormData = {
        ...formData,
        entrySourceGraphSubdirectory: normalizeDirectory(formData.entrySourceGraphSubdirectory),
        ...traversalDefaults,
      };
      const response = await apiRequest(`bundles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalizedFormData)
      });
      
      if (response.ok) {
        const result = await response.json();
        onSuccess(result.slug);
      } else {
        const errorData = await response.json();
        alert(`Failed to create bundle: ${errorData.error}`);
      }
    } catch (err) {
      logger.error('Failed to create bundle:', err);
      alert('Failed to create bundle');
    }
  };

  const runFolderPreflight = async (): Promise<FolderBundlePreflight> => {
    const traversalDefaults = parsedTraversalDefaults();
    const response = await apiRequest(`bundles/folders/preflight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceDirectory: form.sourceDirectory,
        selectedFolders,
        bundleName: form.entryBundleNodeName,
        ...traversalDefaults,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Folder-bundle preflight failed');
    return result as FolderBundlePreflight;
  };

  const createFolderBundle = async (preflight: FolderBundlePreflight) => {
    const response = await apiRequest(`bundles/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: form.slug,
        sourceDirectory: form.sourceDirectory,
        selectedFolders,
        bundleName: form.entryBundleNodeName,
        bundleNotes: form.bundleNotes,
        fingerprint: preflight.fingerprint,
        plan: preflight.plan,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Failed to create folder bundle');
    }
    onSuccess(result.slug);
  };

  const updateBundleWithForm = async (formData: CreateBundleForm) => {
    if (!editBundle?.slug) {
      alert('No bundle selected to edit');
      return;
    }
    try {
      const traversalDefaults = parsedTraversalDefaults();
      const normalizedBody = {
        sourceDirectory: formData.sourceDirectory,
        entryBundleNodeName: formData.entryBundleNodeName,
        entrySourceGraphSubdirectory: normalizeDirectory(formData.entrySourceGraphSubdirectory),
        entryFileType: formData.entryFileType,
        bundleNotes: formData.bundleNotes,
        ...traversalDefaults,
      };

      const response = await apiRequest(`bundles/${editBundle.slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalizedBody)
      });

      if (response.ok) {
        onSuccess(editBundle.slug);
      } else {
        const errorData = await response.json();
        alert(`Failed to update bundle: ${errorData.error}`);
      }
    } catch (err) {
      logger.error('Failed to update bundle:', err);
      alert('Failed to update bundle');
    }
  };

  const submitForm = async (formData: CreateBundleForm) => {
    if (mode === 'edit') {
      await updateBundleWithForm(formData);
    } else {
      await createBundleWithForm(formData);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (submissionInProgress.current || submitDisabledReason) {
      return;
    }

    // Lock immediately, including submissions before React renders the disabled button.
    submissionInProgress.current = true;
    setIsSubmitting(true);
    // Clear previous validation state
    setValidationError(null);
    
    try {
      parsedTraversalDefaults();

      if (mode === 'create' && entryStrategy === 'folders') {
        if (!form.sourceDirectory) throw new Error('Please choose a source directory.');
        if (selectedFolders.length === 0) throw new Error('Please choose at least one folder.');
        if (!form.entryBundleNodeName.trim()) throw new Error('Please enter a home page title.');
        if (!form.slug) throw new Error('Please enter a bundle name.');
        const preflight = await runFolderPreflight();
        await createFolderBundle(preflight);
        return;
      }

      if (mode === 'edit' && editBundle?.folderDerived) {
        await updateBundleWithForm(form);
        return;
      }

      if (!selectedInitialPage && !form.entryBundleNodeName.trim()) {
        setValidationError('Please choose an initial bundle page.');
        return;
      }

      // If the initial page is already locked in, trust it and proceed.
      if (selectedInitialPage) {
        await submitForm(form);
        return;
      }

      // Search for the page in the source directory
      const searchResult = await searchPagesInSource(form.sourceDirectory, form.entryBundleNodeName);

      if (!searchResult.found) {
        // Page not found - show error and don't close
        setValidationError(`Page "${form.entryBundleNodeName}" was not found in the source directory. Please check the page name and try again.`);
        return;
      }

      // Directory not yet specified - check for duplicates
      if (searchResult.count > 1) {
        // Multiple pages with same name - show picker
        setDuplicatePages(searchResult.pages);
        setShowDuplicatePicker(true);
        setValidationError(`Found ${searchResult.count} pages named "${form.entryBundleNodeName}". Please select which one you want to use:`);
        return;
      }

      // Single page found - lock it in and proceed with creation
      const foundPage = searchResult.pages[0];
      const updatedForm = {
        ...form,
        entryBundleNodeName: foundPage.title,
        entrySourceGraphSubdirectory: foundPage.directory,
        entryFileType: foundPage.file_type
      };
      setForm(updatedForm);
      setSelectedInitialPage({
        title: foundPage.title,
        directory: foundPage.directory,
        file_type: foundPage.file_type as SourcePageFileInfo['file_type'],
        fullPath: foundPage.fullPath || sourcePageFallbackPath(foundPage),
        modifiedTimeMs: foundPage.modifiedTimeMs ?? 0
      });
      setIsEditingInitialPage(false);
      setInitialPageEditBackup(null);

      // Pass the updated form directly since setForm is async
      await submitForm(updatedForm);

    } catch (err) {
      logger.error('Failed to validate page:', err);
      setValidationError(err instanceof Error ? err.message : 'Failed to validate page in source directory');
    } finally {
      submissionInProgress.current = false;
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submissionInProgress.current) onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      showCloseButton={!isSubmitting}
      title={mode === 'edit' ? 'Edit Bundle Details' : 'Create New Bundle'}
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
                  <PagePickerButton page={page} onSelect={() => handleSelectDuplicatePage(page)} highlightQuery={form.entryBundleNodeName} />
                </div>
              ))}
            </div>
          </div>
        )}

        {mode === 'create' && !findInBundlesOptions && (
          <EntryStrategyPicker
            value={entryStrategy}
            onChange={strategy => {
              if (strategy === entryStrategy) return;
              setEntryStrategy(strategy);
              setSelectedFolders([]);
              setIsFolderTitleManuallyEdited(false);
              handleInitialTitleChange('');
              setDefaultOutlinksDepth(strategy === 'folders' ? '1' : '3');
              setDefaultInlinksDepth(strategy === 'folders' ? '0' : '1');
              if (strategy === 'folders') {
                setSelectedInitialPage(null);
                setValidationError(null);
              }
            }}
          />
        )}

        {mode === 'create' && entryStrategy === 'folders' && (
          <FolderBundleFields
            bundleName={form.entryBundleNodeName}
            selectedFolders={selectedFolders}
            validation={folderValidation}
            onBundleNameChange={value => {
              setIsFolderTitleManuallyEdited(true);
              handleInitialTitleChange(value);
            }}
            onAddFolders={handleAddSelectedFolders}
            onMoveFolder={moveSelectedFolder}
            onRemoveFolder={removeSelectedFolder}
          />
        )}

        <SourceDirectoryField
          value={form.sourceDirectory}
          choices={viewModel.sourceDirectoryChoices(form.sourceDirectory)}
          isManuallyEdited={isSourceDirectoryManuallyEdited}
          readOnly={mode === 'edit' && editBundle?.folderDerived === true}
          label={entryStrategy === 'folders' ? 'Notes Root' : 'Source Directory'}
          helpText={entryStrategy === 'folders'
            ? 'The top-level notes folder Meadow uses to resolve links and assets. Include this root folder itself or folders nested inside it. In Obsidian, this is usually your vault folder.'
            : 'The folder Meadow searches for source pages, links, and assets.'}
          onStartManualEdit={() => setIsSourceDirectoryManuallyEdited(true)}
          onChange={value => handleFormChange('sourceDirectory', value)}
          onBrowse={handleSelectFolder}
        />

        {mode === 'edit' && editBundle?.folderDerived && (
          <section className="rounded-md border border-blue-200 bg-blue-50 p-3" aria-label="Folder-derived bundle scope">
            <h3 className="text-sm font-semibold text-blue-900">Folder-derived bundle</h3>
            <p className="mt-1 text-sm text-blue-800">
              <span className="font-medium">{form.entryBundleNodeName}</span> is the bundle home. Its selected folder scope stays unchanged here.
            </p>
          </section>
        )}

        {entryStrategy === 'page' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Initial Bundle Page *
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
                title="Edit initial bundle page"
              >
                ✏️
              </button>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={form.entryBundleNodeName}
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
                        <PagePickerButton page={page} onSelect={() => handleSelectCandidatePage(page)} highlightQuery={form.entryBundleNodeName} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        )}

        {mode === 'create' && (
          <BundleNameField
            slug={form.slug}
            isSlugManuallyEdited={isSlugManuallyEdited}
            slugConflictError={slugConflictError}
            onStartSlugEdit={() => setIsSlugManuallyEdited(true)}
            onSlugChange={value => handleFormChange('slug', value)}
          />
        )}

        <BundleTraversalDefaultsFields
          outlinksDepth={defaultOutlinksDepth}
          inlinksDepth={defaultInlinksDepth}
          onOutlinksDepthChange={handleDefaultOutlinksDepthChange}
          onInlinksDepthChange={handleDefaultInlinksDepthChange}
        />

        <MoreBundleDetails
          expanded={showMoreDetails}
          notes={form.bundleNotes}
          onToggle={() => setShowMoreDetails(!showMoreDetails)}
          onNotesChange={value => handleFormChange('bundleNotes', value)}
        />

        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleClose();
            }}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <DisabledTooltip disabled={!!submitDisabledReason} tooltip={submitDisabledReason ?? undefined} align="right" className="inline-flex">
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2 bg-btn-confirm-normal text-btn-confirm-text rounded hover:bg-btn-confirm-hover disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!!submitDisabledReason}
              aria-busy={isSubmitting}
            >
              {isSubmitting && <Spinner />}
              <span aria-live="polite">
                {isSubmitting
                  ? (mode === 'edit' ? 'Updating...' : 'Creating...')
                  : (mode === 'edit' ? 'Update Bundle' : 'Create Bundle')}
              </span>
            </button>
          </DisabledTooltip>
        </div>
      </form>
    </Modal>
  );
};

// Closing ends the editing session; reopening captures fresh defaults and
// directory choices. Parent updates while open must not reset the user's work.
const CreateOrEditBundleModal: React.FC<CreateOrEditBundleModalProps> = props =>
  props.isOpen ? <BundleModalSession {...props} /> : null;

export default CreateOrEditBundleModal;
