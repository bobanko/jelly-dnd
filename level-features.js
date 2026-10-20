// Height-aware level surfaces and triggers, shared by physics, rendering and debug overlays.
(function(root){
 'use strict';
 const alive=p=>!p.state||p.state==='alive';
 const near=(p,q,r)=>Math.abs(p.x-q.x)<r&&Math.abs(p.z-q.z)<r;
 const spikeNormals={top:[0,1,0],north:[0,0,-1],east:[1,0,0],south:[0,0,1],west:[-1,0,0]};
 function spikeFrame(spike,height=0){
  const n=spikeNormals[spike.face||'top']||spikeNormals.top,wall=n[1]===0;
  return {origin:[spike.x+n[0]*.503,height-(wall?.5:0),spike.z+n[2]*.503],n,u:wall?[-n[2],0,n[0]]:[1,0,0],v:wall?[0,1,0]:[0,0,1]};
 }
 function spikeBoxes(spike,height=0,extension=1){
  const f=spikeFrame(spike,height),length=.24*extension,boxes=[];
  for(const u of [-.21,.21])for(const v of [-.21,.21]){
   const center=f.origin.map((p,k)=>p+f.u[k]*u+f.v[k]*v+f.n[k]*(.015+length*.5));
   const half=f.n.map((n,k)=>Math.abs(n)*length*.5+(Math.abs(f.u[k])+Math.abs(f.v[k]))*.075*extension);
   boxes.push({x:center[0],z:center[2],halfX:half[0],halfZ:half[2],minY:center[1]-half[1],maxY:center[1]+half[1],kind:'spikes',...(spike.color===undefined?{}:{color:spike.color})});
  }return boxes;
 }
 function install(World){
  Object.assign(World.prototype,{
   conveyorVelocity(p,foot=p.y||0){
    let x=0,z=0;
    if(!alive(p)||p.launchTimer>0||Math.abs(p.vy||0)>.9)return {x,z};
    const half=.36,area=4*half*half;
    for(const belt of this.conveyors){
     if(Math.abs(p.x-belt.x)>.5+half||Math.abs(p.z-belt.z)>.5+half)continue;
     const height=belt.y??this.heightAt(belt.x,belt.z);if(height===null||Math.abs(foot-height)>.13)continue;
     const overlapX=Math.max(0,Math.min(p.x+half,belt.x+.5)-Math.max(p.x-half,belt.x-.5));
     const overlapZ=Math.max(0,Math.min(p.z+half,belt.z+.5)-Math.max(p.z-half,belt.z-.5));
     const weight=overlapX*overlapZ/area,speed=belt.speed??.85;x+=(belt.dx||0)*speed*weight;z+=(belt.dz??1)*speed*weight;
    }
    return {x,z};
   },
   conveyorJoined(belt,sign){
    const dx=belt.dx||0,dz=belt.dz??1,y=belt.y??this.heightAt(belt.x,belt.z);
    return this.conveyors.some(other=>other!==belt&&other.x===belt.x+dx*sign&&other.z===belt.z+dz*sign&&(other.dx||0)===dx&&(other.dz??1)===dz&&(other.y??this.heightAt(other.x,other.z))===y);
   },
   goalActive(goal,player){
    return !!goal&&!!player&&alive(player)&&player.kind!=='crate'&&Math.abs((player.y||0)-(goal.y??this.heightAt(goal.x,goal.z)??0))<.15&&Math.hypot(player.x-goal.x,player.z-goal.z)<.32;
   },
   goalCharge(goal,player){
    if(!goal||!player||!alive(player)||player.kind==='crate'||Math.abs((player.y||0)-(goal.y??this.heightAt(goal.x,goal.z)??0))>=.15)return 0;
    const t=Math.max(0,Math.min(1,(Math.hypot(player.x-goal.x,player.z-goal.z)-.32)/.4));
    return 1-t*t*(3-2*t);
   },
   portalDestination(portal){
    const chain=this.portals.filter(p=>p.color===portal.color),index=chain.indexOf(portal);
    return index<0||chain.length<2?null:chain[(index+1)%chain.length];
   },
   portalLocked(portal,players){
    const height=portal.y??this.heightAt(portal.x,portal.z)??0;
    return players.some(p=>alive(p)&&p.kind!=='crate'&&p.portalLock===portal.color&&Math.abs((p.y||0)-height)<.2&&near(p,portal,.78));
   },
   portalExitBlocked(portal,bodies,traveller=null){
    const height=portal.y??this.heightAt(portal.x,portal.z);if(height===null)return true;
    if(bodies.some(p=>p!==traveller&&p.state!=='dead'&&near(p,portal,.8)&&Math.abs((p.y||0)-height)<.7))return true;
    return this.collisionBoxes().some(b=>this.blockSolid(traveller,b)&&b.maxY>height+.03&&b.minY<height+.84&&Math.abs(b.x-portal.x)<(b.halfX??b.half)+.36&&Math.abs(b.z-portal.z)<(b.halfZ??b.half)+.36);
   },
   portalInactive(portal,bodies,traveller=null){
    const destination=this.portalDestination(portal);
    return this.portalLocked(portal,bodies)||!destination||this.portalLocked(destination,bodies)||this.portalExitBlocked(destination,bodies,traveller)||this.portalExitBlocked(portal,bodies.filter(p=>p.kind==='crate'),traveller);
   },
   portalCharge(portal,players,available){
    if(available===false||available===undefined&&this.portalInactive(portal,players))return 0;
    const height=portal.y??this.heightAt(portal.x,portal.z)??0;
    let charge=0;
    for(const p of players){
     if(!alive(p)||p.kind==='crate'||Math.abs((p.y||0)-height)>.2)continue;
     const dx=Math.max(0,Math.abs(p.x-portal.x)-.38),dz=Math.max(0,Math.abs(p.z-portal.z)-.38),t=Math.min(1,Math.hypot(dx,dz)/.3);
     charge=Math.max(charge,1-t*t*(3-2*t));
    }
    return charge;
   },
   spikeState(spike){
    if(spike.plate||spike.cycle===0){
     const enabled=spike.plate?this.active(this.plates.findIndex(p=>p.id===spike.plate||p.color===spike.plate),this.bodies||[]):spike.enabled!==false;
     return {extension:enabled?1:0,stage:enabled?'raised':'hidden',dangerous:enabled,warning:false};
    }
    // A one-second warning beat shows harmless tips before the full rise.
    const cycle=spike.cycle??5.8,time=(this.featureTime||0)+(spike.offset||0)+(spike.enabled===false?cycle*2.4/5.8:0),phase=((time%cycle+cycle)%cycle)*(5.8/cycle),peek=.3;
    const smooth=t=>t*t*(3-2*t);
    let extension=1,stage='raised';
    if(phase>=2&&phase<2.3){extension=1-smooth((phase-2)/.3);stage='retracting';}
    else if(phase>=2.3&&phase<4.5){extension=0;stage='hidden';}
    else if(phase>=4.5&&phase<5.5){extension=peek*smooth(Math.min(1,(phase-4.5)/.15));stage='peeking';}
    else if(phase>=5.5){extension=peek+(1-peek)*smooth((phase-5.5)/.3);stage='rising';}
    return {extension,stage,dangerous:extension>.35,warning:stage==='peeking'||(stage==='rising'&&extension<=.35)};
   },
   spikeFrame(spike){return spikeFrame(spike,spike.y??this.heightAt(spike.x,spike.z)??0);},
   spikeBoxes(spike,extension=1){return spikeBoxes(spike,spike.y??this.heightAt(spike.x,spike.z)??0,extension);},
   spikeTouches(player,spike,extension=1){
    if(spike.color!==undefined&&player.kind!=='crate'&&player.slot===spike.color)return false;
    if(Math.abs(player.x-spike.x)>1.2||Math.abs(player.z-spike.z)>1.2)return false;
    const f=this.spikeFrame(spike),d=[player.x-f.origin[0],(player.y||0)+.42-f.origin[1],player.z-f.origin[2]],project=axis=>d.reduce((sum,v,k)=>sum+v*axis[k],0),radius=axis=>Math.abs(axis[1])*.42+(Math.abs(axis[0])+Math.abs(axis[2]))*.38;
    const n=project(f.n),half=radius(f.n),width=.075*extension;
    return n+half>.015&&n-half<.015+.24*extension&&Math.abs(Math.abs(project(f.u))-.21)<radius(f.u)+width&&Math.abs(Math.abs(project(f.v))-.21)<radius(f.v)+width;
   },
   bridgeBounds(i){
    const bridge=this.bridges[i],progress=bridge.progress??(this.soft?0:this.held.has(i)?1:0);
    if(progress<=0)return null;
    // Slide out of the northern bank, revealing only the supported part of the gap.
    return {x:bridge.x,z:bridge.z-.5+progress*.5,half:.5,halfX:.5,halfZ:progress*.5,minY:(bridge.y||0)-.26,maxY:bridge.y||0,kind:'bridge'};
   },
   blockSolid(body,block){return block.color===undefined||!body||body.kind==='crate'||body.slot!==block.color;},
   heightAt(x,z,ceiling=Infinity,body=null){
    if(this.blocks?.length){
     const tx=Math.floor(x+.5),tz=Math.floor(z+.5),surfaces=[];
     const ys=this.blockColumns?(this.blockColumns.get(`${tx},${tz}`)||[]):this.blocks.filter(b=>b.x===tx&&b.z===tz).map(b=>b.y);
     for(const y of ys){if(body&&body.kind!=='crate'&&Number.isInteger(body.slot)&&this.blockColors?.size&&this.blockColors.get(`${tx},${y},${tz}`)===body.slot)continue;if(!this.bridges.some(b=>b.x===tx&&b.z===tz&&Math.abs((b.y||0)-y)<.01)&&!this.lifts.some(l=>l.x===tx&&l.z===tz&&Math.abs(l.base-y)<.01))surfaces.push(y);}
     for(let i=0;i<this.bridges.length;i++){const b=this.bridges[i];if(b.x!==tx||b.z!==tz)continue;const bounds=this.bridgeBounds(i);if(bounds&&Math.abs(x-bounds.x)<=bounds.halfX&&Math.abs(z-bounds.z)<=bounds.halfZ+1e-8)surfaces.push(bounds.maxY);}
     for(const l of this.lifts)if(l.x===tx&&l.z===tz)surfaces.push(l.height);
     const legacyY=this.heights.get(`${tx},${tz}`)||0;if(this.floor.has(`${tx},${tz}`)&&!this.bridges.some(b=>b.x===tx&&b.z===tz&&Math.abs((b.y||0)-legacyY)<.01)&&!this.lifts.some(l=>l.x===tx&&l.z===tz&&Math.abs(l.base-legacyY)<.01))surfaces.push(legacyY);
     const possible=surfaces.filter(y=>y<=ceiling+.001);return possible.length?Math.max(...possible):null;
    }
    const tileX=Math.floor(x+.5),tileZ=Math.floor(z+.5),bridge=this.bridges.findIndex(b=>b.x===tileX&&b.z===tileZ);
    if(bridge>=0){const bounds=this.bridgeBounds(bridge);return bounds&&Math.abs(x-bounds.x)<=bounds.halfX&&Math.abs(z-bounds.z)<=bounds.halfZ+1e-8?bounds.maxY:null;}
    x=tileX;z=tileZ;if(this.solid(x,z))return null;
    const lift=this.lifts.find(l=>l.x===x&&l.z===z);return lift?lift.height:(this.heights.get(`${x},${z}`)||0);
   },
   supported(p){const height=this.heightAt(p.x,p.z,(p.y||0)+.2,p);return height!==null&&(this.blocks?.length?Math.abs((p.y||0)-height)<.23:(p.y||0)>=height-.2);},
   obstaclesNear(p){return this.blocks?.length?this.collisionBoxes().filter(b=>this.blockSolid(p,b)&&b.maxY>(p.y||0)+.05&&b.minY<(p.y||0)+.84):this.obstacles;},
   active(i,bodies){
    const plate=this.plates[i];if(!plate)return false;
    return this.plates.some(candidate=>{
     if(candidate!==plate&&(!plate.color||candidate.color!==plate.color))return false;
     const height=candidate.y??this.heightAt(candidate.x,candidate.z)??0;
     return bodies.some(p=>alive(p)&&Math.abs((p.y||0)-height)<.15&&near(p,candidate,.42));
    });
   },
   collisionBoxes(){
    if(this._collisionCache)return this._collisionCache;
    const boxes=[],conveyorCells=new Set(this.conveyors.map(p=>`${p.x},${p.z}`));
    this._blockBoxes??=(this.blocks||[]).filter(b=>!this.bridges.some(p=>p.x===b.x&&p.z===b.z&&Math.abs((p.y||0)-b.y)<.01)&&!this.lifts.some(p=>p.x===b.x&&p.z===b.z&&Math.abs(p.base-b.y)<.01)).map(b=>({x:b.x,z:b.z,half:.5,minY:b.y-1,maxY:b.y,kind:'block',...(b.color===undefined?{}:{color:b.color})}));boxes.push(...this._blockBoxes);
    if(this.blocks?.length){for(let i=0;i<this.bridges.length;i++){const p=this.bridges[i],b=this.bridgeBounds(i),key=`${p.x},${p.z}`;if(b&&(!this.floor.has(key)||Math.abs((this.heights.get(key)||0)-(p.y||0))>.01))boxes.push(b);}for(const l of this.lifts){const key=`${l.x},${l.z}`;if(!this.floor.has(key)||Math.abs((this.heights.get(key)||0)-l.base)>.01)boxes.push({x:l.x,z:l.z,half:.5,minY:l.height-.16,maxY:l.height,kind:'lift'});}}
    for(const key of this.floor){const [x,z]=key.split(',').map(Number),legacyY=this.heights.get(key)||0,bridge=this.bridges.findIndex(b=>b.x===x&&b.z===z&&(!this.blocks?.length||Math.abs((b.y||0)-legacyY)<.01));
     if(bridge>=0){const bounds=this.bridgeBounds(bridge);if(bounds)boxes.push(bounds);continue;}
     const lift=this.lifts.find(l=>l.x===x&&l.z===z&&(!this.blocks?.length||Math.abs(l.base-legacyY)<.01)),height=lift?lift.height:legacyY;
     boxes.push({x,z,half:.5,minY:lift?height-.16:-.72,maxY:height,kind:lift?'lift':conveyorCells.has(key)?'conveyor':'floor'});
    }
    for(const o of this.obstacles)boxes.push({...o,minY:o.minY??(o.half>.4?-.4:0),maxY:o.height??(o.half>.4?1.4:.56),kind:'wall'});
    for(const a of this.archers)if(a.state!=='dead'){const y=a.y??this.heightAt(a.x,a.z)??0;boxes.push({x:a.x,z:a.z,half:.25,minY:y,maxY:y+1.2,kind:'archer'});}
    return this._collisionCache=boxes;
   },
   debugBoxes(){return [...this.collisionBoxes(),...this.spikes.flatMap(s=>{const state=this.spikeState(s);return state.dangerous?this.spikeBoxes(s,state.extension):[];}),...this.portals.map(p=>({...p,half:.28,minY:p.y??this.heightAt(p.x,p.z)??0,maxY:(p.y??this.heightAt(p.x,p.z)??0)+.08,kind:'portal'}))];},
   featureSnapshot(){return {time:this.featureTime||0,bridges:this.bridges.map(b=>({progress:b.progress||0,velocity:b.velocity||0})),lifts:this.lifts.map(l=>({height:l.height,target:l.target,occupiedTime:l.occupiedTime||0,emptyTime:l.emptyTime||0})),combat:this.combatSnapshot()};},
   restoreFeatures(snapshot){this.featureTime=snapshot?.time||0;this.bridges.forEach((b,i)=>Object.assign(b,snapshot?.bridges?.[i]||{progress:0,velocity:0}));this.lifts.forEach((l,i)=>Object.assign(l,snapshot?.lifts?.[i]||{height:l.base||0,target:l.base||0,occupiedTime:0,emptyTime:0}));this.restoreCombat(snapshot?.combat);this._collisionCache=null;},
   resetFeatures(){this.restoreFeatures(null);},
   beforeFeatures(players,soft,dt){
    this.featureTime=(this.featureTime||0)+dt;
    this._collisionCache=null;
    this.refresh(players);
    for(let i=0;i<this.bridges.length;i++){
     const bridge=this.bridges[i],target=this.held.has(i)?1:0;
     // Exact critically damped spring: smooth starts and reversals at any frame rate.
     const error=(bridge.progress||0)-target,velocity=bridge.velocity||0,omega=10,c=velocity+omega*error,decay=Math.exp(-omega*dt);
     bridge.progress=Math.max(0,Math.min(1,target+(error+c*dt)*decay));bridge.velocity=(velocity-omega*c*dt)*decay;
     if(Math.abs(bridge.progress-target)<.001&&Math.abs(bridge.velocity)<.015){bridge.progress=target;bridge.velocity=0;}
    }
    players.forEach(p=>{p.portalCooldown=Math.max(0,(p.portalCooldown||0)-dt);p.portalFlash=Math.max(0,(p.portalFlash||0)-dt);p.portalBlocked=false;
     if(p.portalLock&&p.portalCooldown===0&&!this.portals.some(portal=>portal.color===p.portalLock&&near(p,portal,.78)&&Math.abs((p.y||0)-(portal.y??this.heightAt(portal.x,portal.z)??0))<.2))p.portalLock=null;
    });
    for(const lift of this.lifts){
     const riders=players.filter(p=>alive(p)&&near(p,lift,.36)&&Math.abs((p.y||0)-lift.height)<.18);
     if(riders.length){lift.emptyTime=0;lift.occupiedTime=(lift.occupiedTime||0)+dt;if(lift.occupiedTime>.16)lift.target=lift.top;}
     else{lift.occupiedTime=0;lift.emptyTime=(lift.emptyTime||0)+dt;if(lift.emptyTime>.75)lift.target=lift.base||0;}
     const previous=lift.height,distance=lift.target-lift.height;lift.height+=Math.sign(distance)*Math.min(Math.abs(distance),dt*.85);
     const delta=lift.height-previous;
     if(delta){const carried=new Set();const carry=p=>{if(carried.has(p))return;carried.add(p);soft.translate(p,0,delta,0);for(const other of players)if(soft.get(other).support===p)carry(other);};for(const p of riders)carry(p);}
    }
   },
   afterFeatures(players,soft){
    const events=[];
    players.forEach((p,i)=>{
     if(!alive(p)||p.kind==='crate')return;
     const spike=this.spikes.find(s=>{const state=this.spikeState(s);return state.dangerous&&this.spikeTouches(p,s,state.extension);});
     if(spike){p.state='dead';p.deaths=(p.deaths||0)+1;p.deathReason='spikes';p.respawnTimer=.7;p.vx=p.vy=p.vz=0;soft.get(p).velocities.forEach(v=>v.fill(0));events.push({type:'death',reason:'spikes',player:i});return;}
     const source=this.portals.find(portal=>portal.color!==p.portalLock&&near(p,portal,.28)&&Math.abs((p.y||0)-(portal.y??this.heightAt(portal.x,portal.z)??0))<.18);
     if(!source)return;
     if(this.portalInactive(source,players,p)){p.portalBlocked=true;return;}
     const destination=this.portalDestination(source);
     const fromHeight=source.y??this.heightAt(source.x,source.z)??0,toHeight=destination.y??this.heightAt(destination.x,destination.z)??0;
     soft.translate(p,destination.x-p.x,toHeight-fromHeight,destination.z-p.z,true);
     p.portalLock=source.color;p.portalCooldown=.65;p.portalFlash=.55;
     events.push({type:'portal',player:i,color:source.color,source:[source.x,fromHeight,source.z],destination:[destination.x,toHeight,destination.z]});
    });
    this._collisionCache=null;return events;
   },
   respawnPosition(p,bodies){
    const candidates=[{...p.spawn}];
    for(let radius=1;radius<=2;radius++)for(let x=-radius;x<=radius;x++)for(let z=-radius;z<=radius;z++)if(Math.max(Math.abs(x),Math.abs(z))===radius)candidates.push({x:p.spawn.x+x,z:p.spawn.z+z});
    for(const c of candidates){const height=this.heightAt(c.x,c.z,this.blocks?.length?(p.spawn.y??0)+.2:Infinity,p);if(height===null)continue;c.y=height;
     if(this.spikes.some(s=>this.spikeTouches({...p,...c},s))||this.portals.some(portal=>near(c,portal,.5)))continue;
     if(this.collisionBoxes().some(o=>this.blockSolid(p,o)&&(o.kind==='wall'||o.kind==='archer'||o.kind==='block')&&height+.03<o.maxY&&height+.84>o.minY&&near(c,o,.36+o.half+.015)))continue;
     if(bodies.some(b=>b!==p&&alive(b)&&near(c,b,.74)&&Math.abs((b.y||0)-height)<.75))continue;
     return c;
    }
   }
  });
 }
 const api={install,spikeFrame,spikeBoxes};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JellyLevelFeatures=api;
})(globalThis);
