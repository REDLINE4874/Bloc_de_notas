function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function noteMatchesSearch(note, query) {
  const terms = normalizeSearchText(query).trim().split(/\s+/).filter(Boolean);
  const searchableText = normalizeSearchText(`${note.title || ""}\n${getNoteContentText(note.content)}`);
  return terms.length > 0 && terms.every((term) => searchableText.includes(term));
}

function formatNoteDate(value) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

function localDateValue() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function noteDraftKey(noteId) {
  return `${DRAFT_PREFIX}-${currentUser?.id}-${noteId}`;
}

function openTabsKey() {
  return `${OPEN_TABS_PREFIX}-${currentUser?.id}`;
}

function readOpenNoteIds() {
  let savedTabs;
  try {
    savedTabs = localStorage.getItem(openTabsKey());
  } catch (error) {
    setGlobalStatus(`No se pudieron leer las pestañas abiertas: ${error.message}`, true);
    return null;
  }
  if (savedTabs === null) return null;

  try {
    const noteIds = JSON.parse(savedTabs);
    if (!Array.isArray(noteIds) || !noteIds.every((noteId) => typeof noteId === "string")) {
      setGlobalStatus("No se pudieron leer las pestañas abiertas: el formato guardado no es válido.", true);
      return null;
    }
    return [...new Set(noteIds)];
  } catch (error) {
    setGlobalStatus(`No se pudieron leer las pestañas abiertas: ${error.message}`, true);
    return null;
  }
}

async function readRemoteOpenTabState() {
  const { data, error } = await client
    .from(OPEN_TAB_STATE_TABLE)
    .select("note_ids, active_note_id")
    .eq("user_id", currentUser.id)
    .maybeSingle();
  if (error) {
    setGlobalStatus(`No se pudieron sincronizar las pestañas abiertas: ${error.message}`, true);
    return null;
  }
  if (!data) return null;
  if (!Array.isArray(data.note_ids)
    || !data.note_ids.every((noteId) => typeof noteId === "string")
    || (data.active_note_id !== null && typeof data.active_note_id !== "string")) {
    setGlobalStatus("No se pudieron sincronizar las pestañas abiertas: el estado guardado no es válido.", true);
    return null;
  }
  return {
    noteIds: [...new Set(data.note_ids)],
    activeNoteId: data.active_note_id,
  };
}

function saveOpenNoteState() {
  try {
    localStorage.setItem(openTabsKey(), JSON.stringify(openNoteIds));
  } catch (error) {
    setGlobalStatus(`No se pudieron guardar las pestañas abiertas: ${error.message}`, true);
  }

  if (!currentUser) return;
  const state = {
    user_id: currentUser.id,
    note_ids: [...openNoteIds],
    active_note_id: activeNoteId,
  };
  openTabSaveQueue = openTabSaveQueue.then(async () => {
    const { error } = await client
      .from(OPEN_TAB_STATE_TABLE)
      .upsert(state, { onConflict: "user_id" });
    if (error) throw error;
  }).catch((error) => {
    setGlobalStatus(`No se pudieron sincronizar las pestañas abiertas: ${error.message}`, true);
  });
}

function readSharedNotesKey() {
  return `${READ_SHARED_NOTES_PREFIX}-${currentUser?.id}`;
}

function loadReadSharedNoteIds(sharedNoteIds) {
  let savedIds;
  try {
    const savedValue = localStorage.getItem(readSharedNotesKey());
    savedIds = savedValue === null ? [] : JSON.parse(savedValue);
  } catch (error) {
    setGlobalStatus(`No se pudo leer el estado de notas compartidas: ${error.message}`, true);
    readSharedNoteIds = new Set();
    return;
  }
  if (!Array.isArray(savedIds) || !savedIds.every((noteId) => typeof noteId === "string")) {
    setGlobalStatus("No se pudo leer el estado de notas compartidas: el formato guardado no es válido.", true);
    readSharedNoteIds = new Set();
    return;
  }
  readSharedNoteIds = new Set(savedIds.filter((noteId) => sharedNoteIds.has(noteId)));
}

function saveReadSharedNoteIds() {
  try {
    localStorage.setItem(readSharedNotesKey(), JSON.stringify([...readSharedNoteIds]));
  } catch (error) {
    setGlobalStatus(`No se pudo guardar el estado de notas compartidas: ${error.message}`, true);
  }
}

function updateSharedNotesCount() {
  const unreadCount = loadedNotes.filter((note) => !isNoteOwner(note) && !readSharedNoteIds.has(note.id)).length;
  sharedNotesCount.textContent = String(unreadCount);
  sharedNotesCount.hidden = unreadCount === 0;
  openSharedNotes.setAttribute(
    "aria-label",
    unreadCount ? `Compartidas, ${unreadCount} ${unreadCount === 1 ? "nota nueva" : "notas nuevas"}` : "Compartidas",
  );
}

function markSharedNoteAsRead(note) {
  if (isNoteOwner(note) || readSharedNoteIds.has(note.id)) return;
  readSharedNoteIds.add(note.id);
  saveReadSharedNoteIds();
  updateSharedNotesCount();
}

function readLocalDraft(noteId) {
  try {
    const raw = localStorage.getItem(noteDraftKey(noteId));
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    setGlobalStatus(`No se pudo leer el borrador local: ${error.message}`, true);
    return null;
  }
}

function writeLocalDraft(noteId, draft) {
  try {
    localStorage.setItem(noteDraftKey(noteId), JSON.stringify(draft));
    return true;
  } catch (error) {
    setSaveStatus(`No se pudo guardar el borrador en este dispositivo: ${error.message}`, true);
    return false;
  }
}

function removeLocalDraft(noteId) {
  try {
    localStorage.removeItem(noteDraftKey(noteId));
  } catch (error) {
    setGlobalStatus(`No se pudo borrar el borrador local: ${error.message}`, true);
  }
}

function currentNote() {
  return loadedNotes.find((note) => note.id === activeNoteId) || null;
}

function isNoteOwner(note) {
  return Boolean(note && note.user_id === currentUser?.id);
}

function canEditNote(note) {
  return isNoteOwner(note) || sharePermissions.get(note?.id) === "edit";
}

function updateTabScrollControls() {
  const maxScroll = notesList.scrollWidth - notesList.clientWidth;
  const hasOverflow = maxScroll > 1;
  scrollTabsLeft.hidden = !hasOverflow || notesList.scrollLeft <= 1;
  scrollTabsRight.hidden = !hasOverflow || notesList.scrollLeft >= maxScroll - 1;
}

function scrollNoteTabs(direction) {
  notesList.scrollBy({
    left: direction * Math.max(notesList.clientWidth * 0.75, 100),
    behavior: "smooth",
  });
}

function keepActiveTabVisible() {
  const activeTab = [...notesList.querySelectorAll('[role="tab"]')]
    .find((tab) => tab.dataset.noteId === activeNoteId);
  if (activeTab) {
    const listBounds = notesList.getBoundingClientRect();
    const tabBounds = activeTab.getBoundingClientRect();
    if (tabBounds.left < listBounds.left) {
      notesList.scrollLeft -= listBounds.left - tabBounds.left;
    } else if (tabBounds.right > listBounds.right) {
      notesList.scrollLeft += tabBounds.right - listBounds.right;
    }
  }
  updateTabScrollControls();
}

