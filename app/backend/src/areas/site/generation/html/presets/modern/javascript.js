/* eslint-disable */
// This script inserts a pipe separator between consecutive links in paragraphs
document.addEventListener('DOMContentLoaded', function() {
    const content = document.querySelector('main');
    const paragraphs = content.getElementsByTagName('p');
    
    for (let i = 0; i < paragraphs.length; i++) {
        const paragraph = paragraphs[i];
        const links = Array.from(paragraph.getElementsByTagName('a')).filter(link => !link.classList.contains('block-anchor'));
        
        for (let j = 1; j < links.length; j++) {
            const previousLink = links[j - 1];
            const currentLink = links[j];
            
            let onlyWhitespaceBetween = true;
            let node = previousLink.nextSibling;
            while (node && node !== currentLink) {
                if (node.nodeType === Node.TEXT_NODE) {
                    const textContent = node.textContent;
                    if (textContent.trim() !== '') {
                        onlyWhitespaceBetween = false;
                        break;
                    }
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    onlyWhitespaceBetween = false;
                    break;
                }
                node = node.nextSibling;
            }
            
            if (onlyWhitespaceBetween) {
                const separator = document.createElement('span');
                separator.textContent = ' | ';
                separator.style.color = 'inherit';
                separator.style.padding = '0 4px';
                currentLink.parentNode.insertBefore(separator, currentLink);
            }
        }
    }
});

function highlightAnchorBlock() {
    const hash = window.location.hash;
    if (hash) {
        const anchorElement = document.querySelector(hash);
        if (anchorElement) {
            var elementToHighlight = null;

            const parentElement = anchorElement.parentElement;
            if (parentElement && (parentElement.tagName === 'P')) {
                // The anchor is in a paragraph
                elementToHighlight = parentElement;
            }
            if (!elementToHighlight) {
                // The anchor is in a list
                const grandParentElement = anchorElement.parentElement.parentElement;
                if (grandParentElement && (grandParentElement.tagName === 'UL' || grandParentElement.tagName === 'OL')) {
                    elementToHighlight = grandParentElement;
                }
            }
            if (elementToHighlight) {
                elementToHighlight.style.backgroundColor = 'rgba(255, 165, 0, 0.1)'; // Light orange background
                elementToHighlight.style.transition = 'background-color 0.3s ease'; // Smooth transition effect
                
                // Scroll to the highlighted paragraph
                elementToHighlight.scrollIntoView({ behavior: 'smooth', block: 'start' });
                // Scroll the page up a bit to position the element on-screen but not at the top
                setTimeout(() => {
                    const viewportHeight = window.innerHeight;
                    const offset = viewportHeight * 0.1; // 10% of viewport height
                    const elementPosition = elementToHighlight.getBoundingClientRect().top;
                    const offsetPosition = elementPosition - offset;
                    
                    window.scrollBy({
                        top: offsetPosition,
                        behavior: 'smooth'
                    });
                }, 100); // Small delay to ensure scrolling happens after the initial scroll
            }
        }
    }
}

// Run the highlight function when the document is fully loaded
document.addEventListener('DOMContentLoaded', function() {
    highlightAnchorBlock();
});

// Also run the highlight function when the hash changes (for single-page applications)
window.addEventListener('hashchange', highlightAnchorBlock);

document.addEventListener('DOMContentLoaded', function() {
    var markdownDownloadLinks = document.querySelectorAll('.markdown-zip-download[data-markdown-zip-manifest-url]');
    if (!markdownDownloadLinks.length) return;

    var manifestCache = {};

    function fetchManifest(manifestUrl) {
        if (!manifestCache[manifestUrl]) {
            manifestCache[manifestUrl] = fetch(manifestUrl, { cache: 'no-store' })
                .then(function(response) {
                    if (!response.ok) {
                        throw new Error('Failed to load markdown export manifest');
                    }
                    return response.json();
                });
        }
        return manifestCache[manifestUrl];
    }

    function startDownload(downloadUrl, downloadName) {
        var tempLink = document.createElement('a');
        tempLink.href = downloadUrl;
        tempLink.download = downloadName;
        document.body.appendChild(tempLink);
        tempLink.click();
        document.body.removeChild(tempLink);
    }

    for (var i = 0; i < markdownDownloadLinks.length; i++) {
        (function(link) {
            link.addEventListener('click', function(event) {
                event.preventDefault();

                var manifestUrl = link.getAttribute('data-markdown-zip-manifest-url');
                if (!manifestUrl) return;

                fetchManifest(manifestUrl)
                    .then(function(manifest) {
                        if (!manifest || !manifest.zipFilename) {
                            throw new Error('Missing markdown export zip filename');
                        }

                        var resolvedManifestUrl = new URL(manifestUrl, window.location.href);
                        var downloadUrl = new URL(manifest.zipFilename, resolvedManifestUrl).toString();
                        startDownload(downloadUrl, manifest.zipFilename);
                    })
                    .catch(function() {
                        link.title = 'Markdown export is unavailable';
                    });
            });
        })(markdownDownloadLinks[i]);
    }
});
