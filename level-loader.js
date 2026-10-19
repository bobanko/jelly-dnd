/* Load authored JSON maps before starting either the game or the editor. */
(async()=>{
 'use strict';
 const entryScript=document.currentScript.dataset.entry;
 const t=key=>globalThis.JellyI18n?.t(key)||key;
 const overlay=document.querySelector('#level-intro');
 if(overlay){overlay.hidden=false;overlay.classList.add('loading');document.querySelector('#level-intro-title').textContent=t('loadingLevel');document.querySelector('#level-loading').hidden=false;document.querySelector('#loading-status').textContent=t('loadingLevel');document.querySelector('#loading-progress').value=.02;}
 try{
  const readJSON=async url=>{const response=await fetch(url);if(!response.ok)throw Error('Could not load '+url+' ('+response.status+')');return response.json();};
  const catalog=await readJSON('levels/catalog.json');
  if(catalog.version!==1||!Array.isArray(catalog.standard)||!catalog.standard.length)throw Error('Invalid level catalog');
  globalThis.JellyLevelCatalog=catalog;globalThis.JellyLevelMaps={};
  if(globalThis.JellyProgress)JellyProgress.setLevelCount(catalog.standard.length);
  const params=new URLSearchParams(location.search);let selected=Number(params.get('level'))||catalog.defaultLevel;
  if(params.get('level')!=='editor'&&params.has('level')&&globalThis.JellyProgress&&!JellyProgress.canPlay(selected)){selected=catalog.standard[0].id;history.replaceState(null,'','?level='+selected);}
  const selectedEntry=catalog.standard.find(level=>level.id===selected);
  if(!selectedEntry)throw Error('Unknown level: '+selected);
  if(overlay)document.querySelector('#level-intro-title').textContent=t(selectedEntry.name);
  await Promise.all([...new Set([catalog.defaultLevel,selected])].map(async id=>{const item=catalog.standard.find(level=>level.id===id);if(!item||!/^[a-z0-9-]+\.json$/i.test(item.file))throw Error('Invalid level file');const map=JellyLevels.read(await readJSON('levels/'+item.file));const errors=JellyLevels.issues(map);if(errors.length)throw Error(item.file+': '+errors.join('\n'));JellyLevelMaps[id]=map;}));
  const list=document.querySelector('#menu-levels .level-list');
  if(list){list.querySelectorAll('[data-level]').forEach(button=>button.remove());catalog.standard.forEach(item=>{const button=document.createElement('button');button.dataset.level=String(item.id);button.append(String(item.id).padStart(2,'0')+' ');const title=document.createElement('span');title.dataset.t=item.name;title.textContent=t(item.name);button.append(title);list.insertBefore(button,document.querySelector('#levels-back'));});}
  await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=entryScript;script.onload=resolve;script.onerror=()=>reject(Error('Could not load '+entryScript));document.body.append(script);});
 }catch(error){
  if(overlay){document.querySelector('#loading-status').textContent=error.message;document.querySelector('#loading-progress').hidden=true;document.querySelector('#loading-retry').hidden=false;}
  else{const message=document.createElement('p');message.setAttribute('role','alert');message.textContent=error.message;document.body.prepend(message);}
 }
})();
