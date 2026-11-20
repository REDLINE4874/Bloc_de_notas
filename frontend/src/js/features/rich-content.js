function sanitizeNoteContent(html) {
  const root = document.createElement("div");
  root.innerHTML = String(html ?? "");
  const allowedTags = new Set(["B", "STRONG", "I", "EM", "U", "BR", "SPAN", "DIV", "P", "CODE"]);
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
      const codeLanguage = node.tagName === "CODE"
        && (CODE_LANGUAGE_IDS.includes(node.getAttribute("data-language")) || node.getAttribute("data-language") === "auto")
        ? node.getAttribute("data-language")
        : "";
      Array.from(node.attributes).forEach((attribute) => node.removeAttribute(attribute.name));
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
    if (["DIV", "P"].includes(node.tagName) && text.length > start && !text.endsWith("\n")) text += "\n";
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
  return fragment;
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
    /(?:=>|->|===?|!==?|&&|\|\||\+\+|--|:=)/,
    /[{}[\]();]/,
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
  const fragment = immediateLanguage
    ? getHighlightedFragment(text, immediateLanguage)
    : getHighlightedFragment(text, "auto", true);
  if (!fragment) return false;
  if (node.nodeType === Node.TEXT_NODE) node.replaceWith(fragment);
  else node.replaceChildren(fragment);
  return true;
}

function updateSyntaxHighlights() {
  if (noteFindPanel && !noteFindPanel.hidden) return false;
  const overlay = noteContent.cloneNode(true);
  let highlightedCount = 0;

  overlay.querySelectorAll("code[data-language]").forEach((code) => {
    const fragment = getHighlightedFragment(code.textContent, code.dataset.language);
    if (fragment) {
      code.replaceChildren(fragment);
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
  return highlightedCount > 0;
}

