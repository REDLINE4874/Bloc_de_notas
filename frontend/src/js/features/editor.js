function renderSharedUsers(note) {
  const shares = ownerShares.get(note.id) || [];
  sharingSection.hidden = !isNoteOwner(note) || shares.length === 0;
  sharingSection.open = false;
  sharedUserCount.textContent = shares.length ? `(${shares.length})` : "";
  sharedUsers.innerHTML = shares.map((share) => `
    <li>
      <span>${escapeHtml(share.recipient_username || "Usuario")}<small>${share.permission === "edit" ? "Puede editar" : "Solo lectura"}</small></span>
      <button class="text-button" type="button" data-revoke-email="${escapeHtml(share.recipient_email)}" data-revoke-name="${escapeHtml(share.recipient_username || "Usuario")}">Quitar acceso</button>
    </li>
  `).join("");
}

function getNoteSharingStatus(note) {
  if (!isNoteOwner(note)) {
    return `· Compartida por ${shareOwners.get(note.id) || "Usuario"}`;
  }
  const usernames = (ownerShares.get(note.id) || [])
    .map((share) => share.recipient_username || share.recipient_email || "Usuario");
  return usernames.length ? `· Compartida con ${usernames.join(", ")}` : "";
}

function getDeveloperLanguage(language) {
  return DEVELOPER_LANGUAGE_OPTIONS.find(({ value }) => value === language)?.value
    || DEVELOPER_LANGUAGE_OPTIONS[0].value;
}

var noteHistoryById = new Map();
var applyingNoteHistory = false;
var NOTE_HISTORY_LIMIT = 100;
var NOTE_HISTORY_GROUP_MS = 700;

function getNoteHistorySnapshot() {
  return {
    title: noteTitle.value,
    content: noteContent.innerHTML,
  };
}

function snapshotsMatch(left, right) {
  return left.title === right.title && left.content === right.content;
}

function resetNoteHistory(noteId) {
  if (!noteId) {
    noteHistoryById.clear();
    updateNoteHistoryButtons();
    return;
  }
  noteHistoryById.set(noteId, {
    past: [],
    future: [],
    baseline: getNoteHistorySnapshot(),
    lastKind: null,
    lastTime: 0,
  });
  updateNoteHistoryButtons();
}

function updateNoteHistoryButtons() {
  const editable = Boolean(currentNote() && canEditNote(currentNote()));
  const entry = noteHistoryById.get(activeNoteId);
  undoNote.disabled = !editable || !entry?.past.length;
  redoNote.disabled = !editable || !entry?.future.length;
}

function recordNoteHistoryChange(kind = "action") {
  if (applyingNoteHistory || !activeNoteId) return;
  let entry = noteHistoryById.get(activeNoteId);
  if (!entry) {
    entry = {
      past: [],
      future: [],
      baseline: getNoteHistorySnapshot(),
      lastKind: null,
      lastTime: 0,
    };
    noteHistoryById.set(activeNoteId, entry);
  }

  const current = getNoteHistorySnapshot();
  if (snapshotsMatch(entry.baseline, current)) return;
  const now = Date.now();
  const canGroup = kind === "typing"
    && entry.lastKind === "typing"
    && now - entry.lastTime <= NOTE_HISTORY_GROUP_MS;

  if (!canGroup) entry.past.push(entry.baseline);
  if (entry.past.length > NOTE_HISTORY_LIMIT) entry.past.shift();
  entry.future = [];
  entry.baseline = current;
  entry.lastKind = kind;
  entry.lastTime = now;
  updateNoteHistoryButtons();
}

function applyNoteHistorySnapshot(snapshot) {
  applyingNoteHistory = true;
  noteTitle.value = snapshot.title;
  noteContent.innerHTML = sanitizeNoteContent(snapshot.content);
  saveEditorSelection();
  applyingNoteHistory = false;
  noteTitle.dispatchEvent(new Event("input", { bubbles: true }));
  noteContent.dispatchEvent(new Event("input", { bubbles: true }));
  scheduleNoteSave();
  updateNoteHistoryButtons();
}

function undoNoteHistory() {
  const entry = noteHistoryById.get(activeNoteId);
  if (!entry?.past.length) return false;
  const current = getNoteHistorySnapshot();
  const previous = entry.past.pop();
  entry.future.push(current);
  entry.baseline = previous;
  entry.lastKind = null;
  applyNoteHistorySnapshot(previous);
  updateNoteHistoryButtons();
  return true;
}

function redoNoteHistory() {
  const entry = noteHistoryById.get(activeNoteId);
  if (!entry?.future.length) return false;
  const current = getNoteHistorySnapshot();
  const next = entry.future.pop();
  entry.past.push(current);
  entry.baseline = next;
  entry.lastKind = null;
  applyNoteHistorySnapshot(next);
  updateNoteHistoryButtons();
  return true;
}

function renderEditor() {
  const note = currentNote();
  const editable = Boolean(note && canEditNote(note));
  if (note) markSharedNoteAsRead(note);
  fontSizeOption.setAttribute("aria-disabled", String(!note || !canEditNote(note)));
  emptyState.hidden = Boolean(note);
  noteEditor.hidden = !note;
  if (!note) {
    noteSharingStatus.textContent = "";
    noteSharingStatus.removeAttribute("title");
    draftNotice.hidden = true;
    sharingSection.hidden = true;
    noteFindPanel.hidden = true;
    noteContentHighlights.hidden = true;
    noteContentHighlights.classList.remove("is-developer-mode");
    noteContentWrap.classList.remove("is-developer-mode");
    noteContent.classList.remove("is-find-open");
    noteContent.classList.remove("is-syntax-highlighted");
    noteContent.classList.remove("is-developer-mode");
    developerToolbar.hidden = true;
    updateNoteHistoryButtons();
    return;
  }

  const owned = isNoteOwner(note);
  const isDeveloperNote = note.developer_mode === true;
  noteContentWrap.classList.toggle("is-developer-mode", isDeveloperNote);
  noteTitle.value = note.title || "";
  setNoteContent(note.content || "");
  noteContent.classList.toggle("is-developer-mode", isDeveloperNote);
  noteContent.spellcheck = !isDeveloperNote;
  noteContent.setAttribute("aria-label", isDeveloperNote ? "Código de la nota" : "Contenido de la nota");
  developerToolbar.hidden = !isDeveloperNote;
  setShareSelectValue("developerLanguageSelect", getDeveloperLanguage(note.code_language));
  document.getElementById("developerLanguageSelectButton").disabled = !editable;
  resetNoteHistory(note.id);
  updateNoteHistoryButtons();
  noteTitle.disabled = !editable;
  noteContent.contentEditable = String(editable);
  noteContent.setAttribute("aria-readonly", String(!editable));
  noteDate.textContent = formatNoteDate(note.note_date);
  noteSharingStatus.textContent = getNoteSharingStatus(note);
  if (noteSharingStatus.textContent) noteSharingStatus.title = noteSharingStatus.textContent.slice(2);
  else noteSharingStatus.removeAttribute("title");
  document.getElementById("shareNote").hidden = !owned;
  document.getElementById("deleteNote").hidden = !owned;
  document.getElementById("leaveSharedNote").hidden = !(!owned && note.user_id !== currentUser?.id);
  editorHint.textContent = editable
    ? "Se guarda automáticamente mientras escribes."
    : `Solo lectura${shareOwners.get(note.id) ? ` · Compartida por ${shareOwners.get(note.id)}` : ""}.`;
  renderSharedUsers(note);

  const draft = readLocalDraft(note.id);
  const serverTime = Date.parse(note.updated_at || "");
  const draftTime = Date.parse(draft?.savedAt || "");
  draftNotice.hidden = !(
    editable
    && draft
    && typeof draft.title === "string"
    && typeof draft.content === "string"
    && (!Number.isFinite(serverTime) || !Number.isFinite(draftTime) || draftTime > serverTime)
  );
  noteFindCurrent = 0;
  updateNoteFindHighlights();
}

function runNoteHistoryCommand(command, button) {
  const note = currentNote();
  if (!note || !canEditNote(note) || activeSection !== "editor") return;

  if (command === "undo" && undoNoteHistory()) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    button.focus();
    return;
  }
  if (command === "redo" && redoNoteHistory()) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    button.focus();
    return;
  }

  const focusedElement = document.activeElement;
  const editTarget = focusedElement === noteTitle || focusedElement === noteContent
    ? focusedElement
    : lastEditorInput;
  if (editTarget === noteTitle && noteTitle.disabled) return;
  if (editTarget === noteContent && noteContent.getAttribute("contenteditable") !== "true") return;

  const returnFocusToButton = focusedElement === button;
  editTarget.focus();
  if (editTarget === noteContent) restoreEditorSelection();
  else if (savedTitleSelection) {
    noteTitle.setSelectionRange(
      savedTitleSelection.start,
      savedTitleSelection.end,
      savedTitleSelection.direction,
    );
  }
  document.execCommand(command);
  if (returnFocusToButton) button.focus();
}

function updateListPreview(noteId, title, content, updatedAt, developerMode, codeLanguage) {
  const note = loadedNotes.find((item) => item.id === noteId);
  if (!note) return;
  note.title = title;
  note.content = content;
  note.developer_mode = developerMode;
  note.code_language = codeLanguage;
  note.updated_at = updatedAt || new Date().toISOString();
  loadedNotes.sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at));
  renderNoteList();
}

function queueNoteSave(noteId, snapshot, revision) {
  saveQueue = saveQueue.then(async () => {
    if (noteRevisions.get(noteId) !== revision || !currentUser) return;
    const note = loadedNotes.find((item) => item.id === noteId);
    if (!note) return;
    const savedSnapshot = {
      ...snapshot,
      developer_mode: typeof snapshot.developer_mode === "boolean"
        ? snapshot.developer_mode
        : note.developer_mode === true,
      code_language: getDeveloperLanguage(snapshot.code_language || note.code_language),
    };
    if (!navigator.onLine) {
      if (activeNoteId === noteId) setSaveStatus("Sin conexión · borrador guardado en este dispositivo", true);
      return;
    }

    if (activeNoteId === noteId) setSaveStatus("Guardando...");
    try {
      const { data, error } = await client
        .from("notes")
        .update({
          title: savedSnapshot.title,
          content: savedSnapshot.content,
          developer_mode: savedSnapshot.developer_mode,
          code_language: savedSnapshot.code_language,
          updated_at: new Date().toISOString(),
        })
        .eq("id", noteId)
        .select("id, updated_at")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("No se pudo guardar la nota. Puede que ya no tengas permiso para editarla.");
      updateListPreview(
        noteId,
        savedSnapshot.title,
        savedSnapshot.content,
        data.updated_at,
        savedSnapshot.developer_mode,
        savedSnapshot.code_language,
      );

      if (noteRevisions.get(noteId) === revision) {
        removeLocalDraft(noteId);
        if (activeNoteId === noteId) setSaveStatus("Guardado", false, true);
      }
    } catch (error) {
      if (activeNoteId === noteId) {
        setSaveStatus(`No se guardó · cambios guardados localmente: ${error.message}`, true);
      }
      setGlobalStatus(`No se pudieron sincronizar los cambios: ${error.message}`, true);
    }
  });
  return saveQueue;
}

function scheduleNoteSave() {
  const note = currentNote();
  if (!note || !canEditNote(note)) return;
  const revision = (noteRevisions.get(note.id) || 0) + 1;
  noteRevisions.set(note.id, revision);
  const snapshot = {
    title: noteTitle.value,
    content: serializeNoteContent(),
    developer_mode: note.developer_mode === true,
    code_language: note.developer_mode === true
      ? getDeveloperLanguage(developerLanguageSelect.value)
      : getDeveloperLanguage(note.code_language),
  };
  writeLocalDraft(note.id, { ...snapshot, savedAt: new Date().toISOString() });
  setSaveStatus("Cambios sin guardar");
  renderNoteList();
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    queueNoteSave(note.id, snapshot, revision);
  }, 700);
}

function noteContentHasChanged(note) {
  const savedContent = note.content || "";
  const contentChanged = savedContent.startsWith(NOTE_CONTENT_PREFIX)
    ? serializeNoteContent() !== savedContent
    : readNoteContentText() !== getNoteContentText(savedContent);
  return contentChanged
    || (note.developer_mode === true
      && getDeveloperLanguage(developerLanguageSelect.value) !== getDeveloperLanguage(note.code_language));
}

async function flushNoteSave() {
  const note = currentNote();
  if (!note || !canEditNote(note)) return saveQueue;
  const hasPendingChanges = saveTimer !== null
    || noteTitle.value !== (note.title || "")
    || noteContentHasChanged(note);
  if (!hasPendingChanges) return saveQueue;
  window.clearTimeout(saveTimer);
  saveTimer = null;
  const revision = (noteRevisions.get(note.id) || 0) + 1;
  noteRevisions.set(note.id, revision);
  const snapshot = {
    title: noteTitle.value,
    content: serializeNoteContent(),
    developer_mode: note.developer_mode === true,
    code_language: note.developer_mode === true
      ? getDeveloperLanguage(developerLanguageSelect.value)
      : getDeveloperLanguage(note.code_language),
  };
  writeLocalDraft(note.id, { ...snapshot, savedAt: new Date().toISOString() });
  return queueNoteSave(note.id, snapshot, revision);
}

function restoreDraft() {
  const note = currentNote();
  const draft = note && readLocalDraft(note.id);
  if (!note || !draft) return;
  noteTitle.value = draft.title;
  setNoteContent(draft.content);
  if (note.developer_mode === true) {
    setShareSelectValue("developerLanguageSelect", getDeveloperLanguage(draft.code_language || note.code_language));
    updateSyntaxHighlights();
  }
  resetNoteHistory(note.id);
  draftNotice.hidden = true;
  scheduleNoteSave();
}

function discardDraft() {
  const note = currentNote();
  if (!note) return;
  removeLocalDraft(note.id);
  draftNotice.hidden = true;
  noteTitle.value = note.title || "";
  setNoteContent(note.content || "");
  if (note.developer_mode === true) {
    setShareSelectValue("developerLanguageSelect", getDeveloperLanguage(note.code_language));
    updateSyntaxHighlights();
  }
  resetNoteHistory(note.id);
  setSaveStatus("Borrador local descartado");
}

async function loadNotes() {
  setGlobalStatus("");
  const { data, error } = await client
    .from("notes")
    .select("id, user_id, title, content, developer_mode, code_language, note_date, updated_at")
    .order("updated_at", { ascending: false });
  if (error) {
    setGlobalStatus(`No se pudieron cargar las notas: ${error.message}`, true);
    return;
  }

  let shares = [];
  if (data?.length) {
    let response = await client.rpc("get_note_shares", {
      target_note_ids: data.map((note) => note.id),
    });
    if (response.error?.message?.includes("Could not find the function public.get_note_shares")) {
      response = await client.from("note_shares").select("note_id, recipient_email, permission");
    }
    if (response.error) {
      setGlobalStatus(`No se pudieron cargar los permisos compartidos: ${response.error.message}`, true);
    } else {
      shares = response.data || [];
    }
  }

  const currentEmail = (currentUser.email || "").toLowerCase();
  sharePermissions = new Map(
    shares
      .filter((share) => (share.recipient_email || "").toLowerCase() === currentEmail)
      .map((share) => [share.note_id, share.permission]),
  );
  const ownedIds = new Set((data || []).filter((note) => note.user_id === currentUser.id).map((note) => note.id));
  ownerShares = new Map();
  shares.forEach((share) => {
    if (!ownedIds.has(share.note_id)) return;
    const items = ownerShares.get(share.note_id) || [];
    items.push(share);
    ownerShares.set(share.note_id, items);
  });

  const sharedIds = (data || []).filter((note) => note.user_id !== currentUser.id).map((note) => note.id);
  shareOwners = new Map();
  if (sharedIds.length) {
    const { data: owners, error: ownersError } = await client.rpc("get_note_owner_usernames", {
      target_note_ids: sharedIds,
    });
    if (ownersError) {
      setGlobalStatus(`No se pudo identificar quién compartió algunas notas: ${ownersError.message}`, true);
    } else {
      shareOwners = new Map((owners || []).map((owner) => [owner.note_id, owner.owner_username]));
    }
  }

  loadedNotes = (data || []).map((note) => ({
    ...note,
    developer_mode: note.developer_mode === true,
    code_language: getDeveloperLanguage(note.code_language),
  }));
  const incomingSharedNoteIds = new Set(
    loadedNotes.filter((note) => note.user_id !== currentUser.id).map((note) => note.id),
  );
  loadReadSharedNoteIds(incomingSharedNoteIds);
  const savedNoteIds = new Set(loadedNotes.map((note) => note.id));
  if (openTabsUserId !== currentUser.id) {
    openTabsUserId = currentUser.id;
    const savedState = await readRemoteOpenTabState();
    if (savedState) {
      openNoteIds = savedState.noteIds.filter((noteId) => savedNoteIds.has(noteId));
      activeNoteId = savedState.activeNoteId;
    } else {
      const savedOpenNoteIds = readOpenNoteIds();
      const firstOwnedNote = loadedNotes.find((note) => note.user_id === currentUser.id);
      openNoteIds = savedOpenNoteIds === null
        ? (firstOwnedNote ? [firstOwnedNote.id] : [])
        : savedOpenNoteIds.filter((noteId) => savedNoteIds.has(noteId));
    }
  } else {
    openNoteIds = openNoteIds.filter((noteId) => savedNoteIds.has(noteId));
  }
  if (!openNoteIds.includes(activeNoteId)) activeNoteId = openNoteIds[0] || null;
  saveOpenNoteState();
  renderNoteList();
  renderLibrarySection();
  renderEditor();
}

async function createNewNote() {
  let developerMode = false;
  if (developerModeEnabled) {
    noteTypeDialog.returnValue = "";
    noteTypeDialog.showModal();
    const choice = await new Promise((resolve) => {
      noteTypeDialog.addEventListener("close", () => resolve(noteTypeDialog.returnValue), { once: true });
    });
    if (choice !== "normal" && choice !== "code") return;
    developerMode = choice === "code";
  }
  await createNote("", "", "Nota nueva", developerMode);
}

async function createNote(title = "", content = "", successMessage = "Nota nueva", developerMode = false) {
  await flushNoteSave();
  const { data, error } = await client
    .from("notes")
    .insert({
      user_id: currentUser.id,
      title,
      content,
      developer_mode: developerMode,
      code_language: DEVELOPER_LANGUAGE_OPTIONS[0].value,
      note_date: localDateValue(),
    })
    .select("id, user_id, title, content, developer_mode, code_language, note_date, updated_at")
    .single();
  if (error) {
    setGlobalStatus(`No se pudo crear la nota: ${error.message}`, true);
    return;
  }
  loadedNotes.unshift(data);
  openNoteIds.unshift(data.id);
  activeNoteId = data.id;
  saveOpenNoteState();
  renderNoteList();
  renderLibrarySection();
  renderEditor();
  noteTitle.focus();
  setSaveStatus(successMessage, false, true);
}

async function importTextFileContents(file) {
  if (!file.name.toLowerCase().endsWith(".txt")) {
    throw new Error("Selecciona un archivo con extensión .txt.");
  }
  if (file.size > 60000) {
    throw new Error("El archivo es demasiado grande para importarlo como nota.");
  }

  const content = await file.text();
  if (content.includes("\u0000")) {
    throw new Error("El archivo contiene datos que no se pueden importar como texto.");
  }
  if (content.length > 20000) {
    throw new Error("El contenido supera el límite de 20,000 caracteres por nota.");
  }

  const title = file.name.replace(/\.txt$/i, "").trim().slice(0, 120) || "Archivo de texto";
  await createNote(title, content, "TXT importado");
}

async function deleteNoteRecord(note) {
  if (!note || !isNoteOwner(note)) return;
  const title = note.title?.trim() || "Nota sin título";
  const confirmed = await requestConfirmation({
    title: "Eliminar nota",
    message: `¿Eliminar "${title}"? Esta acción no se puede deshacer.`,
    confirmLabel: "Eliminar",
  });
  if (!confirmed) return;
  await flushNoteSave();
  const { data, error } = await client
    .from("notes")
    .delete()
    .eq("id", note.id)
    .select("id");
  if (error) {
    setGlobalStatus(`No se pudo eliminar la nota: ${error.message}`, true);
    return;
  }
  if (!data?.some((deletedNote) => deletedNote.id === note.id)) {
    setGlobalStatus("No se eliminó la nota. Verifica que todavía tengas permiso para borrarla.", true);
    return;
  }
  loadedNotes = loadedNotes.filter((item) => item.id !== note.id);
  openNoteIds = openNoteIds.filter((noteId) => noteId !== note.id);
  removeLocalDraft(note.id);
  if (activeNoteId === note.id) {
    activeNoteId = openNoteIds[0] || null;
  }
  saveOpenNoteState();
  renderNoteList();
  renderLibrarySection();
  renderEditor();
  setGlobalStatus("Nota eliminada.");
}

async function deleteCurrentNote() {
  await deleteNoteRecord(currentNote());
}

