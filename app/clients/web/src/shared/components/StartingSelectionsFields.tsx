/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useEffect, useState } from 'react';
import type { BundleSource } from '../../../../../contracts/types/bundleConfig.js';
import type { SourcePageFileInfo } from '../../../../../contracts/types/sourcePageFileInfo.js';
import type { StartingSelection } from '../../../../../contracts/types/startingSelection.js';
import { apiRequest } from '../utils/apiClient';

type PathSuggestion = { path: string; title: string; detail: string };

/** Pages or folders within one source, matching what has been typed so far. */
function useSourcePathSuggestions(directory: string, kind: StartingSelection['kind'], query: string, active: boolean) {
  const [suggestions, setSuggestions] = useState<PathSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!active || !directory) { setSuggestions([]); setError(null); return; }
    const controller = new AbortController();
    const timeout = setTimeout(() => void (async () => {
      const search = `sourceDirectory=${encodeURIComponent(directory)}&query=${encodeURIComponent(query)}&limit=25`;
      try {
        const response = await apiRequest(kind === 'file' ? `bundles/source-pages/search?${search}` : `bundles/source-folders/search?${search}`, { signal: controller.signal });
        if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error || 'Suggestions unavailable');
        const data = await response.json() as { pages?: SourcePageFileInfo[]; folders?: string[] };
        setSuggestions(kind === 'file'
          ? (data.pages ?? []).map(page => ({ path: page.fullPath, title: page.title, detail: page.directory || '(source root)' }))
          : (data.folders ?? []).map(folder => ({ path: folder, title: folder ? folder.slice(folder.lastIndexOf('/') + 1) : '(source root)', detail: folder || 'The whole source' })));
        setError(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setSuggestions([]);
        setError(err instanceof Error ? err.message : 'Suggestions unavailable');
      }
    })(), 150);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [active, directory, kind, query]);
  return { suggestions, error };
}

function StartingSelectionPath({ index, selection, directory, onChange }: {
  index: number; selection: StartingSelection; directory: string; onChange: (path: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const query = selection.kind === 'file' ? selection.path.replace(/\.[^/.]+$/, '') : selection.path;
  const { suggestions, error } = useSourcePathSuggestions(directory, selection.kind, query, focused);
  return <div className="text-xs">
    <label className="block">Path within the source<input className="mt-1 block w-full rounded border px-3 py-2 text-sm" aria-label={`Path for starting selection ${index + 1}`} value={selection.path}
      placeholder={selection.kind === 'file' ? 'Type to search pages' : 'Type to search folders, or leave empty for the source root'}
      onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 150)} onChange={event => onChange(event.target.value)} /></label>
    {focused && !directory && <p className="mt-1 text-neutral-500">Choose this source’s directory to see suggestions.</p>}
    {focused && error && <p className="mt-1 text-neutral-500">Suggestions unavailable: {error}</p>}
    {focused && suggestions.length > 0 && <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-2" aria-label={`Suggestions for starting selection ${index + 1}`}>
      {suggestions.map(suggestion => <li key={suggestion.path}>
        <button type="button" className="w-full rounded border border-gray-300 bg-white p-2 text-left hover:border-blue-300 hover:bg-blue-50" onMouseDown={event => event.preventDefault()} onClick={() => { onChange(suggestion.path); setFocused(false); }}>
          <span className="block text-sm font-medium text-gray-900">{suggestion.title}</span>
          <span className="block text-gray-500">{suggestion.detail}</span>
        </button>
      </li>)}
    </ul>}
  </div>;
}

export function StartingSelectionsFields({ sources, selections, onChange, disabled = false }: {
  sources: BundleSource[]; selections: StartingSelection[]; onChange: (selections: StartingSelection[]) => void; disabled?: boolean;
}) {
  const update = (index: number, value: Partial<StartingSelection>) => onChange(selections.map((selection, position) => position === index ? { ...selection, ...value } : selection));
  const move = (index: number, offset: number) => {
    const next = [...selections];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next);
  };
  return <fieldset disabled={disabled} className="space-y-3">
    <legend className="mb-2 font-semibold">Starting selections</legend>
    <p className="text-xs text-neutral-500">Choose pages, folders, or both. Each selection starts with its own traversal budget. A collection keeps their order.</p>
    {selections.map((selection, index) => <div key={index} className="space-y-2 rounded border border-neutral-200 p-3" data-testid={`starting-selection-${index}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center font-mono text-sm text-neutral-600">source://
          <select className="ml-0.5 rounded border px-2 py-1 font-sans" aria-label={`Source for starting selection ${index + 1}`} value={selection.sourceId} onChange={event => update(index, { sourceId: event.target.value, path: '' })}>
            {sources.map(source => <option key={source.id} value={source.id}>{source.name || 'Unnamed source'}</option>)}
          </select>
        </span>
        <select className="rounded border px-2 py-1" aria-label={`Kind for starting selection ${index + 1}`} value={selection.kind} onChange={event => update(index, { kind: event.target.value as StartingSelection['kind'], path: '' })}>
          <option value="file">Page</option><option value="folder">Folder</option>
        </select>
        <button type="button" disabled={index === 0} aria-label={`Move starting selection ${index + 1} up`} className="ml-auto px-2 disabled:opacity-30" onClick={() => move(index, -1)}>↑</button>
        <button type="button" disabled={index === selections.length - 1} aria-label={`Move starting selection ${index + 1} down`} className="px-2 disabled:opacity-30" onClick={() => move(index, 1)}>↓</button>
        <button type="button" className="text-red-700 underline" onClick={() => onChange(selections.filter((_, position) => position !== index))}>Remove selection</button>
      </div>
      <StartingSelectionPath index={index} selection={selection} directory={sources.find(source => source.id === selection.sourceId)?.directory ?? ''} onChange={path => update(index, { path })} />
    </div>)}
    <button type="button" disabled={!sources.length} className="rounded border px-3 py-2" onClick={() => onChange([...selections, { sourceId: sources[0].id, kind: 'file', path: '' }])}>Add starting selection</button>
  </fieldset>;
}
