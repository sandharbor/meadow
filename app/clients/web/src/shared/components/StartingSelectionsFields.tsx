/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { BundleSource } from '../../../../../contracts/types/bundleConfig.js';
import type { StartingSelection } from '../../../../../contracts/types/startingSelection.js';

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
    <p className="text-xs text-neutral-500">Choose files, folders, or both. Each selection starts with its own traversal budget. A collection keeps their order.</p>
    {selections.map((selection, index) => <div key={index} className="space-y-2 rounded border border-neutral-200 p-3" data-testid={`starting-selection-${index}`}>
      <div className="flex flex-wrap items-center gap-2">
        <select className="rounded border px-2 py-1" aria-label={`Source for starting selection ${index + 1}`} value={selection.sourceId} onChange={event => update(index, { sourceId: event.target.value })}>
          {sources.map(source => <option key={source.id} value={source.id}>{source.name || 'Unnamed source'}</option>)}
        </select>
        <select className="rounded border px-2 py-1" aria-label={`Kind for starting selection ${index + 1}`} value={selection.kind} onChange={event => update(index, { kind: event.target.value as StartingSelection['kind'] })}>
          <option value="file">File</option><option value="folder">Folder</option>
        </select>
        <button type="button" disabled={index === 0} aria-label={`Move starting selection ${index + 1} up`} className="ml-auto px-2 disabled:opacity-30" onClick={() => move(index, -1)}>↑</button>
        <button type="button" disabled={index === selections.length - 1} aria-label={`Move starting selection ${index + 1} down`} className="px-2 disabled:opacity-30" onClick={() => move(index, 1)}>↓</button>
        <button type="button" className="text-red-700 underline" onClick={() => onChange(selections.filter((_, position) => position !== index))}>Remove selection</button>
      </div>
      <label className="block text-xs">Path within the source<input className="mt-1 block w-full rounded border px-3 py-2 text-sm" aria-label={`Path for starting selection ${index + 1}`} value={selection.path} placeholder={selection.kind === 'file' ? 'Start.md' : 'Folder path, or empty for the source root'} onChange={event => update(index, { path: event.target.value })} /></label>
    </div>)}
    <button type="button" disabled={!sources.length} className="rounded border px-3 py-2" onClick={() => onChange([...selections, { sourceId: sources[0].id, kind: 'file', path: '' }])}>Add starting selection</button>
  </fieldset>;
}
