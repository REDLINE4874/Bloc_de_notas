cancelConfirmation.addEventListener("click", () => finishConfirmation(false));
acceptConfirmation.addEventListener("click", () => finishConfirmation(true));
confirmDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  finishConfirmation(false);
});
confirmDialog.addEventListener("click", (event) => {
  if (event.target === confirmDialog) finishConfirmation(false);
});

if (!supabaseReady) {
  authScreen.hidden = false;
  const missingConfig = !config.url
    || !config.anonKey
    || config.url.includes("TU-PROYECTO")
    || config.anonKey.includes("TU-ANON-KEY");
  setAuthStatus(
    missingConfig
      ? "Falta configurar Supabase en supabase-config.js."
      : "No se pudo cargar Supabase. Revisa tu conexión y vuelve a cargar la app.",
    true,
  );
} else {
  client = window.supabase.createClient(config.url, config.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  loginForm.addEventListener("submit", submitLogin);
  recoveryForm.addEventListener("submit", submitRecovery);
  updatePasswordForm.addEventListener("submit", submitPasswordUpdate);
  document.getElementById("forgotPassword").addEventListener("click", () => setAuthPanel("recovery"));
  document.getElementById("backToLogin").addEventListener("click", () => setAuthPanel("login"));
  document.getElementById("signOut").addEventListener("click", async () => {
    await flushNoteSave();
    persistentAuthMessage = "";
    const { error } = await client.auth.signOut();
    if (error) setGlobalStatus(`No se pudo cerrar la sesión: ${error.message}`, true);
  });
  accountToggle.addEventListener("click", () => {
    const showName = accountPopover.hidden;
    accountPopover.hidden = !showName;
    accountToggle.setAttribute("aria-expanded", String(showName));
    accountToggle.setAttribute("aria-label", `${showName ? "Ocultar" : "Mostrar"} nombre de usuario`);
    if (showName) accountPopover.focus();
  });
  document.addEventListener("click", (event) => {
    if (accountPopover.hidden || accountMenu.contains(event.target)) return;
    accountPopover.hidden = true;
    accountToggle.setAttribute("aria-expanded", "false");
    accountToggle.setAttribute("aria-label", "Mostrar nombre de usuario");
  });
  document.addEventListener("keydown", handleGlobalKeydown);

  document.getElementById("createNote").addEventListener("click", () => createNote());
  document.getElementById("emptyCreateNote").addEventListener("click", () => createNote());
  [undoNote, redoNote].forEach((button) => {
    button.addEventListener("pointerdown", (event) => event.preventDefault());
  });
  undoNote.addEventListener("click", () => runNoteHistoryCommand("undo", undoNote));
  redoNote.addEventListener("click", () => runNoteHistoryCommand("redo", redoNote));
  importTextFile.addEventListener("click", () => {
    settingsMenu.hidden = true;
    settingsButton.setAttribute("aria-expanded", "false");
    settingsButton.focus();
    textFileInput.click();
  });
  textFileInput.addEventListener("change", async () => {
    const [file] = textFileInput.files || [];
    textFileInput.value = "";
    if (!file) return;
    try {
      await importTextFileContents(file);
    } catch (error) {
      setGlobalStatus(`No se pudo importar el archivo TXT: ${error.message}`, true);
    }
  });
  document.getElementById("deleteNote").addEventListener("click", deleteCurrentNote);
  document.getElementById("shareNote").addEventListener("click", openShareDialog);
  document.getElementById("leaveSharedNote").addEventListener("click", () => leaveSharedNote());
  document.getElementById("restoreDraft").addEventListener("click", restoreDraft);
  document.getElementById("discardDraft").addEventListener("click", discardDraft);
  document.getElementById("cancelShare").addEventListener("click", () => shareDialog.close());
  noteTitle.addEventListener("input", () => {
    recordNoteHistoryChange("typing");
    scheduleNoteSave();
  });
  noteTitle.addEventListener("focus", () => {
    lastEditorInput = noteTitle;
  });
  noteTitle.addEventListener("blur", () => {
    savedTitleSelection = {
      start: noteTitle.selectionStart,
      end: noteTitle.selectionEnd,
      direction: noteTitle.selectionDirection,
    };
  });
  noteContent.addEventListener("focus", () => {
    lastEditorInput = noteContent;
  });
  noteContent.addEventListener("keydown", (event) => {
    if (event.key === "Backspace" || event.key === "Delete") {
      const range = getEditorSelectionRange();
      const startElement = range?.startContainer.nodeType === Node.ELEMENT_NODE
        ? range.startContainer
        : range?.startContainer.parentElement;
      const codeBlock = startElement?.closest('pre[data-language]');
      const code = codeBlock?.querySelector("code[data-language]");
      if (range?.collapsed && codeBlock && noteContent.contains(codeBlock) && code?.textContent === "") {
        event.preventDefault();
        return;
      }
    }

    if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
      const range = getEditorSelectionRange();
      const startElement = range?.startContainer.nodeType === Node.ELEMENT_NODE
        ? range.startContainer
        : range?.startContainer.parentElement;
      const codeBlock = startElement?.closest('pre[data-language]');
      if (codeBlock && noteContent.contains(codeBlock)) {
        event.preventDefault();
        const code = codeBlock.querySelector("code[data-language]");
        let isAtCodeEnd = false;
        if (range.collapsed && !event.shiftKey && code?.contains(range.startContainer)) {
          const textAfterCaret = document.createRange();
          textAfterCaret.selectNodeContents(code);
          textAfterCaret.setStart(range.startContainer, range.startOffset);
          isAtCodeEnd = !textAfterCaret.toString();
        }
        if (isAtCodeEnd) {
          const nextBlock = ensureCodeBlockContinuation(codeBlock);
          const exitRange = document.createRange();
          exitRange.selectNodeContents(nextBlock);
          exitRange.collapse(true);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(exitRange);
          saveEditorSelection();
          noteContent.dispatchEvent(new Event("input", { bubbles: true }));
          return;
        }
        if (readNoteContentText().length >= NOTE_MAX_LENGTH && range.collapsed) return;
        const selection = window.getSelection();
        range.deleteContents();
        const lineBreak = document.createTextNode("\n");
        range.insertNode(lineBreak);
        range.setStartAfter(lineBreak);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        saveEditorSelection();
        noteContent.dispatchEvent(new Event("input", { bubbles: true }));
        return;
      }
    }
    if (event.key !== "Tab" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const selection = window.getSelection();
    const range = getEditorSelectionRange() || document.createRange();
    if (readNoteContentText().length >= NOTE_MAX_LENGTH && range.collapsed) return;
    range.deleteContents();
    const tab = document.createTextNode("\t");
    range.insertNode(tab);
    range.setStartAfter(tab);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    saveEditorSelection();
    noteContent.dispatchEvent(new Event("input", { bubbles: true }));
  });
  noteContent.addEventListener("input", (event) => {
    if (getEditorTextLength() > NOTE_MAX_LENGTH) {
      trimEditorContent(NOTE_MAX_LENGTH);
      setGlobalStatus("El contenido de la nota admite hasta 20 000 caracteres.", true);
    }
    const typingInputTypes = new Set([
      "insertText",
      "insertCompositionText",
      "deleteContentBackward",
      "deleteContentForward",
      "deleteWordBackward",
      "deleteWordForward",
      "deleteSoftLineBackward",
      "deleteSoftLineForward",
    ]);
    const kind = event instanceof InputEvent && typingInputTypes.has(event.inputType)
      ? "typing"
      : "action";
    recordNoteHistoryChange(kind);
    if (!fontSizeDialog.open) scheduleNoteSave();
    if (!noteFindPanel.hidden) {
      noteFindCurrent = 0;
    }
    updateNoteFindHighlights();
  });
  noteContent.addEventListener("paste", (event) => {
    event.preventDefault();
    const pastedText = event.clipboardData?.getData("text/plain") || "";
    const range = getEditorSelectionRange();
    if (!range) return;
    insertPlainTextAtEditorRange(range, pastedText);
  });
  noteContent.addEventListener("copy", (event) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const commonAncestor = range.commonAncestorContainer;
    const selectedWithinEditor = commonAncestor === noteContent
      || (commonAncestor instanceof Node && noteContent.contains(commonAncestor));
    if (!selectedWithinEditor) return;

    const copiedText = getPlainTextFromEditorRange(range);
    if (!copiedText) return;

    event.preventDefault();
    event.clipboardData?.setData("text/plain", copiedText);
  });
  noteContent.addEventListener("keyup", saveEditorSelection);
  noteContent.addEventListener("mouseup", saveEditorSelection);
  noteContent.addEventListener("scroll", () => {
    noteContentHighlights.style.transform = `translate(${-noteContent.scrollLeft}px, ${-noteContent.scrollTop}px)`;
  }, { passive: true });
  noteFindInput.addEventListener("input", () => {
    noteFindCurrent = 0;
    updateNoteFindHighlights();
  });
  noteFindInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    moveNoteFindMatch(event.shiftKey ? -1 : 1);
  });
  noteFindPrevious.addEventListener("click", () => moveNoteFindMatch(-1));
  noteFindNext.addEventListener("click", () => moveNoteFindMatch(1));
  document.getElementById("closeNoteFind").addEventListener("click", closeNoteFind);
  noteSearchInput.addEventListener("input", renderLibrarySection);
  shareForm.addEventListener("submit", submitShare);

  openEditor.addEventListener("click", () => navigateToSection("editor"));
  openMyNotes.addEventListener("click", () => navigateToSection("my-notes"));
  openSharedNotes.addEventListener("click", () => navigateToSection("shared"));
  libraryNotesList.addEventListener("click", async (event) => {
    const actionButton = event.target.closest("[data-note-action-id]");
    if (actionButton) {
      const note = loadedNotes.find((item) => item.id === actionButton.dataset.noteActionId);
      if (!note) return;
      if (isNoteOwner(note)) await deleteNoteRecord(note);
      else await leaveSharedNote(note.id);
      const nextAction = libraryNotesList.querySelector("[data-note-action-id]")
        || libraryNotesList.querySelector("[data-open-note-id]")
        || libraryTitle;
      nextAction.focus();
      return;
    }

    const openButton = event.target.closest("[data-open-note-id]");
    if (openButton) await openNoteFromLibrary(openButton.dataset.openNoteId);
  });

  notesList.addEventListener("click", async (event) => {
    const closeButton = event.target.closest("[data-close-note-id]");
    if (closeButton) {
      event.preventDefault();
      event.stopPropagation();
      await closeNoteTab(closeButton.dataset.closeNoteId);
      return;
    }

    const row = event.target.closest("[data-note-id]");
    if (!row) return;
    await flushNoteSave();
    activeNoteId = row.dataset.noteId;
    saveOpenNoteState();
    renderNoteList();
    renderEditor();
    [...notesList.querySelectorAll('[role="tab"]')]
      .find((tab) => tab.dataset.noteId === activeNoteId)
      ?.focus();
  });

  scrollTabsLeft.addEventListener("click", () => scrollNoteTabs(-1));
  scrollTabsRight.addEventListener("click", () => scrollNoteTabs(1));
  notesList.addEventListener("scroll", updateTabScrollControls, { passive: true });
  window.addEventListener("resize", updateTabScrollControls);

  notesList.addEventListener("keydown", async (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const tabs = [...notesList.querySelectorAll('[role="tab"]')];
    const activeTab = event.target.closest('[role="tab"]');
    const currentIndex = tabs.indexOf(activeTab);
    if (currentIndex < 0 || !tabs.length) return;
    event.preventDefault();
    const offset = event.key === "ArrowRight" ? 1 : -1;
    const nextTab = tabs[(currentIndex + offset + tabs.length) % tabs.length];
    await flushNoteSave();
    activeNoteId = nextTab.dataset.noteId;
    saveOpenNoteState();
    renderNoteList();
    renderEditor();
    [...notesList.querySelectorAll('[role="tab"]')]
      .find((tab) => tab.dataset.noteId === activeNoteId)
      ?.focus();
  });

  sharedUsers.addEventListener("click", (event) => {
    const button = event.target.closest("[data-revoke-email]");
    const note = currentNote();
    if (!button || !note) return;
    removeShare(note.id, button.dataset.revokeEmail, button.dataset.revokeName, true);
  });

  shareDialog.addEventListener("click", (event) => {
    if (event.target === shareDialog) shareDialog.close();
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    document.getElementById("installApp").hidden = false;
  });
  document.getElementById("installApp").addEventListener("click", async () => {
    if (!installPrompt) return;
    const promptEvent = installPrompt;
    installPrompt = null;
    settingsMenu.hidden = true;
    settingsButton.setAttribute("aria-expanded", "false");
    settingsButton.focus();
    document.getElementById("installApp").hidden = true;
    await promptEvent.prompt();
  });
  window.addEventListener("online", () => {
    loadedNotes.forEach((note) => {
      const draft = readLocalDraft(note.id);
      if (!draft || !canEditNote(note)) return;
      const revision = (noteRevisions.get(note.id) || 0) + 1;
      noteRevisions.set(note.id, revision);
      queueNoteSave(note.id, draft, revision);
    });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void flushNoteSave();
    } else if (currentUser) {
      void (async () => {
        await flushNoteSave();
        await loadNotes();
      })();
    }
  });

  client.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      recoveryActive = true;
      authScreen.hidden = false;
      setAuthPanel("update");
    }
    window.setTimeout(() => handleSession(session), 0);
  });
  client.auth.getSession().then(({ data, error }) => {
    if (error) setAuthStatus(`No se pudo recuperar la sesión: ${error.message}`, true);
    return handleSession(data?.session);
  });

  if ("serviceWorker" in navigator && window.isSecureContext) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch((error) => {
        setGlobalStatus(`No se pudo preparar el modo instalable: ${error.message}`, true);
      });
    });
  }
}
