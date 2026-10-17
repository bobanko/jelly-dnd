// Cardinal archery, swept projectile collisions and automatically equipped shields.
(function(root){
 'use strict';
 const alive=p=>!p.state||p.state==='alive';
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
  combatSnapshot(){return {archers:this.archers.map(a=>({cooldown:a.cooldown??a.firstShot??1.6,shotFlash:a.shotFlash||0})),arrows:this.arrows.map(a=>({...a})),pickups:this.pickups.map(p=>({holder:p.holder??null}))};},
  restoreCombat(state){
   this.archers.forEach((a,i)=>Object.assign(a,state?.archers?.[i]||{cooldown:a.firstShot??1.6,shotFlash:0}));
   this.arrows=(state?.arrows||[]).map(a=>({...a}));
   this.pickups.forEach((p,i)=>{p.holder=state?.pickups?.[i]?.holder??null;});
  },
  beforeCombat(bodies,inputs,dt){
   bodies.forEach((p,i)=>{
    if(p.kind==='crate')return;
    p.facingX??=0;p.facingZ??=1;p.shield??=null;
    if(!alive(p)){
     for(const item of this.pickups)if(item.holder===i)item.holder=null;
     p.shield=null;return;
    }
    const input=inputs[i];
    if(input&&Math.hypot(input.x,input.z)>.01){
     // Keep the current face on equal diagonals when it remains in the input.
     const old=facing(p),tie=Math.abs(input.x)===Math.abs(input.z);
     const f=tie&&(old.x*input.x+old.z*input.z)>0?old:cardinal(input.x,input.z);
     p.facingX=f.x;p.facingZ=f.z;
    }
   });
   this.archers.forEach(a=>{a.cooldown??=a.firstShot??1.6;a.cooldown-=dt;a.shotFlash=Math.max(0,(a.shotFlash||0)-dt);});
  },
  afterCombat(bodies,soft,dt){
   const events=[];
   for(const item of this.pickups){
    if(item.holder!==null&&item.holder!==undefined){
     const owner=bodies[item.holder];
     if(!owner||!alive(owner)){if(owner)owner.shield=null;item.holder=null;}
     else continue;
    }
    const height=item.y??this.heightAt(item.x,item.z)??0;
    const i=bodies.findIndex(p=>alive(p)&&p.kind!=='crate'&&!p.shield&&Math.abs((p.y||0)-height)<.18&&Math.hypot(p.x-item.x,p.z-item.z)<.55);
    if(i>=0){bodies[i].shield=item.id;item.holder=i;events.push({type:'pickup',item:'shield',player:i});}
   }
   for(const a of this.archers)if(a.cooldown<=0){
    const dir=cardinal(a.dx,a.dz),height=a.y??this.heightAt(a.x,a.z)??0;
    if(this.arrows.length<12)this.arrows.push({x:a.x+dir.x*.48,y:height+.5,z:a.z+dir.z*.48,dx:dir.x,dz:dir.z,speed:a.speed??5.5,life:4});
    a.cooldown+=a.interval??2.4;a.shotFlash=.2;
   }
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
     if(target.p.shield&&alive(target.p)&&arrow.dx*f.x+arrow.dz*f.z<-.9)consider(shieldBox(target.p,soft),target,true);
     consider(target.box,target);
    }
    if(!hit){[arrow.x,arrow.y,arrow.z]=to;keep.push(arrow);continue;}
    const position=from.map((v,k)=>v+(to[k]-v)*nearest),target=hit.target;
    if(hit.shield){events.push({type:'arrowBlock',player:target.i,position});continue;}
    if(!target||target.p.kind==='crate'){events.push({type:'arrowImpact',position});continue;}
    const p=target.p;p.state='dead';p.deaths=(p.deaths||0)+1;p.deathReason='arrow';p.respawnTimer=.7;p.vx=p.vy=p.vz=0;
    if(soft)soft.get(p).velocities.forEach(v=>v.fill(0));
    for(const item of this.pickups)if(item.holder===target.i)item.holder=null;
    p.shield=null;events.push({type:'death',reason:'arrow',player:target.i});
   }
   this.arrows=keep;return events;
  }
 });}
 const api={install,facing,segmentBox};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JellyCombat=api;
})(globalThis);
