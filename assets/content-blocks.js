// Content-block layout rules, shared by preview.html, document.html, and translating.html's intro pages.
//
// Rule: a content-row's image + text are vertically centered by default. Once the text is
// taller than the 192px photo, the row switches to top-aligned instead (image and text both
// starting from the row's own top padding, with the extra text continuing down).
function layoutContentRows() {
  const PHOTO_HEIGHT = 192;
  document.querySelectorAll('.content-row').forEach((row) => {
    // Heading/sub-heading rows have no photo to compare text height against — this rule
    // doesn't apply to them. Neither does the cover page's title/image/intro, which never
    // sit side-by-side with a photo the way a normal content row does.
    if (row.classList.contains('content-row--heading') || row.classList.contains('content-row--subheading') || row.closest('.doc-cover')) return;
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
//
// A `.between-section` is a spacer/add-button bar, not content in its own right. Every row
// owns the between-section immediately after it as an atomic [row, trailing-between] group a
// page break never splits — this guarantees a page's last visible row always keeps its "+"
// underneath. Each authored page was originally built with its own leading AND trailing
// spacer, so flattening every page together leaves two spacers back to back at each old
// seam — genuine duplicates representing the same insertion point, not two separate ones —
// so the second of any such pair is discarded outright rather than kept (keeping both would
// mean two "+" controls stacked with no row between them). The one exception is a
// between-section at the very start of the whole document, which has nothing before it and
// becomes its own standalone leading group. Discarding the seam duplicates does mean most
// pages lose their own natural leading spacer once repagination runs; chunking (below)
// synthesizes a fresh one for any page that ends up without one, since every non-first page
// still needs a leading "+" that also serves as its top margin.
function groupContentItems(items) {
  const groups = [];
  let i = 0;

  if (items[i] && items[i].matches('.between-section')) {
    groups.push([items[i]]);
    i += 1;
  }

  while (i < items.length) {
    const item = items[i];
    if (item.matches('.between-section')) {
      item.remove();
      i += 1;
      continue;
    }
    const group = [item];
    i += 1;
    if (i < items.length && items[i].matches('.between-section')) {
      group.push(items[i]);
      i += 1;
    }
    groups.push(group);
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
  const pageRect = contentPages[0].getBoundingClientRect();
  const pageStyle = getComputedStyle(contentPages[0]);
  const fullHeight = pageRect.height
    - parseFloat(pageStyle.paddingTop) - parseFloat(pageStyle.paddingBottom);

  // .doc-page-num sits absolutely positioned near the bottom-left corner and must stay a
  // safe, empty margin — a row's own content should never grow tall enough to run into it.
  // Measured live (distance from the page's bottom edge up to the page number's top edge,
  // plus a small gap) rather than hardcoded, so it stays correct if that styling changes.
  const pageNumEl = contentPages[0].querySelector('.doc-page-num');
  const SAFE_GAP = 8;
  const reservedForPageNum = pageNumEl
    ? (pageRect.bottom - pageNumEl.getBoundingClientRect().top) + SAFE_GAP
    : 0;
  const rowCapacity = fullHeight - reservedForPageNum;

  const buckets = [[]];
  let rowHeightSoFar = 0;
  let totalHeightSoFar = 0;
  groups.forEach((group) => {
    const rowEl = group.find((el) => el.matches('.content-row'));
    const rowHeight = rowEl ? rowEl.getBoundingClientRect().height : 0;
    const groupHeight = group.reduce((sum, el) => sum + el.getBoundingClientRect().height, 0);

    // Two thresholds, checked together. (1) Rows alone must stay within rowCapacity, which
    // already excludes the page-number margin — a between-section's own height never counts
    // against this, since a single spacer is safe to sit in that reserved margin regardless
    // of which page it lands on (counting it here is what made the first content page fit
    // one fewer row than every other page, for no visible reason). (2) But spacers still
    // take up real, physical space on the page, and a shorter row (e.g. an image-less
    // heading) can free up enough of the row budget to let an *entire extra [row, between]
    // group* squeeze in — at which point the accumulated "free" spacer weight is no longer
    // one small margin overrun, it's real overflow past the page's actual height. totalHeight
    // is the hard ceiling that catches that case.
    const rowWouldExceedRowCapacity = rowHeight > 0 && rowHeightSoFar > 0 && rowHeightSoFar + rowHeight > rowCapacity;
    const totalWouldExceedFullHeight = totalHeightSoFar > 0 && totalHeightSoFar + groupHeight > fullHeight;
    // A heading added via the "+" at the top of a page is marked data-page-break-before —
    // it must start a fresh page even when there's physically room to pull it onto the tail
    // of the current one. Only forces a break if the current bucket already has something in
    // it; if the bucket's still empty, this row is already about to start a page on its own.
    const forcesPageBreak = !!(rowEl && rowEl.dataset.pageBreakBefore === 'true' && buckets[buckets.length - 1].length > 0);
    if (rowWouldExceedRowCapacity || totalWouldExceedFullHeight || forcesPageBreak) {
      buckets.push([]);
      rowHeightSoFar = 0;
      totalHeightSoFar = 0;
    }
    buckets[buckets.length - 1].push(...group);
    rowHeightSoFar += rowHeight;
    totalHeightSoFar += groupHeight;
  });

  // Every non-first page needs its own leading spacer — it's both the "+" control at that
  // point and the page's top margin, so rows never butt straight against the top edge.
  // groupContentItems discards the genuine duplicate spacer at each old page seam (rather
  // than leaving two "+" controls stacked with no row between them), which means most pages
  // land here without one; a fresh one (cloned from any existing between-section, so it
  // matches exactly) is synthesized for whichever page needs it.
  const spacerTemplate = groups.flat().find((el) => el.matches('.between-section'));
  buckets.forEach((bucket, i) => {
    if (i === 0 || bucket.length === 0 || bucket[0].matches('.between-section') || !spacerTemplate) return;
    const spacer = spacerTemplate.cloneNode(true);
    const img = spacer.querySelector('img');
    if (img) img.setAttribute('alt', 'Add block at top');
    bucket.unshift(spacer);
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
