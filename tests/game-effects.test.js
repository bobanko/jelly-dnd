import Levels from '../levels.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {System} from '../game-effects.js';
import {World} from '../physics.js';
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

test('teleport particles and rings match every portal colour',()=>{
 for(const color of Levels.portalColors){
  const effects=new System();effects.burst({...portal,color:color.id},players,soft);
  assert.ok(effects.rings.length&&effects.particles.length);
  for(const p of [...effects.rings,...effects.particles])assert.deepEqual(p.color,color.glow);
 }
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

const goals=[{x:2,z:2},{x:4,y:1,z:2},{x:6,z:2}];
const goalWorld=new World(new Set(['2,2','4,2','6,2']),[],[]);
const finishPlayers=()=>goals.map(g=>({...g,y:g.y||0,state:'alive'}));

test('fifth yellow finish emits a distinct rune and yellow jelly death particles have a valid tint',()=>{
 const effects=new System(),goal={x:2,z:2,slot:4},player={x:2,z:2,y:0,slot:4,state:'alive'};
 effects.step(.01,goalWorld,[goal],[player]);assert.equal(effects.runes[0].glyph,4);assert.deepEqual(effects.runes[0].color,[1,.65,.025]);
 effects.burst({type:'death',reason:'spikes',player:0},[player],soft);assert.ok(effects.particles.length>0);assert.ok(effects.particles.every(p=>Array.isArray(p.color)&&p.color.every(Number.isFinite)));
});

test('matching finishes emit their own coloured glyphs at floor height and keep rising',()=>{
 const effects=new System(),party=finishPlayers();
 effects.step(.01,goalWorld,goals,party);
 assert.deepEqual(effects.runes.map(p=>p.glyph),[0,1,2]);
 assert.deepEqual(effects.runes.map(p=>p.position[1]),[.07,1.07,.07]);
 assert.equal(new Set(effects.runes.map(p=>p.color.join(','))).size,3);
 const first=effects.runes[0],start=first.position[1];
 for(let i=0;i<10;i++)effects.step(.1,goalWorld,goals,party);
 assert.ok(first.position[1]>start+.7);
 assert.ok(effects.runes.length>3,'standing on a finish sustains the stream');
});

test('finish particles require the matching living jelly on the correct floor',()=>{
 const effects=new System(),party=finishPlayers();
 [party[0],party[2]]=[party[2],party[0]];party[1].y=0;
 effects.step(.1,goalWorld,goals,party);
 assert.equal(effects.runes.length,0);
 const invalid=finishPlayers();invalid[0].state='dead';invalid[1].kind='crate';invalid[2].y=1;
 effects.step(.1,goalWorld,goals,invalid);
 assert.equal(effects.runes.length,0);
});

test('leaving stops emission, existing glyphs expire, and reset allows immediate re-entry',()=>{
 const effects=new System(),party=finishPlayers();
 effects.step(.1,goalWorld,goals,party);
 const first=effects.runes[0];party.forEach(p=>p.z+=2);
 effects.step(.1,goalWorld,goals,party);
 assert.equal(effects.runes.length,3);assert.ok(first.age>0);
 for(let i=0;i<25;i++)effects.step(.1,goalWorld,goals,party);
 assert.equal(effects.runes.length,0);
 party[0].z-=2;effects.step(.01,goalWorld,goals,party);
 assert.equal(effects.runes.length,1);
 effects.clear();assert.equal(effects.runes.length,0);
 effects.step(.01,goalWorld,goals,party);assert.equal(effects.runes.length,1);
});

test('three persistent rune streams stay bounded and respect reduced motion',()=>{
 const effects=new System(),party=finishPlayers();
 for(let i=0;i<600;i++){
  effects.step(.1,goalWorld,goals,party);
  assert.ok(effects.runes.length<=32);
 }
 assert.ok(effects.runes.some(p=>p.age<.3),'stream keeps spawning during an extended victory');
 const reduced=new System({reducedMotion:true});
 for(let i=0;i<30;i++)reduced.step(.1,goalWorld,goals,party);
 assert.equal(reduced.runes.length,0);
});

test('shield splinters fall and expire, while skeleton bones persist and gather on the five-second gameplay clock',()=>{
 const effects=new System();effects.burst({type:'shieldBreak',position:[2,.5,3]},players,soft);
 assert.ok(effects.particles.every(p=>p.kind==='wood'));
 for(let i=0;i<12;i++)effects.step(.1,world);assert.equal(effects.particles.length,0);
 const skeletonWorld={heightAt:()=>0,archers:[{x:2,z:3,state:'dead',respawnTimer:5,dz:1}]};
 effects.burst({type:'archerDeath',archer:0,position:[2,0,3],direction:{x:0,z:1}},players,soft);
 assert.ok(effects.bones.some(p=>p.skull));
 for(let i=0;i<25;i++)effects.step(.1,skeletonWorld);
 const head=effects.bones.find(p=>p.skull);assert.ok(head.position[1]<.2);
 skeletonWorld.archers[0].respawnTimer=.35;effects.step(.01,skeletonWorld);
 const midDistance=Math.hypot(...head.position.map((v,k)=>v-head.home[k]));
 skeletonWorld.archers[0].respawnTimer=.01;effects.step(.01,skeletonWorld);
 assert.ok(Math.hypot(...head.position.map((v,k)=>v-head.home[k]))<midDistance*.02);
 skeletonWorld.archers[0].state='alive';effects.step(.01,skeletonWorld);assert.equal(effects.bones.length,0);
 skeletonWorld.archers[0].state='dead';skeletonWorld.archers[0].respawnTimer=2;effects.step(.01,skeletonWorld);
 assert.ok(effects.bones.length>0,'undo to a dead skeleton reconstructs its bone fragments');
 effects.clear();assert.equal(effects.bones.length,0);
});
