(function(root){
 'use strict';
 const KEY='jelly-dnd.progress.v2',LEGACY_KEY='jelly-dnd.unlocked-level';
 // Historical file identities, used only to migrate the original five-level saves.
 const LEGACY_FILES=['01-first-steps.json','02-helping-hands.json','03-true-colors.json','04-through-the-rift.json','05-sunken-sanctum.json'];
 function create(storage){
  let order=[],configured=false,saved=false,legacy=1;
  const completed=new Set(),unlocked=new Set();
  try{const data=JSON.parse(storage?.getItem(KEY)||'null');if(data?.version===2&&Array.isArray(data.completed)&&Array.isArray(data.unlocked)){for(const file of data.completed)if(typeof file==='string')completed.add(file);for(const file of data.unlocked)if(typeof file==='string')unlocked.add(file);saved=true;}}catch{}
  if(!saved)try{const value=Number(storage?.getItem(LEGACY_KEY));if(Number.isInteger(value)&&value>=1&&value<=LEGACY_FILES.length)legacy=value;}catch{}
  function persist(){try{storage?.setItem(KEY,JSON.stringify({version:2,completed:[...completed],unlocked:[...unlocked]}));}catch{}}
  return {
   configure(files){
    order=[...files];
    if(!configured&&!saved&&legacy>1){for(const file of LEGACY_FILES.slice(0,legacy))unlocked.add(file);for(const file of LEGACY_FILES.slice(0,legacy-1))completed.add(file);}
    configured=true;
    if(order.length)unlocked.add(order[0]);
    order.forEach((file,index)=>{if(completed.has(file)&&order[index+1])unlocked.add(order[index+1]);});persist();
   },
   get unlocked(){return order.reduce((max,file,i)=>unlocked.has(file)?i+1:max,0);},
   canPlay(id){return Number.isInteger(id)&&id>=1&&id<=order.length&&unlocked.has(order[id-1]);},
   complete(id){if(!this.canPlay(id))return this.unlocked;completed.add(order[id-1]);if(order[id])unlocked.add(order[id]);persist();return this.unlocked;}
  };
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={create,KEY,LEGACY_KEY};
 else{let storage;try{storage=root.localStorage;}catch{}root.JellyProgress=create(storage);}
})(globalThis);
