const CACHE_NAME = "notas-standalone-shell-v18";
const CACHE_PREFIX = "notas-standalone-shell-";
const APP_SHELL = new URL("./", self.location.href).toString();
const SHELL_FILES = [
  APP_SHELL,
  new URL("./src/css/estilos.css", self.location.href).toString(),
  new URL("./src/css/fundamentos.css", self.location.href).toString(),
  new URL("./src/css/autenticacion.css", self.location.href).toString(),
  new URL("./src/css/navegacion.css", self.location.href).toString(),
  new URL("./src/css/editor.css", self.location.href).toString(),
  new URL("./src/css/modales.css", self.location.href).toString(),
  new URL("./src/css/adaptable.css", self.location.href).toString(),
  new URL("./src/js/core/state.js", self.location.href).toString(),
  new URL("./src/js/core/ui.js", self.location.href).toString(),
  new URL("./src/js/components/theme.js", self.location.href).toString(),
  new URL("./src/js/features/rich-content.js", self.location.href).toString(),
  new URL("./src/js/core/notes-utils.js", self.location.href).toString(),
  new URL("./src/js/auth/site-auth.js", self.location.href).toString(),
  new URL("./src/js/features/library.js", self.location.href).toString(),
  new URL("./src/js/features/editor.js", self.location.href).toString(),
  new URL("./src/js/features/sharing.js", self.location.href).toString(),
  new URL("./src/js/features/editor-formatting.js", self.location.href).toString(),
  new URL("./src/js/app.js", self.location.href).toString(),
  new URL("./src/js/auth/supabase-config.js", self.location.href).toString(),
  new URL("./manifest.webmanifest", self.location.href).toString(),
  new URL("./assets/icons/logoapp.svg?v=11", self.location.href).toString(),
  new URL("./assets/icons/apple-touch-icon.png?v=11", self.location.href).toString(),
  new URL("./assets/icons/icon-192-v12.png", self.location.href).toString(),
  new URL("./assets/icons/icon-512-v12.png", self.location.href).toString(),
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(APP_SHELL, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(APP_SHELL)) || Response.error()),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request)),
  );
});
