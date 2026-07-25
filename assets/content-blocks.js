// Content-block layout rules, shared by preview.html, document.html, and translating.html's intro pages.
//
// Rule: a content-row's image + text are vertically centered by default. Once the text is
// taller than the 192px photo, the row switches to top-aligned instead (image and text both
// starting from the row's own top padding, with the extra text continuing down).
function layoutContentRows() {
  const PHOTO_HEIGHT = 192;
  document.querySelectorAll('.content-row').forEach((row) => {
    const textEl = row.querySelector('.content-row-text, .content-row-text-group, .content-row-text-lines');
    if (!textEl) return;
    row.classList.toggle('content-row--top', textEl.scrollHeight > PHOTO_HEIGHT);
  });
}

document.addEventListener('DOMContentLoaded', layoutContentRows);
window.addEventListener('resize', layoutContentRows);
