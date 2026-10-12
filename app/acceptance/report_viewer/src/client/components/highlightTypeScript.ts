/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { highlight, languages } from 'prismjs'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-tsx'
import 'prismjs/themes/prism.css'

/** Colorize TypeScript source as one HTML string per line, so panels keep line numbers and anchors. */
export function highlightTypeScriptLines(source: string, file = ''): string[] {
  const tsx = file.endsWith('.tsx')
  return highlight(source, tsx ? languages.tsx : languages.typescript, tsx ? 'tsx' : 'typescript').split('\n')
}
