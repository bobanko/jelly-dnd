import {initI18n,i18n} from './i18n.js';
import {initEditorI18n,editorI18n} from './editor-i18n.js';
import {loadBuildVersion} from './menu-scene.js';
import {loadLevels} from './level-loader.js';

const $entry=document.querySelector('script[type="module"][data-entry]');
const entryScript=$entry.dataset.entry;
if(entryScript==='editor.js')initEditorI18n();
initI18n();
editorI18n?.apply();
if(entryScript==='game.js')loadBuildVersion();
let storage;
try{storage=globalThis.localStorage;}catch{}

await loadLevels({
 entryScript,document,location,history,i18n,storage,
 startEntry:entry=>import(new URL(entry,import.meta.url))
});
