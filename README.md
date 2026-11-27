# Notas

Aplicación web estática en HTML, CSS y JavaScript, con instalación PWA y
sincronización mediante el mismo proyecto de Supabase que usa Manual.
No requiere servidor propio, instalación de dependencias ni compilación.

## Estructura

```text
.
├── frontend/
│   ├── index.html
│   ├── manifest.webmanifest
│   ├── service-worker.js
│   ├── assets/
│   │   └── icons/          # Iconos de la aplicación
│   └── src/
│       ├── css/
│       │   ├── estilos.css             # Punto de entrada de estilos
│       │   ├── fundamentos.css         # Variables y estilos base
│       │   ├── autenticacion.css       # Inicio de sesión y controles
│       │   ├── navegacion.css          # Encabezado y pestañas
│       │   ├── editor.css              # Editor y biblioteca de notas
│       │   ├── modales.css             # Diálogos y controles de compartir
│       │   └── adaptable.css           # Diseño responsivo y accesibilidad
│       └── js/
│           ├── auth/
│           │   ├── supabase-config.js
│           │   └── site-auth.js
│           ├── components/
│           │   └── theme.js
│           ├── core/
│           │   ├── state.js
│           │   ├── ui.js
│           │   └── notes-utils.js
│           ├── features/
│           │   ├── rich-content.js
│           │   ├── library.js
│           │   ├── editor.js
│           │   ├── sharing.js
│           │   └── editor-formatting.js
│           └── app.js                # Inicialización y eventos
└── supabase/
    ├── notes.sql
    ├── profiles.sql
    ├── note-sharing.sql
    └── note-tab-states.sql
```

## Desarrollo local

Desde la raíz del proyecto:

```powershell
py -m http.server 5501 --directory frontend
```

Abre `http://localhost:5501/`. No abras `index.html` con `file://`; la
autenticación de Supabase requiere un origen HTTP. Agrega
`http://localhost:5501/**` a Authentication > URL Configuration > Redirect
URLs en Supabase para que funcionen los enlaces de recuperación de contraseña.

## Supabase

Notas conserva la URL y la clave pública `anon` configuradas para Manual en
`frontend/src/js/auth/supabase-config.js`. Ambas aplicaciones usan el mismo
proyecto, cuentas, tablas, notas compartidas y políticas RLS; la sesión local
de una app no se transfiere automáticamente a la otra. No reemplaces la clave
por una clave `service_role`.

Los scripts de `supabase/` documentan el esquema compartido: `notes.sql`
configura las notas, `profiles.sql` los perfiles y `note-sharing.sql` el
compartido por nombre de usuario. `note-tab-states.sql` sincroniza entre
dispositivos las pestañas abiertas y la nota activa. Si la base de datos ya
está configurada, ejecuta de nuevo `notes.sql` para añadir las columnas del
modo desarrollador; es idempotente y conserva las notas existentes.

## Publicación

Publica el contenido de `frontend/` como raíz del sitio. El manifiesto y el
service worker mantienen la instalación PWA y la caché separados del Manual.
Notas se mantiene en este repositorio independiente y no requiere una copia
dentro del repositorio de Manual.

## Organización del frontend

Los estilos se separan por área y `src/css/estilos.css` importa los módulos en
el orden visual requerido. La lógica se divide en autenticación, componentes,
utilidades centrales y funciones de contenido enriquecido, biblioteca, editor,
compartido y formato. El editor permite buscar dentro de una nota, aplicar
formato enriquecido e insertar código con resaltado de sintaxis mediante
Highlight.js. Los scripts JavaScript se
cargan como scripts clásicos en el orden declarado en `index.html`, ya que
comparten el estado central de la aplicación.
