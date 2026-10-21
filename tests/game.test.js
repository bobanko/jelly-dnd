import * as menuSceneModule from '../menu-scene.js';
import * as SharedCamera from '../shared-camera.js';
import Levels from '../levels.js';
import * as GameEffects from '../game-effects.js';
import * as Physics from '../physics.js';
import * as SoftBody from '../soft-body.js';
import * as GPU from '../webgpu-renderer.js';
import sunkenSanctum from '../levels/05-sunken-sanctum.json' with {type:'json'};
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
async function game(options={}){
 const noop=()=>{},ctx=new Proxy({createRadialGradient:()=>({addColorStop:noop})},{get:(o,k)=>o[k]??noop});
 const element=()=>({listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},setPointerCapture:noop,getContext:()=>ctx,classList:{toggle:noop},setAttribute:noop,querySelector:()=>element()});
 const elements={},listeners={};
 // Menu metadata is optional; keep this VM test independent of network access.
 const fetch=async()=>({ok:false});
 const sandbox={fetch,innerWidth:1440,innerHeight:900,devicePixelRatio:1,JellySharedCamera:SharedCamera,JellyLevels:Levels,JellyEffects:GameEffects,JellyPhysics:Physics,JellySoftBody:SoftBody,JellyGPU:{...GPU,Renderer:class {constructor(){this.ready=true;}async init(){}render(){}}},document:{addEventListener:()=>{},querySelector:s=>elements[s]??=element(),querySelectorAll:()=>[element(),element()]},addEventListener:(k,f)=>listeners[k]=f,requestAnimationFrame:noop};
 if(!options.map)options.map=structuredClone(sunkenSanctum);
 if(options.map){sandbox.location={search:'?level=editor'};sandbox.localStorage={getItem:()=>JSON.stringify(options.map)};}
 const context=vm.createContext(sandbox);
 const dependencies={
  './levels.js':{default:Levels},
  './physics.js':Physics,
  './soft-body.js':SoftBody,
  './game-effects.js':GameEffects,
  './webgpu-renderer.js':sandbox.JellyGPU,
  './shared-camera.js':SharedCamera,
  './menu-scene.js':menuSceneModule,
  './i18n.js':{i18n:null},
  './runtime-context.js':{menuOnly:!!options.menuOnly,progress:null}
 };
 const source=fs.readFileSync('game.js','utf8')+'\nexport function evaluateTest(source){return eval(source);}';
 const entry=new vm.SourceTextModule(source,{context});
 await entry.link(specifier=>{
  const api=dependencies[specifier];
  if(!api)throw Error('Unexpected game dependency: '+specifier);
  return new vm.SyntheticModule(Object.keys(api),function(){for(const [key,value] of Object.entries(api))this.setExport(key,value);},{context});
 });
 await entry.evaluate();
 const codeFor=key=>({arrowup:'ArrowUp',arrowdown:'ArrowDown',arrowleft:'ArrowLeft',arrowright:'ArrowRight'}[key]||(/^\d$/.test(key)?'Digit'+key:'Key'+key.toUpperCase()));
 return {pointer:(type,options={})=>elements['#scene'].listeners[type]({pointerId:1,button:2,buttons:2,clientX:100,clientY:100,preventDefault:noop,...options}),run:s=>entry.namespace.evaluateTest(s),key:(key,code=codeFor(key),options={})=>listeners.keydown({key,code,preventDefault:noop,...options}),up:(key,code=codeFor(key))=>listeners.keyup({key,code,preventDefault:noop}),blur:()=>listeners.blur()};
}

function partyMap(slots){
 const map=Levels.blank();map.size=8;for(let x=0;x<8;x++)for(let z=0;z<8;z++)map.tiles.push({x,z,height:0});
 slots.forEach((slot,i)=>{map.spawns[slot]={x:1+i*2,z:4};map.goals[slot]={x:1+i*2,z:1};});return map;
}
test('solo and duo levels assign controls by active order, keeping undo/reset and victory',async ()=>{
 for(const slots of [[0],[1],[2],[3],[1,3]]){
  const g=await game({map:partyMap(slots)});assert.equal(g.run('players.length'),slots.length);
  const slot=slots[slots.length-1],key=slots.length===1?'KeyW':'ArrowUp';g.key('layout independent',key);g.run('simulate(.05)');g.up('',key);
  assert.ok(g.run(`players[${slots.length-1}].z<4`));assert.equal(g.run('followedPlayer'),slots.length-1);
  g.key('z');assert.equal(g.run(`players[${slots.length-1}].z`),4);g.key(String(slot+1));assert.equal(g.run('followedPlayer'),slots.length-1);
  g.key('r');assert.equal(g.run('players.length'),slots.length);assert.ok(g.run('players.every(p=>p.state==="alive")'));
  g.run('players.forEach(p=>{const g=goals.find(g=>g.slot===p.slot);Object.assign(p,g,{rx:g.x,rz:g.z});});soft.reset();for(let n=0;n<61;n++)simulate(.05)');assert.equal(g.run('won'),true);
 }
 const solo=await game({map:partyMap([1])});for(const key of ['Digit1','Digit3','Digit4'])solo.key('',key);assert.equal(solo.run('moves'),0);assert.equal(solo.run('followedPlayer'),0);
 const withUnused=partyMap([1]);withUnused.goals[0]={x:5,z:1};const extra=await game({map:withUnused});extra.run('Object.assign(players[0],goals.find(g=>g.slot===1));soft.reset();for(let n=0;n<61;n++)simulate(.05)');assert.equal(extra.run('won'),true,'unused colours do not block victory');
 const wrong=await game({map:withUnused});wrong.run('players[0].x=5;players[0].z=1;soft.reset();simulate(.05);effects.step(.1,world,goals,players)');assert.equal(wrong.run('won'),false);assert.equal(wrong.run('effects.runes.length'),0,'another colour cannot activate an unused rune');
});
test('every control set works for every solo colour, using physical positions in all directions',async ()=>{
 const sets=[['KeyW','KeyA','KeyS','KeyD'],['ArrowUp','ArrowLeft','ArrowDown','ArrowRight'],['KeyI','KeyJ','KeyK','KeyL'],['KeyT','KeyF','KeyG','KeyH']];
 for(const slot of [0,1,2,3])for(const keys of sets)for(const [direction,[axis,sign]] of [['z',-1],['x',-1],['z',1],['x',1]].entries()){
  const g=await game({map:partyMap([slot])}),before=g.run(`players[0].${axis}`),code=keys[direction];
  g.key('любая раскладка',code);g.run('simulate(.05)');g.up('changed layout',code);
  assert.ok((g.run(`players[0].${axis}`)-before)*sign>0,`${slot}: ${code}`);assert.equal(g.run('heldKeys.size'),0);assert.equal(g.run('followedPlayer'),0);
 }
});
test('two players split all four sets as WASD/TFGH and arrows/IJKL, irrespective of colours',async ()=>{
 for(const slots of [[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]])for(const [key,owner] of [['KeyW',0],['KeyT',0],['ArrowUp',1],['KeyI',1]]){
  const g=await game({map:partyMap(slots)});g.key('layout independent',key);g.run('simulate(.05)');
  assert.equal(g.run('followedPlayer'),owner);assert.ok(g.run(`players[${owner}].z<4`));assert.equal(g.run(`inputs()[${1-owner}].z`),0);assert.ok(Math.abs(g.run(`players[${1-owner}].z`)-4)<.001);
 }
 const g=await game({map:partyMap([1,3])});g.key('', 'KeyW');g.key('', 'KeyT');g.key('', 'ArrowUp');g.key('', 'KeyI');
 assert.equal(g.run('heldKeys.size'),4);g.run('simulate(.05)');assert.ok(g.run('players.every(p=>p.z<4)'));
 g.run('players[0].x=20;players[0].rx=20;soft.reset();simulate(.05)');assert.equal(g.run('players[0].state'),'falling');
 assert.equal(g.run('heldKeys.has("KeyW")||heldKeys.has("KeyT")'),false);assert.equal(g.run('heldKeys.has("ArrowUp")&&heldKeys.has("KeyI")'),true);
 g.key('', 'KeyZ');assert.equal(g.run('heldKeys.size'),0);
});
test('three and four players receive primary control sets in roster order',async ()=>{
 for(const slots of [[0,1,2],[0,1,3],[0,2,3],[1,2,3],[0,1,2,3]]){
  const g=await game({map:partyMap(slots)});
  for(let i=0;i<slots.length;i++){const key=['KeyW','ArrowUp','KeyI','KeyT'][i];g.key('',key);assert.equal(g.run('followedPlayer'),i);g.up('',key);}
  if(slots.length===3){g.key('', 'KeyT');assert.equal(g.run('heldKeys.size'),0);}
 }
});
test('fourth purple jelly uses physical TFGH, participates in victory, and respawns normally',async ()=>{
 for(const [code,axis,sign] of [['KeyT','z',-1],['KeyF','x',-1],['KeyG','z',1],['KeyH','x',1]]){
  const g=await game({map:partyMap([0,1,2,3])}),before=g.run('players[3].'+axis);g.key('русская раскладка',code);g.run('simulate(.05)');g.up('',code);
  assert.ok((g.run('players[3].'+axis)-before)*sign>0);assert.equal(g.run('followedPlayer'),3);g.key('4');assert.equal(g.run('followedPlayer'),3);
 }
 const g=await game({map:partyMap([0,1,2,3])});g.run('players.slice(0,3).forEach((p,i)=>Object.assign(p,goals[i]));soft.reset();simulate(.05)');assert.equal(g.run('won'),false);
 g.run('Object.assign(players[3],goals[3]);soft.reset();for(let n=0;n<61;n++)simulate(.05)');assert.equal(g.run('won'),true);
 g.run('reset();players[3].state="dead";players[3].respawnTimer=.01;simulate(.05)');assert.equal(g.run('players[3].state'),'alive');assert.equal(g.run('players.length'),4);
});
test('physical WASD works on Russian layout and releases after a layout change',async ()=>{
 for(const [key,code,axis,sign] of [['ц','KeyW','z',-1],['ф','KeyA','x',-1],['ы','KeyS','z',1],['в','KeyD','x',1]]){
  const g=await game(),before=g.run('players[0].'+axis);
  g.key(key,code);g.run('simulate(.05)');
  assert.ok((g.run('players[0].'+axis)-before)*sign>0);
  g.up(code.slice(3).toLowerCase(),code);
  assert.equal(g.run('heldKeys.size'),0);
 }
});
test('shortcuts follow physical positions and movement ignores repeat and modifier shortcuts',async ()=>{
 const g=await game();g.key('Ц','KeyW');g.key('Ц','KeyW',{repeat:true});
 assert.equal(g.run('moves'),1);
 g.run('simulate(.05)');g.key('я','KeyZ');assert.equal(g.run('players[0].z'),8);
 g.key('й','KeyQ');assert.equal(g.run('targetAngle'),-Math.PI/4);
 g.key('у','KeyE');assert.equal(g.run('targetAngle'),0);
 g.key('@','Digit2');assert.equal(g.run('followedPlayer'),0);
 g.key('к','KeyR');assert.equal(g.run('followedPlayer'),0);
 for(const modifier of ['ctrlKey','metaKey','altKey'])g.key('ц','KeyW',{[modifier]:true});
 assert.equal(g.run('heldKeys.size'),0);
 // A printed Latin W on another physical key must not activate WASD.
 g.key('w','KeyP');assert.equal(g.run('heldKeys.size'),0);
});

test('red jelly uses physical IJKL positions on either keyboard layout with shared camera',async ()=>{
 for(const [key,code,axis,sign] of [['ш','KeyI','z',-1],['о','KeyJ','x',-1],['л','KeyK','z',1],['д','KeyL','x',1]]){
  const g=await game(),before=g.run('players[2].'+axis);g.key(key,code);g.run('simulate(.05)');g.up(key,code);
  assert.ok((g.run('players[2].'+axis)-before)*sign>0);assert.equal(g.run('followedPlayer'),2);
  assert.equal(g.run('heldKeys.size'),0);g.key('3');assert.equal(g.run('followedPlayer'),2);
 }
});
test('camera frames the group independently of the active input and resets to the group',async ()=>{
 const g=await game();g.run('updateGameCamera(0,true)');const before=g.run('({x:camera.x,z:camera.z,scale})');
 g.run('focusPlayer(1);updateGameCamera(0,true)');assert.deepEqual(g.run('({x:camera.x,z:camera.z,scale})'),before);
 g.run('players[1].x+=2;players[1].rx=players[1].x;updateGameCamera(0,true)');assert.ok(g.run('camera.x')>before.x);
 g.key('r');assert.deepEqual(g.run('({x:camera.x,z:camera.z,scale})'),before);
});

test('continuous keyboard motion, release friction, undo and camera-relative input',async ()=>{
 const g=await game();g.key('w');g.run('simulate(.05)');
 assert.ok(g.run('players[0].z<8&&players[0].z>7.9'));
 assert.equal(g.run('players[0].rz===players[0].z'),true);
 g.key('z');assert.equal(g.run('players[0].z'),8);assert.equal(g.run('heldKeys.size'),0);
 g.run('targetAngle=Math.PI/2');g.key('d');g.run('simulate(.05)');assert.ok(g.run('players[0].z<8'));assert.ok(Math.abs(g.run('players[0].x')-2)<.025);
 g.up('d');g.run('for(let n=0;n<40;n++)simulate(.05)');assert.ok(Math.abs(g.run('players[0].vz'))<.002);
 g.key('arrowdown');assert.equal(g.run('followedPlayer'),1);g.blur();assert.equal(g.run('heldKeys.size'),0);
});
test('continuous route activates both plates and finishes the puzzle',async ()=>{
 const g=await game();
 function travel(i,axis,target){
  let routeGuard=0;
  while(true){
   const position=g.run('players['+i+'].'+axis),velocity=g.run('players['+i+'].v'+axis),error=target-position;
   if(g.run('won')||Math.abs(error)<.065&&Math.abs(velocity)<.08)break;
   const direction=Math.sign(error),key=axis==='x'?(i?(direction>0?'arrowright':'arrowleft'):(direction>0?'d':'a')):(i?(direction>0?'arrowdown':'arrowup'):(direction>0?'s':'w'));
   if(Math.abs(error)>.04)g.key(key);
   g.run('simulate(1/120)');g.up(key);
   if(++routeGuard>3000)throw Error('Route failed at '+i+' '+axis+' '+target+' current '+position+' state '+g.run('players['+i+'].state'));
  }

 }
 travel(0,'z',5);assert.equal(g.run('active(0)'),true);
 travel(1,'x',8);travel(1,'z',2);assert.equal(g.run('active(1)'),true);
 // The red companion takes the same bridge and steps aside to its own rune.
 const redTravel=(axis,target)=>{
  const sign=Math.sign(target-g.run('players[2].'+axis)),key=axis==='x'?(sign>0?'l':'j'):(sign>0?'k':'i');
  for(let n=0;n<1800&&Math.abs(target-g.run('players[2].'+axis))>.035;n++){g.key(key);g.run('simulate(1/120)');g.up(key);}
  assert.ok(Math.abs(target-g.run('players[2].'+axis))<.05);
 };
 redTravel('x',8);redTravel('z',3);redTravel('x',9);redTravel('z',2);
 travel(0,'x',3);travel(0,'z',2);
 // Blue leaves the bridge button for its separate finish tile.
 travel(1,'z',3);
 g.run('for(let n=0;n<61;n++)simulate(.05)');assert.equal(g.run('won'),true);
 g.key('z');assert.equal(g.run('won'),false);
});

test('victory requires one continuous second for solo, duo, three and four active colours',async ()=>{
 for(const slots of [[3],[1,3],[0,2,3],[0,1,2,3]]){
  const g=await game({map:partyMap(slots)});g.run('players.forEach(p=>Object.assign(p,goals.find(g=>g.slot===p.slot),{vx:0,vz:0}));soft.reset();for(let n=0;n<119;n++)simulate(JellyPhysics.STEP)');
  assert.equal(g.run('won'),false);assert.ok(g.run('finishHold>.98&&finishHold<1'));
  assert.match(g.run('document.querySelector("#status").textContent'),/Рунические печати/);
  assert.ok(g.run('level.finishProgress>.99&&level.finishProgress<1'));
  g.run('simulate(JellyPhysics.STEP)');assert.equal(g.run('won'),true);assert.equal(g.run('finishHold'),1);assert.equal(g.run('level.finishProgress'),1);assert.equal(g.run('document.querySelector("#win").hidden'),false);
 }
});
test('leaving any finish before the deadline cancels the timer and re-entry requires a full second',async ()=>{
 const g=await game({map:partyMap([1,3])});g.run('players.forEach(p=>Object.assign(p,goals.find(g=>g.slot===p.slot),{vx:0,vz:0}));soft.reset();for(let n=0;n<60;n++)simulate(JellyPhysics.STEP)');
 assert.ok(g.run('finishHold>.49'));assert.equal(g.run('won'),false);
 g.run('players[1].x+=.8;soft.reset();simulate(JellyPhysics.STEP)');assert.equal(g.run('finishHold'),0);assert.equal(g.run('level.finishProgress'),0);assert.equal(g.run('won'),false);
 g.run('Object.assign(players[1],goals.find(g=>g.slot===players[1].slot),{vx:0,vz:0});soft.reset();for(let n=0;n<119;n++)simulate(JellyPhysics.STEP)');assert.equal(g.run('won'),false);
 g.run('simulate(JellyPhysics.STEP)');assert.equal(g.run('won'),true);
});
test('death, reset and undo clear pending victory; wrong or unoccupied finishes never start it',async ()=>{
 const g=await game({map:partyMap([0,2])});g.run('players.forEach(p=>Object.assign(p,goals.find(g=>g.slot===p.slot),{vx:0,vz:0}));soft.reset();for(let n=0;n<60;n++)simulate(JellyPhysics.STEP)');
 assert.ok(g.run('finishHold>.49'));
 g.run('players[1].state="dead";players[1].respawnTimer=10;simulate(JellyPhysics.STEP)');assert.equal(g.run('finishHold'),0);assert.equal(g.run('won'),false);
 g.key('r');assert.equal(g.run('finishHold'),0);assert.equal(g.run('level.finishProgress'),0);
 g.run('players.forEach(p=>Object.assign(p,goals.find(g=>g.slot===p.slot),{vx:0,vz:0}));soft.reset();history.push(snapshot());moves++;for(let n=0;n<60;n++)simulate(JellyPhysics.STEP)');
 assert.ok(g.run('finishHold>.49'));g.key('z');assert.equal(g.run('finishHold'),0);assert.equal(g.run('level.finishProgress'),0);assert.equal(g.run('won'),false);
 g.key('r');g.run('players.forEach((p,i)=>{const g=goals.find(g=>g.slot===[2,0][i]);p.x=g.x;p.z=g.z;});soft.reset();for(let n=0;n<720;n++)simulate(JellyPhysics.STEP)');assert.equal(g.run('finishHold'),0);assert.equal(g.run('won'),false);
});

test('each finish has a floor tile separate from bridge buttons and portals',async ()=>{
 const g=await game();
 assert.equal(g.run('goals.length'),3);
 assert.equal(g.run('goals.every(g=>world.heightAt(g.x,g.z)!==null&&!plates.some(p=>p.x===g.x&&p.z===g.z)&&!world.portals.some(p=>p.x===g.x&&p.z===g.z))'),true);
 assert.equal(g.run('new Set(goals.map(g=>`${g.x},${g.z}`)).size'),3);
});
test('fall clears only the affected controls; respawn resets height and undo restores life',async ()=>{
 const g=await game();
 // Start just before the internal pit at (4,8).
 g.run('players[0].x=3.4');g.key('d');g.key('arrowup');
 g.run('for(let n=0;n<10;n++)simulate(.05)');
 assert.equal(g.run('players[0].state'),'falling');
 assert.equal(g.run('heldKeys.has("KeyD")'),false);
 assert.equal(g.run('heldKeys.has("ArrowUp")'),true);
 const z=g.run('players[1].z');g.run('simulate(.05)');assert.ok(g.run('players[1].z')<z);
 g.up('arrowup');g.run('for(let n=0;n<35&&players[0].state!=="dead";n++)simulate(.05)');
 assert.equal(g.run('players[0].state'),'dead');
 // The companion may also hit its spike trap; count the scraps below the level.
 assert.equal(g.run('effects.particles.filter(p=>p.position[1]<-3).length'),22);
 g.run('for(let n=0;n<35;n++)simulate(.05)');
 assert.equal(g.run('players[0].state'),'alive');assert.equal(g.run('players[0].deaths'),1);
 assert.ok(Math.abs(g.run('players[0].x')-2)<.025);assert.ok(Math.abs(g.run('players[0].y'))<.05);
 g.key('z');assert.equal(g.run('players[0].x'),3.4);assert.equal(g.run('players[0].state'),'alive');assert.equal(g.run('players[0].deaths'),0);
 g.run('players[0].state="falling";players[0].y=-2');g.key('r');
 assert.equal(g.run('players[0].state'),'alive');assert.equal(g.run('players[0].y'),0);
});
test('undo restores a raised lift and the full passenger lattice',async ()=>{
 const g=await game();g.run('players[0].x=4.1;players[0].z=7;players[0].rx=4.1;players[0].rz=7;soft.reset()');g.key('d');
 g.run('for(let n=0;n<120&&players[0].x<4.95;n++)simulate(1/120)');g.up('d');g.run('for(let n=0;n<50;n++)simulate(.05)');
 assert.equal(g.run('world.lifts[0].height'),1);assert.ok(g.run('players[0].y')>.85);
 g.key('z');assert.equal(g.run('world.lifts[0].height'),0);assert.equal(g.run('players[0].x'),4.1);assert.equal(g.run('players[0].y'),0);assert.ok(g.run('Math.abs(soft.get(players[0]).center[1]-.42)<.001'));
});
test('spike death clears held input and undo restores a living character',async ()=>{
 const g=await game();g.run('players[0].x=2.2;players[0].z=9;soft.reset()');g.key('d');g.run('for(let n=0;n<20&&players[0].state!=="dead";n++)simulate(.05)');
 assert.equal(g.run('players[0].state'),'dead');assert.equal(g.run('heldKeys.size'),0);assert.equal(g.run('players[0].deathReason'),'spikes');
 assert.ok(g.run('effects.particles.length')>0);
 g.run('for(let n=0;n<30;n++)simulate(.05)');assert.equal(g.run('players[0].state'),'alive');g.key('z');assert.equal(g.run('players[0].x'),2.2);assert.equal(g.run('players[0].deaths'),0);
 assert.equal(g.run('effects.particles.length'),0);
});
test('undo of the first portal trip restores position, height and portal lock',async ()=>{
 const g=await game();g.run('players[0].x=3;players[0].z=5.4;soft.reset()');g.key('s');g.run('for(let n=0;n<20&&players[0].portalLock===null;n++)simulate(.05)');g.up('s');
 assert.equal(g.run('players[0].portalLock'),'violet');assert.ok(g.run('players[0].y')>.85);
 assert.equal(g.run('effects.rings.length'),2);
 g.key('z');assert.equal(g.run('players[0].portalLock'),null);assert.equal(g.run('players[0].x'),3);assert.equal(g.run('players[0].z'),5.4);assert.equal(g.run('players[0].y'),0);
 assert.equal(g.run('effects.rings.length+effects.particles.length'),0);
 g.run("effects.burst({type:'portal',color:'amber',source:[1,0,1],destination:[2,1,2]},players,soft)");g.key('r');
 assert.equal(g.run('effects.rings.length+effects.particles.length'),0);
});

test('first-gesture shield pickup and facing undo without duplicating inventory; reset clears equipment',async ()=>{
 const g=await game();g.run('players[1].x=8.6;players[1].rx=8.6;soft.reset()');g.key('arrowleft');
 g.run('for(let n=0;n<30&&!players[1].shield;n++)simulate(.05)');g.up('arrowleft');
 assert.equal(g.run('players[1].shield'),'oak-shield');assert.equal(g.run('world.pickups[0].holder'),1);
 assert.equal(g.run('players[1].facingX'),-1);
 g.key('z');assert.equal(g.run('players[1].shield'),null);assert.equal(g.run('world.pickups[0].holder'),null);
 assert.equal(g.run('players[1].facingX'),0);assert.equal(g.run('players[1].facingZ'),1);
 g.run('players[1].shield="oak-shield";world.pickups[0].holder=1');g.key('r');
 assert.equal(g.run('players[1].shield'),null);assert.equal(g.run('world.pickups[0].holder'),null);assert.equal(g.run('world.arrows.length'),0);
});

test('arrow death clears the affected controls and undo restores equipped protection and the firing clock',async ()=>{
 const g=await game();g.run('Object.assign(players[1],{x:10,z:7,rx:10,rz:7,shield:"oak-shield",facingZ:1});world.pickups[0].holder=1;world.archers[0].cooldown=.1;soft.reset()');
 g.key('arrowdown');g.run('for(let n=0;n<40&&players[1].state!=="dead";n++)simulate(.05)');
 assert.equal(g.run('players[1].deathReason'),'arrow');assert.equal(g.run('heldKeys.size'),0);
 assert.equal(g.run('players[1].shield'),null);assert.ok(g.run('effects.particles.some(p=>p.kind==="jelly")'));
 g.key('z');assert.equal(g.run('players[1].state'),'alive');assert.equal(g.run('players[1].shield'),'oak-shield');
 assert.equal(g.run('world.pickups[0].holder'),1);assert.equal(g.run('world.archers[0].cooldown'),.1);assert.equal(g.run('world.arrows.length'),0);
});

test('undo restores shield durability, sword inventory, skeleton recovery time and an airborne throw',async ()=>{
 const g=await game();g.run(`
  Object.assign(players[1],{shield:'oak-shield',shieldHP:1});Object.assign(world.pickups[0],{holder:1,durability:1});
  Object.assign(players[2],{sword:'iron-sword',launchTimer:.8,state:'falling',y:.8,vx:2.22,vy:3,vz:0});world.pickups[1].holder=2;
  Object.assign(world.archers[0],{state:'dead',respawnTimer:2.3});soft.reset();soft.get(players[2]).velocities.forEach(v=>{v[0]=2.22;v[1]=3;});
  history.push(snapshot());moves++;players[1].shield=null;world.pickups[0].destroyed=true;players[2].sword=null;players[2].launchTimer=0;world.archers[0].state='alive';
 `);
 g.key('z');assert.equal(g.run('players[1].shieldHP'),1);assert.equal(g.run('world.pickups[0].durability'),1);assert.equal(g.run('world.pickups[0].destroyed'),false);
 assert.equal(g.run('players[2].sword'),'iron-sword');assert.equal(g.run('players[2].launchTimer'),.8);assert.equal(g.run('world.archers[0].respawnTimer'),2.3);
 assert.ok(g.run('soft.get(players[2]).velocities.every(v=>v[0]===2.22&&v[1]===3)'));
 g.run('stopInput()');assert.equal(g.run('players[2].vx'),2.22,'camera/UI input changes do not interrupt a physical throw');
 g.key('r');assert.ok(g.run('players.every(p=>!p.shield&&!p.sword&&!p.launchTimer)&&world.pickups.every(p=>!p.destroyed)&&world.archers[0].state==="alive"'));
});

test('edited level preserves raised spawns and arbitrary crate start heights on reset',async ()=>{
 const map=Levels.read(sunkenSanctum);map.spawns[0]={x:5,z:9};map.crates=[{x:6,z:7}];map.name='Custom chamber';
 const g=await game({map});assert.equal(g.run('definition.name'),'Custom chamber');assert.equal(g.run('players[0].y'),1);assert.equal(g.run('crates[0].y'),0);
 assert.equal(g.run('camera.targetY'),.5);assert.ok(g.run('Math.abs(camera.focusHeight-.92)<1e-12'));
 g.run('players[0].y=3;crates[0].y=4');g.key('r');assert.equal(g.run('players[0].y'),1);assert.equal(g.run('crates[0].y'),0);
 assert.equal(g.run('camera.targetY'),.5);assert.ok(g.run('Math.abs(camera.focusHeight-.92)<1e-12'));
 assert.equal(g.run('mapError'),null);
});

test('run statistics pause, survive undo, and reset for a new attempt',async ()=>{
 const g=await game({map:partyMap([1,3])});
 g.run('simulate(.05,1.25)');assert.equal(g.run('runSeconds'),1.25);
 g.run('menuOpen=true;simulate(.05,10);menuOpen=false');assert.equal(g.run('runSeconds'),1.25);
 g.key('', 'KeyW');g.run('players[0].x=30;soft.reset();for(let n=0;n<100;n++)simulate(.05)');
 assert.equal(g.run('runDeaths[0]'),1);assert.equal(g.run('runDeaths[1]'),0);
 const elapsed=g.run('runSeconds');g.run('undo()');assert.equal(g.run('runDeaths[0]'),1);assert.equal(g.run('runSeconds'),elapsed);
 g.run('reset()');assert.equal(g.run('runSeconds'),0);assert.equal(g.run('runDeaths.reduce((a,b)=>a+b,0)'),0);
 assert.equal(g.run('formatRunTime(65.12)'), '1:05.12');
});

test('initial menu uses only its diorama instead of creating a playable level',async ()=>{
 const g=await game({menuOnly:true});assert.equal(g.run('runtime===menuScene'),true);assert.equal(g.run('definition.blocks.length'),0);assert.equal(g.run('definition.tiles.length'),0);assert.equal(g.run('currentLevelTitle()'),'');
});

 test('right drag orbits without poking players and releases on cancellation or blur',async()=>{
 const g=await game();
 const moves=g.run('moves');g.pointer('pointerdown');g.pointer('pointermove',{clientX:200,clientY:140});
 assert.ok(Math.abs(g.run('targetAngle')+.8)<1e-9);assert.equal(g.run('targetPitch'),65);assert.equal(g.run('moves'),moves);
 g.pointer('pointermove',{clientY:1000});assert.equal(g.run('targetPitch'),85);
 g.pointer('pointermove',{clientY:-1000});assert.equal(g.run('targetPitch'),20);
 g.pointer('pointercancel');const angle=g.run('targetAngle');g.pointer('pointermove',{clientX:400});assert.equal(g.run('targetAngle'),angle);
 g.pointer('pointerdown');g.blur();assert.equal(g.run('orbitGesture'),null);
 g.run('targetAngle=Math.PI/4');g.key('d');const input=g.run('inputs()[0]');
 assert.ok(Math.abs(input.x-Math.SQRT1_2)<1e-9);assert.ok(Math.abs(input.z+Math.SQRT1_2)<1e-9);
 });
