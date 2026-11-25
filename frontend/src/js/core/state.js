var authScreen = document.getElementById("authScreen");
var authTitle = document.getElementById("authTitle");
var loginForm = document.getElementById("loginForm");
var recoveryForm = document.getElementById("recoveryForm");
var updatePasswordForm = document.getElementById("updatePasswordForm");
var authStatus = document.getElementById("authStatus");
var appShell = document.getElementById("appShell");
var notesList = document.getElementById("notesList");
var scrollTabsLeft = document.getElementById("scrollTabsLeft");
var scrollTabsRight = document.getElementById("scrollTabsRight");
var undoNote = document.getElementById("undoNote");
var redoNote = document.getElementById("redoNote");
var notesEmpty = document.getElementById("notesEmpty");
var openEditor = document.getElementById("openEditor");
var openMyNotes = document.getElementById("openMyNotes");
var openSharedNotes = document.getElementById("openSharedNotes");
var sharedNotesCount = document.getElementById("sharedNotesCount");
var workspace = document.getElementById("workspace");
var noteTabbar = document.querySelector(".note-tabbar");
var libraryView = document.getElementById("libraryView");
var libraryTitle = document.getElementById("libraryTitle");
var libraryDescription = document.getElementById("libraryDescription");
var librarySearch = document.getElementById("librarySearch");
var noteSearchInput = document.getElementById("noteSearchInput");
var libraryNotesList = document.getElementById("libraryNotesList");
var libraryEmpty = document.getElementById("libraryEmpty");
var importTextFile = document.getElementById("importTextFile");
var textFileInput = document.getElementById("textFileInput");
var accountToggle = document.getElementById("accountToggle");
var accountPopover = document.getElementById("accountPopover");
var accountPopoverName = document.getElementById("accountPopoverName");
var accountMenu = document.querySelector(".account-menu");
var saveStatus = document.getElementById("saveStatus");
var noteSharingStatus = document.getElementById("noteSharingStatus");
var globalStatus = document.getElementById("globalStatus");
var noteEditor = document.getElementById("noteEditor");
var emptyState = document.getElementById("emptyState");
var noteTitle = document.getElementById("noteTitle");
var noteContent = document.getElementById("noteContent");
var lastEditorInput = noteContent;
var savedTitleSelection = null;
var noteContentWrap = document.getElementById("noteContentWrap");
var noteContentHighlights = document.getElementById("noteContentHighlights");
var codeBlockActions = document.getElementById("codeBlockActions");
var noteFindPanel = document.getElementById("noteFindPanel");
var noteFindInput = document.getElementById("noteFindInput");
var findInNote = document.getElementById("findInNote");
var noteFindCount = document.getElementById("noteFindCount");
var noteFindPrevious = document.getElementById("noteFindPrevious");
var noteFindNext = document.getElementById("noteFindNext");
var noteDate = document.getElementById("noteDate");
var themeToggles = document.querySelectorAll("[data-theme-toggle]");
var editorHint = document.getElementById("editorHint");
var draftNotice = document.getElementById("draftNotice");
var sharingSection = document.getElementById("sharingSection");
var sharedUserCount = document.getElementById("sharedUserCount");
var sharedUsers = document.getElementById("sharedUsers");
var shareDialog = document.getElementById("shareDialog");
var shareForm = document.getElementById("shareForm");
var shareStatus = document.getElementById("shareStatus");
var confirmDialog = document.getElementById("confirmDialog");
var confirmDialogTitle = document.getElementById("confirmDialogTitle");
var confirmDialogMessage = document.getElementById("confirmDialogMessage");
var cancelConfirmation = document.getElementById("cancelConfirmation");
var acceptConfirmation = document.getElementById("acceptConfirmation");
var settingsButton = document.getElementById("settingsButton");
var settingsMenu = document.getElementById("settingsMenu");
var fontSizeOption = document.getElementById("fontSizeOption");
var fontSizeDialog = document.getElementById("fontSizeDialog");
var fontFamilySelect = document.getElementById("fontFamilySelect");
var fontSizeSelect = document.getElementById("fontSizeSelect");
var applyCodeFormat = document.getElementById("applyCodeFormat");
var cancelFontSize = document.getElementById("cancelFontSize");
var confirmFontSize = document.getElementById("confirmFontSize");
var formatToolbar = document.getElementById("formatToolbar");

var config = window.SUPABASE_CONFIG || {};
var supabaseReady = Boolean(
  window.supabase?.createClient
  && config.url
  && config.anonKey
  && !config.url.includes("TU-PROYECTO")
  && !config.anonKey.includes("TU-ANON-KEY"),
);
var DRAFT_PREFIX = "notas-app-draft";
var THEME_STORAGE_KEY = "notas-app-theme";
var OPEN_TABS_PREFIX = "notas-app-open-tabs";
var OPEN_TAB_STATE_TABLE = "note_tab_states";
var READ_SHARED_NOTES_PREFIX = "notas-app-read-shared-notes";
var NOTE_CONTENT_PREFIX = "<!-- notas-app-rich-text:v1 -->";
var CODE_LANGUAGE_OPTIONS = [
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
];
var CODE_LANGUAGE_IDS = CODE_LANGUAGE_OPTIONS
  .filter(({ value }) => value !== "auto")
  .map(({ value }) => value);
var NOTE_FONT_FAMILIES = [
  "Inter, 'Segoe UI', system-ui, sans-serif",
  "Arial, sans-serif",
  "Aptos, sans-serif",
  "Calibri, sans-serif",
  "Georgia, serif",
  "Verdana, sans-serif",
  "'Courier New', monospace",
];
var NOTE_MAX_LENGTH = 20000;
var shortDateTimeFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "short",
  timeStyle: "short",
  hour12: true,
});

var client = null;
var currentUser = null;
var recoveryActive = false;
var persistentAuthMessage = "";
var pendingFormatContent = null;
var pendingEditorSelection = null;
var savedEditorSelection = null;
var loadedNotes = [];
var loadedShares = [];
var sharePermissions = new Map();
var shareOwners = new Map();
var ownerShares = new Map();
var noteUsers = [];
var openNoteIds = [];
var openTabsUserId = null;
var activeSection = "editor";
var sectionBeforeSearch = "editor";
var activeNoteId = null;
var openTabSaveQueue = Promise.resolve();
var readSharedNoteIds = new Set();
var installPrompt = null;
var saveTimer = null;
var saveQueue = Promise.resolve();
var globalStatusTimer = null;
var pendingConfirmResolution = null;
var noteFindMatches = [];
var noteFindCurrent = 0;
var noteRevisions = new Map();

