'use strict';
const canvas=document.querySelector('#scene');
const reducedMotion=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const sceneRenderer=new JellyGPU.Renderer(canvas,JellySoftBody);
let W,H,DPR,scale,angle=0,targetAngle=0,last=0,time=0,moves=0,history=[],won=false,finishHold=0,audioOn=false,audio;
const WIN_HOLD_SECONDS=3;
const N=12, colors=JellyLevels.characters.map(p=>p.color),names=JellyLevels.characters.map(p=>p.name);
let zoom=1,fpsTime=0,fpsFrames=0;
let mapError=null,definition;
try{const search=globalThis.location?.search||'';definition=JellyLevels.forGame(search.includes('level=editor')?globalThis.localStorage:undefined,search);}catch(error){mapError=error.message;definition=JellyLevels.read(JellyLevels.defaultLevel());}
const runtime=JellyLevels.instantiate(definition,JellyPhysics,JellySoftBody);
const {start,players,crates,bodies,plates,goals,bridges,floor,world,soft}=runtime;
let followedPlayer=0;
const camera={x:start[0].x,z:start[0].z,targetY:start[0].y||0,focusHeight:(start[0].y||0)+.42,mode:'perspective',pitch:55,fov:45};
const cameraPitches={ortho:30,perspective:55};
const effects=new JellyEffects.System({reducedMotion});
const level={...runtime,effects,won:false,finishProgress:0,reducedMotion};
document.querySelector('.intro h1').textContent=definition.name;
document.querySelectorAll('.camera-player').forEach((key,slot)=>key.hidden=!players.some(p=>p.slot===slot));
if(globalThis.location?.search?.includes('level=editor')){document.querySelector('#editor-link').textContent='← В редактор';document.querySelector('.chapter').textContent='ТЕСТ УРОВНЯ';}
const heldKeys=new Set();
const keySets={KeyW:[0,0,-1],KeyS:[0,0,1],KeyA:[0,-1,0],KeyD:[0,1,0],ArrowUp:[1,0,-1],ArrowDown:[1,0,1],ArrowLeft:[1,-1,0],ArrowRight:[1,1,0],KeyI:[2,0,-1],KeyK:[2,0,1],KeyJ:[2,-1,0],KeyL:[2,1,0],KeyT:[3,0,-1],KeyG:[3,0,1],KeyF:[3,-1,0],KeyH:[3,1,0]};
// Assign controls by the active roster's order, independently of character colour.
const controlOwners=players.length===1?[0,0,0,0]:players.length===2?[0,1,1,0]:[0,1,2,3].map(i=>i<players.length?i:-1);
const controlLabels=['WASD','↑←↓→','IJKL','TFGH'];
const movementKeys=Object.fromEntries(Object.entries(keySets).map(([key,[set,x,z]])=>[key,[controlOwners[set],x,z]]).filter(([,value])=>value[0]>=0));
document.querySelectorAll('.member').forEach((member,slot)=>{
 const i=players.findIndex(p=>p.slot===slot);member.hidden=i<0;
 if(i>=0)member.querySelector('kbd').textContent=controlLabels.filter((_,set)=>controlOwners[set]===i).join(' / ');
});
let accumulator=0;
function resize(){W=innerWidth;H=innerHeight;DPR=Math.min(devicePixelRatio,2);scale=Math.min(W/16,H/12)*zoom;}
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
 const lost=players.findIndex(p=>!JellyPhysics.alive(p)),moving=world.lifts.some(l=>Math.abs(l.target-l.height)>.01&&players.some(p=>Math.abs(p.x-l.x)<.4&&Math.abs(p.z-l.z)<.4));
 document.querySelector('#status').textContent=won?'Все руны пробуждены':lost>=0?`${names[players[lost].slot]} ${players[lost].state==='falling'?'падает…':players[lost].deathReason==='spikes'?'погиб на шипах. Возрождение…':'возрождается…'}`:finishHold>0?'Рунические печати наполняются светом…':players.some(p=>p.portalBlocked)?'Выход портала занят':moving?'Лифт поднимается':players.some(p=>p.portalFlash>0)?'Магический переход':active(0)||active(1)?'Магический мост поднят':'Святилище ждёт вас';
}
function focusPlayer(i){if(!players[i])return;followedPlayer=i;document.querySelectorAll('.member').forEach((member,slot)=>{const current=players[i].slot===slot;member.classList.toggle('following',current);member.setAttribute('aria-current',current?'true':'false');});}
function clearGoalVisuals(){level.won=false;level.finishProgress=0;sceneRenderer.goalGlowStrength=[];sceneRenderer.goalWinGlow=0;}
function reset(){
 players.forEach((p,i)=>Object.assign(p,start[i],{spawn:{...start[i]},state:'alive',y:start[i].y||0,vy:0,deaths:0,respawnTimer:0,respawnFlash:0,rx:start[i].x,rz:start[i].z,bounce:0,vx:0,vz:0,impact:0,squish:0,squishVelocity:0,shield:null,shieldHP:0,sword:null,facingX:0,facingZ:1,launchTimer:0,bashCooldown:0,attackTime:0,attackCooldown:0}));
 crates.forEach(p=>Object.assign(p,p.spawn,{y:p.spawn.y||0,state:'alive',vx:0,vy:0,vz:0,deaths:0,respawnTimer:0}));
 history=[];moves=0;won=false;finishHold=0;heldKeys.clear();world.held.clear();world.resetFeatures();soft.reset();effects.clear();sceneRenderer.bridgeKey=undefined;accumulator=0;
 players.forEach(p=>Object.assign(p,{portalLock:null,portalCooldown:0,portalFlash:0,portalBlocked:false,deathReason:null}));
 clearGoalVisuals();
 sceneRenderer.platePress=[];
 focusPlayer(0);camera.x=start[0].x;camera.z=start[0].z;camera.targetY=start[0].y||0;camera.focusHeight=camera.targetY+.42;updateUI();
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
 if(won||mapError)return;
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
  if(finishHold>=WIN_HOLD_SECONDS-1e-9){finishHold=WIN_HOLD_SECONDS;won=true;players.forEach(p=>{p.vx=p.vz=0;});heldKeys.clear();tone(640);}
  level.finishProgress=finishHold/WIN_HOLD_SECONDS;
  accumulator-=JellyPhysics.STEP;
 }
 players.forEach(p=>{p.rx=p.x;p.rz=p.z;p.bounce=Math.max(p.impact,Math.min(.24,Math.hypot(p.vx,p.vz)*.07));});
 updateUI();
}
function stopInput(){heldKeys.clear();players.forEach(p=>{if(p.launchTimer)return;p.vx=p.vz=0;const b=soft.get(p);b.velocities.forEach(v=>{v[0]=v[2]=0;});});accumulator=0;}
addEventListener('keydown',e=>{
 if(e.ctrlKey||e.metaKey||e.altKey)return;
 if(e.target?.closest?.('select,textarea,input:not([type=range]):not([type=checkbox])')||e.target?.matches?.('input[type=range]')&&/^(Arrow|Home|End|Page)/.test(e.code))return;
 // Physical positions stay the same across layouts, Caps Lock and layout changes while held.
 const k=e.code;
 if(movementKeys[k]){
  e.preventDefault();if(won||e.repeat||heldKeys.has(k)||!JellyPhysics.alive(players[movementKeys[k][0]]))return;
  focusPlayer(movementKeys[k][0]);
  if(!heldKeys.size){history.push(snapshot());moves++;if(history.length>256)history.shift();}
  heldKeys.add(k);
 }else if(!e.repeat){
  if(/^Digit[1-4]$/.test(k)){e.preventDefault();focusPlayer(players.findIndex(p=>p.slot===Number(k.slice(-1))-1));}
  else if(k==='KeyQ')targetAngle-=Math.PI/2;
  else if(k==='KeyE')targetAngle+=Math.PI/2;
  else if(k==='KeyR')reset();
  else if(k==='KeyZ')undo();
 }
});
addEventListener('keyup',e=>{const key=e.code;if(movementKeys[key]){e.preventDefault();heldKeys.delete(key);}});
addEventListener('blur',stopInput);
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopInput();});

document.querySelector('#reset').onclick=reset;document.querySelector('#again').onclick=reset;
document.querySelector('#sound').onclick=e=>{
 audioOn=!audioOn;const button=e.currentTarget;
 button.setAttribute('aria-pressed',String(audioOn));button.setAttribute('aria-label',audioOn?'Выключить звук':'Включить звук');button.title=audioOn?'Выключить звук':'Включить звук';tone(400);
};

function frame(t){
 const elapsed=Math.max(0,(t-last)/1000),dt=Math.min(elapsed,.05);last=t;time=t/1000;
 angle=reducedMotion?targetAngle:angle+(targetAngle-angle)*(1-Math.exp(-dt*11));
 if(sceneRenderer.ready)simulate(dt);
 effects.step(dt,world,goals,players);
 const follow=players[followedPlayer],tracking=reducedMotion?1:1-Math.exp(-dt*5);
 camera.x+=(follow.rx-camera.x)*tracking;camera.z+=(follow.rz-camera.z)*tracking;
 camera.targetY+=((follow.y||0)-camera.targetY)*tracking;
 camera.focusHeight=(follow.y||0)+.42;
 level.won=won;sceneRenderer.render(level,players,camera,angle,reducedMotion?0:time,scale,dt);
 fpsTime+=elapsed;fpsFrames++;if(fpsTime>.5){document.querySelector('#fps').textContent=Math.round(fpsFrames/fpsTime)+' FPS';fpsTime=0;fpsFrames=0;}
 requestAnimationFrame(frame);
}
function gpuFailure(message){document.querySelector('#gpu-fallback').hidden=false;document.querySelector('#gpu-status').textContent=message;}
sceneRenderer.onFailure=gpuFailure;
sceneRenderer.init().then(()=>{if(mapError){document.querySelector('#gpu-fallback h2').textContent='Не удалось открыть уровень';gpuFailure(mapError);}else document.querySelector('#gpu-fallback').hidden=true;}).catch(error=>gpuFailure(error.message));
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
canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.65,Math.min(1.8,zoom*Math.exp(-e.deltaY*.001)));resize();},{passive:false});
canvas.addEventListener('pointerdown',e=>{
 let closest=null,distance=Infinity;
 players.forEach((p,i)=>{const q=project(p.x,.42+(p.y||0),p.z),d=Math.hypot(e.clientX-q.x,e.clientY-q.y);if(q.visible&&JellyPhysics.alive(p)&&d<q.scale*.7&&d<distance){closest=i;distance=d;}});
 if(closest!==null){history.push(snapshot());moves++;soft.poke(players[closest]);tone(240);}
});
requestAnimationFrame(frame);focusPlayer(0);updateUI();
