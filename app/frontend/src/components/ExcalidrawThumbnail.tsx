import React, { useEffect, useRef, useState } from 'react';
import { logger } from '../utils/logger';

// Renders an Excalidraw drawing as an SVG thumbnail by reusing the same
// vendored renderer (`@excalidraw/excalidraw` + `lz-string`) that the
// published site uses. The bundle is loaded once per page-load on first
// mount; subsequent thumbnails reuse the same `window.MeadowExcalidraw`.
//
// Usage:
//   <ExcalidrawThumbnail
//     mdSourceUrl="…/source-file/t006/foo.excalidraw.md"
//     className="w-8 h-8 …"
//     onMouseEnter={…}
//     onMouseLeave={…}
//     onClick={…}
//   />

type WindowWithExcalidraw = Window & {
  MeadowExcalidraw?: {
    exportToSvg: (opts: {
      elements: unknown[];
      appState?: unknown;
      files?: unknown;
      exportPadding?: number;
    }) => Promise<SVGSVGElement>;
    LZString: { decompressFromBase64: (input: string) => string | null };
  };
};

let vendorLoadPromise: Promise<void> | null = null;

function loadVendorBundle(vendorUrl: string): Promise<void> {
  const w = window as WindowWithExcalidraw;
  if (w.MeadowExcalidraw) return Promise.resolve();
  if (vendorLoadPromise) return vendorLoadPromise;
  vendorLoadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = vendorUrl;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      vendorLoadPromise = null;
      reject(new Error(`Failed to load Excalidraw vendor bundle from ${vendorUrl}`));
    };
    document.head.appendChild(script);
  });
  return vendorLoadPromise;
}

interface ExcalidrawScene {
  elements?: unknown[];
  appState?: unknown;
  files?: unknown;
}

function extractScene(md: string): ExcalidrawScene | null {
  const match = md.match(/```compressed-json\n([\s\S]*?)\n```/);
  if (!match) return null;
  const blob = match[1].replace(/\s+/g, '');
  const w = window as WindowWithExcalidraw;
  if (!w.MeadowExcalidraw) return null;
  const json = w.MeadowExcalidraw.LZString.decompressFromBase64(blob);
  if (!json) return null;
  try {
    return JSON.parse(json) as ExcalidrawScene;
  } catch {
    return null;
  }
}

export interface ExcalidrawThumbnailProps {
  mdSourceUrl: string;
  vendorUrl: string;
  alt?: string;
  className?: string;
  /** When true, render only after the element scrolls into view. Default: false. */
  lazy?: boolean;
  onMouseEnter?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export function ExcalidrawThumbnail({
  mdSourceUrl,
  vendorUrl,
  alt,
  className,
  lazy = false,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: ExcalidrawThumbnailProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [shouldRender, setShouldRender] = useState(!lazy);
  const [errored, setErrored] = useState(false);

  // Defer rendering until the thumbnail enters the viewport when lazy=true.
  useEffect(() => {
    if (!lazy || shouldRender) return;
    const el = containerRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShouldRender(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShouldRender(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [lazy, shouldRender]);

  useEffect(() => {
    if (!shouldRender) return;
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    (async () => {
      try {
        await loadVendorBundle(vendorUrl);
        if (cancelled) return;
        const resp = await fetch(mdSourceUrl);
        if (!resp.ok) throw new Error(`fetch ${mdSourceUrl}: ${resp.status}`);
        const md = await resp.text();
        if (cancelled) return;
        const scene = extractScene(md);
        if (!scene) throw new Error('scene data missing or unreadable');
        const w = window as WindowWithExcalidraw;
        if (!w.MeadowExcalidraw) throw new Error('vendor bundle did not initialise');
        const svg = await w.MeadowExcalidraw.exportToSvg({
          elements: scene.elements ?? [],
          appState: { exportBackground: true, exportWithDarkMode: false, ...(scene.appState ?? {}) },
          files: scene.files ?? null,
          exportPadding: 8,
        });
        if (cancelled) return;
        // Let CSS size the thumbnail; preserve viewBox for aspect ratio.
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.style.display = 'block';
        svg.style.width = '100%';
        svg.style.height = '100%';
        container.replaceChildren(svg);
      } catch (err) {
        if (cancelled) return;
        setErrored(true);
        logger.warn('[ExcalidrawThumbnail] render failed', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shouldRender, mdSourceUrl, vendorUrl]);

  return (
    <div
      ref={containerRef}
      className={className}
      role="img"
      aria-label={alt}
      title={alt}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      style={{ overflow: 'hidden', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {errored ? <span style={{ fontSize: '0.65em', color: '#999' }}>📐</span> : null}
    </div>
  );
}
