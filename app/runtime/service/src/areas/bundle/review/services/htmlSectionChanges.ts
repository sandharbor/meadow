/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { parseHTML } from 'linkedom';

export interface HtmlSectionChanges {
  head: boolean;
  aside: boolean;
  header: boolean;
  main: boolean;
  footer: boolean;
  other: boolean;
}

const SECTION_SELECTORS = {
  head: 'head',
  aside: 'body > aside',
  header: 'body > header, body > .meadow-bundle-content > header',
  main: 'body > main, body > .meadow-bundle-content > main',
  footer: 'body > footer, body > .meadow-bundle-content > footer',
} as const;

type KnownSection = keyof typeof SECTION_SELECTORS;

function extractSections(html: string): Record<keyof HtmlSectionChanges, string> {
  const { document } = parseHTML(html);
  const sections = {} as Record<keyof HtmlSectionChanges, string>;
  const known: Element[] = [];
  for (const [section, selector] of Object.entries(SECTION_SELECTORS) as Array<[KnownSection, string]>) {
    const element = document.querySelector(selector);
    sections[section] = element?.innerHTML.trim() ?? '';
    for (const match of document.querySelectorAll(selector)) known.push(match);
  }
  // Compare the remaining document after removing every known structural
  // element, so unclassified regions are detected independently.
  for (const element of known) element.remove();
  sections.other = document.documentElement?.outerHTML.trim() ?? '';
  return sections;
}

/** Which generated HTML regions differ; additions and deletions count as every region. */
export function htmlSectionChanges(before: string | null, after: string | null): HtmlSectionChanges {
  if (before === null || after === null) {
    return { head: true, aside: true, header: true, main: true, footer: true, other: true };
  }
  const left = extractSections(before);
  const right = extractSections(after);
  return {
    head: left.head !== right.head,
    aside: left.aside !== right.aside,
    header: left.header !== right.header,
    main: left.main !== right.main,
    footer: left.footer !== right.footer,
    other: left.other !== right.other,
  };
}
