(function(root){
 'use strict';
 const KEY='jelly-dnd.unlocked-level',COUNT=5;
 function create(storage){
  let unlocked=1;
  try{const saved=Number(storage?.getItem(KEY));if(Number.isInteger(saved)&&saved>=1&&saved<=COUNT)unlocked=saved;}catch{}
  return {
   get unlocked(){return unlocked;},
   canPlay(id){return Number.isInteger(id)&&id>=1&&id<=unlocked;},
   complete(id){
    if(!this.canPlay(id))return unlocked;
    unlocked=Math.max(unlocked,Math.min(COUNT,id+1));
    try{storage?.setItem(KEY,String(unlocked));}catch{}
    return unlocked;
   }
  };
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={create,KEY,COUNT};
 else{let storage;try{storage=root.localStorage;}catch{}root.JellyProgress=create(storage);}
})(globalThis);
