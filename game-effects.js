// Short-lived visual particles. They never become gameplay colliders.
(function(root){
 'use strict';
 const palettes=[[.12,.9,.16],[.025,.17,1.],[1.,.065,.035],[.65,.1,1.]];
 const runeColors=[[.45,1.,.08],[.035,.17,1.],[1.,.055,.025],[.68,.12,1.]],RUNE_LIMIT=32;
 class System{
  constructor({reducedMotion=false}={}){this.reducedMotion=reducedMotion;this.particles=[];this.rings=[];this.runes=[];this.bones=[];this.runeTimers=[];this.runeActive=[];this.seed=1;}
  random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
  clear(){this.particles.length=0;this.rings.length=0;this.runes.length=0;this.bones.length=0;this.runeTimers=[];this.runeActive=[];}
  skeletonBurst(event){
   this.bones=this.bones.filter(p=>p.archer!==event.archer);
   const parts=[[0,1.04,0,.14],[0,.43,0,.09],[-.14,.04,.09,.07],[.14,.04,.09,.07]];
   for(const side of [-1,1])for(const y of [.22,.55,.65,.75,.83])parts.push([side*(y<.4?.11:.13),y,0,.055]);
   for(let i=0;i<parts.length;i++){
    const [x,y,z,size]=parts[i],dir=event.direction||{x:0,z:1},home=[event.position[0]+dir.z*x+dir.x*z,event.position[1]+y,event.position[2]-dir.x*x+dir.z*z],a=this.random()*Math.PI*2;
    this.bones.push({kind:'bone',archer:event.archer,home,position:[...home],velocity:this.reducedMotion?[0,0,0]:[Math.cos(a)*(.25+this.random()*.45),.6+this.random()*1.3,Math.sin(a)*(.25+this.random()*.45)],size,phase:this.random()*6.28,color:[.72,.67,.47],age:0,life:5,skull:i===0});
   }
   this.bones=this.bones.slice(-56);
  }
  emitRune(goal,index,world){
   if(this.runes.length>=RUNE_LIMIT)return;
   const a=this.random()*Math.PI*2,edge=Math.floor(this.random()*4),offset=(this.random()-.5)*.6;
   const x=edge<2?(edge===0?-.4:.4):offset,z=edge>=2?(edge===2?-.4:.4):offset;
   this.runes.push({glyph:index,position:[goal.x+x,(goal.y??world.heightAt(goal.x,goal.z)??0)+.07,goal.z+z],velocity:[Math.cos(a)*.045,.72+this.random()*.2,Math.sin(a)*.045],color:runeColors[index],size:.105+this.random()*.035,phase:this.random()*Math.PI*2,age:0,life:1.8+this.random()*.4});
  }
  burst(event,players,soft){
   const random=()=>this.random();
   if(event.type==='death'){
    const player=players[event.player],body=soft.get(player),count=this.reducedMotion?6:22;
    const life=Math.min(this.reducedMotion ? .3 : .68,player.respawnTimer||.68);
    for(let i=0;i<count;i++){
     const q=body.positions[Math.floor(random()*body.positions.length)],a=random()*Math.PI*2,speed=.6+random()*1.8;
     this.particles.push({kind:'jelly',position:[...q],velocity:[Math.cos(a)*speed,1+random()*2.2,Math.sin(a)*speed],size:.075+random()*.075,phase:random()*6.28,color:palettes[player.slot??event.player],age:0,life});
    }
   }else if(event.type==='archerDeath'){
    this.skeletonBurst(event);
   }else if(event.type==='shieldBreak'){
    for(let i=0;i<(this.reducedMotion?4:14);i++){
     const a=random()*Math.PI*2;
     this.particles.push({kind:'wood',position:[...event.position],velocity:[Math.cos(a)*(1+random()),1+random()*2,Math.sin(a)*(1+random())],size:.035+random()*.025,phase:a,color:[.38,.22,.085],age:0,life:.7+random()*.3});
    }
   }else if(event.type==='arrowBlock'||event.type==='arrowImpact'){
    const color=event.type==='arrowBlock'?[1.,.72,.26]:[.48,.4,.29];
    for(let i=0;i<(this.reducedMotion?2:7);i++){
     const a=random()*Math.PI*2;
     this.particles.push({kind:'magic',position:[...event.position],velocity:[Math.cos(a)*.8,.3+random()*.7,Math.sin(a)*.8],size:.012+random()*.012,phase:a,color,age:0,life:.18+random()*.12});
    }
   }else if(event.type==='portal'){
    const color=event.color==='violet'?[.75,.12,1.]:[1.,.48,.05];
    for(const center of [event.source,event.destination]){
     this.rings.push({center:[...center],color,age:0,life:this.reducedMotion ? .25 : .65});
     for(let i=0;i<(this.reducedMotion?0:14);i++){
      const a=random()*Math.PI*2,r=.12+random()*.3;
      this.particles.push({kind:'magic',position:[center[0]+Math.cos(a)*r,center[1]+.06+random()*.5,center[2]+Math.sin(a)*r],velocity:[Math.cos(a)*.35, .5+random()*1.6,Math.sin(a)*.35],size:.018+random()*.026,phase:a,color,age:0,life:.4+random()*.22});
     }
    }
   }
   this.particles=this.particles.slice(-96);this.rings=this.rings.slice(-8);
  }
  step(dt,world,goals=[],players=[]){
   // Cap long background-tab gaps for stable presentation.
   dt=Math.min(Math.max(0,dt),.1);
   for(const p of this.particles){
    p.age+=dt;
    const previousY=p.position[1];
    if(p.kind==='jelly'||p.kind==='wood')p.velocity[1]-=7*dt;
    for(let k=0;k<3;k++)p.position[k]+=p.velocity[k]*dt;
    if(p.kind==='jelly'||p.kind==='wood'){
     const floor=world.heightAt(p.position[0],p.position[2],previousY);
     if(floor!==null&&previousY>=floor-.01&&p.position[1]<floor+p.size*.45&&p.velocity[1]<0){p.position[1]=floor+p.size*.45;p.velocity[1]*=-.22;p.velocity[0]*=.65;p.velocity[2]*=.65;}
    }
   }
   this.particles=this.particles.filter(p=>p.age<p.life);
   for(const ring of this.rings)ring.age+=dt;
   this.rings=this.rings.filter(r=>r.age<r.life);
   // These fragments follow the gameplay resurrection clock, including after undo.
   (world.archers||[]).forEach((a,i)=>{
    if(a.state==='dead'&&!this.bones.some(p=>p.archer===i))this.skeletonBurst({archer:i,position:[a.x,a.y??world.heightAt(a.x,a.z)??0,a.z],direction:{x:a.dx||0,z:a.dz??1}});
   });
   this.bones=this.bones.filter(p=>world.archers?.[p.archer]?.state==='dead');
   const boneWalls=this.bones.length?(world.collisionBoxes?.()||[]).filter(b=>b.kind==='wall'||b.maxY>.15):[];
   for(const p of this.bones){
    const timer=world.archers[p.archer].respawnTimer;p.age=5-timer;
    if(timer<.7&&!this.reducedMotion){
     p.gatherFrom??=[...p.position];const t=1-timer/.7,s=t*t*(3-2*t);p.position=p.gatherFrom.map((v,k)=>v+(p.home[k]-v)*s);continue;
    }
    const previous=p.position[1];p.velocity[1]-=7*dt;
    for(let k=0;k<3;k++)p.position[k]+=p.velocity[k]*dt;
    for(const b of boneWalls){
     const lo=[b.x-(b.halfX??b.half)-p.size*.5,b.minY-p.size*.5,b.z-(b.halfZ??b.half)-p.size*.5],hi=[b.x+(b.halfX??b.half)+p.size*.5,b.maxY+p.size*.5,b.z+(b.halfZ??b.half)+p.size*.5];
     if(p.position.some((v,k)=>v<lo[k]||v>hi[k]))continue;
     let axis=0,side=lo[0],distance=Infinity;
     for(let k=0;k<3;k++)for(const edge of [lo[k],hi[k]])if(Math.abs(p.position[k]-edge)<distance){distance=Math.abs(p.position[k]-edge);axis=k;side=edge;}
     p.position[axis]=side;p.velocity[axis]*=-.2;
    }
    const floor=world.heightAt(p.position[0],p.position[2],previous);
    if(floor!==null&&previous>=floor&&p.position[1]<floor+p.size*.5){p.position[1]=floor+p.size*.5;p.velocity[1]*=-.12;p.velocity[0]*=.65;p.velocity[2]*=.65;}
   }
   for(const rune of this.runes){rune.age+=dt;for(let k=0;k<3;k++)rune.position[k]+=rune.velocity[k]*dt;}
   this.runes=this.runes.filter(r=>r.age<r.life);
   if(!this.reducedMotion)goals.slice(0,4).forEach((goal,i)=>{
    const slot=goal?.slot??i,charge=world.goalCharge(goal,players.find((p,j)=>(p.slot??j)===slot));
    if(charge<=.1){this.runeActive[i]=false;this.runeTimers[i]=0;return;}
    if(!this.runeActive[i]){this.runeActive[i]=true;this.runeTimers[i]=0;this.emitRune(goal,slot,world);}
    this.runeTimers[i]+=dt*charge;
    while(this.runeTimers[i]>=.25){this.runeTimers[i]-=.25;this.emitRune(goal,slot,world);}
   });
  }
 }
 const api={System};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JellyEffects=api;
})(globalThis);
