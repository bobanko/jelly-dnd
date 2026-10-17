// Fixed-step movement, collisions, gravity and independent fall/death/respawn lifecycles.
// Rendering is independent: jelly deformation never changes the collision shape.
(function(root){
 const HALF=.36, SIZE=HALF*2, STEP=1/120, SPEED=2.6, GRAVITY=15, DEATH_HEIGHT=-4, RESPAWN_DELAY=.55;
 const alive=p=>!p.state||p.state==='alive';
 const overlaps=(a,b,half=SIZE)=>Math.abs(a.x-b.x)<half&&Math.abs(a.z-b.z)<half;
 class World{
  constructor(floor,bridges,plates,obstacles=[]){this.floor=floor;this.bridges=bridges;this.plates=plates;this.obstacles=obstacles;this.held=new Set();this.heights=new Map();this.lifts=[];this.spikes=[];this.portals=[];this.archers=[];this.arrows=[];this.pickups=[];}
  active(i,bodies){return bodies.some(p=>alive(p)&&Math.abs(p.y||0)<.15&&Math.abs(p.x-this.plates[i].x)<.42&&Math.abs(p.z-this.plates[i].z)<.42);}
  refresh(bodies){for(let i=0;i<this.bridges.length;i++){const b=this.bridges[i];if(this.active(b.plate,bodies))this.held.add(i);else if(!bodies.some(p=>alive(p)&&overlaps(p,b,.5+HALF+.001)))this.held.delete(i);}}
  solid(x,z){if(!this.floor.has(`${x},${z}`))return true;const i=this.bridges.findIndex(b=>b.x===x&&b.z===z);return i>=0&&!this.held.has(i);}
  supported(p){return !this.solid(Math.floor(p.x+.5),Math.floor(p.z+.5));}
  obstaclesNear(){return this.obstacles;}
  respawnPosition(p,bodies){
   const candidates=[{...p.spawn}];
   for(let radius=1;radius<=2;radius++)for(let x=-radius;x<=radius;x++)for(let z=-radius;z<=radius;z++)
    if(Math.max(Math.abs(x),Math.abs(z))===radius)candidates.push({x:p.spawn.x+x,z:p.spawn.z+z});
   return candidates.find(c=>this.supported(c)&&!this.obstacles.some(o=>overlaps(c,o,HALF+o.half+.001))&&!bodies.some(b=>b!==p&&alive(b)&&overlaps(c,b,SIZE+.02)));
  }
  moveAxis(p,axis,amount){
   if(!amount)return 0;const other=axis==='x'?'z':'x',before=p[axis];let allowed=amount;
   for(const b of this.obstaclesNear(p,axis,amount)){
    const extent=HALF+b.half;
    if(Math.abs(p[other]-b[other])>=extent-1e-8)continue;
    if(amount>0&&p[axis]<=b[axis]-extent+1e-8)allowed=Math.min(allowed,Math.max(0,b[axis]-extent-p[axis]));
    if(amount<0&&p[axis]>=b[axis]+extent-1e-8)allowed=Math.max(allowed,Math.min(0,b[axis]+extent-p[axis]));
   }
   p[axis]+=allowed;return p[axis]-before;
  }
  step(bodies,inputs,dt=STEP){
   this.beforeCombat(bodies,inputs,dt);
   if(this.soft){this.beforeFeatures(bodies,this.soft,dt);const events=this.soft.step(this,bodies,inputs,dt);return [...events,...this.afterFeatures(bodies,this.soft),...this.afterCombat(bodies,this.soft,dt)];}
   const events=[];
   bodies.forEach(p=>{p.spawn??={x:p.x,z:p.z};p.state??='alive';p.y??=0;p.vy??=0;p.deaths??=0;p.respawnFlash=Math.max(0,(p.respawnFlash||0)-dt);});
   this.refresh(bodies);
   bodies.forEach((p,i)=>{
    if(p.state==='dead'){
     p.respawnTimer-=dt;
     const spawn=p.respawnTimer<=0&&this.respawnPosition(p,bodies);
     if(spawn){Object.assign(p,spawn,{y:0,vy:0,vx:0,vz:0,state:'alive',impact:0,squish:.3,squishVelocity:0,respawnFlash:.65});events.push({type:'respawn',player:i});}
     return;
    }
    if(p.state==='falling'){
     p.vy-=GRAVITY*dt;p.y+=p.vy*dt;p.x+=p.vx*dt;p.z+=p.vz*dt;if(!p.launchTimer){p.vx*=Math.exp(-dt*.8);p.vz*=Math.exp(-dt*.8);}
     if(p.launchTimer&&this.heightAt(p.x,p.z)!==null&&p.vy<0&&p.y<=this.heightAt(p.x,p.z)){p.y=this.heightAt(p.x,p.z);p.vy=0;p.state='alive';p.launchTimer=0;events.push({type:'land',player:i});return;}
     if(p.y<DEATH_HEIGHT){p.state='dead';p.deaths++;p.respawnTimer=RESPAWN_DELAY;p.vx=p.vz=0;events.push({type:'death',player:i});}
     return;
    }
    const input=inputs[i]||{x:0,z:0},length=Math.hypot(input.x,input.z),gain=1-Math.exp(-(length?13:18)*dt);
    p.vx+=(length?input.x/length*SPEED-p.vx:-p.vx)*gain;
    p.vz+=(length?input.z/length*SPEED-p.vz:-p.vz)*gain;
    for(const axis of ['x','z']){const v='v'+axis,wanted=p[v]*dt,actual=this.moveAxis(p,axis,wanted);if(Math.abs(actual-wanted)>1e-7){p.impact=Math.max(p.impact||0,Math.min(1,Math.abs(p[v])*.3));p[v]=0;}}
   });
   // Equal masses exchange momentum. Resolve against the map as well as each other,
   // redistributing separation when the receiving cube is pinned against a wall.
   for(let iteration=0;iteration<6;iteration++)for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
    const a=bodies[i],b=bodies[j],dx=b.x-a.x,dz=b.z-a.z,px=SIZE-Math.abs(dx),pz=SIZE-Math.abs(dz);
    if(!alive(a)||!alive(b))continue;
    if(px<=1e-8||pz<=1e-8)continue;
    const axis=px<pz?'x':'z',n=(b[axis]-a[axis])>=0?1:-1,penetration=(axis==='x'?px:pz)+1e-8;
    const da=this.moveAxis(a,axis,-n*penetration*.5),db=this.moveAxis(b,axis,n*(penetration-Math.abs(da)));
    const remainder=penetration-Math.abs(da)-Math.abs(db);if(remainder>1e-8)this.moveAxis(a,axis,-n*remainder);
    const v='v'+axis,closing=(a[v]-b[v])*n;
    if(closing>0){const impulse=closing*.5;a[v]-=impulse*n;b[v]+=impulse*n;a.impact=b.impact=Math.max(a.impact||0,b.impact||0,Math.min(.8,closing*.25));}
   }
   bodies.forEach((p,i)=>{if(alive(p)&&!this.supported(p)){p.state='falling';p.vy=0;events.push({type:'fall',player:i});}});
   bodies.forEach(p=>{
    p.impact=(p.impact||0)*Math.exp(-dt*8);
    // A damped visual spring responds to speed and contact without destabilizing collisions.
    const target=Math.min(.35,Math.hypot(p.vx,p.vz)*.055+p.impact*.2);
    p.squish=p.squish||0;p.squishVelocity=p.squishVelocity||0;
    p.squishVelocity+=(95*(target-p.squish)-11*p.squishVelocity)*dt;
    p.squish+=p.squishVelocity*dt;
    if(Math.hypot(p.vx,p.vz)<.001)p.vx=p.vz=0;
   });
   this.refresh(bodies);
   return [...events,...this.afterCombat(bodies,null,dt)];
  }
 }
 if(typeof module!=='undefined'&&module.exports)require('./level-features.js').install(World);else root.JellyLevelFeatures.install(World);
 if(typeof module!=='undefined'&&module.exports)require('./combat.js').install(World);else root.JellyCombat.install(World);
 const api={World,HALF,SIZE,STEP,SPEED,GRAVITY,DEATH_HEIGHT,RESPAWN_DELAY,alive};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JellyPhysics=api;
})(globalThis);
