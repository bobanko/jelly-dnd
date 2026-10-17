'use strict';
const canvas=document.querySelector('#scene');
const reducedMotion=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const sceneRenderer=new JellyGPU.Renderer(canvas,JellySoftBody);
let W,H,DPR,scale,angle=0,targetAngle=0,last=0,time=0,moves=0,history=[],won=false,audioOn=false,audio;
const N=12, colors=['#9ddd56','#4ac5e5','#ef5346'],names=['Мох','Иней','Уголёк'];
let zoom=1,fpsTime=0,fpsFrames=0;
const start=[{x:2,z:8},{x:9,z:8},{x:9,z:7}],players=start.map(p=>({...p,spawn:{...p},state:'alive',y:0,vy:0,deaths:0,respawnTimer:0,respawnFlash:0,rx:p.x,rz:p.z,bounce:0,vx:0,vz:0,impact:0,squish:0,squishVelocity:0,portalLock:null,portalCooldown:0,portalFlash:0,portalBlocked:false,deathReason:null}));
const crates=[{kind:'crate',x:7,z:9,y:1,spawn:{x:7,z:9},state:'alive',vx:0,vy:0,vz:0,deaths:0}];
const bodies=[...players,...crates];
let followedPlayer=0;
const camera={x:start[0].x,z:start[0].z};
const plates=[{x:2,z:5},{x:8,z:2}],goals=[{x:3,z:2},{x:8,z:2},{x:9,z:2}];
// Each side has a safe route back from its plate. The lower crossing requires teamwork.
const bridges=[{x:8,z:4,plate:0},{x:3,z:4,plate:1}];
const floor=new Set();
for(let z=1;z<=10;z++)for(let x=1;x<=10;x++){
 if(z>=5 || (z<=3 && x>=2&&x<=9) || (z===4&&(x===3||x===8)))floor.add(`${x},${z}`);
}
// Remove tiles to make distinct islands and narrow approaches.
for(const [x,z] of [[5,5],[6,5],[5,6],[6,6],[1,5],[10,5],[1,6],[10,6],[4,8],[7,8],[4,9],[7,9],[5,10],[6,10]])floor.delete(`${x},${z}`);
const world=new JellyPhysics.World(floor,bridges,plates,[{x:1,z:2,half:.17},{x:10,z:2,half:.17},{x:1,z:9,half:.17},{x:10,z:9,half:.17}]);
// Walls stop horizontal movement; open edges and missing floor tiles allow falls.
for(let x=1;x<=10;x++)for(const z of [0,11])if(x!==5&&x!==6)world.obstacles.push({x,z,half:.5});
for(const x of [0,11])for(let z=1;z<=10;z++)if(z!==7&&z!==8)world.obstacles.push({x,z,half:.5});
const soft=new JellySoftBody.System();world.soft=soft;
// A side route demonstrates the new mechanics without blocking the cooperative rune puzzle.
for(const x of [5,6,7])for(const z of [8,9,10]){floor.add(`${x},${z}`);world.heights.set(`${x},${z}`,1);}
world.lifts.push({x:5,z:7,base:0,top:1,height:0,target:0});
world.spikes.push({x:3,z:9},{x:9,z:6,offset:2.4});
world.portals.push({x:3,z:6,color:'violet'},{x:6,z:9,color:'violet'},{x:9,z:9,color:'amber'},{x:7,z:2,color:'amber'});
const effects=new JellyEffects.System({reducedMotion});
const level={floor,bridges,plates,goals,world,soft,effects,crates,won:false,reducedMotion};
const heldKeys=new Set();
const movementKeys={KeyW:[0,0,-1],KeyS:[0,0,1],KeyA:[0,-1,0],KeyD:[0,1,0],ArrowUp:[1,0,-1],ArrowDown:[1,0,1],ArrowLeft:[1,-1,0],ArrowRight:[1,1,0],KeyI:[2,0,-1],KeyK:[2,0,1],KeyJ:[2,-1,0],KeyL:[2,1,0]};
let accumulator=0;
function resize(){W=innerWidth;H=innerHeight;DPR=Math.min(devicePixelRatio,2);scale=Math.min(W/16,H/12)*zoom;}
addEventListener('resize',resize);resize();
function project(x,y,z){const xx=x-camera.x,zz=z-camera.z,c=Math.cos(angle),s=Math.sin(angle),u=xx*c-zz*s,v=xx*s+zz*c;return{x:W*.5+(u-v)*scale*.71,y:H*.56+(u+v)*scale*.355-y*scale*.86};}
function active(i){return world.active(i,players);}
function tone(freq){if(!audioOn)return;audio??=new AudioContext();const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(freq*.6,audio.currentTime+.14);g.gain.setValueAtTime(.045,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.2);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+.2);}
function updateUI(){
 document.querySelector('#moves').textContent=String(moves).padStart(2,'0');document.querySelector('#win').hidden=!won;
 const lost=players.findIndex(p=>!JellyPhysics.alive(p)),moving=world.lifts.some(l=>Math.abs(l.target-l.height)>.01&&players.some(p=>Math.abs(p.x-l.x)<.4&&Math.abs(p.z-l.z)<.4));
 document.querySelector('#status').textContent=won?'Все руны пробуждены':lost>=0?`${names[lost]} ${players[lost].state==='falling'?'падает…':players[lost].deathReason==='spikes'?'погиб на шипах. Возрождение…':'возрождается…'}`:players.some(p=>p.portalBlocked)?'Выход портала занят':moving?'Лифт поднимается':players.some(p=>p.portalFlash>0)?'Магический переход':active(0)||active(1)?'Магический мост поднят':'Святилище ждёт вас';
}
function focusPlayer(i){followedPlayer=i;document.querySelectorAll('.member').forEach((member,j)=>{member.classList.toggle('following',i===j);member.setAttribute('aria-current',i===j?'true':'false');});}
function clearGoalBeams(){level.won=false;sceneRenderer.goalBeamStrength=[];sceneRenderer.goalWinGlow=0;}
function reset(){
 players.forEach((p,i)=>Object.assign(p,start[i],{spawn:{...start[i]},state:'alive',y:0,vy:0,deaths:0,respawnTimer:0,respawnFlash:0,rx:start[i].x,rz:start[i].z,bounce:0,vx:0,vz:0,impact:0,squish:0,squishVelocity:0}));
 crates.forEach(p=>Object.assign(p,p.spawn,{y:1,state:'alive',vx:0,vy:0,vz:0,deaths:0,respawnTimer:0}));
 history=[];moves=0;won=false;heldKeys.clear();world.held.clear();world.resetFeatures();soft.reset();effects.clear();sceneRenderer.bridgeKey=undefined;accumulator=0;
 players.forEach(p=>Object.assign(p,{portalLock:null,portalCooldown:0,portalFlash:0,portalBlocked:false,deathReason:null}));
 clearGoalBeams();
 focusPlayer(0);camera.x=start[0].x;camera.z=start[0].z;updateUI();
}
function undo(){
 if(!history.length)return;
 const previous=history.pop();
 effects.clear();
 clearGoalBeams();
 players.forEach((p,i)=>Object.assign(p,previous.players[i],{rx:previous.players[i].x,rz:previous.players[i].z,vx:0,vz:0,bounce:.2,impact:0,squish:0,squishVelocity:0}));
 crates.forEach((p,i)=>Object.assign(p,previous.crates[i],{vx:0,vy:0,vz:0}));
 world.held=new Set(previous.bridges);world.restoreFeatures(previous.features);soft.restore(bodies,previous.soft);bodies.forEach(p=>soft.get(p).velocities.forEach(v=>v.fill(0)));sceneRenderer.bridgeKey=undefined;heldKeys.clear();accumulator=0;moves--;won=false;updateUI();
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
 if(won)return;
 accumulator+=Math.min(dt,.05);
 const input=inputs();
 while(accumulator>=JellyPhysics.STEP){
  const events=world.step(bodies,input);
  for(const event of events){
   if(event.player>=players.length)continue;
   effects.burst(event,players,soft);
   if(event.type==='fall'||event.type==='death'){
    for(const key of heldKeys)if(movementKeys[key][0]===event.player)heldKeys.delete(key);
    input[event.player]={x:0,z:0};tone(95);
   }else if(event.type==='respawn')tone(event.player?400:300);else if(event.type==='portal')tone(520);
  }
  accumulator-=JellyPhysics.STEP;
 }
 players.forEach(p=>{p.rx=p.x;p.rz=p.z;p.bounce=Math.max(p.impact,Math.min(.24,Math.hypot(p.vx,p.vz)*.07));});
 won=players.every((p,i)=>world.goalActive(goals[i],p)&&Math.hypot(p.vx,p.vz)<.25);
 if(won){players.forEach(p=>{p.vx=p.vz=0;});heldKeys.clear();tone(640);}
 updateUI();
}
function stopInput(){heldKeys.clear();players.forEach(p=>{p.vx=p.vz=0;const b=soft.get(p);b.velocities.forEach(v=>{v[0]=v[2]=0;});});accumulator=0;}
addEventListener('keydown',e=>{
 if(e.ctrlKey||e.metaKey||e.altKey)return;
 // Physical positions stay the same across layouts, Caps Lock and layout changes while held.
 const k=e.code;
 if(movementKeys[k]){
  e.preventDefault();if(won||e.repeat||heldKeys.has(k)||!JellyPhysics.alive(players[movementKeys[k][0]]))return;
  focusPlayer(movementKeys[k][0]);
  if(!heldKeys.size){history.push(snapshot());moves++;if(history.length>256)history.shift();}
  heldKeys.add(k);
 }else if(!e.repeat){
  if(/^Digit[1-3]$/.test(k)){e.preventDefault();focusPlayer(Number(k.slice(-1))-1);}
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
 effects.step(dt,world);
 const follow=players[followedPlayer],tracking=reducedMotion?1:1-Math.exp(-dt*5);
 camera.x+=(follow.rx-camera.x)*tracking;camera.z+=(follow.rz-camera.z)*tracking;
 level.won=won;sceneRenderer.render(level,players,camera,angle,reducedMotion?0:time,scale,dt);
 fpsTime+=elapsed;fpsFrames++;if(fpsTime>.5){document.querySelector('#fps').textContent=Math.round(fpsFrames/fpsTime)+' FPS';fpsTime=0;fpsFrames=0;}
 requestAnimationFrame(frame);
}
function gpuFailure(message){document.querySelector('#gpu-fallback').hidden=false;document.querySelector('#gpu-status').textContent=message;}
sceneRenderer.onFailure=gpuFailure;
sceneRenderer.init().then(()=>{document.querySelector('#gpu-fallback').hidden=true;}).catch(error=>gpuFailure(error.message));
document.querySelector('#softness').addEventListener('input',e=>{soft.softness=Number(e.target.value);players.forEach(p=>{soft.get(p).sleeping=false;soft.get(p).calm=0;});});
document.querySelector('#decay').addEventListener('input',e=>soft.decay=Number(e.target.value));
document.querySelector('#mesh').addEventListener('change',e=>sceneRenderer.mesh=e.target.checked);
document.querySelector('#colliders').addEventListener('change',e=>sceneRenderer.colliders=e.target.checked);
canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.65,Math.min(1.8,zoom*Math.exp(-e.deltaY*.001)));resize();},{passive:false});
canvas.addEventListener('pointerdown',e=>{
 let closest=null,distance=Infinity;
 players.forEach((p,i)=>{const q=project(p.x,.42+(p.y||0),p.z),d=Math.hypot(e.clientX-q.x,e.clientY-q.y);if(JellyPhysics.alive(p)&&d<scale*.7&&d<distance){closest=i;distance=d;}});
 if(closest!==null){history.push(snapshot());moves++;soft.poke(players[closest]);tone(240);}
});
requestAnimationFrame(frame);focusPlayer(0);updateUI();
