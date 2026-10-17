// Short-lived visual particles. They never become gameplay colliders.
(function(root){
 'use strict';
 const palettes=[[.12,.9,.16],[.025,.17,1.],[1.,.065,.035]];
 const runeColors=[[.45,1.,.08],[.035,.17,1.],[1.,.055,.025]],RUNE_LIMIT=32;
 class System{
  constructor({reducedMotion=false}={}){this.reducedMotion=reducedMotion;this.particles=[];this.rings=[];this.runes=[];this.runeTimers=[];this.runeActive=[];this.seed=1;}
  random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
  clear(){this.particles.length=0;this.rings.length=0;this.runes.length=0;this.runeTimers=[];this.runeActive=[];}
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
     this.particles.push({kind:'jelly',position:[...q],velocity:[Math.cos(a)*speed,1+random()*2.2,Math.sin(a)*speed],size:.075+random()*.075,phase:random()*6.28,color:palettes[event.player],age:0,life});
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
    if(p.kind==='jelly')p.velocity[1]-=7*dt;
    for(let k=0;k<3;k++)p.position[k]+=p.velocity[k]*dt;
    if(p.kind==='jelly'){
     const floor=world.heightAt(p.position[0],p.position[2]);
     if(floor!==null&&previousY>=floor-.01&&p.position[1]<floor+p.size*.45&&p.velocity[1]<0){p.position[1]=floor+p.size*.45;p.velocity[1]*=-.22;p.velocity[0]*=.65;p.velocity[2]*=.65;}
    }
   }
   this.particles=this.particles.filter(p=>p.age<p.life);
   for(const ring of this.rings)ring.age+=dt;
   this.rings=this.rings.filter(r=>r.age<r.life);
   for(const rune of this.runes){rune.age+=dt;for(let k=0;k<3;k++)rune.position[k]+=rune.velocity[k]*dt;}
   this.runes=this.runes.filter(r=>r.age<r.life);
   if(!this.reducedMotion)goals.slice(0,3).forEach((goal,i)=>{
    const charge=world.goalCharge(goal,players[i]);
    if(charge<=.1){this.runeActive[i]=false;this.runeTimers[i]=0;return;}
    if(!this.runeActive[i]){this.runeActive[i]=true;this.runeTimers[i]=0;this.emitRune(goal,i,world);}
    this.runeTimers[i]+=dt*charge;
    while(this.runeTimers[i]>=.25){this.runeTimers[i]-=.25;this.emitRune(goal,i,world);}
   });
  }
 }
 const api={System};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JellyEffects=api;
})(globalThis);
