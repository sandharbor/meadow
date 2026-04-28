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

import React from 'react';

// Shared constants for hover image dimensions
export const HOVER_IMAGE_WIDTH = 192; // w-48 in Tailwind (2x the original 96px)
export const HOVER_IMAGE_HEIGHT = 128; // h-32 in Tailwind (2x the original 64px)

interface ImageHoverPreviewProps {
  imageUrl: string;
  title: string;
  style?: React.CSSProperties;
}

const ImageHoverPreview: React.FC<ImageHoverPreviewProps> = ({
  imageUrl,
  title,
  style,
}) => {
  return (
    <div
      style={{
        pointerEvents: 'none',
        zIndex: 50,
        width: HOVER_IMAGE_WIDTH,
        textAlign: 'center',
        ...style,
      }}
      className="bg-gray-800 text-white text-xs rounded px-2 py-1 shadow-lg"
    >
      <img
        src={imageUrl}
        alt={title}
        style={{
          width: HOVER_IMAGE_WIDTH - 16, // Account for padding
          height: HOVER_IMAGE_HEIGHT,
        }}
        className="object-cover rounded mb-1 mx-auto"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
      {title}
    </div>
  );
};

export default ImageHoverPreview;




