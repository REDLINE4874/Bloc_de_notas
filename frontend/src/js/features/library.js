function renderNoteList() {
  const openNotes = openNoteIds
    .map((noteId) => loadedNotes.find((note) => note.id === noteId))
    .filter(Boolean);
  document.getElementById("noteCount").textContent = String(openNotes.length);

  if (!openNotes.length) {
    notesList.innerHTML = "";
    notesEmpty.textContent = "Abre una nota desde Mis notas o crea una nueva.";
    notesEmpty.hidden = false;
    noteEditor.removeAttribute("aria-labelledby");
    updateTabScrollControls();
    return;
  }

  notesEmpty.hidden = true;
  notesList.innerHTML = openNotes.map((note) => {
    const sharedWithMe = note.user_id !== currentUser?.id;
    const title = note.title?.trim() || "Nota sin título";
    const meta = sharedWithMe ? '<span class="note-tab__meta">Compartida contigo</span>' : "";
    return `
      <div class="note-tab-item${note.id === activeNoteId ? " is-active" : ""}${sharedWithMe ? " is-shared-with-me" : ""}" role="presentation">
        <button id="note-tab-${escapeHtml(note.id)}" class="note-tab" type="button" role="tab" aria-selected="${note.id === activeNoteId}" aria-controls="noteEditor" tabindex="${note.id === activeNoteId ? "0" : "-1"}" data-note-id="${escapeHtml(note.id)}" title="${escapeHtml(title)}">
          <span class="note-tab__title">${escapeHtml(title)}</span>
          ${meta}
        </button>
        <button class="note-tab__close" type="button" data-close-note-id="${escapeHtml(note.id)}" aria-label="Cerrar pestaña ${escapeHtml(title)}" title="Cerrar pestaña">×</button>
      </div>
    `;
  }).join("");
  const activeTab = [...notesList.querySelectorAll('[role="tab"]')]
    .find((tab) => tab.dataset.noteId === activeNoteId);
  if (activeTab) noteEditor.setAttribute("aria-labelledby", activeTab.id);
  else noteEditor.removeAttribute("aria-labelledby");
  keepActiveTabVisible();
}

function renderLibrarySection() {
  const ownedNotes = loadedNotes.filter(isNoteOwner);
  const outgoingShareIds = new Set(
    [...ownerShares.entries()]
      .filter(([, shares]) => shares.length > 0)
      .map(([noteId]) => noteId),
  );
  const sharedNotes = loadedNotes.filter((note) => !isNoteOwner(note) || outgoingShareIds.has(note.id));
  const searching = activeSection === "search";
  const showingShared = activeSection === "shared";
  const query = noteSearchInput.value.trim();
  const visibleNotes = searching
    ? (query ? loadedNotes.filter((note) => noteMatchesSearch(note, query)) : [])
    : showingShared
      ? sharedNotes
      : ownedNotes;

  updateSharedNotesCount();
  libraryTitle.textContent = searching
    ? "Buscar notas"
    : `${showingShared ? "Compartidas" : "Mis notas"} (${visibleNotes.length})`;
  libraryDescription.textContent = searching
    ? "Busca por título o contenido en tus notas y las compartidas contigo."
    : showingShared
      ? "Notas que compartiste y notas que otros usuarios compartieron contigo."
      : "Tus notas guardadas. Selecciona una para abrirla en el lienzo.";
  librarySearch.hidden = !searching;
  libraryEmpty.textContent = searching
    ? (query ? `No se encontraron notas que coincidan con "${query}".` : "")
    : showingShared
      ? "Todavía no tienes notas compartidas."
      : "No tienes notas guardadas todavía.";
  libraryEmpty.hidden = visibleNotes.length > 0 || (searching && !query);

  libraryNotesList.innerHTML = visibleNotes.map((note) => {
    const owned = isNoteOwner(note);
    const isNewSharedNote = showingShared && !owned && !readSharedNoteIds.has(note.id);
    const title = note.title?.trim() || "Nota sin título";
    let meta = formatNoteDate(note.note_date);
    let removeAction = activeSection === "my-notes" && owned ? "Eliminar" : "";
    let preview = "";
    if (searching) {
      meta = owned
        ? (outgoingShareIds.has(note.id) ? "Compartida por ti" : "Tu nota")
        : `Compartida por ${shareOwners.get(note.id) || "otro usuario"}`;
      const content = getNoteContentText(note.content).trim().replace(/\s+/g, " ");
      preview = content.length > 120 ? `${content.slice(0, 120)}…` : content;
    } else if (showingShared && owned) {
      const recipientCount = ownerShares.get(note.id)?.length || 0;
      meta = `Compartida por ti con ${recipientCount} ${recipientCount === 1 ? "usuario" : "usuarios"}`;
    } else if (!owned) {
      meta = `Compartida por ${shareOwners.get(note.id) || "otro usuario"}`;
      if (showingShared) removeAction = "Dejar de ver";
    }

    return `
      <div class="notes-library-item" role="group" aria-label="Nota ${escapeHtml(title)}">
        <button class="notes-library-item__open" type="button" data-open-note-id="${escapeHtml(note.id)}" aria-label="Abrir ${escapeHtml(title)}${isNewSharedNote ? ", nueva" : ""}">
          <span class="notes-library-item__title">${escapeHtml(title)}</span>
          ${isNewSharedNote ? '<span class="notes-library-item__new">Nueva</span>' : ""}
          <span class="notes-library-item__meta">${escapeHtml(meta)}</span>
          ${searching && preview ? `<span class="notes-library-item__preview">${escapeHtml(preview)}</span>` : ""}
        </button>
        ${removeAction ? `<button class="notes-library-item__delete" type="button" data-note-action-id="${escapeHtml(note.id)}" aria-label="${removeAction} ${escapeHtml(title)}" title="${removeAction}">×</button>` : ""}
      </div>
    `;
  }).join("");
}

function updateSectionVisibility() {
  const isEditor = activeSection === "editor";
  noteTabbar.hidden = !isEditor;
  workspace.hidden = !isEditor;
  libraryView.hidden = isEditor;
  [
    [openEditor, "editor"],
    [openMyNotes, "my-notes"],
    [openSharedNotes, "shared"],
  ].forEach(([button, section]) => {
    if (activeSection === section) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if (!isEditor) renderLibrarySection();
}

async function navigateToSection(section) {
  if (section !== activeSection) await flushNoteSave();
  if (section !== "editor" && !noteFindPanel.hidden) closeNoteFind(false);
  activeSection = section;
  updateSectionVisibility();
  if (section === "search") {
    noteSearchInput.focus();
    noteSearchInput.select();
  } else if (section !== "editor") {
    libraryTitle.focus();
  }
}

async function openNoteSearch() {
  if (activeSection !== "search") sectionBeforeSearch = activeSection;
  await navigateToSection("search");
}

function updateNoteFindHighlights() {
  if (noteFindPanel.hidden) {
    noteFindMatches = [];
    updateSyntaxHighlights();
    return;
  }

  noteContent.classList.remove("is-syntax-highlighted");
  const query = noteFindInput.value;
  const content = getPlainTextFromRichContent(noteContent);
  noteFindMatches = [];
  noteContentHighlights.replaceChildren();

  const richOverlay = document.createDocumentFragment();
  noteContent.childNodes.forEach((node) => richOverlay.appendChild(node.cloneNode(true)));
  const richRoot = document.createElement("div");
  richRoot.appendChild(richOverlay);
  richRoot.querySelectorAll("pre > code[id]").forEach((code) => code.removeAttribute("id"));

  if (!query) {
    noteContentHighlights.append(...Array.from(richRoot.childNodes));
    noteFindCount.textContent = "0 de 0";
    noteFindPrevious.disabled = true;
    noteFindNext.disabled = true;
    return;
  }

  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matcher = new RegExp(escapedQuery, "gi");
  let match;
  while ((match = matcher.exec(content)) !== null) {
    noteFindMatches.push({ start: match.index, end: match.index + match[0].length });
  }

  noteFindCurrent = Math.min(noteFindCurrent, Math.max(noteFindMatches.length - 1, 0));
  noteContentHighlights.append(...Array.from(richRoot.childNodes));

  let plainTextOffset = 0;
  let plainTextEndsWithNewline = false;
  const textNodes = [];
  function collectTextRanges(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const start = plainTextOffset;
      plainTextOffset += node.nodeValue.length;
      plainTextEndsWithNewline = node.nodeValue.endsWith("\n");
      textNodes.push({ node, start, end: plainTextOffset });
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === "BR") {
      plainTextOffset += 1;
      plainTextEndsWithNewline = true;
      return;
    }
    const start = plainTextOffset;
    Array.from(node.childNodes).forEach(collectTextRanges);
    if (["DIV", "P", "PRE"].includes(node.tagName) && plainTextOffset > start && !plainTextEndsWithNewline) {
      plainTextOffset += 1;
      plainTextEndsWithNewline = true;
    }
  }
  Array.from(noteContentHighlights.childNodes).forEach(collectTextRanges);

  textNodes.forEach(({ node, start, end }) => {
    if (!node.nodeValue || start === end) return;
    const segments = [];
    let textFrom = start;
    noteFindMatches.forEach((match, index) => {
      const overlapStart = Math.max(start, match.start);
      const overlapEnd = Math.min(end, match.end);
      if (overlapStart >= overlapEnd) return;
      if (textFrom < overlapStart) {
        segments.push(document.createTextNode(node.nodeValue.slice(textFrom - start, overlapStart - start)));
      }
      const mark = document.createElement("mark");
      mark.dataset.findIndex = String(index);
      mark.textContent = node.nodeValue.slice(overlapStart - start, overlapEnd - start);
      if (index === noteFindCurrent) mark.classList.add("is-current");
      segments.push(mark);
      textFrom = overlapEnd;
    });
    if (textFrom < end) {
      segments.push(document.createTextNode(node.nodeValue.slice(textFrom - start)));
    }
    if (segments.length > 0) node.replaceWith(...segments);
  });
  noteFindCount.textContent = noteFindMatches.length
    ? `${noteFindCurrent + 1} de ${noteFindMatches.length}`
    : "No hay resultados";
  noteFindPrevious.disabled = noteFindMatches.length === 0;
  noteFindNext.disabled = noteFindMatches.length === 0;
  noteContentHighlights.style.transform = `translate(${-noteContent.scrollLeft}px, ${-noteContent.scrollTop}px)`;
}

function openNoteFind() {
  if (!currentNote()) return false;
  noteFindPanel.hidden = false;
  noteContentHighlights.hidden = false;
  noteContent.classList.add("is-find-open");
  noteFindCurrent = 0;
  updateNoteFindHighlights();
  noteFindInput.focus();
  noteFindInput.select();
  return true;
}

function closeNoteFind(restoreFocus = true) {
  noteFindPanel.hidden = true;
  noteContentHighlights.hidden = true;
  noteContent.classList.remove("is-find-open");
  noteFindInput.value = "";
  updateNoteFindHighlights();
  if (restoreFocus && activeSection === "editor" && !noteEditor.hidden) noteContent.focus();
}

function moveNoteFindMatch(direction) {
  if (noteFindMatches.length < 1) return;
  noteFindCurrent = (noteFindCurrent + direction + noteFindMatches.length) % noteFindMatches.length;
  updateNoteFindHighlights();
  const mark = noteContentHighlights.querySelector(`[data-find-index="${noteFindCurrent}"]`);
  if (!mark) return;
  const textareaRect = noteContent.getBoundingClientRect();
  const matchRect = mark.getBoundingClientRect();
  noteContent.scrollTop = Math.max(
    0,
    Math.min(
      noteContent.scrollHeight - noteContent.clientHeight,
      noteContent.scrollTop + matchRect.top - textareaRect.top - noteContent.clientHeight * 0.35,
    ),
  );
  noteContentHighlights.style.transform = `translate(${-noteContent.scrollLeft}px, ${-noteContent.scrollTop}px)`;
}

async function handleGlobalKeydown(event) {
  if (
    event.key === "F5"
    && !event.ctrlKey
    && !event.metaKey
    && !event.altKey
    && !event.shiftKey
    && !event.repeat
    && activeSection === "editor"
    && document.activeElement === noteContent
    && !shareDialog.open
    && !confirmDialog.open
  ) {
    if (insertShortDateTime()) event.preventDefault();
    return;
  }

  if (
    (event.ctrlKey || event.metaKey)
    && !event.altKey
    && event.key.toLowerCase() === "y"
    && !noteFindPanel.hidden
    && activeSection === "editor"
    && !shareDialog.open
    && !confirmDialog.open
  ) {
    const focusedElement = document.activeElement;
    const editTarget = focusedElement === noteTitle ? noteTitle : noteContent;
    if (editTarget.disabled) return;
    event.preventDefault();
    editTarget.focus();
    document.execCommand("redo");
    if (focusedElement !== editTarget && focusedElement instanceof HTMLElement) focusedElement.focus();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "f") {
    if (!currentUser || shareDialog.open || confirmDialog.open) return;
    event.preventDefault();
    if (activeSection === "editor" && openNoteFind()) return;
    await openNoteSearch();
    return;
  }

  if (noteFindPanel.hidden === false && event.key === "Escape") {
    event.preventDefault();
    closeNoteFind();
    return;
  }

  if (noteFindPanel.hidden === false && event.key === "F3") {
    event.preventDefault();
    moveNoteFindMatch(event.shiftKey ? -1 : 1);
    return;
  }

  if (event.key === "Escape" && activeSection === "search" && !shareDialog.open) {
    event.preventDefault();
    noteSearchInput.value = "";
    await navigateToSection(sectionBeforeSearch);
    return;
  }

  if (event.key !== "Escape" || accountPopover.hidden) return;
  accountPopover.hidden = true;
  accountToggle.setAttribute("aria-expanded", "false");
  accountToggle.setAttribute("aria-label", "Mostrar nombre de usuario");
  accountToggle.focus();
}

