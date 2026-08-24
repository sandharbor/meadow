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

import React, { useEffect, useState } from 'react';
import { apiRequest, requireApiSuccess } from '../../../../shared/utils/apiClient';
import { logger } from '../../../../shared/utils/logger';

export interface AuthenticatedImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  sourcePath: string;
}

/**
 * Loads protected backend images through the authenticated API transport, then
 * exposes only a local blob URL to the browser's declarative image loader.
 */
export function AuthenticatedImage({
  sourcePath,
  alt,
  className,
  style,
  title,
  onError,
  ...imageProps
}: AuthenticatedImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    const abortController = new AbortController();
    let generatedObjectUrl: string | null = null;
    let cancelled = false;

    setObjectUrl(null);
    setErrored(false);

    void (async () => {
      try {
        const response = await requireApiSuccess(await apiRequest(sourcePath, {
          headers: { Accept: 'image/*' },
          signal: abortController.signal,
        }));
        const blob = await response.blob();
        if (cancelled) return;
        generatedObjectUrl = URL.createObjectURL(blob);
        setObjectUrl(generatedObjectUrl);
      } catch (error) {
        if (cancelled || (error instanceof DOMException && error.name === 'AbortError')) return;
        setErrored(true);
        logger.warn(`[AuthenticatedImage] failed to load ${sourcePath}`, error);
      }
    })();

    return () => {
      cancelled = true;
      abortController.abort();
      if (generatedObjectUrl) URL.revokeObjectURL(generatedObjectUrl);
    };
  }, [sourcePath]);

  if (errored) {
    return (
      <span
        className={`${className ?? ''} inline-flex items-center justify-center bg-white text-gray-400`}
        style={style}
        role="img"
        aria-label={alt ? `Failed to load ${alt}` : 'Failed to load image'}
        title={title ?? alt}
        data-thumbnail-state="error"
      >
        🖼️
      </span>
    );
  }

  if (!objectUrl) {
    return (
      <span
        className={`${className ?? ''} inline-block bg-gray-50`}
        style={style}
        role="status"
        aria-label={alt ? `Loading ${alt}` : 'Loading image'}
        title={title ?? alt}
        data-thumbnail-state="loading"
      />
    );
  }

  return (
    <img
      {...imageProps}
      src={objectUrl}
      alt={alt}
      className={className}
      style={style}
      title={title}
      data-thumbnail-state="loaded"
      onError={(event) => {
        setErrored(true);
        onError?.(event);
      }}
    />
  );
}
