/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { isAudioFileType, isVideoFileType } from '../../../../../../../shared_code/utils/fileTypeUtils.js';
import { titleAttribute } from './markedLinks.js';
import { escapeHtmlAttribute, imageSizeStyle } from './shared.js';

const fullscreenIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>';
const pageIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7m0-7L10 14M10 5H3v16h16v-7"/></svg>';
const downloadIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M3 16v5h18v-5"/></svg>';

/** Shared actions for embedded files and their dedicated pages. All URLs are supplied by generation. */
export function mediaFrameHtml(args: {
  fileType: string; src: string; alt?: string; size?: string; title?: string | null;
  pageHref?: string | null; standalone?: boolean; contentHtml?: string;
}): string {
  const { fileType, size, standalone } = args;
  const src = escapeHtmlAttribute(args.src);
  const alt = escapeHtmlAttribute(args.alt ?? '');
  const kind = isAudioFileType(fileType) ? 'audio' : isVideoFileType(fileType) ? 'video' : 'image';
  const content = args.contentHtml ?? (kind === 'audio'
    ? `<audio controls preload="metadata" src="${src}"></audio>`
    : kind === 'video'
      ? `<video controls playsinline preload="metadata" src="${src}"${imageSizeStyle(size)}${titleAttribute(args.title)}></video>`
      : `<img src="${src}" alt="${alt}"${imageSizeStyle(size)}${titleAttribute(args.title)}>`);
  const pageLink = args.pageHref
    ? `<a class="meadow-media-page-link" href="${escapeHtmlAttribute(args.pageHref)}" aria-label="Go to page" title="Go to page">${pageIcon}<span class="meadow-media-action-text">Go to page</span></a>`
    : '';
  const navigation = standalone
    ? `<a href="${src}" download class="meadow-media-download" aria-label="Download media" title="Download media">${downloadIcon}</a>`
    : kind === 'image' ? pageLink
      : pageLink ? `<button type="button" class="meadow-media-menu-button" aria-label="Media actions" aria-haspopup="menu" aria-expanded="false">⋮</button><span class="meadow-media-menu" role="menu" hidden>${pageLink.replace('class="', 'role="menuitem" class="')}</span>` : '';
  const frameStyle = fileType === 'svg' && !standalone
    ? size ? imageSizeStyle(size).replace('max-width:', 'width:') : ' style="width: 100%"' : '';
  const tag = standalone ? 'div' : 'span';
  return `<${tag} class="meadow-media-frame meadow-media-${kind}${standalone ? ' meadow-media-page' : ''}" data-media-kind="${fileType}"${frameStyle}>${content}<span class="meadow-media-toolbar"><button type="button" class="meadow-media-fullscreen" aria-label="Open media fullscreen" title="Open fullscreen" aria-expanded="false">${fullscreenIcon}</button>${navigation}</span></${tag}>`;
}
