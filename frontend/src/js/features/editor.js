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

function renderEditor() {
  const note = currentNote();
  const editable = Boolean(note && canEditNote(note));
  undoNote.disabled = !editable;
  redoNote.disabled = !editable;
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
    noteContent.classList.remove("is-find-open");
    noteContent.classList.remove("is-syntax-highlighted");
    return;
  }

  const owned = isNoteOwner(note);
  noteTitle.value = note.title || "";
  setNoteContent(note.content || "");
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

function updateListPreview(noteId, title, content, updatedAt) {
  const note = loadedNotes.find((item) => item.id === noteId);
  if (!note) return;
  note.title = title;
  note.content = content;
  note.updated_at = updatedAt || new Date().toISOString();
  loadedNotes.sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at));
  renderNoteList();
}

function queueNoteSave(noteId, snapshot, revision) {
  saveQueue = saveQueue.then(async () => {
    if (noteRevisions.get(noteId) !== revision || !currentUser) return;
    if (!navigator.onLine) {
      if (activeNoteId === noteId) setSaveStatus("Sin conexión · borrador guardado en este dispositivo", true);
      return;
    }

    if (activeNoteId === noteId) setSaveStatus("Guardando...");
    try {
      const { data, error } = await client
        .from("notes")
        .update({
          title: snapshot.title,
          content: snapshot.content,
          updated_at: new Date().toISOString(),
        })
        .eq("id", noteId)
        .select("id, updated_at")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("No se pudo guardar la nota. Puede que ya no tengas permiso para editarla.");
      updateListPreview(noteId, snapshot.title, snapshot.content, data.updated_at);

      if (noteRevisions.get(noteId) === revision) {
        removeLocalDraft(noteId);
        if (activeNoteId === noteId) setSaveStatus("Guardado");
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
  const snapshot = { title: noteTitle.value, content: serializeNoteContent() };
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
  if (savedContent.startsWith(NOTE_CONTENT_PREFIX)) {
    return serializeNoteContent() !== savedContent;
  }
  return readNoteContentText() !== getNoteContentText(savedContent);
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
  const snapshot = { title: noteTitle.value, content: serializeNoteContent() };
  writeLocalDraft(note.id, { ...snapshot, savedAt: new Date().toISOString() });
  return queueNoteSave(note.id, snapshot, revision);
}

function restoreDraft() {
  const note = currentNote();
  const draft = note && readLocalDraft(note.id);
  if (!note || !draft) return;
  noteTitle.value = draft.title;
  setNoteContent(draft.content);
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
  setSaveStatus("Borrador local descartado");
}

async function loadNotes() {
  setGlobalStatus("");
  const { data, error } = await client
    .from("notes")
    .select("id, user_id, title, content, note_date, updated_at")
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

  loadedNotes = data || [];
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

async function createNote(title = "", content = "", successMessage = "Nota nueva") {
  await flushNoteSave();
  const { data, error } = await client
    .from("notes")
    .insert({
      user_id: currentUser.id,
      title,
      content,
      note_date: localDateValue(),
    })
    .select("id, user_id, title, content, note_date, updated_at")
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
  setSaveStatus(successMessage);
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

