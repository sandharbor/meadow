(function () {
  'use strict';
  var activeFrame = null;
  var previousFocus = null;
  function closeMenus() {
    document.querySelectorAll('.meadow-media-menu').forEach(function (menu) { menu.hidden = true; });
    document.querySelectorAll('.meadow-media-menu-button').forEach(function (button) { button.setAttribute('aria-expanded', 'false'); });
  }
  function setFullscreen(frame, enabled) {
    if (enabled && activeFrame) setFullscreen(activeFrame, false);
    if (enabled) {
      previousFocus = document.activeElement;
      frame.meadowPlaceholder = document.createComment('media fullscreen');
      frame.parentNode.insertBefore(frame.meadowPlaceholder, frame);
      document.body.appendChild(frame);
    } else if (frame.meadowPlaceholder) {
      frame.meadowPlaceholder.replaceWith(frame);
      frame.meadowPlaceholder = null;
    }
    frame.classList.toggle('is-fullscreen', enabled);
    document.body.classList.toggle('meadow-media-fullscreen-open', enabled);
    var button = frame.querySelector('.meadow-media-fullscreen');
    if (!button.meadowFullscreenIcon) button.meadowFullscreenIcon = button.innerHTML;
    button.innerHTML = enabled ? '×' : button.meadowFullscreenIcon;
    button.setAttribute('aria-expanded', String(enabled));
    button.setAttribute('aria-label', enabled ? 'Close media fullscreen' : 'Open media fullscreen');
    button.setAttribute('title', enabled ? 'Close fullscreen' : 'Open fullscreen');
    if (enabled) {
      activeFrame = frame;
      frame.setAttribute('role', 'dialog');
      frame.setAttribute('aria-modal', 'true');
      frame.setAttribute('aria-label', 'Media fullscreen');
      button.focus();
    } else {
      activeFrame = null;
      frame.removeAttribute('role'); frame.removeAttribute('aria-modal'); frame.removeAttribute('aria-label');
      if (previousFocus) previousFocus.focus();
    }
  }
  function init() {
    document.querySelectorAll('.meadow-media-frame').forEach(function (frame) {
      frame.querySelector('.meadow-media-fullscreen').addEventListener('click', function () { setFullscreen(frame, !frame.classList.contains('is-fullscreen')); });
      var menuButton = frame.querySelector('.meadow-media-menu-button');
      if (menuButton) menuButton.addEventListener('click', function () {
        var menu = frame.querySelector('.meadow-media-menu');
        var open = menu.hidden;
        closeMenus(); menu.hidden = !open; menuButton.setAttribute('aria-expanded', String(open));
        if (open) menu.querySelector('a').focus();
      });
    });
    document.addEventListener('click', function (event) { if (!event.target.closest('.meadow-media-toolbar')) closeMenus(); });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        var openMenu = document.querySelector('.meadow-media-menu:not([hidden])');
        if (openMenu) { var button = openMenu.parentElement.querySelector('.meadow-media-menu-button'); closeMenus(); button.focus(); }
        else if (activeFrame) setFullscreen(activeFrame, false);
      }
      if (event.key === 'Tab' && activeFrame) {
        var focusable = Array.prototype.filter.call(activeFrame.querySelectorAll('button, a[href], audio[controls], video[controls]'), function (element) { return element.getClientRects().length > 0; });
        var first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
