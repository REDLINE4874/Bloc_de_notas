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
      const isPlainText = node.tagName === "SPAN" && node.getAttribute("data-language") === "plain";
      const codeLanguage = ["CODE", "PRE"].includes(node.tagName)
        && (CODE_LANGUAGE_IDS.includes(node.getAttribute("data-language")) || node.getAttribute("data-language") === "auto")
        ? node.getAttribute("data-language")
        : "";
      Array.from(node.attributes).forEach((attribute) => node.removeAttribute(attribute.name));
      if (isPlainText) node.dataset.language = "plain";
      if (codeLanguage) node.dataset.language = codeLanguage;
      if (fontFamily) {
        const safeFamily = NOTE_FONT_FAMILIES.find((family) => normalizeFont(family) === normalizeFont(fontFamily));
        if (safeFamily) node.style.fontFamily = safeFamily;
      }
      if (/^(?:[8-9]|[1-6]\d|7[0-2])px$/.test(fontSize)) node.style.fontSize = fontSize;
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
  savedEditorSelection = null;
  const storedContent = String(content ?? "");
  if (storedContent.startsWith(NOTE_CONTENT_PREFIX)) {
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

function getHighlightedFragment(source, language, requireConfidence = false) {
  if (!window.hljs || !source) return null;
  const result = language === "auto"
    ? window.hljs.highlightAuto(source, CODE_LANGUAGE_IDS)
    : window.hljs.highlight(source, { language });
  if (requireConfidence
    && (!CODE_LANGUAGE_IDS.includes(result.language) || result.relevance < 2)) return null;

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

function getImmediateCodeLanguage(text) {
  const immediateLanguages = [
    { language: "typescript", pattern: /^\s*(?:interface|type)\b/ },
    { language: "javascript", pattern: /^\s*(?:const|let|var|function|return|import|export|async|await|class|if|for|while)\b/ },
    { language: "python", pattern: /^\s*(?:def|from|print|elif|self)\b/ },
    { language: "sql", pattern: /^\s*(?:select|insert|update|delete|create|where)\b/i },
    { language: "bash", pattern: /^\s*(?:echo|cd|sudo|npm|node|git)\b/ },
    { language: "xml", pattern: /^\s*<\/?[a-z][^>]*>/i },
  ];
  return immediateLanguages.find(({ pattern }) => pattern.test(text))?.language || "";
}

function isLikelyCode(text) {
  if (getImmediateCodeLanguage(text)) return true;
  if ((text.match(/<\/?[a-z][^>]*>/gi) || []).length >= 2) return true;
  const signals = [
    /(?:=>|->|===?|!==?|&&|\|\||\+\+|:=)/,
    /[{}[\];]/,
    /\b(?:const|let|var|function|return|import|from|def|class|if|for|while|select|from|where|print|console)\b/i,
    /<\/?[a-z][^>]*>/i,
  ];
  return signals.filter((signal) => signal.test(text)).length >= 2;
}

function highlightAutomaticTextNode(node) {
  const text = node.nodeType === Node.TEXT_NODE
    ? node.textContent
    : getPlainTextFromRichContent(node);
  if (!text || text.length > NOTE_MAX_LENGTH || !isLikelyCode(text)) return false;
  const immediateLanguage = getImmediateCodeLanguage(text);
  const highlighted = immediateLanguage
    ? getHighlightedFragment(text, immediateLanguage)
    : getHighlightedFragment(text, "auto", true);
  if (!highlighted) return false;
  if (node.nodeType === Node.TEXT_NODE) node.replaceWith(highlighted.fragment);
  else node.replaceChildren(highlighted.fragment);
  return true;
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
      control.className = "code-block-copy-control";
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
      const plainButton = document.createElement("button");
      plainButton.type = "button";
      plainButton.className = "code-block-plain-button";
      plainButton.textContent = "Texto normal";
      plainButton.setAttribute("aria-label", "Texto normal: regresar el bloque de código");
      control.append(button, status, plainButton);
      codeBlockActions.append(control);
    });
  }

  const wrapRect = noteContentWrap.getBoundingClientRect();
  const highlightedCode = Array.from(noteContentHighlights.querySelectorAll("pre > code[data-language]"));
  Array.from(codeBlockActions.children).forEach((control, index) => {
    const code = codeBlocks[index];
    if (!code.id) code.id = `noteCodeBlock-${++codeBlockIdCounter}`;
    const button = control.querySelector("button");
    const language = highlightedCode[index]?.dataset.displayLanguage || code.dataset.language;
    button.setAttribute("commandfor", code.id);
    button.setAttribute("aria-label", `Copiar código ${language === "auto" ? "detectado" : language}`);
    const plainButton = control.querySelector(".code-block-plain-button");
    plainButton.dataset.codePlainTarget = code.id;
    plainButton.disabled = noteContent.getAttribute("contenteditable") !== "true";

    const rect = code.parentElement.getBoundingClientRect();
    control.hidden = rect.bottom <= wrapRect.top
      || rect.top >= wrapRect.bottom
      || rect.right <= wrapRect.left
      || rect.left >= wrapRect.right;
    control.style.setProperty("--code-control-top", `${Math.max(0, rect.top - wrapRect.top + 6)}px`);
    control.style.setProperty("--code-control-right", `${Math.max(0, wrapRect.right - rect.right + 6)}px`);
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

  overlay.querySelectorAll("code[data-language]").forEach((code) => {
    const highlighted = getHighlightedFragment(code.textContent, code.dataset.language);
    if (highlighted) {
      code.replaceChildren(highlighted.fragment);
      code.dataset.displayLanguage = highlighted.language || code.dataset.language;
      const pre = code.closest("pre");
      if (pre) pre.dataset.language = code.dataset.displayLanguage;
      highlightedCount += 1;
    }
  });

  function highlightAutomaticBlocks(parent) {
    Array.from(parent.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (highlightAutomaticTextNode(node)) highlightedCount += 1;
        return;
      }
      if (!(node instanceof HTMLElement) || node.tagName === "CODE") return;
      if (node.tagName === "SPAN" && node.dataset.language === "plain") return;
      if (["DIV", "P"].includes(node.tagName)) {
        const hasNestedElements = Array.from(node.children).some((child) => child.tagName !== "BR");
        if (!hasNestedElements) {
          if (highlightAutomaticTextNode(node)) highlightedCount += 1;
          return;
        }
      }
      highlightAutomaticBlocks(node);
    });
  }

  highlightAutomaticBlocks(overlay);
  noteContentHighlights.replaceChildren(...Array.from(overlay.childNodes));
  noteContent.classList.toggle("is-syntax-highlighted", highlightedCount > 0);
  noteContentHighlights.hidden = highlightedCount === 0;
  noteContentHighlights.style.transform = `translate(${-noteContent.scrollLeft}px, ${-noteContent.scrollTop}px)`;
  updateCodeBlockControls();
  return highlightedCount > 0;
}

noteContent.addEventListener("scroll", updateCodeBlockControls, { passive: true });
window.addEventListener("resize", updateCodeBlockControls);

