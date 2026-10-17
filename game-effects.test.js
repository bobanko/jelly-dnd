const {test}=require('node:test');
const assert=require('node:assert/strict');
const {System}=require('./game-effects.js');
const world={heightAt:()=>0},players=[{}],soft={get:()=>({positions:[[2,.05,3],[2.2,.7,3.1]]})};
const death={type:'death',reason:'spikes',player:0};
const portal={type:'portal',color:'violet',source:[3,0,6],destination:[6,1,9]};

test('spike scraps inherit lattice positions, move under gravity, bounce and expire before respawn',()=>{
 const effects=new System();effects.burst(death,players,soft);
 assert.equal(effects.particles.length,22);
 assert.ok(effects.particles.every(p=>p.position[0]>=2&&p.position[0]<=2.2));
 const p=effects.particles[0];p.position=[2,.05,3];p.velocity=[1,-2,0];
 effects.step(.02,world);
 assert.ok(p.position[0]>2&&p.velocity[1]>0,'scrap should bounce on the floor');
 for(let i=0;i<70;i++)effects.step(.01,world);
 assert.equal(effects.particles.length,0);
});

test('void death breaks the fallen lattice into scraps without snapping them up onto the level',()=>{
 const effects=new System(),fallen=[{respawnTimer:.55}],lattice={get:()=>({positions:[[2,-4,3],[2.2,-3.5,3.1]]})};
 effects.burst({type:'death',player:0},fallen,lattice);
 assert.equal(effects.particles.length,22);assert.ok(effects.particles.every(p=>p.position[1]<-3));
 for(const p of effects.particles)p.velocity[1]=-1;
 effects.step(.05,world);
 assert.ok(effects.particles.every(p=>p.position[1]<-3),'underground particles must not bounce to the floor above');
 for(let n=0;n<11;n++)effects.step(.05,world);
 assert.equal(effects.particles.length,0);
});
test('teleport emits both endpoints at their own floor height and has a bounded lifetime',()=>{
 const effects=new System();effects.burst(portal,players,soft);
 assert.deepEqual(effects.rings.map(r=>r.center),[portal.source,portal.destination]);
 assert.equal(effects.particles.length,28);
 for(let i=0;i<8;i++)effects.step(.1,world);
 assert.equal(effects.rings.length+effects.particles.length,0);
});
test('effects stay bounded during bursts and respect reduced motion',()=>{
 const effects=new System();
 for(let i=0;i<30;i++)effects.burst(portal,players,soft);
 assert.equal(effects.particles.length,96);assert.equal(effects.rings.length,8);
 effects.clear();assert.equal(effects.rings.length+effects.particles.length,0);
 const reduced=new System({reducedMotion:true});reduced.burst(portal,players,soft);
 assert.equal(reduced.particles.length,0);
 reduced.burst(death,players,soft);assert.equal(reduced.particles.length,6);
 for(let i=0;i<4;i++)reduced.step(.1,world);
 assert.equal(reduced.rings.length+reduced.particles.length,0);
});
