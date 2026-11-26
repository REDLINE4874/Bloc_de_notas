function applyTheme(theme) {
  const isDark = theme === "dark";
  const selectedTheme = isDark ? "dark" : "light";
  document.documentElement.dataset.theme = selectedTheme;
  themeToggles.forEach((toggle) => {
    toggle.setAttribute("aria-checked", String(isDark));
    toggle.title = `Cambiar a tema ${isDark ? "claro" : "oscuro"}`;
  });
  document.querySelector('meta[name="theme-color"]').content = isDark ? "#292929" : "#f6f7fb";
  if (typeof updateNoteTextContrast === "function") updateNoteTextContrast();
}

function initializeTheme() {
  let theme = "light";
  try {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme === "light" || savedTheme === "dark") theme = savedTheme;
  } catch (error) {
    setGlobalStatus(`No se pudo leer la preferencia del tema: ${error.message}`, true);
  }
  applyTheme(theme);
}

function toggleTheme() {
  const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    setGlobalStatus(`No se pudo guardar la preferencia del tema: ${error.message}`, true);
  }
}

