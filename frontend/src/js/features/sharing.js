function closeShareSelect(root, restoreFocus = false) {
  const trigger = root.querySelector(".share-select__trigger");
  const options = root.querySelector(".share-select__options");
  root.classList.remove("is-open");
  trigger.setAttribute("aria-expanded", "false");
  options.hidden = true;
  if (restoreFocus) trigger.focus();
}

function positionShareSelectOptions(root) {
  const trigger = root.querySelector(".share-select__trigger");
  const options = root.querySelector(".share-select__options");
  const triggerRect = trigger.getBoundingClientRect();
  const viewportPadding = 8;
  const menuGap = 6;
  const menuWidth = Math.min(triggerRect.width, window.innerWidth - viewportPadding * 2);
  const menuLeft = Math.max(
    viewportPadding,
    Math.min(triggerRect.left, window.innerWidth - menuWidth - viewportPadding),
  );
  const desiredHeight = Math.min(230, window.innerHeight * 0.35, options.scrollHeight);
  const spaceBelow = window.innerHeight - triggerRect.bottom - menuGap - viewportPadding;
  const spaceAbove = triggerRect.top - menuGap - viewportPadding;
  const openAbove = spaceBelow < desiredHeight && spaceAbove > spaceBelow;
  const availableSpace = Math.max(60, openAbove ? spaceAbove : spaceBelow);

  options.style.left = `${menuLeft}px`;
  options.style.width = `${menuWidth}px`;
  options.style.maxHeight = `${Math.min(desiredHeight, availableSpace)}px`;
  if (openAbove) {
    options.style.top = "auto";
    options.style.bottom = `${window.innerHeight - triggerRect.top + menuGap}px`;
  } else {
    options.style.top = `${triggerRect.bottom + menuGap}px`;
    options.style.bottom = "auto";
  }
}

function setShareSelectValue(selectId, value) {
  const root = document.querySelector(`[data-share-select="${selectId}"]`);
  const input = document.getElementById(selectId);
  const trigger = root.querySelector(".share-select__trigger");
  const valueLabel = document.getElementById(`${selectId}Value`);
  const options = root.querySelectorAll('[role="option"]');
  const selectedOption = Array.from(options).find((option) => option.dataset.value === value);
  input.value = value;
  valueLabel.textContent = selectedOption?.textContent || root.dataset.placeholder;
  trigger.removeAttribute("aria-invalid");
  options.forEach((option) => {
    option.setAttribute("aria-selected", String(option === selectedOption));
  });
}

function shareSelectHasOption(selectId, value) {
  const root = document.querySelector(`[data-share-select="${selectId}"]`);
  return Array.from(root.querySelectorAll('[role="option"]'))
    .some((option) => option.dataset.value === value);
}

function setShareSelectOptions(selectId, items) {
  const root = document.querySelector(`[data-share-select="${selectId}"]`);
  const options = root.querySelector(".share-select__options");
  options.replaceChildren();
  items.forEach(({ value, label }) => {
    const option = document.createElement("div");
    option.className = "share-select__option";
    option.id = `${selectId}Option${options.childElementCount}`;
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", "false");
    option.tabIndex = -1;
    option.dataset.value = value;
    option.textContent = label;
    options.append(option);
  });
  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "share-select__empty";
    empty.setAttribute("role", "presentation");
    empty.textContent = "No hay opciones disponibles.";
    options.append(empty);
  }
  const currentValue = document.getElementById(selectId).value;
  setShareSelectValue(
    selectId,
    items.some(({ value }) => value === currentValue) ? currentValue : "",
  );
}

function initializeShareSelect(selectId, placeholder, items, onSelect) {
  const root = document.querySelector(`[data-share-select="${selectId}"]`);
  const trigger = root.querySelector(".share-select__trigger");
  const options = root.querySelector(".share-select__options");
  root.dataset.placeholder = placeholder;
  setShareSelectOptions(selectId, items);

  trigger.addEventListener("click", () => {
    if (trigger.getAttribute("aria-expanded") === "true") {
      closeShareSelect(root);
      return;
    }
    document.querySelectorAll("[data-share-select].is-open").forEach((openRoot) => closeShareSelect(openRoot));
    root.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    options.hidden = false;
    positionShareSelectOptions(root);
    const selectedOption = options.querySelector('[aria-selected="true"]');
    (selectedOption || options.querySelector('[role="option"]'))?.focus();
  });
  window.addEventListener("resize", () => {
    if (trigger.getAttribute("aria-expanded") === "true") positionShareSelectOptions(root);
  });
  window.addEventListener("scroll", () => {
    if (trigger.getAttribute("aria-expanded") === "true") positionShareSelectOptions(root);
  }, true);

  trigger.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    trigger.click();
  });

  options.addEventListener("click", (event) => {
    const option = event.target.closest('[role="option"]');
    if (!option || !options.contains(option)) return;
    const value = option.dataset.value;
    setShareSelectValue(selectId, value);
    if (selectId === "shareUsername") {
      shareStatus.textContent = "";
      shareStatus.classList.remove("is-error");
    }
    closeShareSelect(root, true);
    if (selectId === "codeLanguageSelect") restoreEditorSelection();
    onSelect?.(value);
  });

  root.addEventListener("keydown", (event) => {
    if (event.key === "Tab" && trigger.getAttribute("aria-expanded") === "true") {
      closeShareSelect(root);
      return;
    }
    if (event.key === "Escape" && trigger.getAttribute("aria-expanded") === "true") {
      event.preventDefault();
      closeShareSelect(root, true);
      return;
    }
    const optionElements = Array.from(options.querySelectorAll('[role="option"]'));
    if (optionElements.length === 0) return;
    const currentIndex = optionElements.indexOf(event.target);
    let nextIndex = currentIndex;
    if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % optionElements.length;
    else if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + optionElements.length) % optionElements.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = optionElements.length - 1;
    else if (event.key === "Enter" || event.key === " ") {
      if (currentIndex < 0) return;
      event.preventDefault();
      optionElements[currentIndex].click();
      return;
    } else return;
    event.preventDefault();
    optionElements[nextIndex].focus();
  });

  document.addEventListener("click", (event) => {
    if (!root.contains(event.target)) closeShareSelect(root);
  });
}

async function loadNoteUsers() {
  const { data, error } = await client.rpc("list_note_users");
  if (error) {
    shareStatus.textContent = `No se pudieron cargar los usuarios: ${error.message}`;
    shareStatus.classList.add("is-error");
    return false;
  }
  noteUsers = (data || []).map(({ username }) => username).filter(Boolean);
  setShareSelectOptions("shareUsername", noteUsers.map((username) => ({ value: username, label: username })));
  return true;
}

async function openShareDialog() {
  const note = currentNote();
  if (!note || !isNoteOwner(note)) return;
  shareStatus.textContent = "";
  shareStatus.classList.remove("is-error");
  setShareSelectValue("shareUsername", "");
  setShareSelectOptions("shareUsername", []);
  shareDialog.showModal();
  await loadNoteUsers();
}

async function submitShare(event) {
  event.preventDefault();
  const note = currentNote();
  if (!note || !isNoteOwner(note)) return;
  if (!document.getElementById("shareUsername").value) {
    shareStatus.textContent = "Selecciona un usuario para compartir la nota.";
    shareStatus.classList.add("is-error");
    document.getElementById("shareUsernameButton").setAttribute("aria-invalid", "true");
    document.getElementById("shareUsernameButton").focus();
    return;
  }
  const submit = shareForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  shareStatus.textContent = "Compartiendo...";
  shareStatus.classList.remove("is-error");
  const { error } = await client.rpc("share_note_with_username", {
    target_note_id: note.id,
    target_username: document.getElementById("shareUsername").value,
    target_permission: document.getElementById("sharePermission").value,
  });
  submit.disabled = false;
  if (error) {
    shareStatus.textContent = `No se pudo compartir la nota: ${error.message}`;
    shareStatus.classList.add("is-error");
    return;
  }
  shareDialog.close();
  await loadNotes();
  setGlobalStatus("Nota compartida.");
}

async function removeShare(noteId, email, name, isOwner) {
  const confirmed = await requestConfirmation({
    title: isOwner ? "Quitar acceso" : "Dejar de ver la nota",
    message: isOwner
      ? `¿Quieres quitarle el acceso a ${name}?`
      : "¿Quieres dejar de ver esta nota compartida?",
    confirmLabel: isOwner ? "Quitar acceso" : "Dejar de ver",
  });
  if (!confirmed) return;
  const { data, error } = await client
    .from("note_shares")
    .delete()
    .eq("note_id", noteId)
    .eq("recipient_email", email.toLowerCase())
    .select("id");
  if (error) {
    setGlobalStatus(`No se pudo actualizar el acceso: ${error.message}`, true);
    return;
  }
  if (!data?.length) {
    setGlobalStatus("El acceso compartido ya no estaba activo.", true);
  }
  await loadNotes();
}

async function leaveSharedNote(noteId = activeNoteId) {
  const note = loadedNotes.find((item) => item.id === noteId);
  if (!note || isNoteOwner(note) || !currentUser.email) return;
  await removeShare(note.id, currentUser.email, "", false);
}

async function openNoteFromLibrary(noteId) {
  const note = loadedNotes.find((item) => item.id === noteId);
  if (!note) return;
  await flushNoteSave();
  if (!openNoteIds.includes(note.id)) openNoteIds.push(note.id);
  activeNoteId = note.id;
  saveOpenNoteState();
  activeSection = "editor";
  updateSectionVisibility();
  renderNoteList();
  renderEditor();
  [...notesList.querySelectorAll('[role="tab"]')]
    .find((tab) => tab.dataset.noteId === note.id)
    ?.focus();
}

async function closeNoteTab(noteId) {
  const tabIndex = openNoteIds.indexOf(noteId);
  if (tabIndex < 0) return;
  await flushNoteSave();
  openNoteIds = openNoteIds.filter((id) => id !== noteId);
  if (activeNoteId === noteId) {
    activeNoteId = openNoteIds[Math.min(tabIndex, openNoteIds.length - 1)] || null;
  }
  saveOpenNoteState();
  renderNoteList();
  renderEditor();
  const activeTab = notesList.querySelector('[role="tab"][aria-selected="true"]');
  (activeTab || openMyNotes).focus();
}

themeToggles.forEach((toggle) => toggle.addEventListener("click", toggleTheme));
initializeTheme();
settingsButton.addEventListener("click", () => {
  const willOpen = settingsMenu.hidden;
  settingsMenu.hidden = !willOpen;
  settingsButton.setAttribute("aria-expanded", String(willOpen));
  if (willOpen) fontSizeOption.focus();
  else fontSizeOption.setAttribute("aria-expanded", "false");
});

