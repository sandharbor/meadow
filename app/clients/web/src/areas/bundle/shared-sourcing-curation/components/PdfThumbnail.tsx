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

import React, { useEffect, useRef, useState } from 'react';
import { apiRequest, apiUrl, requireApiSuccess } from '../../../../shared/utils/apiClient';
import { logger } from '../../../../shared/utils/logger';
import { loadVendorScript } from '../../../../shared/utils/vendorScript';

// Renders a PDF's first page as a thumbnail with the same vendored pdf.js
// that the published bundle uses. The renderer and its worker are loaded once
// per page-load, on first mount.

interface PdfPage {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  render: (options: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> };
}

interface PdfDocument {
  getPage: (pageNumber: number) => Promise<PdfPage>;
}

interface PdfLoadingTask {
  promise: Promise<PdfDocument>;
  destroy: () => Promise<void>;
}

type WindowWithPdf = Window & {
  MeadowPdf?: {
    getDocument: (source: { data: ArrayBuffer }) => PdfLoadingTask;
    GlobalWorkerOptions: { workerSrc: string };
  };
};

let workerLoad: Promise<string> | null = null;

// pdf.js starts its worker from a URL; the worker, like the renderer, sits
// behind the API's authentication, so it runs from a blob URL.
function loadWorkerUrl(): Promise<string> {
  workerLoad ??= (async () => {
    const response = await requireApiSuccess(await apiRequest(apiUrl('generation/assets/pdf-worker.js')));
    return URL.createObjectURL(new Blob([await response.blob()], { type: 'text/javascript' }));
  })().catch((error: unknown) => {
    workerLoad = null;
    throw error;
  });
  return workerLoad;
}

export interface PdfThumbnailProps {
  pdfSourcePath: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function PdfThumbnail({ pdfSourcePath, alt, className, style }: PdfThumbnailProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: PdfLoadingTask | null = null;
    const container = containerRef.current;
    if (!container) return;

    (async () => {
      try {
        const [workerUrl] = await Promise.all([
          loadWorkerUrl(),
          loadVendorScript(apiUrl('generation/assets/pdf-vendor.js'), () => Boolean((window as WindowWithPdf).MeadowPdf)),
        ]);
        const pdf = (window as WindowWithPdf).MeadowPdf;
        if (!pdf) throw new Error('vendor bundle did not initialise');
        pdf.GlobalWorkerOptions.workerSrc = workerUrl;
        const resp = await apiRequest(pdfSourcePath);
        if (!resp.ok) throw new Error(`fetch ${pdfSourcePath}: ${resp.status}`);
        const data = await resp.arrayBuffer();
        if (cancelled) return;
        loadingTask = pdf.getDocument({ data });
        const doc = await loadingTask.promise;
        const page = await doc.getPage(1);
        if (cancelled) return;
        // Fit the first page inside the thumbnail, sharp on high-density screens.
        const base = page.getViewport({ scale: 1 });
        const fit = Math.min(container.clientWidth / base.width, container.clientHeight / base.height) || 1;
        const viewport = page.getViewport({ scale: fit * (window.devicePixelRatio || 1) });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('canvas unavailable');
        await page.render({ canvasContext: context, viewport }).promise;
        if (cancelled) return;
        canvas.style.maxWidth = '100%';
        canvas.style.maxHeight = '100%';
        canvas.style.background = '#ffffff';
        container.replaceChildren(canvas);
      } catch (err) {
        if (cancelled) return;
        setErrored(true);
        logger.warn('[PdfThumbnail] render failed', err);
      }
    })();

    return () => {
      cancelled = true;
      // Destroying the loading task also releases the document it loaded.
      void loadingTask?.destroy();
    };
  }, [pdfSourcePath]);

  return (
    <div
      ref={containerRef}
      className={className}
      role="img"
      aria-label={alt}
      title={alt}
      style={{ overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}
    >
      {errored ? <span style={{ fontSize: '0.65em', color: '#999' }}>PDF</span> : null}
    </div>
  );
}
