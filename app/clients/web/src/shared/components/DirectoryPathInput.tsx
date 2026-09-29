/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

/** A directory path field with its folder chooser beside it, as in the bundle creation form. */
export function DirectoryPathInput({ value, onChange, ariaLabel, dialogTitle, placeholder = '/path/to/source' }: {
  value: string; onChange: (value: string) => void; ariaLabel: string; dialogTitle: string; placeholder?: string;
}) {
  const browse = async () => {
    const result = await window.electronAPI?.showOpenDialog({ properties: ['openDirectory'], title: dialogTitle });
    if (result && !result.canceled && result.filePaths[0]) onChange(result.filePaths[0]);
  };
  return <div className="mt-1 flex items-center gap-2">
    <input className="block min-w-0 flex-1 rounded border px-3 py-2" aria-label={ariaLabel} placeholder={placeholder} value={value} onChange={event => onChange(event.target.value)} />
    {window.electronAPI && <button type="button" className="rounded border border-gray-300 bg-gray-100 px-3 py-2 hover:bg-gray-200" title="Browse for folder" aria-label={`Browse for ${ariaLabel}`} onClick={() => void browse()}>📁</button>}
  </div>;
}
