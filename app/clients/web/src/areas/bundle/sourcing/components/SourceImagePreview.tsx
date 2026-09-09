/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AuthenticatedImage } from '../../../../shared/components/AuthenticatedImage.js';
import { FileRoute } from './SourceFileRoute.js';

export const isSourceImage = (filename: string) => /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(filename);
export type SourceImageUrl = (filename: string, side: 'before' | 'after') => string;

export function SourceImagePreview({ url, filename, route }: { url: string; filename: string; route?: string[] }) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const show = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 344)), top: rect.bottom + 8 });
  };
  return <>
    <button type="button" aria-label={`Preview ${filename}`} className="shrink-0 rounded border border-neutral-200 bg-neutral-50 p-1" onMouseEnter={event => show(event.currentTarget)} onMouseLeave={() => setPosition(null)} onFocus={event => show(event.currentTarget)} onBlur={() => setPosition(null)} onKeyDown={event => { if (event.key === 'Escape') setPosition(null); }}>
      <AuthenticatedImage sourcePath={url} alt={filename} className="h-10 w-14 object-contain" />
    </button>
    {position && createPortal(<div role="tooltip" className="pointer-events-none fixed z-[9999] w-80 max-w-[calc(100vw-1rem)] rounded border border-neutral-200 bg-white p-3 text-xs text-neutral-700 shadow-lg" style={{ left: position.left, top: Math.min(position.top, Math.max(8, window.innerHeight - 370)) }}>
      <AuthenticatedImage sourcePath={url} alt={filename} className="h-56 w-full object-contain" />
      {Boolean(route?.length) && <div className="mt-2">Reached through<FileRoute paths={route!} /></div>}
    </div>, document.body)}
  </>;
}

export function SourceImageComparison({ beforePath, afterPath, beforeImage, afterImage, imageUrl }: { beforePath: string; afterPath: string; beforeImage?: boolean; afterImage?: boolean; imageUrl: SourceImageUrl }) {
  return <div className="grid gap-4 p-3 sm:grid-cols-2">
    {([['before', beforePath, beforeImage, 'Previous image'], ['after', afterPath, afterImage, 'New image']] as const).map(([side, filename, exists, label]) => <figure key={side}>
      <figcaption className="mb-2 text-xs text-neutral-500">{label}</figcaption>
      {exists ? <AuthenticatedImage sourcePath={imageUrl(filename, side)} alt={`${label}: ${filename}`} className="h-56 w-full rounded bg-neutral-50 object-contain" /> : <p className="text-xs text-neutral-500">No image in this snapshot.</p>}
    </figure>)}
  </div>;
}
