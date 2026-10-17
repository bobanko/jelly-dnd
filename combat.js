// Cardinal archery, durable shields, ballistic bashes and automatic sword attacks.
(function(root){
 'use strict';
 const alive=p=>!p.state||p.state==='alive';
 const carrying=p=>alive(p)||(p.state==='falling'&&(p.launchTimer||0)>0);
 function cardinal(x=0,z=1){return Math.abs(x)>Math.abs(z)?{x:Math.sign(x),z:0}:{x:0,z:Math.sign(z)||1};}
 function facing(p){return cardinal(p.facingX||0,p.facingZ??1);}
 function segmentBox(a,b,box){
  let enter=0,exit=1;
  for(let k=0;k<3;k++){
   const d=b[k]-a[k],lo=box.min[k]-.025,hi=box.max[k]+.025;
   if(Math.abs(d)<1e-10){if(a[k]<lo||a[k]>hi)return null;continue;}
   let t0=(lo-a[k])/d,t1=(hi-a[k])/d;if(t0>t1)[t0,t1]=[t1,t0];
   enter=Math.max(enter,t0);exit=Math.min(exit,t1);if(enter>exit)return null;
  }
  return enter;
 }
 function bodyBox(p,soft){
  const positions=soft?.get(p).positions;
  if(positions){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const q of positions)for(let k=0;k<3;k++){min[k]=Math.min(min[k],q[k]);max[k]=Math.max(max[k],q[k]);}return {min,max};}
  return {min:[p.x-.36,p.y||0,p.z-.36],max:[p.x+.36,(p.y||0)+.84,p.z+.36]};
 }
 function shieldBox(p,soft){
  const f=facing(p),core=soft?.get(p).core||[p.x,(p.y||0)+.42,p.z],center=[core[0]+f.x*.62,core[1],core[2]+f.z*.62];
  return {min:[center[0]-(f.x?.065:.27),center[1]-.34,center[2]-(f.z?.065:.27)],max:[center[0]+(f.x?.065:.27),center[1]+.34,center[2]+(f.z?.065:.27)]};
 }
 function install(World){Object.assign(World.prototype,{
  combatSnapshot(){return {archers:this.archers.map(a=>({cooldown:a.cooldown??a.firstShot??1.6,shotFlash:a.shotFlash||0,state:a.state||'alive',respawnTimer:a.respawnTimer||0})),arrows:this.arrows.map(a=>({...a})),pickups:this.pickups.map(p=>({holder:p.holder??null,durability:p.durability??3,destroyed:!!p.destroyed}))};},
  restoreCombat(state){
   this.droneBeams=[];
   this.archers.forEach((a,i)=>Object.assign(a,state?.archers?.[i]||{cooldown:a.firstShot??1.6,shotFlash:0,state:'alive',respawnTimer:0}));
   this.arrows=(state?.arrows||[]).map(a=>({...a}));
   this.pickups.forEach((p,i)=>Object.assign(p,state?.pickups?.[i]||{holder:null,durability:3,destroyed:false}));
  },
  droneOrigin(d){return [d.x,(d.y??this.heightAt(d.x,d.z)??0)+(d.hover??1.8),d.z];},
  traceDrones(bodies,soft){
   if(!this.drones?.length)return [];
   const targets=bodies.flatMap((p,i)=>p.state==='dead'?[]:[{p,i,box:bodyBox(p,soft)}]);
   const bounds=this.collisionBoxes().map(o=>({min:[o.x-(o.halfX??o.half),o.minY,o.z-(o.halfZ??o.half)],max:[o.x+(o.halfX??o.half),o.maxY,o.z+(o.halfZ??o.half)]})),beams=[];
   for(const [index,d] of this.drones.entries()){
    const from=this.droneOrigin(d),eligible=targets.filter(t=>t.p.kind!=='crate'&&(d.target===undefined||d.target===-1||(t.p.slot??t.i)===d.target));
    eligible.sort((a,b)=>Math.hypot(a.p.x-from[0],(a.p.y||0)+.42-from[1],a.p.z-from[2])-Math.hypot(b.p.x-from[0],(b.p.y||0)+.42-from[1],b.p.z-from[2]));
    const target=eligible[0];if(!target)continue;
    const aim=[target.p.x,(target.p.y||0)+.42,target.p.z],delta=aim.map((v,k)=>v-from[k]),length=Math.hypot(...delta);if(length<.001)continue;
    const end=from.map((v,k)=>v+delta[k]/length*Math.min(32,length+.5));let nearest=1,hit=-1;
    for(const box of bounds){const t=segmentBox(from,end,box);if(t!==null&&t<nearest){nearest=t;hit=-1;}}
    for(const t of targets){const distance=segmentBox(from,end,t.box);if(distance!==null&&distance<nearest){nearest=distance;hit=t.i;}}
    beams.push({drone:index,from,to:from.map((v,k)=>v+(end[k]-v)*nearest),color:d.color??3,hit,target:target.p.slot??target.i});
   }
   return beams;
  },
  afterDrones(bodies,soft){
   const events=[];this.droneBeams=this.traceDrones(bodies,soft);
   for(const beam of this.droneBeams){
    const p=bodies[beam.hit];if(!p||p.kind==='crate'||p.state==='dead'||p.slot===beam.color)continue;
    Object.assign(p,{state:'dead',deaths:(p.deaths||0)+1,deathReason:'beam',respawnTimer:.7,vx:0,vy:0,vz:0,shield:null,shieldHP:0,sword:null,launchTimer:0});
    if(soft)soft.get(p).velocities.forEach(v=>v.fill(0));
    for(const item of this.pickups)if(item.holder===beam.hit)item.holder=null;
    events.push({type:'death',reason:'beam',player:beam.hit,beam});
   }
   return events;
  },
  beforeCombat(bodies,inputs,dt){
   bodies.forEach((p,i)=>{
    if(p.kind==='crate')return;
    p.facingX??=0;p.facingZ??=1;p.shield??=null;p.sword??=null;
    p.launchTimer=Math.max(0,(p.launchTimer||0)-dt);p.bashCooldown=Math.max(0,(p.bashCooldown||0)-dt);p.attackTime=Math.max(0,(p.attackTime||0)-dt);p.attackCooldown=Math.max(0,(p.attackCooldown||0)-dt);
    if(!carrying(p)){
     for(const item of this.pickups)if(item.holder===i)item.holder=null;
     p.shield=null;p.shieldHP=0;p.sword=null;return;
    }
    const input=inputs[i];
    if(!p.launchTimer&&input&&Math.hypot(input.x,input.z)>.01){
     // Keep the current face on equal diagonals when it remains in the input.
     const old=facing(p),tie=Math.abs(input.x)===Math.abs(input.z);
     const f=tie&&(old.x*input.x+old.z*input.z)>0?old:cardinal(input.x,input.z);
     p.facingX=f.x;p.facingZ=f.z;
    }
   });
   this.archers.forEach(a=>{
    if(a.state==='dead'){
     a.respawnTimer=Math.max(0,a.respawnTimer-dt);
     if(a.respawnTimer<=1e-8){a.state='alive';a.respawnTimer=0;a.cooldown=a.firstShot??1.6;this._collisionCache=null;}
     return;
    }
    a.cooldown??=a.firstShot??1.6;a.cooldown-=dt;a.shotFlash=Math.max(0,(a.shotFlash||0)-dt);
   });
  },
  afterCombat(bodies,soft,dt){
   const events=[];
   for(const item of this.pickups){
    if(item.destroyed)continue;
    if(item.holder!==null&&item.holder!==undefined){
     const owner=bodies[item.holder];
     if(!owner||!carrying(owner)){if(owner){owner.shield=null;owner.shieldHP=0;owner.sword=null;}item.holder=null;}
     else continue;
    }
    const height=item.y??this.heightAt(item.x,item.z)??0;
    const i=bodies.findIndex(p=>alive(p)&&p.kind!=='crate'&&!p.shield&&!p.sword&&Math.abs((p.y||0)-height)<.18&&Math.hypot(p.x-item.x,p.z-item.z)<.55);
    if(i>=0){const kind=item.kind==='sword'?'sword':'shield';bodies[i][kind]=item.id;if(kind==='shield')bodies[i].shieldHP=item.durability??3;item.holder=i;events.push({type:'pickup',item:kind,player:i});}
   }
   bodies.forEach((p,i)=>{
    if(!alive(p)||p.kind==='crate'||p.launchTimer)return;
    const f=facing(p);
    if(p.shield&&!(p.bashCooldown>0)&&((p.vx||0)*f.x+(p.vz||0)*f.z)>.3){
     const victim=bodies.find(q=>q!==p&&alive(q)&&q.kind!=='crate'&&!(q.launchTimer>0)&&Math.abs((p.y||0)-(q.y||0))<.3&&
      (q.x-p.x)*f.x+(q.z-p.z)*f.z>.35&&(q.x-p.x)*f.x+(q.z-p.z)*f.z<1.08&&Math.abs((q.x-p.x)*f.z-(q.z-p.z)*f.x)<.47);
     if(victim&&this.combatLineClear([p.x,(p.y||0)+.42,p.z],[victim.x,(victim.y||0)+.42,victim.z])){
      const speed=2/.9;Object.assign(victim,{state:'falling',launchTimer:1.25,vx:f.x*speed,vy:6.75,vz:f.z*speed});
      if(soft){const b=soft.get(victim);b.sleeping=false;b.calm=0;b.support=null;b.carryVelocity=[0,0,0];b.velocities.forEach(v=>{v[0]=victim.vx;v[1]=victim.vy;v[2]=victim.vz;});}
      p.bashCooldown=.8;events.push({type:'shieldBash',player:i,target:bodies.indexOf(victim),position:[victim.x,(victim.y||0)+.42,victim.z]});
     }
    }
    if(p.sword&&!(p.attackCooldown>0)){
     const index=this.archers.findIndex(a=>a.state!=='dead'&&Math.abs((p.y||0)-(a.y??this.heightAt(a.x,a.z)??0))<.3&&
      (a.x-p.x)*f.x+(a.z-p.z)*f.z>.25&&(a.x-p.x)*f.x+(a.z-p.z)*f.z<1.16&&Math.abs((a.x-p.x)*f.z-(a.z-p.z)*f.x)<.42);
     if(index>=0){const a=this.archers[index],y=a.y??this.heightAt(a.x,a.z)??0;
      if(this.combatLineClear([p.x,(p.y||0)+.6,p.z],[a.x,y+.6,a.z],index)){
       a.state='dead';a.respawnTimer=5;a.shotFlash=0;p.attackCooldown=.65;p.attackTime=.32;this._collisionCache=null;
       events.push({type:'archerDeath',archer:index,player:i,position:[a.x,y,a.z],direction:cardinal(a.dx,a.dz)});
      }
     }
    }
   });
   for(const a of this.archers)if(a.state!=='dead'&&a.cooldown<=0){
    const dir=cardinal(a.dx,a.dz),height=a.y??this.heightAt(a.x,a.z)??0;
    if(this.arrows.length<12){this.arrows.push({x:a.x+dir.x*.48,y:height+.5,z:a.z+dir.z*.48,dx:dir.x,dz:dir.z,speed:a.speed??5.5,life:4});events.push({type:'archerShot',position:[a.x,height+.5,a.z]});}
    a.cooldown+=a.interval??2.4;a.shotFlash=.2;
   }
   events.push(...this.afterDrones(bodies,soft));
   if(!this.arrows.length)return events;
   const bounds=this.collisionBoxes().map(o=>({min:[o.x-(o.halfX??o.half),o.minY,o.z-(o.halfZ??o.half)],max:[o.x+(o.halfX??o.half),o.maxY,o.z+(o.halfZ??o.half)]}));
   const targets=bodies.map((p,i)=>p.state!=='dead'?{p,i,box:bodyBox(p,soft)}:null).filter(Boolean);
   const keep=[];
   for(const arrow of this.arrows){
    arrow.life-=dt;if(arrow.life<=0)continue;
    const from=[arrow.x,arrow.y,arrow.z],to=[arrow.x+arrow.dx*arrow.speed*dt,arrow.y,arrow.z+arrow.dz*arrow.speed*dt];
    let hit=null,nearest=Infinity;
    const consider=(box,target,shield=false)=>{const t=segmentBox(from,to,box);if(t!==null&&t<nearest){nearest=t;hit={target,shield};}};
    bounds.forEach(box=>consider(box,null));
    for(const target of targets){
     if(target.p.state==='dead')continue;
     const f=facing(target.p);
     if(target.p.shield&&carrying(target.p)&&arrow.dx*f.x+arrow.dz*f.z<-.9)consider(shieldBox(target.p,soft),target,true);
     consider(target.box,target);
    }
    if(!hit){[arrow.x,arrow.y,arrow.z]=to;keep.push(arrow);continue;}
    const position=from.map((v,k)=>v+(to[k]-v)*nearest),target=hit.target;
    if(hit.shield){
     const p=target.p,item=this.pickups.find(item=>item.id===p.shield);p.shieldHP=Math.max(0,(p.shieldHP??item?.durability??3)-1);
     if(item)item.durability=p.shieldHP;
     events.push({type:'arrowBlock',player:target.i,position,durability:p.shieldHP});
     if(p.shieldHP===0){p.shield=null;if(item){item.destroyed=true;item.holder=null;}events.push({type:'shieldBreak',player:target.i,position});}
     continue;
    }
    if(!target||target.p.kind==='crate'){events.push({type:'arrowImpact',position});continue;}
    const p=target.p;p.state='dead';p.deaths=(p.deaths||0)+1;p.deathReason='arrow';p.respawnTimer=.7;p.vx=p.vy=p.vz=0;
    if(soft)soft.get(p).velocities.forEach(v=>v.fill(0));
    for(const item of this.pickups)if(item.holder===target.i)item.holder=null;
    p.shield=null;p.shieldHP=0;p.sword=null;p.launchTimer=0;events.push({type:'death',reason:'arrow',player:target.i});
   }
   this.arrows=keep;return events;
  },
  combatLineClear(from,to,ignoredArcher=-1){
   const ignored=this.archers[ignoredArcher];
   return !this.collisionBoxes().some(o=>{
    if(ignored&&o.kind==='archer'&&o.x===ignored.x&&o.z===ignored.z)return false;
    return segmentBox(from,to,{min:[o.x-(o.halfX??o.half),o.minY,o.z-(o.halfZ??o.half)],max:[o.x+(o.halfX??o.half),o.maxY,o.z+(o.halfZ??o.half)]})!==null;
   });
  }
 });}
 const api={install,facing,segmentBox};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JellyCombat=api;
})(globalThis);
