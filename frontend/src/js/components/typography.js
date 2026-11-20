function applyNoteFontSize(size) {
  const parsedSize = Number(size);
  const selectedSize = Number.isFinite(parsedSize)
    ? Math.min(72, Math.max(8, parsedSize))
    : 16;
  document.documentElement.style.setProperty("--note-font-size", `${selectedSize}px`);
  const fontSizeSelect = document.getElementById("fontSizeSelect");
  if (fontSizeSelect) {
    let option = Array.from(fontSizeSelect.options).find((item) => Number(item.value) === selectedSize);
    if (!option) {
      option = new Option(String(selectedSize), String(selectedSize));
      fontSizeSelect.add(option);
    }
    fontSizeSelect.value = String(selectedSize);
  }
}

function initializeNoteFontSize() {
  let size = 16;
  try {
    size = Number(localStorage.getItem(NOTE_FONT_SIZE_STORAGE_KEY)) || 16;
  } catch (error) {
    setGlobalStatus(`No se pudo leer el tamaño de fuente: ${error.message}`, true);
  }
  applyNoteFontSize(size);
}

