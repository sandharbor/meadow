/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { BundleSource } from '../../../../../../contracts/types/bundleConfig.js';
import type { StartingSelection } from '../../../../../../contracts/types/startingSelection.js';
import { generateBundleNodeId } from '../../../../../../shared_code/utils/bundleNodeConfigUtils.js';
import { DirectoryPathInput } from '../../../shared/components/DirectoryPathInput.js';
import { StartingSelectionsFields } from '../../../shared/components/StartingSelectionsFields.js';

export function MultiSourceBundleFields({ sources, selections, onSourcesChange, onSelectionsChange, name, onNameChange }: {
  sources: BundleSource[]; selections: StartingSelection[]; onSourcesChange: (sources: BundleSource[]) => void;
  onSelectionsChange: (selections: StartingSelection[]) => void; name: string; onNameChange: (name: string) => void;
}) {
  const update = (id: string, changes: Partial<BundleSource>) => onSourcesChange(sources.map(source => source.id === id ? { ...source, ...changes } : source));
  const add = () => {
    const source = { id: generateBundleNodeId(sources.map(source => source.id)), name: '', directory: '' };
    onSourcesChange([...sources, source]);
    if (!selections.length) onSelectionsChange([{ sourceId: source.id, kind: 'file', path: '' }]);
  };
  return <section className="space-y-4 text-sm" aria-label="Sources and starting selections">
    <label className="block font-medium">Bundle home title<input className="mt-1 block w-full rounded border px-3 py-2 font-normal" value={name} onChange={event => onNameChange(event.target.value)} /></label>
    <p className="text-xs text-neutral-500">Register the directories links may reach, then choose where traversal starts. Sources and starting selections are independent.</p>
    {sources.map((source, index) => <fieldset key={source.id} className="space-y-2 rounded border p-3">
      <label className="block">Source name<input className="mt-1 block w-full rounded border px-3 py-2" aria-label={`Source name ${index + 1}`} placeholder="notes" value={source.name} onChange={event => update(source.id, { name: event.target.value })} /></label>
      <div>Directory<DirectoryPathInput ariaLabel={`Source directory ${index + 1}`} dialogTitle="Choose source directory" value={source.directory} onChange={directory => update(source.id, { directory })} /></div>
      <label className="block text-xs">Aliases, separated by commas<input className="mt-1 block w-full rounded border px-3 py-2" value={(source.aliases ?? []).join(', ')} onChange={event => update(source.id, { aliases: event.target.value.split(',').map(value => value.trim()).filter(Boolean) })} /></label>
      <button type="button" className="text-red-700 underline" onClick={() => { onSourcesChange(sources.filter(item => item.id !== source.id)); onSelectionsChange(selections.filter(item => item.sourceId !== source.id)); }}>Remove source</button>
    </fieldset>)}
    <button type="button" className="rounded border px-3 py-2" onClick={add}>Add source</button>
    <StartingSelectionsFields sources={sources} selections={selections} onChange={onSelectionsChange} />
  </section>;
}
