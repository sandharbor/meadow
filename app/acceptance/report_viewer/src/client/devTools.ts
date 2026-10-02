/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

export async function resolveDevToolsUrl(): Promise<string> {
  const response = await fetch('/api/dev-tools');
  if (!response.ok) throw new Error('Could not locate Dev Tools.');
  const data = await response.json() as { url: string };
  return data.url;
}
