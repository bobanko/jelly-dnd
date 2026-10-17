// Height-aware level surfaces and triggers, shared by physics, rendering and debug overlays.
(function(root){
 'use strict';
 const alive=p=>!p.state||p.state==='alive';
 const near=(p,q,r)=>Math.abs(p.x-q.x)<r&&Math.abs(p.z-q.z)<r;
 function install(World){
  Object.assign(World.prototype,{
   goalActive(goal,player){
    return !!goal&&!!player&&alive(player)&&player.kind!=='crate'&&Math.abs((player.y||0)-(goal.y??this.heightAt(goal.x,goal.z)??0))<.15&&Math.hypot(player.x-goal.x,player.z-goal.z)<.32;
   },
   goalCharge(goal,player){
    if(!goal||!player||!alive(player)||player.kind==='crate'||Math.abs((player.y||0)-(goal.y??this.heightAt(goal.x,goal.z)??0))>=.15)return 0;
    const t=Math.max(0,Math.min(1,(Math.hypot(player.x-goal.x,player.z-goal.z)-.32)/.4));
    return 1-t*t*(3-2*t);
   },
   portalInactive(portal,players){
    const height=portal.y??this.heightAt(portal.x,portal.z)??0;
    return players.some(p=>alive(p)&&p.kind!=='crate'&&p.portalLock===portal.color&&Math.abs((p.y||0)-height)<.2&&near(p,portal,.78));
   },
   portalCharge(portal,players){
    if(this.portalInactive(portal,players))return 0;
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
    // A one-second warning beat shows harmless tips before the full rise.
    const cycle=5.8,phase=(((this.featureTime||0)+(spike.offset||0))%cycle+cycle)%cycle,peek=.3;
    const smooth=t=>t*t*(3-2*t);
    let extension=1,stage='raised';
    if(phase>=2&&phase<2.3){extension=1-smooth((phase-2)/.3);stage='retracting';}
    else if(phase>=2.3&&phase<4.5){extension=0;stage='hidden';}
    else if(phase>=4.5&&phase<5.5){extension=peek*smooth(Math.min(1,(phase-4.5)/.15));stage='peeking';}
    else if(phase>=5.5){extension=peek+(1-peek)*smooth((phase-5.5)/.3);stage='rising';}
    return {extension,stage,dangerous:extension>.35,warning:stage==='peeking'||(stage==='rising'&&extension<=.35)};
   },
   bridgeBounds(i){
    const bridge=this.bridges[i],progress=bridge.progress??(this.soft?0:this.held.has(i)?1:0);
    if(progress<=0)return null;
    // Slide out of the northern bank, revealing only the supported part of the gap.
    return {x:bridge.x,z:bridge.z-.5+progress*.5,half:.5,halfX:.5,halfZ:progress*.5,minY:-.26,maxY:0,kind:'bridge'};
   },
   heightAt(x,z){
    const tileX=Math.floor(x+.5),tileZ=Math.floor(z+.5),bridge=this.bridges.findIndex(b=>b.x===tileX&&b.z===tileZ);
    if(bridge>=0){const bounds=this.bridgeBounds(bridge);return bounds&&Math.abs(x-bounds.x)<=bounds.halfX&&Math.abs(z-bounds.z)<=bounds.halfZ+1e-8?0:null;}
    x=tileX;z=tileZ;if(this.solid(x,z))return null;
    const lift=this.lifts.find(l=>l.x===x&&l.z===z);return lift?lift.height:(this.heights.get(`${x},${z}`)||0);
   },
   supported(p){const height=this.heightAt(p.x,p.z);return height!==null&&(p.y||0)>=height-.2;},
   active(i,bodies){const plate=this.plates[i],height=plate.y??this.heightAt(plate.x,plate.z)??0;return bodies.some(p=>alive(p)&&Math.abs((p.y||0)-height)<.15&&near(p,plate,.42));},
   collisionBoxes(){
    if(this._collisionCache)return this._collisionCache;
    const boxes=[];
    for(const key of this.floor){const [x,z]=key.split(',').map(Number),bridge=this.bridges.findIndex(b=>b.x===x&&b.z===z);
     if(bridge>=0){const bounds=this.bridgeBounds(bridge);if(bounds)boxes.push(bounds);continue;}
     const height=this.heightAt(x,z);if(height===null)continue;
     const lift=this.lifts.find(l=>l.x===x&&l.z===z);
     boxes.push({x,z,half:.5,minY:lift?height-.16:-.72,maxY:height,kind:lift?'lift':'floor'});
    }
    for(const o of this.obstacles)boxes.push({...o,minY:o.minY??(o.half>.4?-.4:0),maxY:o.height??(o.half>.4?1.4:.56),kind:'wall'});
    return this._collisionCache=boxes;
   },
   debugBoxes(){return [...this.collisionBoxes(),...this.spikes.filter(s=>this.spikeState(s).dangerous).map(s=>({...s,half:.34,minY:s.y??this.heightAt(s.x,s.z)??0,maxY:(s.y??this.heightAt(s.x,s.z)??0)+.03+.18*this.spikeState(s).extension,kind:'spikes'})),...this.portals.map(p=>({...p,half:.28,minY:p.y??this.heightAt(p.x,p.z)??0,maxY:(p.y??this.heightAt(p.x,p.z)??0)+.08,kind:'portal'}))];},
   featureSnapshot(){return {time:this.featureTime||0,bridges:this.bridges.map(b=>({progress:b.progress||0,velocity:b.velocity||0})),lifts:this.lifts.map(l=>({height:l.height,target:l.target,occupiedTime:l.occupiedTime||0,emptyTime:l.emptyTime||0}))};},
   restoreFeatures(snapshot){this.featureTime=snapshot?.time||0;this.bridges.forEach((b,i)=>Object.assign(b,snapshot?.bridges?.[i]||{progress:0,velocity:0}));this.lifts.forEach((l,i)=>Object.assign(l,snapshot?.lifts?.[i]||{height:l.base||0,target:l.base||0,occupiedTime:0,emptyTime:0}));this._collisionCache=null;},
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
     if(p.portalLock&&p.portalCooldown===0&&!this.portals.some(portal=>portal.color===p.portalLock&&near(p,portal,.78)))p.portalLock=null;
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
     const spike=this.spikes.find(s=>this.spikeState(s).dangerous&&near(p,s,.65)&&Math.abs((p.y||0)-(s.y??this.heightAt(s.x,s.z)??0))<.2);
     if(spike){p.state='dead';p.deaths=(p.deaths||0)+1;p.deathReason='spikes';p.respawnTimer=.7;p.vx=p.vy=p.vz=0;soft.get(p).velocities.forEach(v=>v.fill(0));events.push({type:'death',reason:'spikes',player:i});return;}
     const source=this.portals.find(portal=>portal.color!==p.portalLock&&near(p,portal,.28)&&Math.abs((p.y||0)-(portal.y??this.heightAt(portal.x,portal.z)??0))<.18);
     if(!source)return;
     if(this.portalInactive(source,players)){p.portalBlocked=true;return;}
     const destination=this.portals.find(portal=>portal!==source&&portal.color===source.color);if(!destination)return;
     const fromHeight=source.y??this.heightAt(source.x,source.z)??0,toHeight=destination.y??this.heightAt(destination.x,destination.z)??0;
     if(players.some(other=>other!==p&&alive(other)&&near(other,destination,.8)&&Math.abs((other.y||0)-toHeight)<.7)){p.portalBlocked=true;return;}
     soft.translate(p,destination.x-p.x,toHeight-fromHeight,destination.z-p.z,true);
     p.portalLock=source.color;p.portalCooldown=.65;p.portalFlash=.55;
     events.push({type:'portal',player:i,color:source.color,source:[source.x,fromHeight,source.z],destination:[destination.x,toHeight,destination.z]});
    });
    this._collisionCache=null;return events;
   },
   respawnPosition(p,bodies){
    const candidates=[{...p.spawn}];
    for(let radius=1;radius<=2;radius++)for(let x=-radius;x<=radius;x++)for(let z=-radius;z<=radius;z++)if(Math.max(Math.abs(x),Math.abs(z))===radius)candidates.push({x:p.spawn.x+x,z:p.spawn.z+z});
    for(const c of candidates){const height=this.heightAt(c.x,c.z);if(height===null)continue;c.y=height;
     if(this.spikes.some(s=>near(c,s,.7))||this.portals.some(portal=>near(c,portal,.5)))continue;
     if(this.collisionBoxes().some(o=>o.kind==='wall'&&height<o.maxY&&near(c,o,.36+o.half+.015)))continue;
     if(bodies.some(b=>b!==p&&alive(b)&&near(c,b,.74)&&Math.abs((b.y||0)-height)<.75))continue;
     return c;
    }
   }
  });
 }
 const api={install};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JellyLevelFeatures=api;
})(globalThis);
