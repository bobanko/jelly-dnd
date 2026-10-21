import JellyLevels from './levels.js';
import {i18n as JellyI18n} from './i18n.js';
import * as JellyGPU from './webgpu-renderer.js';
import * as JellySoftBody from './soft-body.js';
import * as JellyPhysics from './physics.js';
import * as JellyEffects from './game-effects.js';
import * as JellySharedCamera from './shared-camera.js';
import {createMenuScene} from './menu-scene.js';
import {menuOnly as JellyMenuOnly,progress as JellyProgress} from './runtime-context.js';

const tr=key=>JellyI18n?.t(key)??key;
let menuOpen=false,hasPlayed=false,menuHelp=false,menuLevelSelect=false,menuSelected=0;
let winShown=false,winSelected=0;
let restartTransition=null;
let loadingActive=false,loadingFailed=false,loadingStage='loadingGraphics',autoZoom=1;
let playerHints=[];
const canvas=document.querySelector('#scene');
const reducedMotion=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const sceneRenderer=new JellyGPU.Renderer(canvas,JellySoftBody);
let W,H,DPR,scale,angle=0,targetAngle=0,last=0,time=0,moves=0,history=[],won=false,finishHold=0,audioOn=false,audio;
const WIN_HOLD_SECONDS=1;
const N=12, colors=JellyLevels.characters.map(p=>p.color),names=JellyLevels.characters.map(p=>p.name);
let zoom=1;
let fpsElapsed=0,fpsFrames=0;
const menuOnly=JellyMenuOnly===true;
const menuScene=createMenuScene(reducedMotion);
let mapError=null,definition;
try{let search=globalThis.location?.search||'';const requested=/(?:^|[?&])level=(\d+)(?:&|$)/.exec(search);if(requested&&JellyProgress&&!JellyProgress.canPlay(Number(requested[1]))){search='?level=1';globalThis.history.replaceState(null,'',search);}definition=menuOnly?JellyLevels.blank():JellyLevels.forGame(search.includes('level=editor')?globalThis.localStorage:undefined,search);}catch(error){mapError=error.message;definition=JellyLevels.read(JellyLevels.standardLevel(1));}
const runtime=menuOnly?menuScene:JellyLevels.instantiate(definition,JellyPhysics,JellySoftBody);
const {start,players,crates,bodies,plates,goals,bridges,floor,world,soft}=runtime;
let followedPlayer=0;
let runSeconds=0,runDeaths=players.map(()=>0);
const camera={x:start[0].x,z:start[0].z,targetY:start[0].y||0,focusHeight:(start[0].y||0)+.42,mode:'perspective',pitch:55,fov:45};
const cameraPitches={ortho:30,perspective:55};
let targetPitch=camera.pitch,orbitGesture=null;
const effects=new JellyEffects.System({reducedMotion});
const level={...runtime,effects,won:false,finishProgress:0,reducedMotion};
const heldKeys=new Set();
const keySets={KeyW:[0,0,-1],KeyS:[0,0,1],KeyA:[0,-1,0],KeyD:[0,1,0],ArrowUp:[1,0,-1],ArrowDown:[1,0,1],ArrowLeft:[1,-1,0],ArrowRight:[1,1,0],KeyI:[2,0,-1],KeyK:[2,0,1],KeyJ:[2,-1,0],KeyL:[2,1,0],KeyT:[3,0,-1],KeyG:[3,0,1],KeyF:[3,-1,0],KeyH:[3,1,0],Numpad8:[4,0,-1],Numpad5:[4,0,1],Numpad4:[4,-1,0],Numpad6:[4,1,0]};
// Assign controls by the active roster's order, independently of character colour.
const controlOwners=players.length===1?[0,0,0,0,0]:players.length===2?[0,1,1,0,1]:[0,1,2,3,4].map(i=>i<players.length?i:-1);
const movementKeys=Object.fromEntries(Object.entries(keySets).map(([key,[set,x,z]])=>[key,[controlOwners[set],x,z]]).filter(([,value])=>value[0]>=0));
let accumulator=0;
function resize(){W=innerWidth;H=innerHeight;DPR=Math.min(devicePixelRatio,2);scale=Math.min(W/16,H/12)*zoom*autoZoom;}
addEventListener('resize',resize);resize();
function project(x,y,z){return JellyGPU.projectPoint(JellyGPU.cameraFrame(camera,angle,W,H,scale),x,y,z,W,H);}
function active(i){return world.active(i,players);}
function tone(freq){if(!audioOn)return;audio??=new AudioContext();const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(freq*.6,audio.currentTime+.14);g.gain.setValueAtTime(.045,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.2);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+.2);}
function woodHit(broken=false){
 if(!audioOn)return;audio??=new AudioContext();
 const now=audio.currentTime,duration=broken?.3:.18,buffer=audio.createBuffer(1,Math.ceil(audio.sampleRate*duration),audio.sampleRate),samples=buffer.getChannelData(0);
 for(let i=0;i<samples.length;i++){
  const t=i/audio.sampleRate,crack=Math.exp(-t*95)+.5*Math.exp(-Math.abs(t-.018)*420)+.3*Math.exp(-Math.abs(t-.045)*380)+(broken?.6*Math.exp(-Math.abs(t-.095)*180):0);
  samples[i]=(Math.random()*2-1)*crack;
 }
 const source=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();source.buffer=buffer;filter.type='bandpass';filter.frequency.value=broken?780:1050;filter.Q.value=.7;gain.gain.value=broken?.36:.26;source.connect(filter).connect(gain).connect(audio.destination);source.start();
 const thud=audio.createOscillator(),body=audio.createGain();thud.type='triangle';thud.frequency.setValueAtTime(130,now);thud.frequency.exponentialRampToValueAtTime(60,now+.075);body.gain.setValueAtTime(.055,now);body.gain.exponentialRampToValueAtTime(.001,now+.1);thud.connect(body).connect(audio.destination);thud.start();thud.stop(now+.11);
}
function updateUI(){
 document.querySelector('#moves').textContent=String(moves).padStart(2,'0');document.querySelector('#win').hidden=!won;
 document.body?.classList.toggle('level-won',won);
 if(won&&!winShown&&JellyI18n){refreshWin();selectWinItem(0);}winShown=won;
 const lost=players.findIndex(p=>!JellyPhysics.alive(p)),moving=world.lifts.some(l=>Math.abs(l.target-l.height)>.01&&players.some(p=>Math.abs(p.x-l.x)<.4&&Math.abs(p.z-l.z)<.4));
 document.querySelector('#status').textContent=won?tr('Все руны пробуждены'):lost>=0?`${tr(names[players[lost].slot])} ${players[lost].state==='falling'?tr('падает…'):players[lost].deathReason==='spikes'?tr('погиб на шипах. Возрождение…'):tr('возрождается…')}`:finishHold>0?tr('Рунические печати наполняются светом…'):players.some(p=>p.portalBlocked)?tr('Выход портала занят'):moving?tr('Лифт поднимается'):players.some(p=>p.portalFlash>0)?tr('Магический переход'):active(0)||active(1)?tr('Магический мост поднят'):tr('Святилище ждёт вас');
}
function focusPlayer(i){if(players[i])followedPlayer=i;}
function clearGoalVisuals(){level.won=false;level.finishProgress=0;sceneRenderer.goalGlowStrength=[];sceneRenderer.goalWinGlow=0;}
function reset(){
 players.forEach((p,i)=>Object.assign(p,start[i],{spawn:{...start[i]},state:'alive',y:start[i].y||0,vy:0,deaths:0,respawnTimer:0,respawnFlash:0,rx:start[i].x,rz:start[i].z,bounce:0,vx:0,vz:0,impact:0,squish:0,squishVelocity:0,shield:null,shieldHP:0,sword:null,facingX:0,facingZ:1,launchTimer:0,bashCooldown:0,attackTime:0,attackCooldown:0}));
 crates.forEach(p=>Object.assign(p,p.spawn,{y:p.spawn.y||0,state:'alive',vx:0,vy:0,vz:0,deaths:0,respawnTimer:0}));
 runSeconds=0;runDeaths.fill(0);history=[];moves=0;won=false;finishHold=0;heldKeys.clear();world.held.clear();world.resetFeatures();soft.reset();effects.clear();sceneRenderer.bridgeKey=undefined;accumulator=0;
 players.forEach(p=>Object.assign(p,{portalLock:null,portalCooldown:0,portalFlash:0,portalBlocked:false,deathReason:null}));
 clearGoalVisuals();
 sceneRenderer.platePress=[];
 focusPlayer(0);updateGameCamera(0,true);updateUI();
}
function undo(){
 if(!history.length)return;
 const previous=history.pop();
 effects.clear();
 clearGoalVisuals();
 sceneRenderer.platePress=[];
 players.forEach((p,i)=>Object.assign(p,previous.players[i],{rx:previous.players[i].x,rz:previous.players[i].z,vx:previous.players[i].launchTimer?previous.players[i].vx:0,vz:previous.players[i].launchTimer?previous.players[i].vz:0,bounce:.2,impact:0,squish:0,squishVelocity:0}));
 crates.forEach((p,i)=>Object.assign(p,previous.crates[i],{vx:0,vy:0,vz:0}));
 world.held=new Set(previous.bridges);world.restoreFeatures(previous.features);soft.restore(bodies,previous.soft);bodies.forEach(p=>{if(!p.launchTimer)soft.get(p).velocities.forEach(v=>v.fill(0));});sceneRenderer.bridgeKey=undefined;heldKeys.clear();accumulator=0;moves--;won=false;finishHold=0;updateUI();
}
function snapshot(){return {players:players.map(p=>({...p,spawn:{...p.spawn}})),crates:crates.map(p=>({...p,spawn:{...p.spawn}})),bridges:[...world.held],features:world.featureSnapshot(),soft:soft.snapshot(bodies)};}
function inputs(){
 const result=players.map(()=>({x:0,z:0}));
 for(const key of heldKeys){const [i,x,z]=movementKeys[key];result[i].x+=x;result[i].z+=z;}
 // Keep each movement key on a grid axis, including between camera quarter-turns.
 const quarter=((Math.round(targetAngle/(Math.PI/2))%4)+4)%4;
 for(const v of result)for(let k=0;k<quarter;k++)[v.x,v.z]=[v.z,-v.x];
 return result;
}
function simulate(dt,elapsed=dt){
 if(loadingActive||menuOpen||restartTransition||won||mapError||document.hidden)return;
 runSeconds+=Math.max(0,elapsed);
 accumulator+=Math.min(dt,.05);
 const input=inputs();
 while(accumulator>=JellyPhysics.STEP&&!won){
  const events=world.step(bodies,input);
  for(const event of events){
   if(event.player>=players.length)continue;
   effects.burst(event,players,soft);
   if(event.type==='death')runDeaths[event.player]++;
   if(event.type==='fall'||event.type==='death'){
    for(const key of heldKeys)if(movementKeys[key][0]===event.player)heldKeys.delete(key);
    input[event.player]={x:0,z:0};tone(95);
   }else if(event.type==='shieldBash'){
    for(const key of heldKeys)if(movementKeys[key][0]===event.target)heldKeys.delete(key);input[event.target]={x:0,z:0};woodHit();
   }else if(event.type==='respawn')tone(event.player?400:300);else if(event.type==='portal')tone(520);else if(event.type==='pickup')tone(720);else if(event.type==='archerShot')tone(840);else if(event.type==='arrowBlock'&&event.durability>0)woodHit();else if(event.type==='shieldBreak')woodHit(true);else if(event.type==='archerDeath')tone(180);
  }
  const allFinished=players.length>0&&players.every(p=>world.goalActive(goals.find(g=>g.slot===p.slot),p)&&Math.hypot(p.vx,p.vz)<.25);
  finishHold=allFinished?Math.min(WIN_HOLD_SECONDS,finishHold+JellyPhysics.STEP):0;
  if(finishHold>=WIN_HOLD_SECONDS-1e-9){finishHold=WIN_HOLD_SECONDS;won=true;players.forEach(p=>{p.vx=p.vz=0;});heldKeys.clear();tone(640);const current=currentStandardLevel();if(current&&JellyProgress){JellyProgress.complete(current,runSeconds);updateLevelLocks();}}
  level.finishProgress=finishHold/WIN_HOLD_SECONDS;
  accumulator-=JellyPhysics.STEP;
 }
 players.forEach(p=>{p.rx=p.x;p.rz=p.z;p.bounce=Math.max(p.impact,Math.min(.24,Math.hypot(p.vx,p.vz)*.07));});
 updateUI();
}
function stopInput(){endOrbit();heldKeys.clear();players.forEach(p=>{if(p.launchTimer)return;p.vx=p.vz=0;const b=soft.get(p);b.velocities.forEach(v=>{v[0]=v[2]=0;});});accumulator=0;}
addEventListener('keydown',e=>{
 if(e.ctrlKey||e.metaKey||e.altKey)return;
 if(e.code==='Backquote'&&!menuOpen&&!won&&!loadingActive&&!restartTransition){
  e.preventDefault();if(e.repeat)return;
  const panel=document.querySelector('.jelly-settings');panel.hidden=!panel.hidden;panel.open=!panel.hidden;
  if(panel.hidden&&panel.contains?.(document.activeElement))document.querySelector('#menu-button').focus?.({preventScroll:true});
  return;
 }
 if(e.target?.closest?.('select,textarea,input:not([type=range]):not([type=checkbox])')||e.target?.matches?.('input[type=range]')&&/^(Arrow|Home|End|Page)/.test(e.code))return;
 // Physical positions stay the same across layouts, Caps Lock and layout changes while held.
 const k=e.code;
 if(loadingActive){e.preventDefault();return;}
 if(restartTransition){e.preventDefault();return;}
 if(menuOpen){handleMenuKey(e);return;}
 if(won&&JellyI18n){handleWinKey(e);return;}
 if(k==='Escape'){e.preventDefault();setMenu(!menuOpen);return;}
 if(movementKeys[k]){
  e.preventDefault();if(won||e.repeat||heldKeys.has(k)||!JellyPhysics.alive(players[movementKeys[k][0]]))return;
  focusPlayer(movementKeys[k][0]);
  if(!heldKeys.size){history.push(snapshot());moves++;if(history.length>256)history.shift();}
  heldKeys.add(k);
 }else if(!e.repeat){
  if(k==='KeyQ')targetAngle-=Math.PI/4;
  else if(k==='KeyE')targetAngle+=Math.PI/4;
  else if(k==='KeyR')restartLevel();
  else if(k==='KeyZ')undo();
 }
});
addEventListener('keyup',e=>{const key=e.code;if(movementKeys[key]){e.preventDefault();heldKeys.delete(key);}});
addEventListener('blur',stopInput);
document.addEventListener('visibilitychange',()=>{last=0;if(document.hidden)stopInput();});

document.querySelector('#reset').onclick=()=>restartLevel();document.querySelector('#again').onclick=()=>restartLevel();
function restartLevel(){
 if(!JellyI18n){reset();return;}
 if(restartTransition)return;
 stopInput();restartTransition={elapsed:0,reset:false};
 document.querySelector('#restart-fade').hidden=false;document.querySelector('#restart-fade').style.opacity='0';
}
function updateRestart(dt){
 if(!restartTransition)return;
 const state=restartTransition;state.elapsed+=dt;
 if(state.elapsed>=.22&&!state.reset){state.reset=true;reset();}
 const opacity=state.elapsed<.22?state.elapsed/.22:1-(state.elapsed-.22)/.33;
 document.querySelector('#restart-fade').style.opacity=String(Math.max(0,Math.min(1,opacity)));
 if(state.elapsed>=.55){restartTransition=null;document.querySelector('#restart-fade').hidden=true;}
}
document.querySelector('#sound').onclick=e=>{
 audioOn=!audioOn;const button=e.currentTarget;
 button.setAttribute('aria-pressed',String(audioOn));button.setAttribute('aria-label',audioOn?tr('Выключить звук'):tr('Включить звук'));button.title=audioOn?tr('Выключить звук'):tr('Включить звук');tone(400);
};

function createPlayerHints(){
 const layouts=[['W','A','S','D'],['↑','←','↓','→'],['I','J','K','L'],['T','F','G','H'],['8','4','5','6']];
 playerHints=players.map((p,i)=>{const node=document.createElement('div');node.className='player-key-hint';node.hidden=true;node.style.setProperty('--jelly-color',colors[p.slot]);
  const control=controlOwners.indexOf(i),keys=layouts[control];if(control===4)node.title='NumPad';keys.forEach(key=>{const kbd=document.createElement('kbd');kbd.textContent=key;node.append(kbd);});
  const caption=document.createElement('span');caption.className='player-hint-action';caption.dataset.t='helpMove';caption.textContent=tr('helpMove');node.append(caption);
  document.querySelector('#player-hints').append(node);return {node,idle:0};
 });
}
function updatePlayerHints(dt){
 if(!playerHints.length)return;
 const inactive=menuOpen||won||loadingActive||restartTransition;
 const boxes=[];
 playerHints.forEach((hint,i)=>{
  const p=players[i],moving=Math.hypot(p.vx||0,p.vz||0)>.08||[...heldKeys].some(key=>movementKeys[key][0]===i);
  hint.idle=inactive||moving||!JellyPhysics.alive(p)?0:hint.idle+dt;
  const point=project(p.rx,(p.y||0)+1.2,p.rz);hint.node.hidden=hint.idle<2||!point.visible;
  if(hint.node.hidden)return;
  const x=Math.max(50,Math.min(W-50,point.x));let y=Math.max(110,Math.min(H-90,point.y));
  for(const box of boxes)if(Math.abs(x-box.x)<98&&Math.abs(y-box.y)<72)y=box.y-78;
  boxes.push({x,y});hint.node.style.left=x+'px';hint.node.style.top=y+'px';
 });
}
function frame(t){
 const elapsed=last?Math.max(0,(t-last)/1000):0,dt=Math.min(elapsed,.05);last=t;time=t/1000;
 fpsElapsed+=elapsed;fpsFrames++;
 if(fpsElapsed>=.5){const counter=document.querySelector('#fps');if(counter)counter.textContent=Math.round(fpsFrames/fpsElapsed)+' FPS';fpsElapsed=0;fpsFrames=0;}
 updateRestart(dt);
 angle=reducedMotion?targetAngle:angle+(targetAngle-angle)*(1-Math.exp(-dt*11));
 camera.pitch=reducedMotion?targetPitch:camera.pitch+(targetPitch-camera.pitch)*(1-Math.exp(-dt*11));
 if(sceneRenderer.ready)simulate(dt,elapsed);
 effects.step(dt,world,goals,players);
 updateGameCamera(dt);
 level.won=won;
 if(menuOpen&&menuScene){
  menuScene.animate(dt);
  const menuCamera={x:3.1,z:4.8,targetY:.2,focusHeight:.5,mode:'ortho',pitch:24,fov:45};
  sceneRenderer.render(menuScene,menuScene.players,menuCamera,-.15,reducedMotion?0:time,Math.min(W/7.5,H/5),dt);
 }else sceneRenderer.render(level,players,camera,angle,reducedMotion?0:time,scale,dt);
 updatePlayerHints(dt);
 requestAnimationFrame(frame);
}
function updateGameCamera(dt,snap=false){
  const target=JellySharedCamera.target(players,definition,camera,angle,W,H),tracking=snap||reducedMotion?1:1-Math.exp(-dt*3);
  camera.x+=(target.x-camera.x)*tracking;camera.z+=(target.z-camera.z)*tracking;camera.targetY+=(target.targetY-camera.targetY)*tracking;camera.focusHeight=target.focusHeight;
  const smoothing=snap||reducedMotion?1:1-Math.exp(-dt*(target.zoom<autoZoom?6:1.8));
  autoZoom+=(target.zoom-autoZoom)*smoothing;
 scale=Math.min(W/16,H/12)*zoom*autoZoom;
}
function updateLoading(progress,stage){if(!JellyI18n)return;loadingActive=true;loadingStage=stage;if(menuOnly&&!loadingFailed)return;document.querySelector('#level-intro').hidden=false;document.querySelector('#level-intro').classList.add('loading');document.querySelector('#level-intro-title').textContent=currentLevelTitle();document.querySelector('#level-loading').hidden=false;document.querySelector('#loading-status').textContent=tr(stage);document.querySelector('#loading-progress').value=progress;}
function gpuFailure(message){if(!JellyI18n)return;loadingFailed=true;updateLoading(0,'loadingGraphics');document.querySelector('#loading-status').textContent=message;document.querySelector('#loading-progress').hidden=true;document.querySelector('#loading-retry').hidden=false;}
sceneRenderer.onFailure=gpuFailure;
sceneRenderer.onProgress=updateLoading;
if(JellyI18n)updateLoading(0,'loadingGraphics');
sceneRenderer.init().then(async()=>{
 if(mapError){gpuFailure(mapError);return;}
 updateGameCamera(0,true);
 // Build and submit the actual scene before revealing it or accepting input.
 if(menuOpen&&menuScene){const menuCamera={x:3.1,z:4.8,targetY:.2,focusHeight:.5,mode:'ortho',pitch:24,fov:45};sceneRenderer.render(menuScene,menuScene.players,menuCamera,-.15,0,Math.min(W/7.5,H/5),0);}
 else sceneRenderer.render(level,players,camera,angle,0,scale,0);
 await sceneRenderer.device?.queue?.onSubmittedWorkDone();
 if(loadingFailed)return;
 if(JellyI18n){document.querySelector('#level-loading').hidden=true;document.querySelector('#level-intro').hidden=true;document.querySelector('#level-intro').classList.remove('loading');}
 loadingActive=false;
}).catch(error=>gpuFailure(error.message));
document.querySelector('#softness').addEventListener('input',e=>{soft.softness=Number(e.target.value);players.forEach(p=>{soft.get(p).sleeping=false;soft.get(p).calm=0;});});
document.querySelector('#decay').addEventListener('input',e=>soft.decay=Number(e.target.value));
document.querySelector('#mesh').addEventListener('change',e=>sceneRenderer.mesh=e.target.checked);
document.querySelector('#colliders').addEventListener('change',e=>sceneRenderer.colliders=e.target.checked);
function updateCameraUI(){
 document.querySelector('#camera-zoom-value').textContent=Math.round(zoom*100)+'%';
 document.querySelector('#camera-pitch').value=targetPitch;
 document.querySelector('#camera-pitch-value').textContent=Math.round(targetPitch)+'°';
 document.querySelector('#camera-fov-value').textContent=camera.fov+'°';
 document.querySelector('#camera-fov').disabled=camera.mode!=='perspective';
}
document.querySelector('#camera-mode').addEventListener('change',e=>{if(e.target.type!=='radio')return;stopInput();camera.mode=e.target.value;targetPitch=camera.pitch=cameraPitches[camera.mode];updateCameraUI();});
function setCameraZoom(value){zoom=Math.max(.65,Math.min(1.8,value));resize();updateCameraUI();}
document.querySelector('#camera-zoom-out').addEventListener('click',()=>setCameraZoom(zoom*.8));
document.querySelector('#camera-zoom-in').addEventListener('click',()=>setCameraZoom(zoom*1.25));
document.querySelector('#camera-turn-left').addEventListener('click',()=>targetAngle-=Math.PI/4);
document.querySelector('#camera-turn-right').addEventListener('click',()=>targetAngle+=Math.PI/4);
document.querySelector('#camera-pitch').addEventListener('input',e=>{targetPitch=camera.pitch=Number(e.target.value);cameraPitches[camera.mode]=camera.pitch;updateCameraUI();});
document.querySelector('#camera-fov').addEventListener('input',e=>{camera.fov=Number(e.target.value);updateCameraUI();});
updateCameraUI();
canvas.addEventListener('wheel',e=>{e.preventDefault();if(menuOpen)return;setCameraZoom(zoom*Math.exp(-e.deltaY*.001));},{passive:false});
function endOrbit(){
 if(!orbitGesture)return;
 const id=orbitGesture.id;orbitGesture=null;
 if(canvas.hasPointerCapture?.(id))canvas.releasePointerCapture(id);
}
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointermove',e=>{
 if(!orbitGesture||e.pointerId!==orbitGesture.id)return;
 if(!(e.buttons&2)){endOrbit();return;}
 targetAngle-=(e.clientX-orbitGesture.x)*.008;
 targetPitch=Math.max(20,Math.min(85,targetPitch+(e.clientY-orbitGesture.y)*.25));
 cameraPitches[camera.mode]=targetPitch;updateCameraUI();
 orbitGesture.x=e.clientX;orbitGesture.y=e.clientY;
});
for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,e=>{
 if(e.pointerId===orbitGesture?.id)endOrbit();
});
canvas.addEventListener('pointerdown',e=>{
 if(menuOpen||restartTransition||loadingActive)return;
 if(e.button===2){
  e.preventDefault();endOrbit();orbitGesture={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);return;
 }
 if(e.button!==0)return;
 let closest=null,distance=Infinity;
 players.forEach((p,i)=>{const q=project(p.x,.42+(p.y||0),p.z),d=Math.hypot(e.clientX-q.x,e.clientY-q.y);if(q.visible&&JellyPhysics.alive(p)&&d<q.scale*.7&&d<distance){closest=i;distance=d;}});
 if(closest!==null){history.push(snapshot());moves++;soft.poke(players[closest]);tone(240);}
});
requestAnimationFrame(frame);focusPlayer(0);updateUI();

function refreshLanguage(){
 document.querySelectorAll('.player-hint-action').forEach(node=>node.textContent=tr('helpMove'));
 if(JellyI18n){
  const russian=JellyI18n.language==='ru',title=document.querySelector('#menu-title');
  title.replaceChildren();const word=document.createElement('span');word.className='jelly-word';
  [...(russian?'Желейки':'Jelly')].forEach((letter,i)=>{const span=document.createElement('span');span.className='jelly-letter';span.style.color=colors[i%colors.length];span.textContent=letter;word.append(span);});
  const and=document.createElement('span');and.textContent=russian?' и':' &';title.append(word,and,document.createElement('br'));
  const bones=document.createElement('span');bones.className='bones-word';bones.setAttribute('aria-hidden','true');
  for(const letter of (russian?'косточки':'Bones')){
   if(letter.toLowerCase()==='o'||letter==='о'){
    const skull=document.createElement('span');skull.className='title-skull';
    skull.innerHTML='<svg viewBox="0 0 64 72" aria-hidden="true" focusable="false"><path fill="currentColor" d="M32 2C14 2 3 14 3 31c0 12 5 20 14 24v13h30V55c9-4 14-12 14-24C61 14 50 2 32 2Z"/><g fill="#151819"><ellipse cx="20" cy="32" rx="9" ry="11" transform="rotate(-14 20 32)"/><ellipse cx="44" cy="32" rx="9" ry="11" transform="rotate(14 44 32)"/><path d="m32 42-5 10h10Z"/><path d="M24 59h3v11h-3zm13 0h3v11h-3z"/></g></svg>';
    bones.append(skull);
   }else bones.append(document.createTextNode(letter));
  }
  title.append(bones);
  title.setAttribute('aria-label',russian?'Желейки и косточки':'Jelly & Bones');document.title=russian?'Желейки и косточки':'Jelly & Bones';
 }
 if(JellyI18n&&!menuOnly)document.querySelector('#level-intro-title').textContent=currentLevelTitle();
 if(loadingActive&&!loadingFailed)document.querySelector('#loading-status').textContent=tr(loadingStage);
 const sound=document.querySelector('#sound');sound.title=tr(audioOn?'Выключить звук':'Включить звук');sound.setAttribute('aria-label',sound.title);
  if(JellyI18n)document.querySelector('#play').textContent=tr(hasPlayed?'resume':'play');
 document.querySelectorAll('[data-level-name]').forEach(node=>node.textContent=JellyLevels.displayName(JellyLevels.standardLevel(Number(node.dataset.levelName)),JellyI18n?.language));
 updateLevelLocks();updateUI();
 if(won&&JellyI18n)refreshWin();
}
function currentStandardLevel(){const match=/(?:^|[?&])level=(\d+)(?:&|$)/.exec(globalThis.location?.search||'');return globalThis.location?.search?.includes('level=editor')?0:match?Number(match[1]):1;}
function currentLevelTitle(){if(menuOnly)return '';const id=currentStandardLevel(),name=JellyLevels.displayName(definition,JellyI18n?.language);return id?`${id}. ${name}`:name;}
function formatRunTime(seconds){const n=Math.floor((seconds+1e-9)*100);return `${Math.floor(n/6000)}:${String(Math.floor(n/100)%60).padStart(2,'0')}.${String(n%100).padStart(2,'0')}`;}
function statIcon(kind,slot){
 const icon=document.createElement('span');icon.className='stat-icon'+(kind==='jelly'?' stat-jelly':'');icon.setAttribute('aria-hidden','true');
 if(kind==='jelly')icon.style.color=colors[slot];
 const drawings={timer:'<path d="M9 2h6M12 2v3m6 1 2-2"/><circle cx="12" cy="14" r="8"/><path d="M12 9v5l3 2"/>',skull:'<path d="M12 3a8 8 0 0 0-8 8c0 3 1 5 4 6v4h8v-4c3-1 4-3 4-6a8 8 0 0 0-8-8Z"/><circle cx="9" cy="11" r="1"/><circle cx="15" cy="11" r="1"/><path d="m11 15 1-2 1 2m-3 3v3m4-3v3"/>',jelly:"<path d=\"M16 3 29 10 16 17 3 10Z\" fill=\"currentColor\" fill-opacity=\".55\"/><path d=\"M3 10v14l13 7V17Z\" fill=\"currentColor\" fill-opacity=\".3\"/><path d=\"m16 17 13-7v14l-13 7Z\" fill=\"currentColor\" fill-opacity=\".18\"/><path d=\"m16 3 13 7v14l-13 7-13-7V10Zm0 14v14M3 10l13 7 13-7\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linejoin=\"round\"/><path d=\"M8 15c-3-1-4 0-4 3 0 2 1 4 2 5v3l5 3v-3c2 0 3-1 3-3 0-3-2-6-6-8Z\" fill=\"currentColor\"/><path d=\"m6 19 2 1v3l-2-1Zm4 2 2 1v3l-2-1Z\" fill=\"#142023\"/>"};
 icon.innerHTML='<svg viewBox="'+(kind==='jelly'?'0 0 32 34':'0 0 24 24')+'" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" focusable="false">'+drawings[kind]+'</svg>';return icon;
}
function refreshWin(){const time=document.querySelector('#win-time');time.replaceChildren(statIcon('timer'),document.createTextNode(formatRunTime(runSeconds)));time.setAttribute('aria-label',tr('completionTime')+': '+formatRunTime(runSeconds));const deaths=document.querySelector('#win-deaths');deaths.replaceChildren();players.forEach((p,i)=>{const row=document.createElement('div');row.className='death-stat';row.setAttribute('aria-label',tr(names[p.slot])+', '+tr('deaths')+': '+runDeaths[i]);row.append(statIcon('jelly',p.slot),statIcon('skull'),String(runDeaths[i]));deaths.append(row);});const id=currentStandardLevel();document.querySelector('#win-title').textContent=tr(id===JellyLevels.standardNames.length?'demoComplete':'levelComplete');document.querySelector('#win-level-name').textContent=currentLevelTitle();document.querySelector('#win-next').textContent=tr(id&&id<JellyLevels.standardNames.length?'nextLevel':globalThis.location?.search?.includes('level=editor')?'editor':'levels');}
function selectWinItem(index,focus=true){const buttons=[document.querySelector('#win-next'),document.querySelector('#again')];winSelected=(index+2)%2;buttons.forEach((button,i)=>button.classList.toggle('selected',i===winSelected));if(focus)buttons[winSelected].focus({preventScroll:true});}
function handleWinKey(e){const k=e.code;if(['ArrowDown','ArrowRight','KeyS','KeyD','ArrowUp','ArrowLeft','KeyW','KeyA','Tab'].includes(k)){e.preventDefault();selectWinItem(winSelected+1);}else if(k==='Enter'||k==='KeyE'){e.preventDefault();if(!e.repeat)document.querySelector(winSelected===0?'#win-next':'#again').click();}else if(k==='Escape'||k==='KeyQ'){e.preventDefault();if(!e.repeat)setMenu(true);}}
function updateLevelLocks(){document.querySelectorAll('[data-level]').forEach(button=>{const locked=JellyProgress&&!JellyProgress.canPlay(Number(button.dataset.level));let best=button.querySelector('.level-best');if(!best){best=document.createElement('span');best.className='level-best';button.append(best);}const seconds=JellyProgress?.bestTime(Number(button.dataset.level));const value=seconds==null?'\u2014':formatRunTime(seconds);best.replaceChildren(statIcon('timer'),document.createTextNode(value));best.setAttribute('aria-label',tr('bestTime')+': '+value);button.disabled=!!locked;button.classList.toggle('locked',!!locked);let icon=button.querySelector('.level-lock');if(!icon){icon=document.createElement('span');icon.className='level-lock';icon.setAttribute('aria-hidden','true');icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';button.append(icon);}icon.hidden=!locked;});}
function menuButtons(){return [...document.querySelectorAll(menuHelp?'#menu-back':menuLevelSelect?'#menu-levels button:not(:disabled)':'#menu-root button')];}
function selectMenuItem(index,focus=true){const buttons=menuButtons();menuSelected=(index+buttons.length)%buttons.length;buttons.forEach((button,i)=>button.classList.toggle('selected',i===menuSelected));if(focus){const button=buttons[menuSelected];button?.focus({preventScroll:true});const list=menuLevelSelect&&button?.closest('.level-list');if(list){const item=button.getBoundingClientRect(),box=list.getBoundingClientRect();if(item.top<box.top)list.scrollTop+=item.top-box.top;else if(item.bottom>box.bottom)list.scrollTop+=item.bottom-box.bottom;}}}
function showMenuScreen(screen){menuHelp=screen==='help';menuLevelSelect=screen==='levels';if(menuLevelSelect)updateLevelLocks();document.querySelector('#menu-root').hidden=menuHelp||menuLevelSelect;document.querySelector('#menu-help').hidden=!menuHelp;document.querySelector('#menu-levels').hidden=!menuLevelSelect;document.querySelector('#main-menu').classList.toggle('selecting-level',menuLevelSelect);selectMenuItem(0);}
function showMenuHelp(show){showMenuScreen(show?'help':'root');}
function handleMenuKey(e){
 const k=e.code;
 if(['ArrowDown','ArrowRight','KeyS','KeyD','ArrowUp','ArrowLeft','KeyW','KeyA'].includes(k)){e.preventDefault();selectMenuItem(menuSelected+(['ArrowUp','ArrowLeft','KeyW','KeyA'].includes(k)?-1:1));}
 else if(k==='Enter'||k==='KeyE'){e.preventDefault();if(!e.repeat)menuButtons()[menuSelected]?.click();}
 else if(k==='Escape'||k==='KeyQ'){e.preventDefault();if(e.repeat)return;if(menuHelp||menuLevelSelect)showMenuScreen('root');else if(hasPlayed)setMenu(false);}
}
function setMenu(open){if(menuOpen!==open){sceneRenderer.bridgeKey=undefined;sceneRenderer.propGeometryKey=undefined;sceneRenderer.decorationKey=undefined;}menuOpen=open;stopInput();document.querySelector('#main-menu').hidden=!open;document.body?.classList.toggle('menu-open',open);if(open){refreshLanguage();if(JellyI18n)showMenuHelp(false);}else{hasPlayed=true;document.querySelector('#menu-button').focus?.({preventScroll:true});}}
if(JellyI18n){
 createPlayerHints();
 document.querySelector('#win-next').onclick=()=>{const id=currentStandardLevel();if(id&&id<JellyLevels.standardNames.length)globalThis.location.href='?level='+(id+1)+'&play=1';else if(globalThis.location?.search?.includes('level=editor'))globalThis.location.href='editor.html';else{setMenu(true);showMenuScreen('levels');}};
 [document.querySelector('#win-next'),document.querySelector('#again')].forEach((button,index)=>{button.addEventListener('pointerenter',()=>selectWinItem(index,false));button.addEventListener('focus',()=>selectWinItem(index,false));});
 document.querySelector('#play').onclick=()=>hasPlayed?setMenu(false):showMenuScreen('levels');
 document.querySelector('#show-levels').onclick=()=>showMenuScreen('levels');
 document.querySelector('#levels-back').onclick=()=>showMenuScreen('root');
 document.querySelector('#open-editor').onclick=()=>{globalThis.location.href='editor.html';};
 document.querySelectorAll('[data-level]').forEach(button=>button.onclick=()=>{if(!JellyProgress||JellyProgress.canPlay(Number(button.dataset.level)))globalThis.location.href='?level='+button.dataset.level+'&play=1';});
 document.querySelector('#menu-button').onclick=()=>setMenu(true);
 document.querySelector('#show-controls').onclick=()=>showMenuHelp(true);
 document.querySelector('#menu-back').onclick=()=>showMenuHelp(false);
 document.querySelectorAll('#main-menu button').forEach(button=>{
  button.addEventListener('pointerenter',()=>{const index=menuButtons().indexOf(button);if(index>=0)selectMenuItem(index,false);});
  button.addEventListener('focus',()=>{const index=menuButtons().indexOf(button);if(index>=0)selectMenuItem(index,false);});
 });
 addEventListener('languagechange',refreshLanguage);refreshLanguage();
 setMenu(!globalThis.location?.search?.includes('level=editor')&&!/(?:^|[?&])play=1(?:&|$)/.test(globalThis.location?.search||''));
}
