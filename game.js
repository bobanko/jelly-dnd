'use strict';
const tr=key=>globalThis.JellyI18n?.t(key)??key;
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
let mapError=null,definition;
try{let search=globalThis.location?.search||'';const requested=/(?:^|[?&])level=([1-5])(?:&|$)/.exec(search);if(requested&&globalThis.JellyProgress&&!JellyProgress.canPlay(Number(requested[1]))){search='?level=1';globalThis.history.replaceState(null,'',search);}definition=JellyLevels.forGame(search.includes('level=editor')?globalThis.localStorage:undefined,search);}catch(error){mapError=error.message;definition=JellyLevels.read(JellyLevels.defaultLevel());}
const runtime=JellyLevels.instantiate(definition,JellyPhysics,JellySoftBody);
const {start,players,crates,bodies,plates,goals,bridges,floor,world,soft}=runtime;
let followedPlayer=0;
const camera={x:start[0].x,z:start[0].z,targetY:start[0].y||0,focusHeight:(start[0].y||0)+.42,mode:'perspective',pitch:55,fov:45};
const cameraPitches={ortho:30,perspective:55};
const effects=new JellyEffects.System({reducedMotion});
const level={...runtime,effects,won:false,finishProgress:0,reducedMotion};
const menuScene=typeof createMenuScene==='function'?createMenuScene():null;
const heldKeys=new Set();
const keySets={KeyW:[0,0,-1],KeyS:[0,0,1],KeyA:[0,-1,0],KeyD:[0,1,0],ArrowUp:[1,0,-1],ArrowDown:[1,0,1],ArrowLeft:[1,-1,0],ArrowRight:[1,1,0],KeyI:[2,0,-1],KeyK:[2,0,1],KeyJ:[2,-1,0],KeyL:[2,1,0],KeyT:[3,0,-1],KeyG:[3,0,1],KeyF:[3,-1,0],KeyH:[3,1,0]};
// Assign controls by the active roster's order, independently of character colour.
const controlOwners=players.length===1?[0,0,0,0]:players.length===2?[0,1,1,0]:[0,1,2,3].map(i=>i<players.length?i:-1);
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
 if(won&&!winShown&&globalThis.JellyI18n){refreshWin();selectWinItem(0);}winShown=won;
 const lost=players.findIndex(p=>!JellyPhysics.alive(p)),moving=world.lifts.some(l=>Math.abs(l.target-l.height)>.01&&players.some(p=>Math.abs(p.x-l.x)<.4&&Math.abs(p.z-l.z)<.4));
 document.querySelector('#status').textContent=won?tr('Все руны пробуждены'):lost>=0?`${tr(names[players[lost].slot])} ${players[lost].state==='falling'?tr('падает…'):players[lost].deathReason==='spikes'?tr('погиб на шипах. Возрождение…'):tr('возрождается…')}`:finishHold>0?tr('Рунические печати наполняются светом…'):players.some(p=>p.portalBlocked)?tr('Выход портала занят'):moving?tr('Лифт поднимается'):players.some(p=>p.portalFlash>0)?tr('Магический переход'):active(0)||active(1)?tr('Магический мост поднят'):tr('Святилище ждёт вас');
}
function focusPlayer(i){if(players[i])followedPlayer=i;}
function clearGoalVisuals(){level.won=false;level.finishProgress=0;sceneRenderer.goalGlowStrength=[];sceneRenderer.goalWinGlow=0;}
function reset(){
 players.forEach((p,i)=>Object.assign(p,start[i],{spawn:{...start[i]},state:'alive',y:start[i].y||0,vy:0,deaths:0,respawnTimer:0,respawnFlash:0,rx:start[i].x,rz:start[i].z,bounce:0,vx:0,vz:0,impact:0,squish:0,squishVelocity:0,shield:null,shieldHP:0,sword:null,facingX:0,facingZ:1,launchTimer:0,bashCooldown:0,attackTime:0,attackCooldown:0}));
 crates.forEach(p=>Object.assign(p,p.spawn,{y:p.spawn.y||0,state:'alive',vx:0,vy:0,vz:0,deaths:0,respawnTimer:0}));
 history=[];moves=0;won=false;finishHold=0;heldKeys.clear();world.held.clear();world.resetFeatures();soft.reset();effects.clear();sceneRenderer.bridgeKey=undefined;accumulator=0;
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
 const quarter=((Math.round(targetAngle/(Math.PI/2))%4)+4)%4;
 for(const v of result)for(let k=0;k<quarter;k++)[v.x,v.z]=[v.z,-v.x];
 return result;
}
function simulate(dt){
 if(loadingActive||menuOpen||restartTransition||won||mapError)return;
 accumulator+=Math.min(dt,.05);
 const input=inputs();
 while(accumulator>=JellyPhysics.STEP&&!won){
  const events=world.step(bodies,input);
  for(const event of events){
   if(event.player>=players.length)continue;
   effects.burst(event,players,soft);
   if(event.type==='fall'||event.type==='death'){
    for(const key of heldKeys)if(movementKeys[key][0]===event.player)heldKeys.delete(key);
    input[event.player]={x:0,z:0};tone(95);
   }else if(event.type==='shieldBash'){
    for(const key of heldKeys)if(movementKeys[key][0]===event.target)heldKeys.delete(key);input[event.target]={x:0,z:0};woodHit();
   }else if(event.type==='respawn')tone(event.player?400:300);else if(event.type==='portal')tone(520);else if(event.type==='pickup')tone(720);else if(event.type==='archerShot')tone(840);else if(event.type==='arrowBlock'&&event.durability>0)woodHit();else if(event.type==='shieldBreak')woodHit(true);else if(event.type==='archerDeath')tone(180);
  }
  const allFinished=players.length>0&&players.every(p=>world.goalActive(goals.find(g=>g.slot===p.slot),p)&&Math.hypot(p.vx,p.vz)<.25);
  finishHold=allFinished?Math.min(WIN_HOLD_SECONDS,finishHold+JellyPhysics.STEP):0;
  if(finishHold>=WIN_HOLD_SECONDS-1e-9){finishHold=WIN_HOLD_SECONDS;won=true;players.forEach(p=>{p.vx=p.vz=0;});heldKeys.clear();tone(640);const current=/(?:^|[?&])level=([1-5])(?:&|$)/.exec(globalThis.location?.search||'');if(current&&globalThis.JellyProgress){JellyProgress.complete(Number(current[1]));updateLevelLocks();}}
  level.finishProgress=finishHold/WIN_HOLD_SECONDS;
  accumulator-=JellyPhysics.STEP;
 }
 players.forEach(p=>{p.rx=p.x;p.rz=p.z;p.bounce=Math.max(p.impact,Math.min(.24,Math.hypot(p.vx,p.vz)*.07));});
 updateUI();
}
function stopInput(){heldKeys.clear();players.forEach(p=>{if(p.launchTimer)return;p.vx=p.vz=0;const b=soft.get(p);b.velocities.forEach(v=>{v[0]=v[2]=0;});});accumulator=0;}
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
 if(won&&globalThis.JellyI18n){handleWinKey(e);return;}
 if(k==='Escape'){e.preventDefault();setMenu(!menuOpen);return;}
 if(movementKeys[k]){
  e.preventDefault();if(won||e.repeat||heldKeys.has(k)||!JellyPhysics.alive(players[movementKeys[k][0]]))return;
  focusPlayer(movementKeys[k][0]);
  if(!heldKeys.size){history.push(snapshot());moves++;if(history.length>256)history.shift();}
  heldKeys.add(k);
 }else if(!e.repeat){
  if(k==='KeyQ')targetAngle-=Math.PI/2;
  else if(k==='KeyE')targetAngle+=Math.PI/2;
  else if(k==='KeyR')restartLevel();
  else if(k==='KeyZ')undo();
 }
});
addEventListener('keyup',e=>{const key=e.code;if(movementKeys[key]){e.preventDefault();heldKeys.delete(key);}});
addEventListener('blur',stopInput);
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopInput();});

document.querySelector('#reset').onclick=()=>restartLevel();document.querySelector('#again').onclick=()=>restartLevel();
function restartLevel(){
 if(!globalThis.JellyI18n){reset();return;}
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
 const layouts=[['W','A','S','D'],['↑','←','↓','→'],['I','J','K','L'],['T','F','G','H']];
 playerHints=players.map((p,i)=>{const node=document.createElement('div');node.className='player-key-hint';node.hidden=true;node.style.setProperty('--jelly-color',colors[p.slot]);
  const keys=layouts[controlOwners.indexOf(i)];keys.forEach(key=>{const kbd=document.createElement('kbd');kbd.textContent=key;node.append(kbd);});
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
 const elapsed=Math.max(0,(t-last)/1000),dt=Math.min(elapsed,.05);last=t;time=t/1000;
 fpsElapsed+=elapsed;fpsFrames++;
 if(fpsElapsed>=.5){const counter=document.querySelector('#fps');if(counter)counter.textContent=Math.round(fpsFrames/fpsElapsed)+' FPS';fpsElapsed=0;fpsFrames=0;}
 updateRestart(dt);
 angle=reducedMotion?targetAngle:angle+(targetAngle-angle)*(1-Math.exp(-dt*11));
 if(sceneRenderer.ready)simulate(dt);
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
function updateLoading(progress,stage){if(!globalThis.JellyI18n)return;loadingActive=true;loadingStage=stage;document.querySelector('#level-intro').hidden=false;document.querySelector('#level-intro').classList.add('loading');document.querySelector('#level-intro-title').textContent=tr(definition.name);document.querySelector('#level-loading').hidden=false;document.querySelector('#loading-status').textContent=tr(stage);document.querySelector('#loading-progress').value=progress;}
function gpuFailure(message){if(!globalThis.JellyI18n)return;loadingFailed=true;updateLoading(0,'loadingGraphics');document.querySelector('#loading-status').textContent=message;document.querySelector('#loading-progress').hidden=true;document.querySelector('#loading-retry').hidden=false;}
sceneRenderer.onFailure=gpuFailure;
sceneRenderer.onProgress=updateLoading;
if(globalThis.JellyI18n)updateLoading(0,'loadingGraphics');
sceneRenderer.init().then(async()=>{
 if(mapError){gpuFailure(mapError);return;}
 updateGameCamera(0,true);
 // Build and submit the actual scene before revealing it or accepting input.
 if(menuOpen&&menuScene){const menuCamera={x:3.1,z:4.8,targetY:.2,focusHeight:.5,mode:'ortho',pitch:24,fov:45};sceneRenderer.render(menuScene,menuScene.players,menuCamera,-.15,0,Math.min(W/7.5,H/5),0);}
 else sceneRenderer.render(level,players,camera,angle,0,scale,0);
 await sceneRenderer.device?.queue?.onSubmittedWorkDone();
 if(loadingFailed)return;
 if(globalThis.JellyI18n){document.querySelector('#level-loading').hidden=true;document.querySelector('#level-intro').hidden=true;document.querySelector('#level-intro').classList.remove('loading');}
 loadingActive=false;
}).catch(error=>gpuFailure(error.message));
document.querySelector('#softness').addEventListener('input',e=>{soft.softness=Number(e.target.value);players.forEach(p=>{soft.get(p).sleeping=false;soft.get(p).calm=0;});});
document.querySelector('#decay').addEventListener('input',e=>soft.decay=Number(e.target.value));
document.querySelector('#mesh').addEventListener('change',e=>sceneRenderer.mesh=e.target.checked);
document.querySelector('#colliders').addEventListener('change',e=>sceneRenderer.colliders=e.target.checked);
function updateCameraUI(){
 document.querySelector('#camera-pitch').value=camera.pitch;
 document.querySelector('#camera-pitch-value').textContent=camera.pitch+'°';
 document.querySelector('#camera-fov-value').textContent=camera.fov+'°';
 document.querySelector('#camera-fov').disabled=camera.mode!=='perspective';
}
document.querySelector('#camera-mode').addEventListener('change',e=>{stopInput();camera.mode=e.target.value;camera.pitch=cameraPitches[camera.mode];updateCameraUI();});
document.querySelector('#camera-pitch').addEventListener('input',e=>{camera.pitch=Number(e.target.value);cameraPitches[camera.mode]=camera.pitch;updateCameraUI();});
document.querySelector('#camera-fov').addEventListener('input',e=>{camera.fov=Number(e.target.value);updateCameraUI();});
updateCameraUI();
canvas.addEventListener('wheel',e=>{e.preventDefault();if(menuOpen)return;zoom=Math.max(.65,Math.min(1.8,zoom*Math.exp(-e.deltaY*.001)));resize();},{passive:false});
canvas.addEventListener('pointerdown',e=>{
 if(menuOpen||restartTransition||loadingActive)return;
 let closest=null,distance=Infinity;
 players.forEach((p,i)=>{const q=project(p.x,.42+(p.y||0),p.z),d=Math.hypot(e.clientX-q.x,e.clientY-q.y);if(q.visible&&JellyPhysics.alive(p)&&d<q.scale*.7&&d<distance){closest=i;distance=d;}});
 if(closest!==null){history.push(snapshot());moves++;soft.poke(players[closest]);tone(240);}
});
requestAnimationFrame(frame);focusPlayer(0);updateUI();

function refreshLanguage(){
 if(globalThis.JellyI18n){
  const russian=JellyI18n.language==='ru',title=document.querySelector('#menu-title');
  title.replaceChildren();const word=document.createElement('span');word.className='jelly-word';
  [...(russian?'Желейки':'Jelly')].forEach((letter,i)=>{const span=document.createElement('span');span.className='jelly-letter';span.style.color=colors[i%colors.length];span.textContent=letter;word.append(span);});
  const and=document.createElement('span');and.textContent=russian?' и':' &';title.append(word,and,document.createElement('br'),document.createTextNode(russian?'косточки':'Bones'));
  title.setAttribute('aria-label',russian?'Желейки и косточки':'Jelly & Bones');document.title=russian?'Желейки и косточки':'Jelly & Bones';
 }
 if(globalThis.JellyI18n)document.querySelector('#level-intro-title').textContent=tr(definition.name);
 if(loadingActive&&!loadingFailed)document.querySelector('#loading-status').textContent=tr(loadingStage);
 const sound=document.querySelector('#sound');sound.title=tr(audioOn?'Выключить звук':'Включить звук');sound.setAttribute('aria-label',sound.title);
  if(globalThis.JellyI18n)document.querySelector('#play').textContent=tr(hasPlayed?'resume':'play');
 updateUI();
 if(won&&globalThis.JellyI18n)refreshWin();
}
function currentStandardLevel(){const match=/(?:^|[?&])level=([1-5])(?:&|$)/.exec(globalThis.location?.search||'');return match?Number(match[1]):0;}
function refreshWin(){const id=currentStandardLevel();document.querySelector('#win-title').textContent=tr(id===5?'demoComplete':'levelComplete');document.querySelector('#win-level-name').textContent=tr(definition.name);document.querySelector('#win-next').textContent=tr(id&&id<5?'nextLevel':globalThis.location?.search?.includes('level=editor')?'editor':'levels');}
function selectWinItem(index,focus=true){const buttons=[document.querySelector('#win-next'),document.querySelector('#again')];winSelected=(index+2)%2;buttons.forEach((button,i)=>button.classList.toggle('selected',i===winSelected));if(focus)buttons[winSelected].focus({preventScroll:true});}
function handleWinKey(e){const k=e.code;if(['ArrowDown','ArrowRight','KeyS','KeyD','ArrowUp','ArrowLeft','KeyW','KeyA','Tab'].includes(k)){e.preventDefault();selectWinItem(winSelected+1);}else if(k==='Enter'||k==='KeyE'){e.preventDefault();if(!e.repeat)document.querySelector(winSelected===0?'#win-next':'#again').click();}else if(k==='Escape'||k==='KeyQ'){e.preventDefault();if(!e.repeat)setMenu(true);}}
function updateLevelLocks(){document.querySelectorAll('[data-level]').forEach(button=>{const locked=globalThis.JellyProgress&&!JellyProgress.canPlay(Number(button.dataset.level));button.disabled=!!locked;button.classList.toggle('locked',!!locked);let icon=button.querySelector('.level-lock');if(!icon){icon=document.createElement('span');icon.className='level-lock';icon.setAttribute('aria-hidden','true');icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';button.append(icon);}icon.hidden=!locked;});}
function menuButtons(){return [...document.querySelectorAll(menuHelp?'#menu-back':menuLevelSelect?'#menu-levels button:not(:disabled)':'#menu-root button')];}
function selectMenuItem(index,focus=true){const buttons=menuButtons();menuSelected=(index+buttons.length)%buttons.length;buttons.forEach((button,i)=>button.classList.toggle('selected',i===menuSelected));if(focus)buttons[menuSelected]?.focus({preventScroll:true});}
function showMenuScreen(screen){menuHelp=screen==='help';menuLevelSelect=screen==='levels';if(menuLevelSelect)updateLevelLocks();document.querySelector('#menu-root').hidden=menuHelp||menuLevelSelect;document.querySelector('#menu-help').hidden=!menuHelp;document.querySelector('#menu-levels').hidden=!menuLevelSelect;document.querySelector('#main-menu').classList.toggle('selecting-level',menuLevelSelect);selectMenuItem(0);}
function showMenuHelp(show){showMenuScreen(show?'help':'root');}
function handleMenuKey(e){
 const k=e.code;
 if(['ArrowDown','ArrowRight','KeyS','KeyD','ArrowUp','ArrowLeft','KeyW','KeyA'].includes(k)){e.preventDefault();selectMenuItem(menuSelected+(['ArrowUp','ArrowLeft','KeyW','KeyA'].includes(k)?-1:1));}
 else if(k==='Enter'||k==='KeyE'){e.preventDefault();if(!e.repeat)menuButtons()[menuSelected]?.click();}
 else if(k==='Escape'||k==='KeyQ'){e.preventDefault();if(e.repeat)return;if(menuHelp||menuLevelSelect)showMenuScreen('root');else if(hasPlayed)setMenu(false);}
}
function setMenu(open){if(menuOpen!==open){sceneRenderer.bridgeKey=undefined;sceneRenderer.propGeometryKey=undefined;sceneRenderer.decorationKey=undefined;}menuOpen=open;stopInput();document.querySelector('#main-menu').hidden=!open;document.body?.classList.toggle('menu-open',open);if(open){refreshLanguage();if(globalThis.JellyI18n)showMenuHelp(false);}else{hasPlayed=true;document.querySelector('#menu-button').focus?.({preventScroll:true});}}
if(globalThis.JellyI18n){
 createPlayerHints();
 document.querySelector('#win-next').onclick=()=>{const id=currentStandardLevel();if(id&&id<5)globalThis.location.href='?level='+(id+1)+'&play=1';else if(globalThis.location?.search?.includes('level=editor'))globalThis.location.href='editor.html';else{setMenu(true);showMenuScreen('levels');}};
 [document.querySelector('#win-next'),document.querySelector('#again')].forEach((button,index)=>{button.addEventListener('pointerenter',()=>selectWinItem(index,false));button.addEventListener('focus',()=>selectWinItem(index,false));});
 document.querySelector('#play').onclick=()=>hasPlayed?setMenu(false):showMenuScreen('levels');
 document.querySelector('#show-levels').onclick=()=>showMenuScreen('levels');
 document.querySelector('#levels-back').onclick=()=>showMenuScreen('root');
 document.querySelector('#open-editor').onclick=()=>{globalThis.location.href='editor.html';};
 document.querySelectorAll('[data-level]').forEach(button=>button.onclick=()=>{if(!globalThis.JellyProgress||JellyProgress.canPlay(Number(button.dataset.level)))globalThis.location.href='?level='+button.dataset.level+'&play=1';});
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
