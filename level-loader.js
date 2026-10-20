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
  if(catalog.version!==1||!Array.isArray(catalog.standard)||!catalog.standard.length||new Set(catalog.standard).size!==catalog.standard.length||!catalog.standard.includes(catalog.defaultLevel))throw Error('Invalid level catalog');
  globalThis.JellyLevelCatalog=catalog;globalThis.JellyLevelMaps={};
  if(globalThis.JellyProgress)JellyProgress.configure(catalog.standard);
  const params=new URLSearchParams(location.search);let selected=Number(params.get('level'))||catalog.standard.indexOf(catalog.defaultLevel)+1;
  if(params.get('level')!=='editor'&&params.has('level')&&globalThis.JellyProgress&&!JellyProgress.canPlay(selected)){selected=1;history.replaceState(null,'','?level=1');}
  if(!catalog.standard[selected-1])throw Error('Unknown level: '+selected);
  await Promise.all(catalog.standard.map(async(file,index)=>{if(!/^[a-z0-9-]+\.json$/i.test(file))throw Error('Invalid level file');const map=JellyLevels.read(await readJSON('levels/'+file));const errors=JellyLevels.issues(map);if(errors.length)throw Error(file+': '+errors.join('\n'));JellyLevelMaps[index+1]=map;}));
  if(overlay)document.querySelector('#level-intro-title').textContent=JellyLevels.displayName(JellyLevelMaps[selected],globalThis.JellyI18n?.language);
  const list=document.querySelector('#menu-levels .level-list');
  if(list){list.querySelectorAll('[data-level]').forEach(button=>button.remove());catalog.standard.forEach((file,index)=>{const button=document.createElement('button');button.dataset.level=String(index+1);button.append(String(index+1).padStart(2,'0')+' ');const title=document.createElement('span');title.dataset.levelName=String(index+1);title.textContent=JellyLevels.displayName(JellyLevelMaps[index+1],globalThis.JellyI18n?.language);button.append(title);list.append(button);});}
  await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=entryScript;script.onload=resolve;script.onerror=()=>reject(Error('Could not load '+entryScript));document.body.append(script);});
 }catch(error){
  if(overlay){document.querySelector('#loading-status').textContent=error.message;document.querySelector('#loading-progress').hidden=true;document.querySelector('#loading-retry').hidden=false;}
  else{const message=document.createElement('p');message.setAttribute('role','alert');message.textContent=error.message;document.body.prepend(message);}
 }
})();
