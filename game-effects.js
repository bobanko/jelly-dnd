// Short-lived visual particles. They never become gameplay colliders.
(function(root){
 'use strict';
 const palettes=[[.12,.9,.16],[.025,.17,1.],[1.,.065,.035]];
 class System{
  constructor({reducedMotion=false}={}){this.reducedMotion=reducedMotion;this.particles=[];this.rings=[];this.seed=1;}
  random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
  clear(){this.particles.length=0;this.rings.length=0;}
  burst(event,players,soft){
   const random=()=>this.random();
   if(event.type==='death'){
    const player=players[event.player],body=soft.get(player),count=this.reducedMotion?6:22;
    const life=Math.min(this.reducedMotion ? .3 : .68,player.respawnTimer||.68);
    for(let i=0;i<count;i++){
     const q=body.positions[Math.floor(random()*body.positions.length)],a=random()*Math.PI*2,speed=.6+random()*1.8;
     this.particles.push({kind:'jelly',position:[...q],velocity:[Math.cos(a)*speed,1+random()*2.2,Math.sin(a)*speed],size:.075+random()*.075,phase:random()*6.28,color:palettes[event.player],age:0,life});
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
  step(dt,world){
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
  }
 }
 const api={System};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JellyEffects=api;
})(globalThis);
