import { initI18n, i18n } from './i18n/i18n.js';
import { editorMessages } from './i18n/locales/editor/index.js';
import { initEditorI18n, editorI18n } from './editor/editor-i18n.js';
import { loadBuildVersion } from './game/menu-scene.js';
import { loadLevels } from './level-loader.js';

const $entry = document.querySelector('script[type="module"][data-entry]');
const entryScript = $entry.dataset.entry;
if (entryScript === 'editor.js') initEditorI18n();
initI18n({ additionalMessages: entryScript === 'editor.js' ? editorMessages : {} });
editorI18n?.apply();
if (entryScript === 'game.js') loadBuildVersion();
let storage;
try {
  storage = globalThis.localStorage;
} catch {}

await loadLevels({
  entryScript,
  document,
  location,
  history,
  i18n,
  storage,
  startEntry: (entry) => import(new URL(entry, import.meta.url)),
});
