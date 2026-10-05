/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { ConceptDetails } from './ConceptPage.tsx';

type Mode = 'embedded' | 'sidebar' | 'floating';
type Location = { id: string; implementation?: string };
type Bounds = { x: number; y: number; width: number; height: number };
const prefix = 'report-concept-';
const read = <T,>(key: string, fallback: T): T => {
  try { return JSON.parse(window.localStorage.getItem(prefix + key) ?? 'null') ?? fallback; } catch { return fallback; }
};
const save = (key: string, value: unknown) => { try { window.localStorage.setItem(prefix + key, JSON.stringify(value)); } catch { /* Optional layout preference. */ } };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(Number.isFinite(value) ? value : min, Math.max(min, max)));
const fit = (bounds: Bounds): Bounds => {
  const width = clamp(bounds.width, 300, window.innerWidth - 24);
  const height = clamp(bounds.height, 220, window.innerHeight - 72);
  return { width, height, x: clamp(bounds.x, 12, window.innerWidth - width - 12), y: clamp(bounds.y, 56, window.innerHeight - height - 12) };
};

export default function ConceptExplorer({ concept: selected, selectedConceptIds, onSelectConcept, onSidebarWidth }: {
  concept: { id: string; name: string } | null;
  selectedConceptIds: string[];
  onSelectConcept: (id: string, add: boolean) => void;
  onSidebarWidth: (width: number) => void;
}) {
  const [lastSelected, setLastSelected] = useState(selected);
  const concept = selected ?? lastSelected;
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<Mode>(() => {
    const saved = read<Mode>('mode', 'embedded');
    return ['embedded', 'sidebar', 'floating'].includes(saved) ? saved : 'embedded';
  });
  const [location, setLocation] = useState<Location>({ id: selected?.id ?? '' });
  const [history, setHistory] = useState<Location[]>([]);
  const [bounds, setBounds] = useState(() => fit(read<Bounds>('bounds', { x: window.innerWidth - 680, y: 90, width: 640, height: 560 })));
  const [sidebarWidth, setSidebarWidth] = useState(() => clamp(read<number>('sidebar-width', 420), 300, window.innerWidth - 120));
  const gesture = useRef<{ kind: 'move' | 'floating' | 'sidebar'; x: number; y: number; bounds: Bounds; width: number } | null>(null);
  const selectionFromExplorer = useRef(false);
  const selectionKey = selectedConceptIds.join('\0');
  useEffect(() => {
    if (selected) {
      setLastSelected(selected);
      if (!selectionFromExplorer.current) { setLocation({ id: selected.id }); setHistory([]); }
    }
    selectionFromExplorer.current = false;
  }, [selected, selectionKey]);
  useEffect(() => { save('mode', mode); }, [mode]);
  useEffect(() => { save('bounds', bounds); }, [bounds]);
  useEffect(() => { save('sidebar-width', sidebarWidth); }, [sidebarWidth]);
  useEffect(() => {
    onSidebarWidth(expanded && mode === 'sidebar' ? sidebarWidth + 12 : 0);
    return () => onSidebarWidth(0);
  }, [expanded, mode, sidebarWidth, onSidebarWidth]);
  useEffect(() => {
    const resize = () => { setBounds(value => fit(value)); setSidebarWidth(value => clamp(value, 300, window.innerWidth - 120)); };
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  if (!concept) return null;
  const navigate = (id: string, implementation?: string) => {
    setHistory(value => [...value, location]); setLocation({ id, implementation });
  };
  const begin = (event: PointerEvent<HTMLElement>, kind: 'move' | 'floating' | 'sidebar') => {
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { kind, x: event.clientX, y: event.clientY, bounds, width: sidebarWidth };
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    const start = gesture.current;
    if (!start) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (start.kind === 'move') setBounds(fit({ ...start.bounds, x: start.bounds.x + dx, y: start.bounds.y + dy }));
    else if (start.kind === 'sidebar') setSidebarWidth(clamp(start.width - dx, 300, window.innerWidth - 120));
    else setBounds({ ...start.bounds,
      width: clamp(start.bounds.width + dx, 300, window.innerWidth - start.bounds.x - 12),
      height: clamp(start.bounds.height + dy, 220, window.innerHeight - start.bounds.y - 12) });
  };
  const end = () => { gesture.current = null; };
  const viewedConceptSelected = selectedConceptIds.includes(location.id);
  const selectConcept = (add: boolean) => {
    selectionFromExplorer.current = true;
    onSelectConcept(location.id, add);
  };
  const displayControl = <label className="flex items-center gap-1 text-xs text-neutral-500">View
    <select aria-label="Concept display" value={mode} className="rounded border bg-white px-2 py-1 text-neutral-700"
      onChange={event => { setMode(event.target.value as Mode); setExpanded(true); }}>
      <option value="embedded">Embedded</option><option value="sidebar">Sidebar</option><option value="floating">Floating</option>
    </select>
  </label>;
  const content = <>
    <div className="flex flex-wrap items-center gap-3 border-b px-4 py-2 text-xs">
      {history.length > 0 && <button className="cursor-pointer text-brand-600 hover:underline" onClick={() => {
        setLocation(history[history.length - 1]); setHistory(value => value.slice(0, -1));
      }}>← Back</button>}
      {(location.id !== concept.id || location.implementation) && <button className="cursor-pointer text-brand-600 hover:underline"
        onClick={() => { setLocation({ id: concept.id }); setHistory([]); }}>Return to {concept.name}</button>}
      {!history.length && location.id === concept.id && !location.implementation && <span className="text-neutral-500">Concept details and implementation</span>}
    </div>
    <div role="group" aria-label="Concept selection" className="flex flex-wrap items-center gap-2 border-b px-4 py-2 text-xs">
      <span className={`mr-auto ${viewedConceptSelected ? 'font-medium text-brand-600' : 'text-neutral-400'}`}>
        {viewedConceptSelected ? '✓ Selected' : 'Not selected'}
      </span>
      <button className="cursor-pointer rounded border border-brand-200 px-2 py-1 font-medium text-brand-600 hover:bg-brand-50 disabled:cursor-default disabled:opacity-40"
        title="Make this the only selected concept" disabled={viewedConceptSelected && selectedConceptIds.length === 1}
        onClick={() => selectConcept(false)}>Select</button>
      <button className="cursor-pointer rounded border border-neutral-200 px-2 py-1 text-neutral-600 hover:bg-neutral-50 disabled:cursor-default disabled:opacity-40"
        disabled={viewedConceptSelected} onClick={() => selectConcept(true)}>Add to selection</button>
    </div>
    <div className="min-h-0 flex-1 overflow-auto p-4" key={`${location.id}:${location.implementation ?? ''}`}>
      <ConceptDetails conceptId={location.id} selected={location.implementation} onNavigate={navigate} showTitle={mode !== 'embedded' || location.id !== concept.id} />
    </div>
  </>;
  const detached = expanded && mode !== 'embedded' ? createPortal(
    <section role={mode === 'floating' ? 'dialog' : 'region'} aria-label={mode === 'floating' ? 'Floating concept details' : 'Concept sidebar'}
      aria-modal={mode === 'floating' ? false : undefined}
      className={`fixed z-40 flex flex-col border border-neutral-200 bg-white shadow-xl ${mode === 'floating' ? 'rounded-lg' : ''}`}
      style={mode === 'floating' ? { left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height } : { right: 0, top: 56, bottom: 0, width: sidebarWidth }}
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setExpanded(false); } }}>
      <div className="flex flex-wrap items-center gap-3 border-b bg-neutral-50 px-4 py-2">
        {mode === 'floating' ? <div role="button" tabIndex={0} aria-label="Move concept panel" className="mr-auto cursor-move select-none font-semibold text-neutral-700" style={{ touchAction: 'none' }}
          onPointerDown={event => begin(event, 'move')} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
          onKeyDown={event => { if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
            event.preventDefault(); setBounds(value => fit({ ...value, x: value.x + (event.key === 'ArrowLeft' ? -10 : event.key === 'ArrowRight' ? 10 : 0), y: value.y + (event.key === 'ArrowUp' ? -10 : event.key === 'ArrowDown' ? 10 : 0) })); }}>Concept details ⋮⋮</div>
          : <span className="mr-auto font-semibold text-neutral-700">Concept details</span>}
        {displayControl}
        <button aria-label="Close concept details" className="cursor-pointer rounded px-2 py-1 text-neutral-500 hover:bg-neutral-200" onClick={() => setExpanded(false)}>✕</button>
      </div>
      {content}
      {mode === 'sidebar' ? <div role="separator" aria-label="Resize concept sidebar" aria-orientation="vertical" aria-valuemin={300} aria-valuemax={window.innerWidth - 120} aria-valuenow={sidebarWidth} tabIndex={0}
        className="absolute inset-y-0 left-0 w-2 cursor-col-resize hover:bg-brand-100" style={{ touchAction: 'none' }}
        onPointerDown={event => begin(event, 'sidebar')} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
        onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setSidebarWidth(value => clamp(value + (event.key === 'ArrowLeft' ? 20 : -20), 300, window.innerWidth - 120)); } }} />
        : <button aria-label="Resize concept panel" className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize text-neutral-400" style={{ touchAction: 'none' }}
          onPointerDown={event => begin(event, 'floating')} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
          onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); setBounds(value => fit({ ...value, width: value.width + (event.key === 'ArrowLeft' ? -20 : event.key === 'ArrowRight' ? 20 : 0), height: value.height + (event.key === 'ArrowUp' ? -20 : event.key === 'ArrowDown' ? 20 : 0) })); } }}>◢</button>}
    </section>, document.body) : null;
  return <section aria-label="Concept explorer" hidden={!selected && (!expanded || mode !== 'embedded')} className="mt-2 rounded border border-neutral-200 bg-white">
    <div className="flex flex-wrap items-center gap-3 px-3 py-2">
      <h2 className="mr-auto text-sm font-semibold text-neutral-800">{concept.name}</h2>
      <button aria-label={expanded ? 'Hide concept details' : 'Show concept details'} aria-expanded={expanded}
        className="cursor-pointer text-xs font-medium text-brand-600" onClick={() => setExpanded(value => !value)}>{expanded ? '▾' : '▸'} Details</button>
      {(!expanded || mode === 'embedded') && displayControl}
    </div>
    {expanded && mode === 'embedded' && <div aria-label="Concept details" className="flex flex-col border-t">{content}</div>}
    {detached}
  </section>;
}
