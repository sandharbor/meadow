/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { createContext, useContext } from 'react';

/** Each owning mode supplies the destination and behavior of business operations. */
export interface EditorOperations {
  mode: 'curation' | 'sourcing';
  request: (operation: string, options?: RequestInit) => Promise<Response>;
}

export const EditorOperationsContext = createContext<EditorOperations | null>(null);

export function useEditorOperations(): EditorOperations {
  const operations = useContext(EditorOperationsContext);
  if (!operations) throw new Error('The graph editor requires operations from its owning mode.');
  return operations;
}
