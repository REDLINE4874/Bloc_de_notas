function getEditorSelectionRange() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  return noteContent.contains(range.startContainer) && noteContent.contains(range.endContainer)
    ? range.cloneRange()
    : null;
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

function applyCodeFormatting() {
  restoreEditorSelection();
  const range = getEditorSelectionRange() || savedEditorSelection?.cloneRange();
  if (!range || range.collapsed) {
    setGlobalStatus("Selecciona el código que quieres resaltar.", true);
    return;
  }

  const language = codeLanguageSelect.value;
  const existingCode = getFormattingAncestor(range.startContainer, ["CODE"]);
  if (existingCode && existingCode.contains(range.endContainer)) {
    if (language === "plain") {
      const plainText = document.createTextNode(existingCode.textContent);
      existingCode.replaceWith(plainText);
      range.selectNodeContents(plainText);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      saveEditorSelection();
      noteContent.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    existingCode.dataset.language = language;
    saveEditorSelection();
    noteContent.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  if (language === "plain") {
    setGlobalStatus("Selecciona un bloque de código para quitar su formato.", true);
    return;
  }

  const selectedText = getPlainTextFromRichContent(range.cloneContents());
  if (!selectedText) {
    setGlobalStatus("Selecciona el código que quieres resaltar.", true);
    return;
  }

  range.deleteContents();
  const code = document.createElement("code");
  code.dataset.language = language;
  code.textContent = selectedText;
  range.insertNode(code);
  range.selectNodeContents(code);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  saveEditorSelection();
  noteContent.dispatchEvent(new Event("input", { bubbles: true }));
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
  const code = range && getFormattingAncestor(range.startContainer, ["CODE"]);
  const codeLanguage = code && shareSelectHasOption("codeLanguageSelect", code.dataset.language)
    ? code.dataset.language
    : "auto";
  setShareSelectValue("codeLanguageSelect", codeLanguage);
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

fontSizeOption.addEventListener("click", openFormatDialog);
formatToolbar.querySelectorAll("[data-format-command]").forEach((button) => {
  button.addEventListener("pointerdown", (event) => event.preventDefault());
  button.addEventListener("click", () => applyToggleFormat(button.dataset.formatCommand));
});
applyCodeFormat.addEventListener("pointerdown", (event) => event.preventDefault());
applyCodeFormat.addEventListener("click", applyCodeFormatting);

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
initializeShareSelect("codeLanguageSelect", "Detectar lenguaje", [
  { value: "plain", label: "Texto normal" },
  { value: "auto", label: "Detectar lenguaje" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "csharp", label: "C#" },
  { value: "css", label: "CSS" },
  { value: "xml", label: "HTML / XML" },
  { value: "json", label: "JSON" },
  { value: "sql", label: "SQL" },
  { value: "bash", label: "Bash" },
  { value: "yaml", label: "YAML" },
  { value: "markdown", label: "Markdown" },
]);
initializeShareSelect("shareUsername", "Selecciona un usuario", []);
initializeShareSelect("sharePermission", "Selecciona un permiso", [
  { value: "view", label: "Solo lectura" },
  { value: "edit", label: "Puede editar" },
]);
