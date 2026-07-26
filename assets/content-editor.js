// Content block editor: in-page inline editing for .content-row blocks (text/heading/
// subheading rows), plus an add-block menu and an image-picker popover. Loaded by pages that
// allow editing (document.html; translating.html in a later pass) — never by preview.html,
// which stays structurally read-only by simply not loading this file.
//
// Data model per block, persisted to localStorage on Save:
//   Text row:    { id, type: 'text', paragraphs: [...], image: {src, alt}, explanations: [...], updatedAt }
//   Heading row: { id, type: 'heading' | 'subheading', text, updatedAt }
// paragraphs: [{ type:'p', text, boldRanges:[[start,end],...] } | { type:'ul', items:[{text,boldRanges}] }]
// boldRanges are character offsets into a unit's own text marking defined terms — kept
// separate from the text itself (not inline markup) so there's nothing to parse at render
// time and no risk of markdown characters leaking into the editor.
(function () {
  const docId = (document.querySelector('[data-doc-id]') || {}).dataset ? document.querySelector('[data-doc-id]').dataset.docId : 'default';
  const STORAGE_KEY = `diyer:blocks:${docId}`;

  const IMAGE_BANK = [
    { src: 'assets/img/dorothy/dorothy-93-with-carer.png', alt: 'Photo: Dorothy, 93, with her family carer', keywords: 'dorothy carer age' },
    { src: 'assets/img/dorothy/woman-holding-late-husband-photo.png', alt: 'Photo: a woman holding a photo of her late husband', keywords: 'husband widow photo' },
    { src: 'assets/img/dorothy/dorothy-and-family-outside-house.png', alt: 'Photo: Dorothy and her family outside her house', keywords: 'family house outside' },
    { src: 'assets/img/dorothy/dorothy-sitting-in-armchair.png', alt: 'Photo: Dorothy sitting in her armchair at home', keywords: 'armchair independent home' },
    { src: 'assets/img/dorothy/dorothy-and-late-husband-outside-house.png', alt: 'Photo: Dorothy and her late husband outside their house', keywords: 'husband house outside' },
    { src: 'assets/img/dorothy/house-dorothy-raised-family-in.png', alt: 'Photo: the house Dorothy raised her family in', keywords: 'house family raised' },
    { src: 'assets/img/dorothy/man-gardening.png', alt: 'Photo: a man gardening', keywords: 'gardening garden man' },
    { src: 'assets/img/dorothy/woman-holding-family-photo.png', alt: 'Photo: a woman holding a family photo', keywords: 'family photo love' },
    { src: 'assets/img/dorothy/dorothys-four-children.png', alt: "Photo: Dorothy's four children", keywords: 'children four family' },
    { src: 'assets/img/dorothy/family-meal-with-grandchildren.png', alt: 'Photo: a family meal with grandchildren', keywords: 'grandchildren meal family' },
    { src: 'assets/img/dorothy/dorothy-with-great-grandchildren.png', alt: 'Photo: Dorothy in her armchair with great grandchildren', keywords: 'great grandchildren armchair' },
    { src: 'assets/img/dorothy/dorothy-looking-confused-eating.png', alt: 'Photo: Dorothy looking confused while eating', keywords: 'dementia confused eating' },
    { src: 'assets/img/dorothy/stovetop-oven.png', alt: 'Photo: a stovetop oven', keywords: 'stove oven cooking fire' },
    { src: 'assets/img/dorothy/dorothy-looking-confused-cooking.png', alt: 'Photo: Dorothy looking confused while cooking', keywords: 'confused cooking forgot' },
    { src: 'assets/img/dorothy/pot-left-burning-on-stove.png', alt: 'Photo: a pot left burning on the stove', keywords: 'pot burning stove fire' },
    { src: 'assets/img/dorothy/carer-helping-with-medication.png', alt: 'Photo: a carer helping Dorothy with her medication', keywords: 'medication carer skipping' },
  ];

  // ---------- localStorage ----------

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveBlockToStore(block) {
    const store = loadStore();
    store[block.id] = block;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (e) {
      // Quota exceeded (a large uploaded photo, most likely) or storage unavailable — the edit
      // still applies to the DOM for this session, it just won't survive a reload.
      console.warn('Could not save block edit to localStorage:', e);
    }
  }

  // Deleting a block only removes it from the live DOM and the edit store — the block's
  // markup still exists in the static HTML, so a plain reload would silently bring it right
  // back. A separate tombstone list, applied after every edit-patch pass in
  // patchRowsFromStorage(), is what makes a deletion actually stick.
  const DELETED_KEY = `${STORAGE_KEY}:deleted`;

  function loadDeletedIds() {
    try {
      const raw = localStorage.getItem(DELETED_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function markBlockDeleted(id) {
    const deleted = loadDeletedIds();
    if (!deleted.includes(id)) deleted.push(id);
    try {
      localStorage.setItem(DELETED_KEY, JSON.stringify(deleted));
    } catch (e) {
      console.warn('Could not persist block deletion:', e);
    }
  }

  // ---------- DOM <-> inline text model (a single paragraph or list item's own content) ----------

  function domToTextModel(containerEl) {
    let text = '';
    const boldRanges = [];
    let boldStart = null;

    function walk(node, insideStrong) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (insideStrong && boldStart === null) boldStart = text.length;
        if (!insideStrong && boldStart !== null) {
          boldRanges.push([boldStart, text.length]);
          boldStart = null;
        }
        text += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const isStrong = node.tagName === 'STRONG';
        Array.from(node.childNodes).forEach((child) => walk(child, insideStrong || isStrong));
      }
    }
    Array.from(containerEl.childNodes).forEach((child) => walk(child, false));
    if (boldStart !== null) boldRanges.push([boldStart, text.length]);
    return { text, boldRanges };
  }

  function renderTextWithBold(text, boldRanges) {
    const frag = document.createDocumentFragment();
    const sorted = boldRanges.slice().sort((a, b) => a[0] - b[0]);
    let pos = 0;
    sorted.forEach(([start, end]) => {
      if (start > pos) frag.appendChild(document.createTextNode(text.slice(pos, start)));
      const strong = document.createElement('strong');
      strong.textContent = text.slice(start, end);
      frag.appendChild(strong);
      pos = end;
    });
    if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
    return frag;
  }

  function boldFirstOccurrence(text, term) {
    const frag = document.createDocumentFragment();
    const idx = term ? text.toLowerCase().indexOf(term.toLowerCase()) : -1;
    if (idx === -1) {
      frag.appendChild(document.createTextNode(text));
      return frag;
    }
    if (idx > 0) frag.appendChild(document.createTextNode(text.slice(0, idx)));
    const strong = document.createElement('strong');
    strong.textContent = text.slice(idx, idx + term.length);
    frag.appendChild(strong);
    if (idx + term.length < text.length) frag.appendChild(document.createTextNode(text.slice(idx + term.length)));
    return frag;
  }

  // ---------- DOM <-> paragraphs model (a text block's whole content: paragraphs + lists) ----------

  function domToParagraphsModel(blockEls) {
    return blockEls.map((el) => {
      if (el.tagName === 'UL') {
        return {
          type: 'ul',
          items: Array.from(el.children).filter((li) => li.tagName === 'LI').map((li) => domToTextModel(li)),
        };
      }
      return Object.assign({ type: 'p' }, domToTextModel(el));
    });
  }

  function renderParagraphsToDom(paragraphs) {
    const frag = document.createDocumentFragment();
    paragraphs.forEach((para) => {
      if (para.type === 'ul') {
        const ul = document.createElement('ul');
        para.items.forEach((item) => {
          const li = document.createElement('li');
          li.appendChild(renderTextWithBold(item.text, item.boldRanges));
          ul.appendChild(li);
        });
        frag.appendChild(ul);
      } else {
        const p = document.createElement('p');
        p.appendChild(renderTextWithBold(para.text, para.boldRanges));
        frag.appendChild(p);
      }
    });
    return frag;
  }

  // Chrome's execCommand('insertUnorderedList') wraps the resulting <ul> inside the
  // paragraph it was applied to (<p><ul>...</ul></p>) instead of replacing that paragraph,
  // which isn't valid block nesting and isn't a shape domToParagraphsModel expects (it only
  // looks at the text host's direct children). Hoist any such <ul>/<ol> out to be a direct
  // child of the host itself, discarding the now-empty wrapping paragraph.
  function normalizeTextHost(host) {
    Array.from(host.querySelectorAll('p > ul, p > ol')).forEach((list) => {
      const wrapper = list.parentElement;
      if (wrapper.parentElement === host) wrapper.replaceWith(list);
    });

    // Native contenteditable edits (e.g. Backspace merging content across a list boundary)
    // can leave stray top-level nodes that are neither <p> nor <ul> — a bare <div>, a loose
    // text node, a trailing <br>. commitActiveText only reads <p>/<ul> children, so anything
    // else used to be silently dropped — losing that text on the next Save, and, via
    // syncExplanationsWithBoldTerms, any explanation tied to a bolded term inside it. Wrap any
    // run of such nodes into a <p> instead of losing them.
    let runP = null;
    Array.from(host.childNodes).forEach((node) => {
      const isValidBlock = node.nodeType === Node.ELEMENT_NODE && (node.tagName === 'P' || node.tagName === 'UL');
      if (isValidBlock) { runP = null; return; }
      if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR' && !node.nextSibling) { node.remove(); return; }
      if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim() && !runP) { node.remove(); return; }
      if (!runP) {
        runP = document.createElement('p');
        host.insertBefore(runP, node);
      }
      runP.appendChild(node);
    });
  }

  // Every {text, boldRanges} unit across all paragraphs and list items, in document order —
  // the flat view bold-term tracking and search prefill work against.
  function allTextUnits(block) {
    const units = [];
    block.paragraphs.forEach((para) => {
      if (para.type === 'ul') para.items.forEach((item) => units.push(item));
      else units.push(para);
    });
    return units;
  }

  function plainTextOf(block) {
    return allTextUnits(block).map((u) => u.text).join(' ');
  }

  function boldTermsOf(block) {
    const terms = [];
    allTextUnits(block).forEach((unit) => {
      unit.boldRanges.forEach(([start, end]) => terms.push(unit.text.slice(start, end)));
    });
    return terms;
  }

  // Keeps `explanations` structurally in sync with the current bold terms: a term that's no
  // longer bold loses its explanation, a newly-bolded term gets a blank one to fill in. This
  // enforces "a bolded word always has an explanation" as a rule of the data, not just a
  // convention the UI has to remember to honor. Explanations with no term at all (added
  // standalone, not tied to any bolded word — not every piece of key information relates to
  // a highlighted word) are left untouched here; only term-linked entries get reconciled.
  function syncExplanationsWithBoldTerms(block) {
    const terms = boldTermsOf(block);
    const kept = block.explanations.filter((ex) => ex.term === '' || terms.includes(ex.term));
    const keptTerms = kept.filter((ex) => ex.term !== '').map((ex) => ex.term);
    terms.forEach((term) => {
      if (!keptTerms.includes(term)) {
        kept.push({ term, definition: '' });
        keptTerms.push(term);
      }
    });
    block.explanations = kept;
  }

  // ---------- Reading/writing a block against its .content-row ----------

  function getTextBlockEls(rowEl) {
    const bare = rowEl.querySelector(':scope > .content-row-text');
    if (bare) return [bare];
    const group = rowEl.querySelector(':scope > .content-row-text-group, :scope > .content-row-text-lines');
    if (!group) return [];
    return Array.from(group.children).filter((el) => el.tagName === 'P' || el.tagName === 'UL');
  }

  function readExplanationsFromRow(rowEl) {
    return Array.from(rowEl.querySelectorAll('.content-definition')).map((def) => {
      const span = def.querySelector('span:not(.content-definition-emoji)');
      return { term: def.dataset.term || '', definition: span ? span.textContent : '' };
    });
  }

  function isHeadingRow(rowEl) {
    return rowEl.matches('.content-row--heading, .content-row--subheading');
  }

  function readBlockFromRow(rowEl) {
    if (isHeadingRow(rowEl)) {
      const headingEl = rowEl.querySelector('.content-row-heading-text');
      return {
        id: rowEl.dataset.blockId,
        type: rowEl.classList.contains('content-row--heading') ? 'heading' : 'subheading',
        text: headingEl ? headingEl.textContent : '',
        updatedAt: new Date().toISOString(),
      };
    }
    const img = rowEl.querySelector('.content-row-photo');
    return {
      id: rowEl.dataset.blockId,
      type: 'text',
      paragraphs: domToParagraphsModel(getTextBlockEls(rowEl)),
      image: { src: img ? img.getAttribute('src') : '', alt: img ? img.getAttribute('alt') : '' },
      explanations: readExplanationsFromRow(rowEl),
      updatedAt: new Date().toISOString(),
    };
  }

  function writeBlockToDom(block) {
    const rowEl = document.querySelector(`.content-row[data-block-id="${block.id}"]`);
    if (!rowEl) return;

    if (block.type === 'heading' || block.type === 'subheading') {
      const headingEl = rowEl.querySelector('.content-row-heading-text');
      if (headingEl) headingEl.textContent = block.text;
      return;
    }

    const img = rowEl.querySelector('.content-row-photo');
    if (block.image.src) {
      if (img && img.tagName === 'IMG') {
        img.setAttribute('src', block.image.src);
        img.setAttribute('alt', block.image.alt || '');
      } else if (img) {
        // translating.html's placeholder rows use a bare <div class="content-row-photo
        // content-row-photo--placeholder"> with no <img> at all — replace it with a real one.
        const freshImg = document.createElement('img');
        freshImg.className = img.className.replace('content-row-photo--placeholder', '').trim();
        freshImg.setAttribute('src', block.image.src);
        freshImg.setAttribute('alt', block.image.alt || '');
        img.replaceWith(freshImg);
      }
    }

    // Includes .content-row-edit-body so this correctly replaces the live edit surface
    // (toolbar + contenteditable + explanations) when called on exit, not just the normal
    // static text host.
    const existingTextHost = rowEl.querySelector(':scope > .content-row-text, :scope > .content-row-text-group, :scope > .content-row-text-lines, :scope > .content-row-edit-body');

    const isSimple = block.paragraphs.length === 1 && block.paragraphs[0].type === 'p' && block.explanations.length === 0;
    let newTextHost;
    if (isSimple) {
      const p = document.createElement('p');
      p.className = 'content-row-text';
      p.appendChild(renderTextWithBold(block.paragraphs[0].text, block.paragraphs[0].boldRanges));
      newTextHost = p;
    } else {
      newTextHost = document.createElement('div');
      newTextHost.className = 'content-row-text-group';
      newTextHost.appendChild(renderParagraphsToDom(block.paragraphs));
      block.explanations.forEach((ex) => {
        const def = document.createElement('div');
        def.className = 'content-definition';
        // The term itself is stored here rather than only relying on the <strong> rendered
        // inside the definition text below — that <strong> only appears once boldFirstOccurrence
        // finds the term inside a filled-in definition, so a term with a still-blank definition
        // would otherwise be unrecoverable by readExplanationsFromRow on the next edit.
        def.dataset.term = ex.term;
        // A term-linked explanation (💡) reads as "here's what this bolded word means" —
        // misleading for a standalone note that isn't tied to any highlighted word, so those
        // get an info icon instead.
        if (ex.term) {
          const emoji = document.createElement('span');
          emoji.className = 'content-definition-emoji';
          emoji.innerHTML = '&#128161;';
          def.appendChild(emoji);
        } else {
          const icon = document.createElement('img');
          icon.className = 'content-definition-icon';
          icon.src = 'assets/icons/info.svg';
          icon.alt = '';
          icon.width = 24;
          icon.height = 24;
          def.appendChild(icon);
        }
        const span = document.createElement('span');
        span.appendChild(boldFirstOccurrence(ex.definition, ex.term));
        def.appendChild(span);
        newTextHost.appendChild(def);
      });
    }

    if (existingTextHost) {
      existingTextHost.replaceWith(newTextHost);
    } else {
      // A freshly-inserted block (via the add-menu) has no text host yet — insert one
      // before the edit button rather than treating this as an error.
      const editBtn = rowEl.querySelector('.edit-btn');
      rowEl.insertBefore(newTextHost, editBtn);
    }
  }

  function patchRowsFromStorage() {
    const store = loadStore();
    Object.keys(store).forEach((id) => writeBlockToDom(store[id]));
    loadDeletedIds().forEach((id) => {
      const rowEl = document.querySelector(`.content-row[data-block-id="${id}"]`);
      if (rowEl) removeBlockFromDom(rowEl);
    });
  }

  // ---------- Inline edit state machine ----------

  let activeRowEl = null;
  let workingCopy = null;
  let originalSnapshot = null;
  let activeIsNewBlock = false;

  function commitActiveText() {
    const host = activeRowEl.querySelector('[data-row-text-host]');
    if (!host) return;
    normalizeTextHost(host);
    const blockEls = Array.from(host.children).filter((el) => el.tagName === 'P' || el.tagName === 'UL');
    workingCopy.paragraphs = domToParagraphsModel(blockEls);
    syncExplanationsWithBoldTerms(workingCopy);
  }

  function renderRowExplanations() {
    const container = activeRowEl.querySelector('[data-row-explanations]');
    if (!container) return;
    container.innerHTML = '';
    workingCopy.explanations.forEach((ex, i) => {
      const item = document.createElement('div');
      item.className = 'editor-explanation-item';

      // Label reads as just the term itself (bold) rather than "Add an explanation for
      // <term>" — a standalone explanation (no term) falls back to a generic "Explanation"
      // heading since there's no word to name.
      const header = document.createElement('div');
      header.className = 'editor-explanation-header';

      const termLabel = document.createElement('div');
      termLabel.className = 'editor-explanation-term';
      if (ex.term) {
        const strong = document.createElement('strong');
        strong.textContent = ex.term;
        termLabel.appendChild(strong);
      } else {
        termLabel.textContent = 'Explanation';
      }

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'editor-explanation-close';
      closeBtn.dataset.action = 'remove-explanation';
      closeBtn.dataset.explanationIndex = String(i);
      closeBtn.setAttribute('aria-label', ex.term ? `Remove explanation for "${ex.term}"` : 'Remove explanation');
      closeBtn.innerHTML = '<img src="assets/icons/close.svg" alt="" width="16" height="16">';

      header.appendChild(termLabel);
      header.appendChild(closeBtn);

      const textarea = document.createElement('textarea');
      textarea.className = 'field-input';
      textarea.rows = 2;
      textarea.value = ex.definition;
      textarea.dataset.explanationIndex = String(i);
      textarea.setAttribute('aria-label', `Explanation for "${ex.term}"`);

      item.appendChild(header);
      item.appendChild(textarea);
      container.appendChild(item);
    });
  }

  // Shared by both edit surfaces: Cancel/Save on the left, a "..." overflow trigger on the
  // right (Add a list / Add explanation / Delete section — the first two hidden for heading
  // rows, which support neither). Icons reuse the project's existing SVGs; check.svg is
  // inverted to read as white against the filled Save button, matching how .image-edit-trigger
  // already inverts its icon against a dark circular background elsewhere in this file's CSS.
  function buildActionsBar() {
    const actions = document.createElement('div');
    actions.className = 'row-editor-actions dialog-actions';
    actions.innerHTML = `
      <div class="row-editor-actions-left">
        <button type="button" class="btn btn-outlined" data-action="cancel-edit">Cancel <img class="btn-icon" src="assets/icons/close.svg" alt="" width="16" height="16"></button>
        <button type="button" class="btn btn-filled" data-action="save-edit">Save <img class="btn-icon icon-invert" src="assets/icons/check.svg" alt="" width="16" height="16"></button>
      </div>
      <button type="button" class="row-overflow-btn" data-action="toggle-overflow" aria-label="More options" aria-haspopup="true" aria-expanded="false">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="5" cy="12" r="2.2" fill="currentColor"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><circle cx="19" cy="12" r="2.2" fill="currentColor"/></svg>
      </button>
    `;
    return actions;
  }

  function buildTextEditSurface(rowEl) {
    const existingTextHost = rowEl.querySelector(':scope > .content-row-text, :scope > .content-row-text-group, :scope > .content-row-text-lines');

    const body = document.createElement('div');
    body.className = 'content-row-edit-body';

    const textHost = document.createElement('div');
    textHost.className = 'content-row-text-group editor-contenteditable';
    textHost.contentEditable = 'true';
    textHost.setAttribute('role', 'textbox');
    textHost.setAttribute('aria-multiline', 'true');
    textHost.setAttribute('aria-label', 'Block text');
    textHost.setAttribute('data-row-text-host', '');
    textHost.appendChild(renderParagraphsToDom(workingCopy.paragraphs));

    const explanations = document.createElement('div');
    explanations.className = 'editor-explanation-list';
    explanations.setAttribute('data-row-explanations', '');

    body.appendChild(textHost);
    body.appendChild(explanations);
    body.appendChild(buildActionsBar());

    if (existingTextHost) existingTextHost.replaceWith(body);
    else rowEl.insertBefore(body, rowEl.querySelector('.edit-btn'));

    renderRowExplanations();
    textHost.focus();
  }

  function buildHeadingEditSurface(rowEl) {
    const headingEl = rowEl.querySelector('.content-row-heading-text');
    headingEl.contentEditable = 'true';
    headingEl.setAttribute('data-row-text-host', '');

    rowEl.insertBefore(buildActionsBar(), rowEl.querySelector('.edit-btn'));
    headingEl.focus();
  }

  function enterEditMode(rowEl, isNew) {
    if (activeRowEl && activeRowEl !== rowEl) exitEditMode('save');
    if (activeRowEl === rowEl) return;
    closeImagePopover();
    closeAddMenu();
    closeOverflowMenu();

    activeRowEl = rowEl;
    activeIsNewBlock = !!isNew;
    workingCopy = readBlockFromRow(rowEl);
    originalSnapshot = JSON.parse(JSON.stringify(workingCopy));
    rowEl.classList.add('is-editing');

    if (isHeadingRow(rowEl)) buildHeadingEditSurface(rowEl);
    else buildTextEditSurface(rowEl);
  }

  // Shared by "cancel a just-inserted block" and "delete an existing one" — both need to
  // remove the row plus its trailing spacer so the "every row owns exactly one trailing
  // between-section" invariant repagination relies on stays intact.
  function removeBlockFromDom(rowEl) {
    const trailingBetween = rowEl.nextElementSibling;
    if (trailingBetween && trailingBetween.matches('.between-section')) trailingBetween.remove();
    rowEl.remove();
  }

  function clearActiveEditState() {
    activeRowEl = null;
    workingCopy = null;
    originalSnapshot = null;
    activeIsNewBlock = false;
  }

  function exitEditMode(mode) {
    if (!activeRowEl) return;
    const rowEl = activeRowEl;

    // Cancelling a block that was just inserted (never actually saved before) removes it
    // outright rather than "reverting" to its own placeholder content — there's nothing
    // meaningful to revert to, and leaving placeholder text like "New heading" sitting in
    // the document would look like a stray, broken block.
    if (mode === 'cancel' && activeIsNewBlock) {
      removeBlockFromDom(rowEl);
      clearActiveEditState();
      document.dispatchEvent(new CustomEvent('contentblocks:changed'));
      return;
    }

    if (mode === 'cancel') {
      writeBlockToDom(originalSnapshot);
    } else {
      if (workingCopy.type === 'text') commitActiveText();
      else {
        const host = rowEl.querySelector('[data-row-text-host]');
        if (host) workingCopy.text = host.textContent;
      }
      const changed = JSON.stringify(workingCopy) !== JSON.stringify(originalSnapshot);
      if (changed) {
        workingCopy.updatedAt = new Date().toISOString();
        writeBlockToDom(workingCopy);
        saveBlockToStore(workingCopy);
      } else {
        writeBlockToDom(originalSnapshot);
      }
    }

    rowEl.classList.remove('is-editing');
    const actions = rowEl.querySelector('.row-editor-actions');
    if (actions) actions.remove();
    const headingEl = rowEl.querySelector('.content-row-heading-text');
    if (headingEl) { headingEl.contentEditable = 'false'; headingEl.removeAttribute('data-row-text-host'); }

    clearActiveEditState();
    document.dispatchEvent(new CustomEvent('contentblocks:changed'));
  }

  // Deletes the block currently being edited outright — no confirmation step, matching the
  // approved design. Removes it from localStorage too (unlike cancelling a fresh insert,
  // this block may already have been saved in an earlier session).
  function deleteActiveBlock() {
    if (!activeRowEl) return;
    const rowEl = activeRowEl;
    const id = rowEl.dataset.blockId;
    removeBlockFromDom(rowEl);
    const store = loadStore();
    if (id in store) {
      delete store[id];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      } catch (e) {
        console.warn('Could not update localStorage after deleting a block:', e);
      }
    }
    markBlockDeleted(id);
    clearActiveEditState();
    closeOverflowMenu();
    document.dispatchEvent(new CustomEvent('contentblocks:changed'));
  }

  // ---------- Image popover ----------

  const imagePopover = document.getElementById('image-popover');
  const imagePopoverSearch = document.getElementById('image-popover-search');
  const imagePopoverGrid = document.getElementById('image-popover-grid');
  const imagePopoverUploadInput = document.getElementById('image-popover-upload-input');
  let imagePopoverRowEl = null;
  let imagePopoverTriggerEl = null;

  function positionPopover(popoverEl, triggerEl) {
    const rect = triggerEl.getBoundingClientRect();
    const width = popoverEl.offsetWidth || 320;
    let left = rect.left;
    if (left + width > window.innerWidth - 16) left = window.innerWidth - width - 16;
    if (left < 16) left = 16;
    popoverEl.style.left = `${left}px`;
    popoverEl.style.top = `${rect.bottom + 8}px`;
  }

  // These popovers are position:fixed (deliberately — see openImagePopover/openAddMenu),
  // so they don't move with the page on their own the way a position:absolute element
  // anchored in normal flow would. Re-running positionPopover against each one's stored
  // trigger element on every scroll/resize keeps whichever is open visually attached to its
  // trigger instead of drifting away as the page scrolls underneath it.
  function repositionOpenPopovers() {
    if (imagePopover && !imagePopover.hidden && imagePopoverTriggerEl) positionPopover(imagePopover, imagePopoverTriggerEl);
    if (addMenu && !addMenu.hidden && addMenuTriggerEl) positionPopover(addMenu, addMenuTriggerEl);
    if (overflowMenu && !overflowMenu.hidden && overflowMenuTriggerEl) positionPopover(overflowMenu, overflowMenuTriggerEl);
  }
  window.addEventListener('scroll', repositionOpenPopovers, { passive: true, capture: true });
  window.addEventListener('resize', repositionOpenPopovers, { passive: true });

  function renderImagePopoverResults(query) {
    imagePopoverGrid.innerHTML = '';
    const q = query.trim().toLowerCase();
    const results = q
      ? IMAGE_BANK.filter((entry) => entry.alt.toLowerCase().includes(q) || entry.keywords.toLowerCase().includes(q))
      : IMAGE_BANK;
    (results.length ? results : IMAGE_BANK).forEach((entry) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'editor-image-thumb';
      btn.dataset.action = 'pick-image';
      btn.dataset.imageSrc = entry.src;
      btn.dataset.imageAlt = entry.alt;
      btn.setAttribute('aria-pressed', String(workingCopy && entry.src === workingCopy.image.src));
      btn.setAttribute('aria-label', entry.alt);
      const img = document.createElement('img');
      img.src = entry.src;
      img.alt = '';
      btn.appendChild(img);
      imagePopoverGrid.appendChild(btn);
    });
  }

  function openImagePopover(triggerEl, rowEl) {
    if (activeRowEl !== rowEl) enterEditMode(rowEl);
    closeAddMenu();
    closeOverflowMenu();
    imagePopoverRowEl = rowEl;
    imagePopoverTriggerEl = triggerEl;
    const query = plainTextOf(workingCopy);
    imagePopoverSearch.value = query;
    renderImagePopoverResults(query);
    imagePopover.hidden = false;
    positionPopover(imagePopover, triggerEl);
    triggerEl.setAttribute('aria-expanded', 'true');
  }

  function closeImagePopover() {
    if (imagePopover.hidden) return;
    imagePopover.hidden = true;
    document.querySelectorAll('[data-image-trigger][aria-expanded="true"]').forEach((el) => el.setAttribute('aria-expanded', 'false'));
    imagePopoverRowEl = null;
    imagePopoverTriggerEl = null;
  }

  function pickImage(src, alt) {
    if (!workingCopy || workingCopy.type !== 'text') return;
    workingCopy.image = { src, alt };
    const rowImg = activeRowEl.querySelector('.content-row-photo');
    if (rowImg && rowImg.tagName === 'IMG') rowImg.setAttribute('src', src);
    closeImagePopover();
  }

  // ---------- Add-block menu + insertion ----------

  const addMenu = document.getElementById('add-block-menu');
  let addMenuBetweenEl = null;
  let addMenuTriggerEl = null;

  function openAddMenu(triggerEl, betweenEl) {
    closeImagePopover();
    closeOverflowMenu();
    addMenuBetweenEl = betweenEl;
    addMenuTriggerEl = triggerEl;
    addMenu.hidden = false;
    positionPopover(addMenu, triggerEl);
  }

  function closeAddMenu() {
    addMenu.hidden = true;
    addMenuBetweenEl = null;
    addMenuTriggerEl = null;
  }

  // ---------- Row overflow menu (Add a list / Add explanation / Delete section) ----------

  const overflowMenu = document.getElementById('row-overflow-menu');
  let overflowMenuTriggerEl = null;

  function openOverflowMenu(triggerEl) {
    closeImagePopover();
    closeAddMenu();
    const isText = !!workingCopy && workingCopy.type === 'text';
    overflowMenu.querySelector('[data-action="toggle-list"]').hidden = !isText;
    overflowMenu.querySelector('[data-action="add-explanation"]').hidden = !isText;
    overflowMenuTriggerEl = triggerEl;
    overflowMenu.hidden = false;
    positionPopover(overflowMenu, triggerEl);
    triggerEl.setAttribute('aria-expanded', 'true');
  }

  function closeOverflowMenu() {
    if (overflowMenu.hidden) return;
    overflowMenu.hidden = true;
    document.querySelectorAll('[data-action="toggle-overflow"][aria-expanded="true"]').forEach((el) => el.setAttribute('aria-expanded', 'false'));
    overflowMenuTriggerEl = null;
  }

  // The single "Add explanation" action does one of two things depending on whether text is
  // currently selected: with a selection, it bolds it and creates its paired explanation
  // (the same mechanic as markSelectionAsTerm/Cmd+B); with none, it adds a blank standalone
  // explanation not tied to any word — not everything worth explaining is a defined term.
  function addExplanation() {
    if (!activeRowEl || !workingCopy || workingCopy.type !== 'text') return;
    const textHost = activeRowEl.querySelector('[data-row-text-host]');
    const sel = window.getSelection();
    const hasSelection = textHost && sel.rangeCount > 0 && !sel.isCollapsed
      && textHost.contains(sel.getRangeAt(0).commonAncestorContainer);
    if (hasSelection) {
      markSelectionAsTerm();
    } else {
      workingCopy.explanations.push({ term: '', definition: '' });
      renderRowExplanations();
    }
    closeOverflowMenu();
  }

  function nextBlockId() {
    return `block-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function insertNewBlock(betweenEl, type) {
    const id = nextBlockId();
    let row;
    if (type === 'heading' || type === 'subheading') {
      row = document.createElement('div');
      row.className = `content-row content-row--${type}`;
      row.dataset.blockId = id;
      const tag = type === 'heading' ? 'h2' : 'h3';
      row.innerHTML = `
        <${tag} class="content-row-heading-text">${type === 'heading' ? 'New heading' : 'New sub heading'}</${tag}>
        <button type="button" class="edit-btn" data-edit-block><span>Edit</span><img src="assets/icons/edit.svg" alt=""></button>
      `;
    } else {
      row = document.createElement('div');
      row.className = 'content-row';
      row.dataset.blockId = id;
      row.innerHTML = `
        <div class="content-row-photo-wrap">
          <div class="content-row-photo content-row-photo--placeholder"></div>
          <button type="button" class="image-edit-trigger" data-image-trigger aria-label="Change image" aria-haspopup="true">
            <img src="assets/icons/image.svg" alt="" width="20" height="20">
          </button>
        </div>
        <p class="content-row-text">New content section</p>
        <button type="button" class="edit-btn" data-edit-block><span>Edit</span><img src="assets/icons/edit.svg" alt=""></button>
      `;
    }

    betweenEl.insertAdjacentElement('afterend', row);
    const freshBetween = betweenEl.cloneNode(true);
    row.insertAdjacentElement('afterend', freshBetween);

    closeAddMenu();
    document.dispatchEvent(new CustomEvent('contentblocks:changed'));
    enterEditMode(row, true);
  }

  // ---------- Wiring (event delegation — the edit surface is built/torn down dynamically) ----------

  document.addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit-block]');
    if (editBtn) {
      const rowEl = editBtn.closest('.content-row');
      if (rowEl) enterEditMode(rowEl);
      return;
    }

    const imageTrigger = e.target.closest('[data-image-trigger]');
    if (imageTrigger) {
      const rowEl = imageTrigger.closest('.content-row');
      if (rowEl) openImagePopover(imageTrigger, rowEl);
      return;
    }

    // Tapping anywhere in a not-yet-editing block starts editing it — the Edit button and
    // image hover-trigger above already handle their own specific cases and return early, so
    // this only ever fires for the rest of the row (text, background, or the image itself
    // before its hover-trigger becomes interactive). Tapping the image specifically also
    // opens the image popover immediately, rather than requiring a second tap once editing.
    const rowForTap = e.target.closest('.content-row');
    if (rowForTap && !rowForTap.classList.contains('is-editing')) {
      const tappedImage = e.target.closest('.content-row-photo');
      enterEditMode(rowForTap);
      if (tappedImage) {
        const trigger = rowForTap.querySelector('[data-image-trigger]');
        if (trigger) openImagePopover(trigger, rowForTap);
      }
      return;
    }

    const addTrigger = e.target.closest('.add-btn, [data-add-trigger]');
    if (addTrigger) {
      const betweenEl = addTrigger.closest('.between-section');
      if (betweenEl) openAddMenu(addTrigger, betweenEl);
      return;
    }

    const addType = e.target.closest('[data-add-type]');
    if (addType) {
      if (addMenuBetweenEl) insertNewBlock(addMenuBetweenEl, addType.dataset.addType);
      return;
    }

    const overflowTrigger = e.target.closest('[data-action="toggle-overflow"]');
    if (overflowTrigger) {
      if (overflowMenu.hidden) openOverflowMenu(overflowTrigger);
      else closeOverflowMenu();
      return;
    }

    const addExplanationBtn = e.target.closest('[data-action="add-explanation"]');
    if (addExplanationBtn) {
      addExplanation();
      return;
    }

    const deleteBtn = e.target.closest('[data-action="delete-section"]');
    if (deleteBtn) {
      deleteActiveBlock();
      return;
    }

    const toggleListBtn = e.target.closest('[data-action="toggle-list"]');
    if (toggleListBtn) {
      const host = activeRowEl && activeRowEl.querySelector('[data-row-text-host]');
      if (host) {
        host.focus();
        document.execCommand('insertUnorderedList');
        commitActiveText();
      }
      closeOverflowMenu();
      return;
    }

    const removeExplanationBtn = e.target.closest('[data-action="remove-explanation"]');
    if (removeExplanationBtn) {
      const idx = Number(removeExplanationBtn.dataset.explanationIndex);
      const term = workingCopy.explanations[idx].term;
      allTextUnits(workingCopy).forEach((unit) => {
        unit.boldRanges = unit.boldRanges.filter(([s, ee]) => unit.text.slice(s, ee) !== term);
      });
      const host = activeRowEl.querySelector('[data-row-text-host]');
      host.innerHTML = '';
      host.appendChild(renderParagraphsToDom(workingCopy.paragraphs));
      syncExplanationsWithBoldTerms(workingCopy);
      renderRowExplanations();
      return;
    }

    const pickImageBtn = e.target.closest('[data-action="pick-image"]');
    if (pickImageBtn) {
      pickImage(pickImageBtn.dataset.imageSrc, pickImageBtn.dataset.imageAlt);
      return;
    }

    if (e.target.closest('#image-popover-search-btn')) {
      renderImagePopoverResults(imagePopoverSearch.value);
      return;
    }
    if (e.target.closest('#image-popover-upload-btn')) {
      imagePopoverUploadInput.click();
      return;
    }

    if (e.target.closest('[data-action="save-edit"]')) { exitEditMode('save'); return; }
    if (e.target.closest('[data-action="cancel-edit"]')) { exitEditMode('cancel'); return; }

    // Clicking anywhere outside an open popover closes it (the popovers themselves are
    // position:fixed siblings of everything else, so this is a safe global check).
    if (imagePopover && !imagePopover.hidden && !imagePopover.contains(e.target) && !e.target.closest('[data-image-trigger]')) closeImagePopover();
    if (addMenu && !addMenu.hidden && !addMenu.contains(e.target) && !e.target.closest('.add-btn, [data-add-trigger]')) closeAddMenu();
    if (overflowMenu && !overflowMenu.hidden && !overflowMenu.contains(e.target) && !e.target.closest('[data-action="toggle-overflow"]')) closeOverflowMenu();
  });

  document.addEventListener('input', (e) => {
    if (e.target.matches('[data-row-explanations] textarea')) {
      const idx = Number(e.target.dataset.explanationIndex);
      workingCopy.explanations[idx].definition = e.target.value;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (addMenu && !addMenu.hidden) { closeAddMenu(); return; }
      if (imagePopover && !imagePopover.hidden) { closeImagePopover(); return; }
      if (overflowMenu && !overflowMenu.hidden) { closeOverflowMenu(); return; }
      if (activeRowEl) { exitEditMode('cancel'); return; }
      return;
    }

    const textHost = e.target.closest('[data-row-text-host]');
    if (!textHost) return;

    // Cmd/Ctrl+B is the standard shortcut for this — routes through the same
    // markSelectionAsTerm() the toolbar button uses (which already no-ops on heading rows,
    // since workingCopy.type !== 'text' there) rather than letting the browser's native
    // execCommand('bold') fire, which would produce a <b> tag outside this editor's model.
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      markSelectionAsTerm();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (workingCopy && workingCopy.type === 'text') {
        document.execCommand('insertParagraph');
        commitActiveText();
      }
      // Heading rows: Enter is simply suppressed — a heading never wraps into a new paragraph.
      return;
    }

    if (e.key === ' ') {
      startBulletListFromMarker(e);
    }

    if (e.key === 'Backspace') {
      handleListOutdentOnBackspace(e);
    }
  });

  // Backspace at the very start of a list item's content converts it back into a plain
  // paragraph — mirroring startBulletListFromMarker's direct-DOM approach rather than relying
  // on the browser's own list-outdent behavior, which isn't consistent enough across engines
  // to trust (that inconsistency is what left stray nodes for normalizeTextHost to clean up).
  function handleListOutdentOnBackspace(e) {
    if (!workingCopy || workingCopy.type !== 'text') return;
    const sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const node = range.startContainer.nodeType === Node.TEXT_NODE
      ? range.startContainer.parentElement
      : range.startContainer;
    const li = node && node.closest && node.closest('li');
    if (!li) return;
    const ul = li.parentElement;
    if (!ul || ul.tagName !== 'UL' || li.previousElementSibling) return;

    const preRange = document.createRange();
    preRange.setStart(li, 0);
    preRange.setEnd(range.startContainer, range.startOffset);
    if (preRange.toString() !== '') return;

    e.preventDefault();
    const p = document.createElement('p');
    while (li.firstChild) p.appendChild(li.firstChild);
    if (ul.children.length === 1) ul.replaceWith(p);
    else { ul.parentElement.insertBefore(p, ul); li.remove(); }

    const freshRange = document.createRange();
    freshRange.selectNodeContents(p);
    freshRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(freshRange);
    commitActiveText();
  }

  // Typing "-" or "•" as the very first character of a paragraph, then a space, converts
  // that paragraph into a bulleted list item — the marker is consumed, and anything already
  // typed after it (an empty paragraph, or a sentence the cursor is sitting in front of)
  // becomes the new list item's content, matching the shorthand most block-based text
  // editors support. Deliberately scoped to plain <p> blocks only, never an existing <li>:
  // execCommand('insertUnorderedList') toggles, so calling it again inside an existing list
  // item would remove that item from the list instead of starting a new nested one.
  function startBulletListFromMarker(e) {
    if (!workingCopy || workingCopy.type !== 'text') return;
    const sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const container = range.startContainer;
    const el = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
    const blockEl = el && el.closest('p');
    if (!blockEl) return;

    // The marker must be the very first content of the paragraph, with the cursor sitting
    // immediately after it — nothing else between the paragraph's start and the cursor.
    const preRange = document.createRange();
    preRange.setStart(blockEl, 0);
    preRange.setEnd(range.startContainer, range.startOffset);
    const marker = preRange.toString();
    if (marker !== '-' && marker !== '•') return;

    e.preventDefault();
    // Direct DOM replacement rather than clearing the paragraph and calling
    // execCommand('insertUnorderedList') on it — an empty block (no text node, no <br>)
    // isn't a reliable target for that command in every browser; it can end up converting
    // some other paragraph in the row instead of this exact one. Since blockEl is already
    // the precise node in hand, moving its content directly removes the ambiguity entirely.
    const ul = document.createElement('ul');
    const li = document.createElement('li');
    while (blockEl.firstChild) li.appendChild(blockEl.firstChild);
    const walker = document.createTreeWalker(li, NodeFilter.SHOW_TEXT);
    const firstTextNode = walker.nextNode();
    if (firstTextNode) firstTextNode.textContent = firstTextNode.textContent.slice(marker.length);
    ul.appendChild(li);
    blockEl.replaceWith(ul);
    const freshRange = document.createRange();
    freshRange.selectNodeContents(li);
    freshRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(freshRange);
    commitActiveText();
  }

  document.addEventListener('paste', (e) => {
    const textHost = e.target.closest('[data-row-text-host]');
    if (!textHost) return;
    e.preventDefault();
    const raw = (e.clipboardData || window.clipboardData).getData('text/plain');
    // Paragraph breaks in this editor are structural (separate <p>/<li> elements), not
    // inline characters, so a pasted multi-line string collapses onto one line rather than
    // leaving raw, non-rendering newline characters sitting inside a single paragraph.
    const text = raw.replace(/\r?\n+/g, ' ');
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
    range.collapse(false);
  });

  imagePopoverSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); renderImagePopoverResults(imagePopoverSearch.value); }
  });

  imagePopoverUploadInput.addEventListener('change', () => {
    const file = imagePopoverUploadInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      // A data: URL (not a blob: object URL) so this survives round-tripping through
      // localStorage after a reload — object URLs are revoked/invalid once the page unloads.
      pickImage(reader.result, file.name);
    };
    reader.readAsDataURL(file);
  });

  function markSelectionAsTerm() {
    if (!activeRowEl || !workingCopy || workingCopy.type !== 'text') return;
    const textHost = activeRowEl.querySelector('[data-row-text-host]');
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed || !textHost.contains(range.commonAncestorContainer)) return;

    let node = range.commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    const strongAncestor = node.closest('strong');

    if (strongAncestor && textHost.contains(strongAncestor)) {
      const parent = strongAncestor.parentNode;
      while (strongAncestor.firstChild) parent.insertBefore(strongAncestor.firstChild, strongAncestor);
      parent.removeChild(strongAncestor);
    } else {
      const strong = document.createElement('strong');
      try {
        range.surroundContents(strong);
      } catch (e) {
        // Selection straddles an existing element boundary (surroundContents can't handle a
        // partial overlap) — extract and re-wrap instead.
        const contents = range.extractContents();
        strong.appendChild(contents);
        range.insertNode(strong);
      }
    }
    sel.removeAllRanges();
    commitActiveText();
    renderRowExplanations();
  }

  document.execCommand('defaultParagraphSeparator', false, 'p');
  patchRowsFromStorage();
  if (window.relayoutAll) window.relayoutAll();
})();
