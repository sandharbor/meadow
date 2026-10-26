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

import { apiRequest, requireApiSuccess } from './apiClient';

// Vendored renderers (Excalidraw, pdf.js) are served by the runtime behind
// the API's authentication, so a plain `<script src>` cannot load them. Each
// is fetched once, run from a blob URL, and shared by every later caller.
const scriptLoads = new Map<string, Promise<void>>();

export function loadVendorScript(url: string, isLoaded: () => boolean): Promise<void> {
  if (isLoaded()) return Promise.resolve();
  const pending = scriptLoads.get(url);
  if (pending) return pending;
  const load = (async () => {
    const response = await requireApiSuccess(await apiRequest(url, {
      headers: { Accept: 'application/javascript' },
    }));
    const objectUrl = URL.createObjectURL(await response.blob());
    const script = document.createElement('script');
    script.src = objectUrl;
    script.async = true;
    try {
      await new Promise<void>((resolve, reject) => {
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to execute vendor bundle from ${url}`));
        document.head.appendChild(script);
      });
    } finally {
      script.remove();
      URL.revokeObjectURL(objectUrl);
    }
  })().catch((error: unknown) => {
    scriptLoads.delete(url);
    throw error;
  });
  scriptLoads.set(url, load);
  return load;
}
