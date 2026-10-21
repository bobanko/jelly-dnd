const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Levels=require('../levels.js');
const catalog=require('../levels/catalog.js');
let run=0;

async function boot({entry='game.js',search='',failure,deniedStorage=false}={}){
 const names=['document','location','history','fetch','localStorage','JellyLevels','JellyI18n','JellyMenuOnly','JellyProgress','JellyLevelCatalog','JellyLevelMaps','JellyEditorModel'];
 const original=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 const element=()=>({hidden:true,textContent:'',value:0,children:[],dataset:{},classList:{add(){}},append(...children){this.children.push(...children);},setAttribute(name,value){this[name]=value;},querySelectorAll(){return [];}});
 const elements=Object.fromEntries(['#level-intro','#level-intro-title','#level-loading','#loading-status','#loading-progress','#loading-retry','#menu-levels .level-list'].map(selector=>[selector,element()]));
 const entries=[],alerts=[],requests=[],saved=new Map();let redirected;
 try{
  for(const name of names)delete globalThis[name];
  Object.assign(globalThis,{
   document:{querySelector:selector=>selector==='script[type="module"][data-entry]'?{dataset:{entry}}:elements[selector],createElement:element,body:{append($script){entries.push($script.src);$script.onload();},prepend($message){alerts.push($message);}}},
   location:{search},history:{replaceState(a,b,url){redirected=url;}},
   fetch:async url=>{requests.push(url);return {ok:url!==failure,status:url===failure?404:200,json:async()=>JSON.parse(fs.readFileSync(url,'utf8'))};},
   JellyLevels:Levels,JellyI18n:{t:key=>key,language:'en'}
  });
  if(entry==='editor.js')delete elements['#level-intro'];
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){if(deniedStorage)throw Error('Storage denied');return {getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)};}});
  await import('../level-loader.js?test='+run++);
  return {elements,entries,alerts,requests,redirected,maps:globalThis.JellyLevelMaps,menuOnly:globalThis.JellyMenuOnly,progress:globalThis.JellyProgress,editorModel:globalThis.JellyEditorModel};
 }finally{
  for(const [name,descriptor] of original){delete globalThis[name];if(descriptor)Object.defineProperty(globalThis,name,descriptor);}
 }
}

test('module loader publishes validated campaign maps before launching the menu',async()=>{
 const result=await boot();
 assert.deepEqual(result.entries,['game.js']);
 assert.equal(result.menuOnly,true);
 assert.equal(Object.keys(result.maps).length,catalog.standard.length);
 assert.equal(result.maps[1].name,Levels.standardLevel(1).name);
 assert.equal(result.elements['#menu-levels .level-list'].children.length,catalog.standard.length);
 assert.equal(result.progress.canPlay(1),true);
 assert.equal(result.progress.canPlay(2),false);
});

test('module loader redirects locked levels and still starts without local storage',async()=>{
 const result=await boot({search:'?level=2&play=1',deniedStorage:true});
 assert.equal(result.redirected,'?level=1');
 assert.deepEqual(result.entries,['game.js']);
 assert.equal(result.menuOnly,false);
 assert.match(result.elements['#level-intro-title'].textContent,/^1\. /);
});

test('failed campaign requests show an error without publishing partial maps or starting the game',async()=>{
 const file='levels/'+catalog.standard[0];
 const result=await boot({search:'?play=1',failure:file});
 assert.deepEqual(result.entries,[]);
 assert.equal(result.maps,undefined);
 assert.equal(result.elements['#level-intro'].hidden,false);
 assert.equal(result.elements['#loading-status'].textContent,'Could not load '+file+' (404)');
 assert.equal(result.elements['#loading-progress'].hidden,true);
 assert.equal(result.elements['#loading-retry'].hidden,false);
});

test('editor startup loads maps without creating player progression',async()=>{
 const result=await boot({entry:'editor.js'});
 assert.deepEqual(result.entries,['editor.js']);
 assert.equal(result.progress,undefined);
 assert.equal(result.maps[1].name,Levels.standardLevel(1).name);
 const model=new result.editorModel.Model(Levels,result.maps[1]);
 assert.deepEqual(model.map,Levels.read(result.maps[1]));
});

test('editor loading failure exposes an accessible alert and keeps the editor from starting',async()=>{
 const result=await boot({entry:'editor.js',failure:'levels/'+catalog.standard[0]});
 assert.deepEqual(result.entries,[]);
 assert.equal(result.alerts.length,1);
 assert.equal(result.alerts[0].role,'alert');
 assert.match(result.alerts[0].textContent,/Could not load/);
});
