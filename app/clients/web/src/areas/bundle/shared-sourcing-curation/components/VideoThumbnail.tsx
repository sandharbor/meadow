/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import React, { useEffect, useRef, useState } from 'react';
import { apiRequest, requireApiSuccess } from '../../../../shared/utils/apiClient.js';

/** Decode one frame of the captured source without playing audio or requiring a server codec. */
export function VideoThumbnail({ sourcePath, alt, style }: { sourcePath: string; alt: string; style?: React.CSSProperties }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading');
  useEffect(() => {
    const controller = new AbortController();
    const video = document.createElement('video');
    let objectUrl: string | undefined;
    let cancelled = false;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    setState('loading');
    video.onloadeddata = () => {
      const time = Number.isFinite(video.duration) ? Math.min(1, video.duration / 10) : 0;
      if (time > 0) video.currentTime = time;
      else capture();
    };
    function capture() {
      if (cancelled) return;
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context || !video.videoWidth) { setState('error'); return; }
      const scale = Math.min(352 / video.videoWidth, 256 / video.videoHeight);
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      setState('loaded');
    }
    video.onseeked = capture;
    video.onerror = () => { if (!cancelled) setState('error'); };
    void (async () => {
      try {
        const response = await requireApiSuccess(await apiRequest(sourcePath, { signal: controller.signal }));
        const blob = await response.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        video.src = objectUrl;
      } catch { if (!cancelled) setState('error'); }
    })();
    return () => {
      cancelled = true; controller.abort();
      video.onloadeddata = null; video.onseeked = null; video.onerror = null;
      video.removeAttribute('src'); video.load();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [sourcePath]);
  return <span data-testid="video-thumbnail" data-thumbnail-state={state} style={{ display: 'block', ...style }}>
    <canvas ref={canvasRef} role="img" aria-label={alt} style={{ width: '100%', height: '100%', objectFit: 'contain', display: state === 'loaded' ? 'block' : 'none' }} />
    {state !== 'loaded' && <span role="status">{state === 'error' ? 'Video preview unavailable' : 'Loading video preview…'}</span>}
  </span>;
}
