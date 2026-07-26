// Content block editor: Text / Image / Explanation dialog for .content-row blocks in document.html.
// Data model per block, persisted to localStorage on Save:
//   {
//     id, image: {src, alt}, explanations: [{term, definition}], updatedAt,
//     paragraphs: [
//       { type: 'p', text, boldRanges: [[start,end], ...] } |
//       { type: 'ul', items: [{ text, boldRanges }, ...] }
//     ]
//   }
// boldRanges are character offsets into a unit's own `text` marking defined terms — kept
// separate from the text itself (rather than inline markup) so there's nothing to parse at
// render time and no risk of literal markdown characters leaking into the editor.
(function () {
  const dialog = document.getElementById('block-editor-dialog');
  if (!dialog) return;

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

  // ---------- DOM <-> paragraphs model (the block's whole text: paragraphs + lists) ----------

  // Chrome's execCommand('insertUnorderedList') wraps the resulting <ul> inside the
  // paragraph it was applied to (<p><ul>...</ul></p>) instead of replacing that paragraph,
  // which isn't valid block nesting and isn't a shape domToParagraphsModel expects (it only
  // looks at textHost's direct children). Hoist any such <ul>/<ol> out to be a direct child
  // of textHost itself, discarding the now-empty wrapping paragraph.
  function normalizeTextHost() {
    Array.from(textHost.querySelectorAll('p > ul, p > ol')).forEach((list) => {
      const wrapper = list.parentElement;
      if (wrapper.parentElement === textHost) wrapper.replaceWith(list);
    });
  }

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
  // longer bold loses its explanation, a newly-bolded term gets a blank one to fill in. This is
  // what enforces "each explanation corresponds to a bolded word" as a rule of the data, not
  // just a convention the UI has to remember to honor.
  function syncExplanationsWithBoldTerms(block) {
    const terms = boldTermsOf(block);
    const kept = block.explanations.filter((ex) => terms.includes(ex.term));
    const keptTerms = kept.map((ex) => ex.term);
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
    // Text lives either directly as a lone <p class="content-row-text"> (the common case,
    // one plain paragraph, no definitions), or as one-or-more <p>/<ul> children of
    // .content-row-text-group ahead of any .content-definition callouts.
    const bare = rowEl.querySelector(':scope > .content-row-text');
    if (bare) return [bare];
    const group = rowEl.querySelector(':scope > .content-row-text-group, :scope > .content-row-text-lines');
    if (!group) return [];
    return Array.from(group.children).filter((el) => el.tagName === 'P' || el.tagName === 'UL');
  }

  function readExplanationsFromRow(rowEl) {
    return Array.from(rowEl.querySelectorAll('.content-definition')).map((def) => {
      const span = def.querySelector('span:not(.content-definition-emoji)');
      const strong = span ? span.querySelector('strong') : null;
      return { term: strong ? strong.textContent : '', definition: span ? span.textContent : '' };
    });
  }

  function readBlockFromRow(rowEl) {
    const img = rowEl.querySelector('.content-row-photo');
    return {
      id: rowEl.dataset.blockId,
      paragraphs: domToParagraphsModel(getTextBlockEls(rowEl)),
      image: { src: img ? img.getAttribute('src') : '', alt: img ? img.getAttribute('alt') : '' },
      explanations: readExplanationsFromRow(rowEl),
      updatedAt: new Date().toISOString(),
    };
  }

  function writeBlockToDom(block) {
    const rowEl = document.querySelector(`.content-row[data-block-id="${block.id}"]`);
    if (!rowEl) return;

    const img = rowEl.querySelector('.content-row-photo');
    if (img && block.image.src) {
      img.setAttribute('src', block.image.src);
      img.setAttribute('alt', block.image.alt || '');
    }

    const existingTextHost = rowEl.querySelector(':scope > .content-row-text, :scope > .content-row-text-group, :scope > .content-row-text-lines');
    if (!existingTextHost) {
      console.error(`content-editor: block ${block.id} has no text host to replace`);
      return;
    }

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
        const emoji = document.createElement('span');
        emoji.className = 'content-definition-emoji';
        emoji.innerHTML = '&#128161;';
        const span = document.createElement('span');
        span.appendChild(boldFirstOccurrence(ex.definition, ex.term));
        def.appendChild(emoji);
        def.appendChild(span);
        newTextHost.appendChild(def);
      });
    }

    existingTextHost.replaceWith(newTextHost);
  }

  function patchRowsFromStorage() {
    const store = loadStore();
    Object.keys(store).forEach((id) => writeBlockToDom(store[id]));
  }

  // ---------- Tabs (WAI-ARIA APG tabs pattern: click + roving-tabindex arrow keys) ----------

  function selectTab(tab) {
    if (workingCopy) {
      commitTextTab();
      renderExplanationTab();
    }
    const tablist = tab.closest('[role="tablist"]');
    const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
    tabs.forEach((t) => {
      const selected = t === tab;
      t.setAttribute('aria-selected', String(selected));
      t.tabIndex = selected ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !selected;
    });
  }

  function initTabs(tablistEl) {
    const tabs = Array.from(tablistEl.querySelectorAll('[role="tab"]'));
    tabs.forEach((tab) => tab.addEventListener('click', () => selectTab(tab)));
    tablistEl.addEventListener('keydown', (e) => {
      const currentIndex = tabs.indexOf(document.activeElement);
      if (currentIndex === -1) return;
      let nextIndex = null;
      if (e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') nextIndex = 0;
      else if (e.key === 'End') nextIndex = tabs.length - 1;
      if (nextIndex !== null) {
        e.preventDefault();
        tabs[nextIndex].focus();
        selectTab(tabs[nextIndex]);
      }
    });
  }

  // ---------- Dialog state ----------

  let activeRowEl = null;
  let workingCopy = null;

  const textHost = document.getElementById('editor-text-content');
  const imageCurrentEl = document.getElementById('editor-image-current');
  const imageSearchInput = document.getElementById('editor-image-search');
  const imageGrid = document.getElementById('editor-image-grid');
  const explanationList = document.getElementById('editor-explanation-list');
  const explanationHint = document.getElementById('editor-explanation-hint');

  // Enter creates a new <p> (rather than Chrome's default <div>) and the list-toggle button
  // below relies on the browser's own native, well-tested handling of splitting/merging
  // paragraphs and list items — reimplementing that with manual Range surgery would be a lot
  // more code to reproduce what the browser already does correctly.
  document.execCommand('defaultParagraphSeparator', false, 'p');

  function renderTextTab() {
    textHost.innerHTML = '';
    textHost.appendChild(renderParagraphsToDom(workingCopy.paragraphs));
  }

  function commitTextTab() {
    normalizeTextHost();
    const blockEls = Array.from(textHost.children).filter((el) => el.tagName === 'P' || el.tagName === 'UL');
    workingCopy.paragraphs = domToParagraphsModel(blockEls);
    syncExplanationsWithBoldTerms(workingCopy);
  }

  function renderImageResults(query) {
    imageGrid.innerHTML = '';
    const q = query.trim().toLowerCase();
    const results = q
      ? IMAGE_BANK.filter((entry) => entry.alt.toLowerCase().includes(q) || entry.keywords.toLowerCase().includes(q))
      : IMAGE_BANK;
    (results.length ? results : IMAGE_BANK).forEach((entry) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'editor-image-thumb';
      btn.setAttribute('aria-pressed', String(entry.src === workingCopy.image.src));
      btn.setAttribute('aria-label', entry.alt);
      const img = document.createElement('img');
      img.src = entry.src;
      img.alt = '';
      btn.appendChild(img);
      btn.addEventListener('click', () => {
        workingCopy.image = { src: entry.src, alt: entry.alt };
        renderImageTab();
      });
      imageGrid.appendChild(btn);
    });
  }

  function renderImageTab() {
    imageCurrentEl.src = workingCopy.image.src;
    imageCurrentEl.alt = workingCopy.image.alt;
    const text = plainTextOf(workingCopy);
    imageSearchInput.value = text;
    renderImageResults(text);
  }

  function renderExplanationTab() {
    explanationList.innerHTML = '';
    explanationHint.hidden = workingCopy.explanations.length > 0;
    workingCopy.explanations.forEach((ex, i) => {
      const item = document.createElement('div');
      item.className = 'editor-explanation-item';

      const termLabel = document.createElement('div');
      termLabel.className = 'editor-explanation-term';
      termLabel.textContent = ex.term;

      const textarea = document.createElement('textarea');
      textarea.className = 'field-input';
      textarea.rows = 2;
      textarea.value = ex.definition;
      textarea.setAttribute('aria-label', `Explanation for "${ex.term}"`);
      textarea.addEventListener('input', () => { workingCopy.explanations[i].definition = textarea.value; });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn btn-link editor-explanation-remove';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => {
        // The pairing is structural (a bold term always has an explanation), so removing an
        // explanation un-bolds its term in the text rather than leaving an orphaned bold word.
        const term = ex.term;
        allTextUnits(workingCopy).forEach((unit) => {
          unit.boldRanges = unit.boldRanges.filter(([s, e]) => unit.text.slice(s, e) !== term);
        });
        syncExplanationsWithBoldTerms(workingCopy);
        renderTextTab();
        renderExplanationTab();
      });

      item.appendChild(termLabel);
      item.appendChild(textarea);
      item.appendChild(removeBtn);
      explanationList.appendChild(item);
    });
  }

  function openEditor(rowEl) {
    activeRowEl = rowEl;
    workingCopy = readBlockFromRow(rowEl);
    renderTextTab();
    renderImageTab();
    renderExplanationTab();
    selectTab(document.getElementById('editor-tab-text'));
    dialog.showModal();
  }

  function closeEditor() {
    if (dialog.open) dialog.close();
    activeRowEl = null;
    workingCopy = null;
  }

  // ---------- Wiring ----------

  document.querySelectorAll('[data-edit-block]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const rowEl = btn.closest('.content-row');
      if (rowEl) openEditor(rowEl);
    });
  });

  document.querySelectorAll('.editor-tablist').forEach(initTabs);

  dialog.querySelectorAll('[data-action="cancel"]').forEach((btn) => {
    btn.addEventListener('click', () => closeEditor());
  });
  // Fires on Escape (native <dialog> behavior) — the dialog closes itself, this just resets state.
  dialog.addEventListener('cancel', () => { activeRowEl = null; workingCopy = null; });

  dialog.querySelector('[data-action="save"]').addEventListener('click', () => {
    commitTextTab();
    writeBlockToDom(workingCopy);
    saveBlockToStore(workingCopy);
    document.dispatchEvent(new CustomEvent('contentblocks:changed'));
    closeEditor();
  });

  document.getElementById('editor-mark-term').addEventListener('click', () => {
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
    commitTextTab();
    renderExplanationTab();
  });

  document.getElementById('editor-toggle-list').addEventListener('click', () => {
    textHost.focus();
    document.execCommand('insertUnorderedList');
    commitTextTab();
  });

  textHost.addEventListener('keydown', (e) => {
    // Invoked explicitly rather than left to the browser's default Enter handling, so
    // paragraph creation is deterministic and doesn't depend on defaultParagraphSeparator
    // having taken effect for this particular keystroke.
    if (e.key === 'Enter') {
      e.preventDefault();
      document.execCommand('insertParagraph');
      commitTextTab();
    }
  });

  textHost.addEventListener('paste', (e) => {
    e.preventDefault();
    const raw = (e.clipboardData || window.clipboardData).getData('text/plain');
    // This editor's paragraph breaks are structural (separate <p>/<li> elements), not inline
    // characters, so a pasted multi-line string collapses onto one line rather than leaving
    // raw, non-rendering newline characters sitting inside a single paragraph.
    const text = raw.replace(/\r?\n+/g, ' ');
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
    range.collapse(false);
  });

  document.getElementById('editor-image-search-btn').addEventListener('click', () => {
    renderImageResults(imageSearchInput.value);
  });
  imageSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); renderImageResults(imageSearchInput.value); }
  });

  const uploadInput = document.getElementById('editor-upload-input');
  document.getElementById('editor-upload-btn').addEventListener('click', () => uploadInput.click());
  uploadInput.addEventListener('change', () => {
    const file = uploadInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      // A data: URL (not a blob: object URL) so this survives round-tripping through
      // localStorage after a reload — object URLs are revoked/invalid once the page unloads.
      workingCopy.image = { src: reader.result, alt: file.name };
      renderImageTab();
    };
    reader.readAsDataURL(file);
  });

  patchRowsFromStorage();
  if (window.relayoutAll) window.relayoutAll();
})();
