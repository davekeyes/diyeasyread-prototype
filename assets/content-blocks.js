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

// Rule: content blocks (.between-section / .content-row, inside .doc-content) flow across
// pages based on their actual rendered height against a page's fixed A4-representative
// capacity. Grown content pushes the lowest block onto the next page, cascading forward as
// far as needed (creating new pages if the existing ones run out); shrunk content pulls
// later blocks back up, removing any trailing page left empty. This is a full recompute
// (flatten every content page's children into one ordered list, then re-chunk it from
// scratch) rather than an incremental push/pull, so the same logic handles both directions
// and any number of cascading pages correctly.
// A `.between-section` is a spacer/add-button bar, not content in its own right — it
// should never end up alone at the top of a page, separated from the row it introduces.
// Group each between-section with the content-row immediately after it (a trailing
// between-section with no following row, i.e. the "add block at bottom" spacer on the
// last row, joins the previous group instead) so a page break only ever falls between
// groups, never inside one.
function groupContentItems(items) {
  const groups = [];
  let i = 0;
  while (i < items.length) {
    const group = [];
    if (items[i].matches('.between-section')) {
      group.push(items[i]);
      i += 1;
    }
    if (i < items.length && !items[i].matches('.between-section')) {
      group.push(items[i]);
      i += 1;
    }
    groups.push(group);
  }
  const last = groups[groups.length - 1];
  if (groups.length > 1 && last.length === 1 && last[0].matches('.between-section')) {
    groups[groups.length - 2].push(...last);
    groups.pop();
  }
  return groups;
}

function repaginateContentPages() {
  const allPages = Array.from(document.querySelectorAll('.doc-page'));
  let contentPages = allPages.filter((p) => p.querySelector(':scope > .doc-content'));
  if (contentPages.length === 0) return;

  const items = [];
  contentPages.forEach((page) => {
    const content = page.querySelector(':scope > .doc-content');
    Array.from(content.children).forEach((child) => items.push(child));
  });
  const groups = groupContentItems(items);

  // Measured from the page shell, not from .doc-content itself: .doc-content is a flex
  // item with the default `min-height: auto`, so it grows to fit its own children when
  // they overflow rather than staying pinned to the page's fixed height. The shell
  // (.doc-page) has an explicit CSS height and clips overflow, so it stays the true,
  // stable A4-representative size regardless of how much content is currently inside it.
  const pageStyle = getComputedStyle(contentPages[0]);
  const capacity = contentPages[0].getBoundingClientRect().height
    - parseFloat(pageStyle.paddingTop) - parseFloat(pageStyle.paddingBottom);

  const buckets = [[]];
  let currentHeight = 0;
  groups.forEach((group) => {
    const h = group.reduce((sum, item) => sum + item.getBoundingClientRect().height, 0);
    if (currentHeight > 0 && currentHeight + h > capacity) {
      buckets.push([]);
      currentHeight = 0;
    }
    buckets[buckets.length - 1].push(...group);
    currentHeight += h;
  });

  // Create additional content pages if needed, cloning the shell of the last one
  let insertAfter = contentPages[contentPages.length - 1];
  while (contentPages.length < buckets.length) {
    const newPage = insertAfter.cloneNode(true);
    newPage.querySelector(':scope > .doc-content').innerHTML = '';
    insertAfter.insertAdjacentElement('afterend', newPage);
    contentPages.push(newPage);
    insertAfter = newPage;
  }

  // Remove now-unneeded trailing pages
  while (contentPages.length > buckets.length) {
    contentPages.pop().remove();
  }

  // Move items into their bucket's page (appendChild re-parents existing nodes, doesn't clone)
  buckets.forEach((bucket, i) => {
    const content = contentPages[i].querySelector(':scope > .doc-content');
    bucket.forEach((item) => content.appendChild(item));
  });

  // Renumber sequentially — offset by 1 if the very first page overall is a cover
  const hasCover = !!(allPages[0] && allPages[0].querySelector('.doc-cover'));
  let num = hasCover ? 2 : 1;
  contentPages.forEach((page) => {
    const numEl = page.querySelector('.doc-page-num');
    if (numEl) numEl.textContent = String(num);
    num += 1;
  });
}
window.repaginateContentPages = repaginateContentPages;

function relayoutAll() {
  layoutContentRows();
  repaginateContentPages();
}
window.relayoutAll = relayoutAll;

document.addEventListener('DOMContentLoaded', relayoutAll);
window.addEventListener('resize', layoutContentRows);

// Future content-block editing can dispatch this event on `document` after any change
// (text edited, image swapped, block added/removed) instead of calling the layout
// functions directly — keeps the editing code decoupled from this module's internals.
document.addEventListener('contentblocks:changed', relayoutAll);
