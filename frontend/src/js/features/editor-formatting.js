var pendingCodeLanguageSelection = false;
const noteContextMenuAnchor = document.getElementById("noteContextMenuAnchor");
const noteContextMenu = document.getElementById("noteContextMenu");
const noteContextMenuItems = document.getElementById("noteContextMenuItems");
const cutSelectedText = document.getElementById("cutSelectedText");
const copySelectedText = document.getElementById("copySelectedText");
const pasteIntoNote = document.getElementById("pasteIntoNote");
const insertCodeBlock = document.getElementById("insertCodeBlock");
const formatSelectedText = document.getElementById("formatSelectedText");
const noteContextMenuButtons = Array.from(noteContextMenuItems.querySelectorAll("button"));
let contextMenuRange = null;
let contextMenuPointer = null;

function getEditorSelectionRange() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  return noteContent.contains(range.startContainer) && noteContent.contains(range.endContainer)
    ? range.cloneRange()
    : null;
}

function getPlainTextFromEditorRange(range) {
  return getPlainTextFromRichContent(range.cloneContents());
}

function insertPlainTextAtEditorRange(range, pastedText) {
  if (!range
    || !noteContent.contains(range.startContainer)
    || !noteContent.contains(range.endContainer)) return false;
  const selection = window.getSelection();
  if (!selection) return false;
  const availableLength = Math.max(0, NOTE_MAX_LENGTH - readNoteContentText().length + range.toString().length);
  const text = pastedText.slice(0, availableLength);
  range.deleteContents();
  const pastedNode = document.createTextNode(text);
  range.insertNode(pastedNode);
  range.setStartAfter(pastedNode);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  saveEditorSelection();
  noteContent.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

function getEditorRangeAtPoint(x, y) {
  const position = document.caretPositionFromPoint?.(x, y);
  if (position && noteContent.contains(position.offsetNode)) {
    const range = document.createRange();
    range.setStart(position.offsetNode, position.offset);
    range.collapse(true);
    return range;
  }
  const pointRange = document.caretRangeFromPoint?.(x, y);
  if (pointRange && noteContent.contains(pointRange.startContainer)) return pointRange;
  const endRange = document.createRange();
  endRange.selectNodeContents(noteContent);
  endRange.collapse(false);
  return endRange;
}

function insertShortDateTime() {
  const note = currentNote();
  const range = getEditorSelectionRange();
  if (!note || !canEditNote(note) || !range) return false;

  const text = shortDateTimeFormatter.format(new Date());
  const availableLength = Math.max(0, NOTE_MAX_LENGTH - getEditorTextLength() + range.toString().length);
  if (text.length > availableLength) {
    setGlobalStatus("El contenido de la nota admite hasta 20 000 caracteres.", true);
    return true;
  }

  const selection = window.getSelection();
  range.deleteContents();
  const insertedText = document.createTextNode(text);
  range.insertNode(insertedText);
  range.setStartAfter(insertedText);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  saveEditorSelection();
  noteContent.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

function restoreEditorSelection(range = savedEditorSelection) {
  if (!range
    || !noteContent.contains(range.startContainer)
    || !noteContent.contains(range.endContainer)) return;
  if (!fontSizeDialog.open) noteContent.focus();
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range.cloneRange());
}

function getFormattingRange() {
  const savedRange = savedEditorSelection
    && noteContent.contains(savedEditorSelection.startContainer)
    && noteContent.contains(savedEditorSelection.endContainer)
    ? savedEditorSelection.cloneRange()
    : null;
  const range = getEditorSelectionRange() || savedRange || document.createRange();
  if (!range.collapsed) return range;
  range.selectNodeContents(noteContent);
  return range;
}

function saveEditorSelection() {
  savedEditorSelection = getEditorSelectionRange();
  updateFormatToolbarState();
}

function removeInlineStyle(fragment, property) {
  fragment.querySelectorAll("span[style]").forEach((span) => {
    span.style.removeProperty(property);
    if (!span.getAttribute("style")) span.removeAttribute("style");
  });
}

function getFullSelectionSpan(range) {
  const selectedText = range.toString();
  let element = range.commonAncestorContainer instanceof Element
    ? range.commonAncestorContainer
    : range.commonAncestorContainer.parentElement;
  while (element && element !== noteContent) {
    if (element.tagName === "SPAN"
      && !element.querySelector("br")
      && element.textContent === selectedText) return element;
    element = element.parentElement;
  }
  return null;
}

function getFormattingAncestor(node, tagNames) {
  let element = node instanceof Element ? node : node.parentElement;
  while (element && element !== noteContent) {
    if (tagNames.includes(element.tagName)) return element;
    element = element.parentElement;
  }
  return null;
}

function getCodeFormattingAncestor(node) {
  let element = node instanceof Element ? node : node.parentElement;
  while (element && element !== noteContent) {
    if (element.tagName === "CODE"
      || (element.tagName === "SPAN" && element.dataset.language === "plain")) return element;
    element = element.parentElement;
  }
  return null;
}

function getCodeFormattingForRange(range) {
  const formatting = getCodeFormattingAncestor(range.startContainer);
  if (formatting && formatting.contains(range.endContainer)) return formatting;

  const selectedText = range.toString();
  if (!selectedText) return null;
  const matches = Array.from(noteContent.querySelectorAll('code, span[data-language="plain"]'))
    .filter((element) => range.intersectsNode(element)
      && getPlainTextFromRichContent(element) === selectedText);
  return matches.length === 1 ? matches[0] : null;
}

function createCodeBlock(text, language) {
  const pre = document.createElement("pre");
  pre.dataset.language = language;
  const code = document.createElement("code");
  code.dataset.language = language;
  code.textContent = text;
  code.spellcheck = false;
  pre.append(code);
  return pre;
}

function insertEmptyCodeBlockAtRange(range, language) {
  if (!range
    || !noteContent.contains(range.startContainer)
    || !noteContent.contains(range.endContainer)) return false;
  const existingFormatting = getCodeFormattingAncestor(range.startContainer);
  const existingBlock = existingFormatting?.closest("pre");
  if (existingBlock) {
    range.selectNode(existingBlock);
    range.collapse(false);
  }
  const codeBlock = createCodeBlock("", language);
  range.deleteContents();
  range.insertNode(codeBlock);
  selectCodeBlock(range, codeBlock);
  return true;
}

function selectCodeBlock(range, pre) {
  const code = pre.querySelector("code");
  range.selectNodeContents(code);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  pendingCodeLanguageSelection = false;
  saveEditorSelection();
  noteContent.dispatchEvent(new Event("input", { bubbles: true }));
}

function deleteCodeBlock(codeBlock) {
  if (!codeBlock || !noteContent.contains(codeBlock)) return false;
  const range = document.createRange();
  range.selectNode(codeBlock);
  range.deleteContents();
  range.collapse(true);
  noteContent.focus();
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  pendingCodeLanguageSelection = false;
  saveEditorSelection();
  noteContent.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

function applyCodeFormatting() {
  restoreEditorSelection();
  const range = getEditorSelectionRange() || savedEditorSelection?.cloneRange();
  if (!range) {
    setGlobalStatus("Coloca el cursor o selecciona el texto que quieres convertir en código.", true);
    return;
  }

  const language = codeLanguageSelect.value;
  if (!CODE_LANGUAGE_OPTIONS.some(({ value }) => value === language)) {
    setGlobalStatus("Selecciona un lenguaje válido para el bloque de código.", true);
    return;
  }
  const existingFormatting = getCodeFormattingForRange(range);
  if (existingFormatting) {
    if (existingFormatting.tagName === "SPAN") {
      const codeBlock = createCodeBlock(existingFormatting.textContent, language);
      existingFormatting.replaceWith(codeBlock);
      selectCodeBlock(range, codeBlock);
      return;
    }
    const codeBlock = existingFormatting.closest("pre");
    if (codeBlock) {
      codeBlock.dataset.language = language;
      existingFormatting.dataset.language = language;
      selectCodeBlock(range, codeBlock);
    } else {
      const wrappedBlock = createCodeBlock(existingFormatting.textContent, language);
      existingFormatting.replaceWith(wrappedBlock);
      selectCodeBlock(range, wrappedBlock);
    }
    return;
  }
  const selectedText = getPlainTextFromRichContent(range.cloneContents());
  if (range.collapsed || !selectedText) {
    insertEmptyCodeBlockAtRange(range, language);
    return;
  }

  range.deleteContents();
  const codeBlock = createCodeBlock(selectedText, language);
  range.insertNode(codeBlock);
  selectCodeBlock(range, codeBlock);
}

function isRangeFormatted(range, tagNames) {
  const startAncestor = getFormattingAncestor(range.startContainer, tagNames);
  if (startAncestor && startAncestor === getFormattingAncestor(range.endContainer, tagNames)) return true;
  const contents = range.cloneContents();
  const walker = document.createTreeWalker(contents, NodeFilter.SHOW_TEXT);
  let hasText = false;
  while (walker.nextNode()) {
    if (!walker.currentNode.textContent) continue;
    hasText = true;
    if (!getFormattingAncestor(walker.currentNode, tagNames)) return false;
  }
  return hasText;
}

function applyInlineStyle(property, value) {
  restoreEditorSelection();
  const range = getFormattingRange();
  if (range.collapsed) return;
  const existingSpan = getFullSelectionSpan(range);
  if (existingSpan) {
    if (value) existingSpan.style.setProperty(property, value);
    else existingSpan.style.removeProperty(property);
    if (!existingSpan.getAttribute("style")) existingSpan.removeAttribute("style");
    saveEditorSelection();
    noteContent.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  const contents = range.extractContents();
  removeInlineStyle(contents, property);
  const wrapper = document.createElement("span");
  if (value) wrapper.style.setProperty(property, value);
  wrapper.append(contents);
  range.insertNode(wrapper);
  range.selectNodeContents(wrapper);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  saveEditorSelection();
  noteContent.dispatchEvent(new Event("input", { bubbles: true }));
}

function applyToggleFormat(command) {
  restoreEditorSelection();
  const range = getFormattingRange();
  if (range.collapsed) return;
  const tagNames = command === "bold" ? ["B", "STRONG"] : command === "italic" ? ["I", "EM"] : ["U"];
  const alreadyFormatted = isRangeFormatted(range, tagNames);
  const sharedWrapper = alreadyFormatted
    ? getFormattingAncestor(range.startContainer, tagNames)
    : null;
  const contents = range.extractContents();
  if (alreadyFormatted) {
    Array.from(contents.querySelectorAll(tagNames.join(","))).reverse().forEach((element) => {
      element.replaceWith(...Array.from(element.childNodes));
    });
    const firstSelected = contents.firstChild;
    const lastSelected = contents.lastChild;
    if (sharedWrapper && sharedWrapper.isConnected) {
      const point = range.cloneRange();
      const beforeRange = document.createRange();
      const afterRange = document.createRange();
      let before = document.createDocumentFragment();
      let after = document.createDocumentFragment();
      if (sharedWrapper.contains(point.startContainer)) {
        beforeRange.selectNodeContents(sharedWrapper);
        beforeRange.setEnd(point.startContainer, point.startOffset);
        before = beforeRange.cloneContents();
        afterRange.selectNodeContents(sharedWrapper);
        afterRange.setStart(point.startContainer, point.startOffset);
        after = afterRange.cloneContents();
      }
      const replacement = document.createDocumentFragment();
      if (before.textContent || before.querySelector("br")) {
        const beforeWrapper = sharedWrapper.cloneNode(false);
        beforeWrapper.append(before);
        replacement.append(beforeWrapper);
      }
      replacement.append(contents);
      if (after.textContent || after.querySelector("br")) {
        const afterWrapper = sharedWrapper.cloneNode(false);
        afterWrapper.append(after);
        replacement.append(afterWrapper);
      }
      sharedWrapper.replaceWith(replacement);
    } else {
      range.insertNode(contents);
    }
    if (firstSelected && lastSelected) {
      range.setStartBefore(firstSelected);
      range.setEndAfter(lastSelected);
    }
  } else {
    const wrapper = document.createElement(command === "bold" ? "strong" : command === "italic" ? "em" : "u");
    wrapper.append(contents);
    range.insertNode(wrapper);
    range.selectNodeContents(wrapper);
  }
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  saveEditorSelection();
  noteContent.dispatchEvent(new Event("input", { bubbles: true }));
}

function rangeHasFormat(range, command) {
  const tagNames = command === "bold" ? ["B", "STRONG"] : command === "italic" ? ["I", "EM"] : ["U"];
  return isRangeFormatted(range, tagNames);
}

function updateFormatToolbarState() {
  if (!fontSizeDialog.open) return;
  const range = getEditorSelectionRange() || savedEditorSelection;
  const parent = range?.commonAncestorContainer;
  const element = parent instanceof Element ? parent : parent?.parentElement;
  const style = element && noteContent.contains(element) ? getComputedStyle(element) : null;
  const code = range && getCodeFormattingForRange(range);
  const codeLanguage = code && shareSelectHasOption("codeLanguageSelect", code.dataset.language)
      ? code.dataset.language
      : "auto";
  if (!pendingCodeLanguageSelection) setShareSelectValue("codeLanguageSelect", codeLanguage);
  const fontFamily = style
    ? NOTE_FONT_FAMILIES.find((family) => family.replace(/["']/g, "").toLowerCase() === style.fontFamily.replace(/["']/g, "").toLowerCase()) || NOTE_FONT_FAMILIES[0]
    : NOTE_FONT_FAMILIES[0];
  setShareSelectValue("fontFamilySelect", fontFamily);
  const size = style ? `${Math.round(parseFloat(style.fontSize))}px` : "";
  setShareSelectValue("fontSizeSelect", shareSelectHasOption("fontSizeSelect", size) ? size : "16px");
  formatToolbar.querySelectorAll("[data-format-command]").forEach((button) => {
    let pressed = false;
    if (range && noteContent.contains(range.startContainer)) {
      pressed = rangeHasFormat(range, button.dataset.formatCommand);
    }
    button.setAttribute("aria-pressed", String(pressed));
  });
}

function openFormatDialog() {
  if (fontSizeOption.getAttribute("aria-disabled") === "true") return;
  pendingCodeLanguageSelection = false;
  pendingFormatContent = noteContent.innerHTML;
  const activeSelection = getEditorSelectionRange();
  const savedSelectionIsActive = savedEditorSelection
    && noteContent.contains(savedEditorSelection.startContainer)
    && noteContent.contains(savedEditorSelection.endContainer);
  pendingEditorSelection = activeSelection || (savedSelectionIsActive ? savedEditorSelection.cloneRange() : null);
  savedEditorSelection = pendingEditorSelection?.cloneRange() || null;
  fontSizeOption.setAttribute("aria-expanded", "false");
  settingsMenu.hidden = true;
  settingsButton.setAttribute("aria-expanded", "false");
  fontSizeDialog.showModal();
  updateFormatToolbarState();
  document.getElementById("fontSizeSelectButton").focus();
}

function canEditCurrentNoteContent() {
  return noteContent.getAttribute("contenteditable") === "true"
    && fontSizeOption.getAttribute("aria-disabled") !== "true";
}

function focusNoteContextMenuButton(button) {
  if (!("focusGroup" in HTMLElement.prototype)) {
    noteContextMenuButtons.forEach((item) => {
      item.tabIndex = item === button ? 0 : -1;
    });
  }
  button.focus();
}

function closeNoteContextMenu(range = null) {
  if (noteContextMenu.matches(":popover-open")) noteContextMenu.hidePopover();
  contextMenuRange = null;
  if (!range
    || !canEditCurrentNoteContent()
    || !noteContent.contains(range.startContainer)
    || !noteContent.contains(range.endContainer)) return;
  restoreEditorSelection(range);
  saveEditorSelection();
}

async function copyContextText() {
  const range = contextMenuRange?.cloneRange();
  if (!range || range.collapsed) return;
  const text = getPlainTextFromEditorRange(range);
  if (!text) return;

  let writePromise;
  try {
    writePromise = navigator.clipboard.writeText(text);
  } catch (error) {
    closeNoteContextMenu(range);
    setGlobalStatus(`No se pudo copiar el texto: ${error.message}`, true);
    return;
  }
  closeNoteContextMenu(range);
  try {
    await writePromise;
    setGlobalStatus("Texto copiado al portapapeles.");
  } catch (error) {
    setGlobalStatus(`No se pudo copiar el texto: ${error.message}`, true);
  }
}

async function cutContextText() {
  const range = contextMenuRange?.cloneRange();
  if (!range || range.collapsed || !canEditCurrentNoteContent()) return;
  const text = getPlainTextFromEditorRange(range);
  if (!text) return;
  const noteId = activeNoteId;

  let writePromise;
  try {
    writePromise = navigator.clipboard.writeText(text);
  } catch (error) {
    closeNoteContextMenu(range);
    setGlobalStatus(`No se pudo cortar el texto: ${error.message}`, true);
    return;
  }
  closeNoteContextMenu(range);
  try {
    await writePromise;
  } catch (error) {
    setGlobalStatus(`No se pudo cortar el texto: ${error.message}`, true);
    return;
  }

  if (activeNoteId !== noteId
    || !canEditCurrentNoteContent()
    || !noteContent.contains(range.startContainer)
    || !noteContent.contains(range.endContainer)) {
    setGlobalStatus("El texto se copió, pero no se cortó porque cambió la nota activa.", true);
    return;
  }
  if (getPlainTextFromEditorRange(range) !== text) {
    setGlobalStatus("El texto se copió, pero no se cortó porque la selección cambió.", true);
    return;
  }
  if (insertPlainTextAtEditorRange(range, "")) setGlobalStatus("Texto cortado al portapapeles.");
}

async function pasteContextText() {
  const range = contextMenuRange?.cloneRange();
  if (!range || !canEditCurrentNoteContent()) return;
  const noteId = activeNoteId;

  let readPromise;
  try {
    readPromise = navigator.clipboard.readText();
  } catch (error) {
    closeNoteContextMenu(range);
    setGlobalStatus(`No se pudo leer el portapapeles: ${error.message}`, true);
    return;
  }
  closeNoteContextMenu(range);
  try {
    const text = await readPromise;
    if (!text) {
      setGlobalStatus("El portapapeles no contiene texto para pegar.");
      return;
    }
    if (activeNoteId !== noteId
      || !canEditCurrentNoteContent()
      || !noteContent.contains(range.startContainer)
      || !noteContent.contains(range.endContainer)) {
      setGlobalStatus("No se pegó el texto porque cambió la nota activa o sus permisos.", true);
      return;
    }
    restoreEditorSelection(range);
    insertPlainTextAtEditorRange(range, text);
  } catch (error) {
    setGlobalStatus(`No se pudo leer el portapapeles: ${error.message}`, true);
  }
}

function openSelectedTextContextMenu(event) {
  const pointer = contextMenuPointer;
  contextMenuPointer = null;
  const selectionRange = getEditorSelectionRange();
  const selectedRange = selectionRange && !selectionRange.collapsed
    && getPlainTextFromEditorRange(selectionRange)
    ? selectionRange.cloneRange()
    : null;
  if (!canEditCurrentNoteContent() || fontSizeDialog.open) return;

  const pointerIsRecent = pointer
    && performance.now() - pointer.time < 1000
    && (event.button === 2 || event.ctrlKey);
  const eventHasPoint = event.clientX !== 0 || event.clientY !== 0;
  const selectionRect = selectionRange?.getBoundingClientRect();
  const x = pointerIsRecent ? pointer.x : eventHasPoint ? event.clientX : selectionRect?.left || 0;
  const y = pointerIsRecent ? pointer.y : eventHasPoint ? event.clientY : selectionRect?.bottom || 0;
  const range = selectedRange || (!pointerIsRecent && !eventHasPoint && selectionRange
    ? selectionRange.cloneRange()
    : getEditorRangeAtPoint(x, y));
  if (!range) return;

  event.preventDefault();
  contextMenuRange = range.cloneRange();
  savedEditorSelection = contextMenuRange.cloneRange();
  cutSelectedText.disabled = !selectedRange;
  copySelectedText.disabled = !selectedRange;
  insertCodeBlock.disabled = Boolean(selectedRange);
  formatSelectedText.disabled = !selectedRange;

  noteContextMenuAnchor.style.left = `${x}px`;
  noteContextMenuAnchor.style.top = `${y}px`;

  const canAnchorToPopoverSource = CSS.supports("position-area: block-end")
    && typeof ToggleEvent !== "undefined"
    && "source" in ToggleEvent.prototype;
  noteContextMenu.toggleAttribute("data-anchor-positioned", canAnchorToPopoverSource);
  noteContextMenu.style.removeProperty("left");
  noteContextMenu.style.removeProperty("top");
  if (!noteContextMenu.matches(":popover-open")) {
    if (canAnchorToPopoverSource) noteContextMenu.showPopover({ source: noteContextMenuAnchor });
    else noteContextMenu.showPopover();
  }
  if (!canAnchorToPopoverSource) {
    const menuRect = noteContextMenu.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, window.innerWidth - menuRect.width - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - menuRect.height - 8));
    noteContextMenu.style.left = `${left}px`;
    noteContextMenu.style.top = `${top}px`;
  }
  const firstEnabledButton = noteContextMenuButtons.find((button) => !button.disabled);
  if (firstEnabledButton) focusNoteContextMenuButton(firstEnabledButton);
}

noteContent.addEventListener("pointerup", (event) => {
  contextMenuPointer = event.button === 2 || event.ctrlKey
    ? { x: event.clientX, y: event.clientY, time: performance.now() }
    : null;
});
noteContent.addEventListener("contextmenu", openSelectedTextContextMenu);
cutSelectedText.addEventListener("click", cutContextText);
copySelectedText.addEventListener("click", copyContextText);
pasteIntoNote.addEventListener("click", pasteContextText);
insertCodeBlock.addEventListener("click", () => {
  const range = contextMenuRange?.cloneRange();
  closeNoteContextMenu(range);
  if (!range || !range.collapsed || !canEditCurrentNoteContent()) return;
  insertEmptyCodeBlockAtRange(range, "auto");
});
formatSelectedText.addEventListener("click", () => {
  const range = contextMenuRange?.cloneRange();
  closeNoteContextMenu(range);
  if (!range
    || !noteContent.contains(range.startContainer)
    || !noteContent.contains(range.endContainer)) return;
  openFormatDialog();
});
noteContextMenuItems.addEventListener("pointermove", (event) => {
  if (event.pointerType === "touch") return;
  const button = event.target instanceof Element
    ? event.target.closest("button:not(:disabled)")
    : null;
  if (button && noteContextMenuItems.contains(button)) focusNoteContextMenuButton(button);
});
noteContextMenu.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.stopPropagation();
  closeNoteContextMenu(contextMenuRange?.cloneRange());
});
noteContextMenu.addEventListener("toggle", (event) => {
  if (event.newState === "closed" && !noteContextMenu.matches(":popover-open")) {
    contextMenuRange = null;
  }
});
noteContextMenuItems.addEventListener("keydown", (event) => {
  if (event.key === "Tab") {
    window.setTimeout(() => {
      if (!noteContextMenuItems.contains(document.activeElement)
        && noteContextMenu.matches(":popover-open")) closeNoteContextMenu();
    });
    return;
  }
  const hasNativeFocusGroup = "focusGroup" in HTMLElement.prototype;
  if (hasNativeFocusGroup && !["Home", "End"].includes(event.key)) return;
  if (!hasNativeFocusGroup && !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  const enabledButtons = noteContextMenuButtons.filter((button) => !button.disabled);
  const currentIndex = enabledButtons.indexOf(document.activeElement);
  if (currentIndex < 0) return;
  let nextIndex;
  if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % enabledButtons.length;
  else if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + enabledButtons.length) % enabledButtons.length;
  else if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = enabledButtons.length - 1;
  else return;
  event.preventDefault();
  focusNoteContextMenuButton(enabledButtons[nextIndex]);
});

if (!("focusGroup" in HTMLElement.prototype)) {
  noteContextMenuItems.setAttribute("role", "menu");
  noteContextMenuButtons.forEach((button) => {
    button.setAttribute("role", "menuitem");
    button.tabIndex = -1;
  });
}

fontSizeOption.addEventListener("click", openFormatDialog);
formatToolbar.querySelectorAll("[data-format-command]").forEach((button) => {
  button.addEventListener("pointerdown", (event) => event.preventDefault());
  button.addEventListener("click", () => applyToggleFormat(button.dataset.formatCommand));
});
applyCodeFormat.addEventListener("pointerdown", (event) => event.preventDefault());
applyCodeFormat.addEventListener("click", applyCodeFormatting);
codeBlockActions.addEventListener("change", (event) => {
  const languageSelect = event.target instanceof HTMLSelectElement
    ? event.target.closest(".code-block-language-select")
    : null;
  if (!languageSelect || !canEditCurrentNoteContent()) return;

  const language = CODE_LANGUAGE_OPTIONS.find(({ value }) => value === languageSelect.value);
  const code = document.getElementById(languageSelect.dataset.codeLanguageTarget);
  if (!language || !(code instanceof HTMLElement) || code.tagName !== "CODE" || !noteContent.contains(code)) {
    setGlobalStatus("No se encontró el bloque de código para actualizar.", true);
    updateCodeBlockControls();
    return;
  }
  const codeBlock = code.closest("pre");
  if (!codeBlock) {
    setGlobalStatus("No se encontró el contenedor del bloque de código.", true);
    updateCodeBlockControls();
    return;
  }

  const selection = savedEditorSelection
    && noteContent.contains(savedEditorSelection.startContainer)
    && noteContent.contains(savedEditorSelection.endContainer)
    ? savedEditorSelection.cloneRange()
    : null;
  code.dataset.language = language.value;
  codeBlock.dataset.language = language.value;
  noteContent.dispatchEvent(new Event("input", { bubbles: true }));
  if (selection) {
    restoreEditorSelection(selection);
    saveEditorSelection();
  }
});
codeBlockActions.addEventListener("click", (event) => {
  const button = event.target instanceof Element
    ? event.target.closest("[data-code-delete-target]")
    : null;
  if (!button || button.disabled) return;
  if (noteContent.getAttribute("contenteditable") !== "true") return;
  const code = document.getElementById(button.dataset.codeDeleteTarget);
  const codeBlock = code?.closest("pre");
  if (!codeBlock) {
    setGlobalStatus("No se encontró el bloque de código para eliminarlo.", true);
    return;
  }
  deleteCodeBlock(codeBlock);
});

if (!("focusGroup" in HTMLElement.prototype)) {
  const toolbarItems = Array.from(formatToolbar.querySelectorAll("button"));
  toolbarItems.forEach((item, index) => {
    item.tabIndex = index === 0 ? 0 : -1;
  });
  formatToolbar.addEventListener("focusin", (event) => {
    if (!toolbarItems.includes(event.target)) return;
    toolbarItems.forEach((item) => {
      item.tabIndex = item === event.target ? 0 : -1;
    });
  });
  formatToolbar.addEventListener("keydown", (event) => {
    const rtl = getComputedStyle(formatToolbar).direction === "rtl";
    const steps = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 };
    const step = steps[event.key];
    const currentIndex = toolbarItems.indexOf(document.activeElement);
    let nextIndex = currentIndex;
    if (step) nextIndex = (currentIndex + step + toolbarItems.length) % toolbarItems.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = toolbarItems.length - 1;
    else return;
    event.preventDefault();
    toolbarItems[nextIndex].focus();
  });
}

function closeFormatDialog(saveChanges) {
  const contentChanged = noteContent.innerHTML !== pendingFormatContent;
  const selectionToRestore = saveChanges ? savedEditorSelection : pendingEditorSelection;
  if (saveChanges && contentChanged) scheduleNoteSave();
  if (!saveChanges && pendingFormatContent !== null) {
    noteContent.innerHTML = pendingFormatContent;
    updateNoteFindHighlights();
  }
  pendingFormatContent = null;
  pendingCodeLanguageSelection = false;
  savedEditorSelection = selectionToRestore;
  pendingEditorSelection = null;
  fontSizeDialog.close();
  if (currentNote()) {
    noteContent.focus();
    restoreEditorSelection(savedEditorSelection);
  } else {
    settingsButton.focus();
  }
}

cancelFontSize.addEventListener("click", () => closeFormatDialog(false));
confirmFontSize.addEventListener("click", () => closeFormatDialog(true));
fontSizeDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeFormatDialog(false);
});
document.addEventListener("selectionchange", () => {
  const range = getEditorSelectionRange();
  if (range) savedEditorSelection = range;
  if (fontSizeDialog.open) updateFormatToolbarState();
});
findInNote.addEventListener("click", openNoteFind);
document.addEventListener("click", (event) => {
  if (settingsMenu.hidden || event.target.closest(".settings-control")) return;
  settingsMenu.hidden = true;
  settingsButton.setAttribute("aria-expanded", "false");
  fontSizeOption.setAttribute("aria-expanded", "false");
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !settingsMenu.hidden) {
    settingsMenu.hidden = true;
    settingsButton.setAttribute("aria-expanded", "false");
    settingsButton.focus();
  }
});
initializeShareSelect("fontFamilySelect", "Predeterminada", [
  { value: NOTE_FONT_FAMILIES[0], label: "Predeterminada" },
  { value: NOTE_FONT_FAMILIES[1], label: "Arial" },
  { value: NOTE_FONT_FAMILIES[2], label: "Aptos (Cuerpo)" },
  { value: NOTE_FONT_FAMILIES[3], label: "Calibri" },
  { value: NOTE_FONT_FAMILIES[4], label: "Georgia" },
  { value: NOTE_FONT_FAMILIES[5], label: "Verdana" },
  { value: NOTE_FONT_FAMILIES[6], label: "Courier New" },
], (value) => applyInlineStyle("font-family", value));
initializeShareSelect("fontSizeSelect", "16", [
  "8px", "9px", "10px", "11px", "12px", "13px", "14px", "16px",
  "18px", "20px", "22px", "24px", "26px", "28px", "32px", "36px", "48px", "72px",
].map((value) => ({ value, label: value.slice(0, -2) })), (value) => applyInlineStyle("font-size", value));
initializeShareSelect("codeLanguageSelect", "Detectar lenguaje", CODE_LANGUAGE_OPTIONS, () => {
  pendingCodeLanguageSelection = true;
});
initializeShareSelect("shareUsername", "Selecciona un usuario", []);
initializeShareSelect("sharePermission", "Selecciona un permiso", [
  { value: "view", label: "Solo lectura" },
  { value: "edit", label: "Puede editar" },
]);
