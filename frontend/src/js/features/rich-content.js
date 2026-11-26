function sanitizeNoteContent(html) {
  const root = document.createElement("div");
  root.innerHTML = String(html ?? "");
  const allowedTags = new Set(["B", "STRONG", "I", "EM", "U", "BR", "SPAN", "DIV", "P", "PRE", "CODE"]);
  const dangerousTags = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH", "TEMPLATE"]);
  const normalizeFont = (value) => String(value || "").replace(/["']/g, "").trim().toLowerCase();

  function clean(parent) {
    Array.from(parent.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) return;
      if (!(node instanceof HTMLElement)) {
        node.remove();
        return;
      }
      if (dangerousTags.has(node.tagName)) {
        node.remove();
        return;
      }
      clean(node);
      if (!allowedTags.has(node.tagName)) {
        node.replaceWith(...Array.from(node.childNodes));
        return;
      }

      const fontFamily = node.tagName === "SPAN" ? node.style.fontFamily : "";
      const fontSize = node.tagName === "SPAN" ? node.style.fontSize : "";
      const textColor = node.tagName === "SPAN" ? node.style.color : "";
      const isPlainText = node.tagName === "SPAN" && node.getAttribute("data-language") === "plain";
      const storedLanguage = node.getAttribute("data-language");
      const codeLanguage = ["CODE", "PRE"].includes(node.tagName)
        && (CODE_LANGUAGE_IDS.includes(storedLanguage) || ["auto", "plaintext"].includes(storedLanguage))
        ? (storedLanguage === "plaintext" ? "auto" : storedLanguage)
        : "";
      Array.from(node.attributes).forEach((attribute) => node.removeAttribute(attribute.name));
      if (isPlainText) node.dataset.language = "plain";
      if (codeLanguage) node.dataset.language = codeLanguage;
      if (node.tagName === "CODE" && codeLanguage) node.spellcheck = false;
      if (fontFamily) {
        const safeFamily = NOTE_FONT_FAMILIES.find((family) => normalizeFont(family) === normalizeFont(fontFamily));
        if (safeFamily) node.style.fontFamily = safeFamily;
      }
      if (/^(?:[8-9]|[1-6]\d|7[0-2])px$/.test(fontSize)) node.style.fontSize = fontSize;
      if (/^#[0-9a-f]{6}$/i.test(textColor)
        || /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/i.test(textColor)) {
        node.style.color = textColor;
      }
      if (!node.getAttribute("style")) node.removeAttribute("style");
    });
  }

  clean(root);
  root.querySelectorAll("code[data-language]").forEach((code) => {
    let pre = code.parentElement;
    if (pre.tagName !== "PRE") {
      pre = document.createElement("pre");
      code.replaceWith(pre);
      pre.append(code);
    }
    pre.dataset.language = code.dataset.language;
  });
  return root.innerHTML;
}

function setNoteContent(content) {
  const storedContent = String(content ?? "");
  const isRichContent = storedContent.startsWith(NOTE_CONTENT_PREFIX);
  const currentContent = isRichContent
    ? `${NOTE_CONTENT_PREFIX}${sanitizeNoteContent(noteContent.innerHTML)}`
    : noteContent.textContent;
  if (currentContent === storedContent) return;

  savedEditorSelection = null;
  if (isRichContent) {
    noteContent.innerHTML = sanitizeNoteContent(storedContent.slice(NOTE_CONTENT_PREFIX.length));
  } else {
    noteContent.textContent = storedContent;
  }
}

function getPlainTextFromRichContent(root, trimTrailingNewline = true) {
  let text = "";

  function append(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.nodeValue;
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === "BR") {
      text += "\n";
      return;
    }
    const start = text.length;
    node.childNodes.forEach(append);
    if (["DIV", "P", "PRE"].includes(node.tagName) && text.length > start && !text.endsWith("\n")) text += "\n";
  }

  root.childNodes.forEach(append);
  return trimTrailingNewline && text.endsWith("\n") ? text.slice(0, -1) : text;
}

function getNoteContentText(content) {
  const storedContent = String(content ?? "");
  if (!storedContent.startsWith(NOTE_CONTENT_PREFIX)) return storedContent;
  const root = document.createElement("div");
  root.innerHTML = sanitizeNoteContent(storedContent.slice(NOTE_CONTENT_PREFIX.length));
  return getPlainTextFromRichContent(root);
}

function readNoteContentText() {
  return noteContent.innerText.replace(/\r/g, "");
}

function getEditorTextLength() {
  let length = 0;
  const walker = document.createTreeWalker(noteContent, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === Node.TEXT_NODE) length += node.textContent.length;
    else if (node instanceof HTMLElement && node.tagName === "BR") length += 1;
  }
  return length;
}

function trimEditorContent(maxLength) {
  let length = 0;
  const walker = document.createTreeWalker(noteContent, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node instanceof HTMLElement && node.tagName === "BR") {
      if (length >= maxLength) {
        const range = document.createRange();
        range.setStartBefore(node);
        range.setEnd(noteContent, noteContent.childNodes.length);
        range.deleteContents();
        return;
      }
      length += 1;
    } else if (node.nodeType === Node.TEXT_NODE) {
      const textLength = node.textContent.length;
      if (length + textLength > maxLength) {
        const range = document.createRange();
        range.setStart(node, maxLength - length);
        range.setEnd(noteContent, noteContent.childNodes.length);
        range.deleteContents();
        return;
      }
      length += textLength;
    }
  }
}

function serializeNoteContent() {
  return `${NOTE_CONTENT_PREFIX}${sanitizeNoteContent(noteContent.innerHTML)}`;
}

const detectedCodeLanguages = new WeakMap();

function getDetectedCodeLanguage(code) {
  const source = code.textContent;
  const cachedDetection = detectedCodeLanguages.get(code);
  if (cachedDetection?.source === source) return cachedDetection.language;

  const detectedLanguage = window.hljs && source.trim()
    ? window.hljs.highlightAuto(source, CODE_LANGUAGE_IDS).language
    : null;
  const language = CODE_LANGUAGE_IDS.includes(detectedLanguage) ? detectedLanguage : null;
  detectedCodeLanguages.set(code, { source, language });
  return language;
}

function getHighlightedFragment(source, language) {
  if (!window.hljs || !source || language === "plaintext") return null;
  const result = language === "auto"
    ? window.hljs.highlightAuto(source, CODE_LANGUAGE_IDS)
    : window.hljs.highlight(source, { language });
  if (language === "auto" && !result.language) return null;

  const template = document.createElement("template");
  template.innerHTML = result.value;
  const fragment = document.createDocumentFragment();
  const appendSafeNode = (node, parent) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.append(document.createTextNode(node.nodeValue));
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === "SPAN") {
      const tokenClasses = Array.from(node.classList).filter((className) => /^hljs-[a-z0-9_-]+$/i.test(className));
      if (tokenClasses.length) {
        const token = document.createElement("span");
        token.classList.add(...tokenClasses);
        node.childNodes.forEach((child) => appendSafeNode(child, token));
        parent.append(token);
        return;
      }
    }
    node.childNodes.forEach((child) => appendSafeNode(child, parent));
  };
  template.content.childNodes.forEach((node) => appendSafeNode(node, fragment));
  return { fragment, language: result.language };
}

var codeBlockIdCounter = 0;
const codeCopyFeedbackTimers = new WeakMap();

function updateCodeBlockControls() {
  const codeBlocks = Array.from(noteContent.querySelectorAll("pre > code[data-language]"));
  const controls = Array.from(codeBlockActions.children);
  if (controls.length !== codeBlocks.length) {
    codeBlockActions.replaceChildren();
    codeBlocks.forEach((code) => {
      const control = document.createElement("div");
      control.className = "code-block-copy-control code-block-control";
      const languageSelect = document.createElement("select");
      languageSelect.className = "code-block-language-select";
      languageSelect.setAttribute("aria-label", "Lenguaje del bloque de código");
      CODE_LANGUAGE_OPTIONS.forEach(({ value, label }) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        languageSelect.append(option);
      });
      const actions = document.createElement("div");
      actions.className = "code-block-control__actions";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "code-block-copy-button";
      button.setAttribute("command", "--copy");
      button.setAttribute("aria-label", "Copiar código");
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.classList.add("code-block-copy-icon");
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("aria-hidden", "true");
      const outline = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      outline.setAttribute("x", "8");
      outline.setAttribute("y", "8");
      outline.setAttribute("width", "12");
      outline.setAttribute("height", "13");
      outline.setAttribute("rx", "2");
      const back = document.createElementNS("http://www.w3.org/2000/svg", "path");
      back.setAttribute("d", "M16 5V4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h1");
      icon.append(outline, back);
      const copiedIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      copiedIcon.classList.add("code-block-copied-icon");
      copiedIcon.setAttribute("viewBox", "0 0 24 24");
      copiedIcon.setAttribute("aria-hidden", "true");
      const check = document.createElementNS("http://www.w3.org/2000/svg", "path");
      check.setAttribute("d", "m5 12 4 4L19 6");
      copiedIcon.append(check);
      button.append(icon, copiedIcon);
      const status = document.createElement("span");
      status.className = "code-block-copy-status";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "code-block-delete-button";
      deleteButton.setAttribute("aria-label", "Eliminar bloque de código");
      deleteButton.title = "Eliminar bloque de código";
      const deleteIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      deleteIcon.setAttribute("viewBox", "0 0 24 24");
      deleteIcon.setAttribute("aria-hidden", "true");
      const deletePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      deletePath.setAttribute("d", "M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5");
      deleteIcon.append(deletePath);
      deleteButton.append(deleteIcon);
      actions.append(button, status, deleteButton);
      control.append(languageSelect, actions);
      codeBlockActions.append(control);
    });
  }

  const wrapRect = noteContentWrap.getBoundingClientRect();
  Array.from(codeBlockActions.children).forEach((control, index) => {
    const code = codeBlocks[index];
    code.spellcheck = false;
    if (!code.id) code.id = `noteCodeBlock-${++codeBlockIdCounter}`;
    const languageSelect = control.querySelector(".code-block-language-select");
    languageSelect.dataset.codeLanguageTarget = code.id;
    const storedLanguage = CODE_LANGUAGE_OPTIONS.some(({ value }) => value === code.dataset.language)
      ? code.dataset.language
      : "auto";
    const detectedLanguage = storedLanguage === "auto" ? getDetectedCodeLanguage(code) : null;
    const displayedLanguage = detectedLanguage || storedLanguage;
    languageSelect.value = displayedLanguage;
    const displayedLanguageLabel = CODE_LANGUAGE_OPTIONS.find(({ value }) => value === displayedLanguage)?.label;
    languageSelect.setAttribute(
      "aria-label",
      storedLanguage === "auto" && detectedLanguage
        ? `Lenguaje detectado: ${displayedLanguageLabel}. Selecciona otro si no es correcto.`
        : "Lenguaje del bloque de código",
    );
    languageSelect.disabled = noteContent.getAttribute("contenteditable") !== "true";
    const button = control.querySelector("button");
    const language = CODE_LANGUAGE_OPTIONS.find(({ value }) => value === code.dataset.language)?.label
      || code.dataset.language;
    button.setAttribute("commandfor", code.id);
    button.setAttribute("aria-label", `Copiar código ${language}`);
    const deleteButton = control.querySelector(".code-block-delete-button");
    deleteButton.dataset.codeDeleteTarget = code.id;
    deleteButton.disabled = noteContent.getAttribute("contenteditable") !== "true";

    const rect = code.parentElement.getBoundingClientRect();
    control.hidden = rect.bottom <= wrapRect.top
      || rect.top >= wrapRect.bottom
      || rect.right <= wrapRect.left
      || rect.left >= wrapRect.right;
    control.style.setProperty("--code-control-top", `${Math.max(0, rect.top - wrapRect.top + 6)}px`);
    control.style.setProperty("--code-control-left", `${Math.max(0, rect.left - wrapRect.left + 6)}px`);
    control.style.setProperty("--code-control-right", `${Math.max(0, wrapRect.right - rect.right + 6)}px`);
    control.style.setProperty("--code-control-width", `${Math.max(0, Math.min(rect.right, wrapRect.right) - Math.max(rect.left, wrapRect.left) - 12)}px`);
  });
}

function reportCodeCopy(button, succeeded) {
  const status = button.nextElementSibling;
  window.clearTimeout(codeCopyFeedbackTimers.get(button));
  button.removeAttribute("data-copied");
  button.removeAttribute("data-failed");
  const message = succeeded ? "Copiado" : "No se pudo copiar";
  status.textContent = button.dataset.lastMessage === message ? `${message}\u00a0` : message;
  button.dataset.lastMessage = message;
  button.setAttribute(succeeded ? "data-copied" : "data-failed", "");
  codeCopyFeedbackTimers.set(button, window.setTimeout(() => {
    button.removeAttribute("data-copied");
    button.removeAttribute("data-failed");
    status.textContent = "";
  }, 2000));
}

async function copyCodeBlock(button, target) {
  if (!(button instanceof HTMLButtonElement)) return;
  const text = target instanceof HTMLElement ? target.textContent : "";
  if (!text) {
    reportCodeCopy(button, false);
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    reportCodeCopy(button, true);
  } catch {
    reportCodeCopy(button, false);
  }
}

document.addEventListener("command", (event) => {
  if (event.command !== "--copy") return;
  void copyCodeBlock(event.source, event.target);
}, true);

if (!("CommandEvent" in window)) {
  codeBlockActions.addEventListener("click", (event) => {
    const button = event.target instanceof Element
      ? event.target.closest('button[command="--copy"]')
      : null;
    if (!button) return;
    void copyCodeBlock(button, document.getElementById(button.getAttribute("commandfor")));
  });
}

function updateSyntaxHighlights() {
  if (noteFindPanel && !noteFindPanel.hidden) {
    updateCodeBlockControls();
    return false;
  }
  const overlay = noteContent.cloneNode(true);
  overlay.querySelectorAll("pre > code[id]").forEach((code) => code.removeAttribute("id"));
  let highlightedCount = 0;
  const sourceCodeBlocks = Array.from(noteContent.querySelectorAll("code[data-language]"));

  overlay.querySelectorAll("code[data-language]").forEach((code, index) => {
    const sourceCode = sourceCodeBlocks[index];
    if (!sourceCode) return;
    if (sourceCode.dataset.language !== "auto") {
      detectedCodeLanguages.delete(sourceCode);
    }
    if (code.dataset.language === "plaintext") return;
    const highlighted = getHighlightedFragment(code.textContent, code.dataset.language);
    if (highlighted) {
      code.replaceChildren(highlighted.fragment);
      if (sourceCode.dataset.language === "auto") {
        detectedCodeLanguages.set(sourceCode, {
          source: sourceCode.textContent,
          language: CODE_LANGUAGE_IDS.includes(highlighted.language) ? highlighted.language : null,
        });
      }
      highlightedCount += 1;
    } else if (sourceCode.dataset.language === "auto") {
      detectedCodeLanguages.set(sourceCode, { source: sourceCode.textContent, language: null });
    }
  });

  noteContentHighlights.replaceChildren(...Array.from(overlay.childNodes));
  noteContent.classList.toggle("is-syntax-highlighted", highlightedCount > 0);
  noteContentHighlights.hidden = highlightedCount === 0;
  syncNoteContentHighlightsViewport();
  updateCodeBlockControls();
  return highlightedCount > 0;
}

function syncNoteContentHighlightsViewport() {
  if (noteContent.clientWidth > 0) {
    noteContentHighlights.style.insetInlineEnd = "auto";
    noteContentHighlights.style.width = `${noteContent.clientWidth}px`;
  }
  noteContentHighlights.style.transform = `translate(${-noteContent.scrollLeft}px, ${-noteContent.scrollTop}px)`;
}

noteContent.addEventListener("scroll", () => {
  syncNoteContentHighlightsViewport();
  updateCodeBlockControls();
}, { passive: true });
new ResizeObserver(() => {
  syncNoteContentHighlightsViewport();
  updateCodeBlockControls();
}).observe(noteContent);
window.addEventListener("resize", () => {
  syncNoteContentHighlightsViewport();
  updateCodeBlockControls();
});

