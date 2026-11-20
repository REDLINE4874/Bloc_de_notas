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
  const searchableText = normalizeSearchText(`${note.title || ""}\n${note.content || ""}`);
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

function saveOpenNoteIds() {
  try {
    localStorage.setItem(openTabsKey(), JSON.stringify(openNoteIds));
  } catch (error) {
    setGlobalStatus(`No se pudieron guardar las pestañas abiertas: ${error.message}`, true);
  }
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

