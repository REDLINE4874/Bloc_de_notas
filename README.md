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
│           │   ├── theme.js
│           │   └── typography.js
│           ├── core/
│           │   ├── state.js
│           │   ├── ui.js
│           │   └── notes-utils.js
│           ├── features/
│           │   ├── library.js
│           │   ├── editor.js
│           │   └── sharing.js
│           └── app.js                # Inicialización y eventos
└── supabase/
    ├── notes.sql
    ├── profiles.sql
    └── note-sharing.sql
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
compartido por nombre de usuario. Ya que el backend pertenece a ambas apps,
no vuelvas a ejecutar estos scripts si la base de datos actual ya está
configurada.

## Publicación

Publica el contenido de `frontend/` como raíz del sitio. El manifiesto y el
service worker mantienen la instalación PWA y la caché separados del Manual.
La copia que actualmente vive dentro del repositorio de Manual se conserva
temporalmente para no romper su enlace hasta que se configure la URL pública
de este proyecto independiente.

## Organización del frontend

Los estilos se separan por área y `src/css/estilos.css` importa los módulos en
el orden visual requerido. La lógica se divide en autenticación, componentes,
utilidades centrales y funciones de biblioteca, editor y compartido. Los
scripts JavaScript se cargan como scripts clásicos en el orden declarado en
`index.html`, ya que comparten el estado central de la aplicación.
