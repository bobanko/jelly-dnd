/* Load authored JSON maps before starting either the game or the editor. */
import * as catalog from './levels/catalog.js';
import {create as createProgress} from './progression.js';

const $entry=document.querySelector('script[type="module"][data-entry]');
const entryScript=$entry.dataset.entry;
const t=key=>globalThis.JellyI18n?.t(key)||key;
const $overlay=document.querySelector('#level-intro');
const $title=document.querySelector('#level-intro-title');
const $loading=document.querySelector('#level-loading');
const $status=document.querySelector('#loading-status');
const $progress=document.querySelector('#loading-progress');
const $retry=document.querySelector('#loading-retry');
const menuOnly=entryScript==='game.js'&&!location.search.includes('level=editor')&&!/(?:^|[?&])play=1(?:&|$)/.test(location.search);

// Temporary bridge while the game/editor entry points still use classic scripts.
let storage;
try{storage=globalThis.localStorage;}catch{}
const progress=entryScript==='game.js'?createProgress(storage):null;
globalThis.JellyMenuOnly=menuOnly;
globalThis.JellyLevelCatalog=catalog;
if(progress)globalThis.JellyProgress=progress;

async function readJSON(url){
 const response=await fetch(url);
 if(!response.ok)throw Error('Could not load '+url+' ('+response.status+')');
 return response.json();
}

function showLoading(){
 if(!$overlay||menuOnly)return;
 $overlay.hidden=false;$overlay.classList.add('loading');
 $title.textContent=t('loadingLevel');$loading.hidden=false;
 $status.textContent=t('loadingLevel');$progress.value=.02;
}

function renderLevelList(maps){
 const $list=document.querySelector('#menu-levels .level-list');
 if(!$list)return;
 $list.querySelectorAll('[data-level]').forEach($button=>$button.remove());
 catalog.standard.forEach((file,index)=>{
  const $button=document.createElement('button');
  $button.dataset.level=String(index+1);$button.append(String(index+1).padStart(2,'0')+' ');
  const $name=document.createElement('span');
  $name.dataset.levelName=String(index+1);
  $name.textContent=JellyLevels.displayName(maps[index+1],globalThis.JellyI18n?.language);
  $button.append($name);$list.append($button);
 });
}

function startEntry(){
 return new Promise((resolve,reject)=>{
  const $script=document.createElement('script');
  $script.src=entryScript;$script.onload=resolve;
  $script.onerror=()=>reject(Error('Could not load '+entryScript));
  document.body.append($script);
 });
}

function showError(error){
 if($overlay){
  $overlay.hidden=false;$overlay.classList.add('loading');$loading.hidden=false;
  $status.textContent=error.message;$progress.hidden=true;$retry.hidden=false;
  return;
 }
 const $message=document.createElement('p');
 $message.setAttribute('role','alert');$message.textContent=error.message;
 document.body.prepend($message);
}

async function start(){
 showLoading();
 try{
  if(catalog.version!==1||!Array.isArray(catalog.standard)||!catalog.standard.length||new Set(catalog.standard).size!==catalog.standard.length||!Array.isArray(catalog.extra))throw Error('Invalid level catalog');
  progress?.configure(catalog.standard);
  const params=new URLSearchParams(location.search);
  let selected=Number(params.get('level'))||1;
  if(params.get('level')!=='editor'&&params.has('level')&&progress&&!progress.canPlay(selected)){
   selected=1;history.replaceState(null,'','?level=1');
  }
  if(!catalog.standard[selected-1])throw Error('Unknown level: '+selected);
  const maps={};
  await Promise.all(catalog.standard.map(async(file,index)=>{
   if(!/^[a-z0-9-]+\.json$/i.test(file))throw Error('Invalid level file');
   const map=JellyLevels.read(await readJSON('levels/'+file));
   const errors=JellyLevels.issues(map);
   if(errors.length)throw Error(file+': '+errors.join('\n'));
   maps[index+1]=map;
  }));
  globalThis.JellyLevelMaps=maps;
  if($overlay&&!menuOnly)$title.textContent=selected+'. '+JellyLevels.displayName(maps[selected],globalThis.JellyI18n?.language);
  renderLevelList(maps);
  await startEntry();
 }catch(error){showError(error);}
}

await start();
