const {test}=require('node:test');
const assert=require('node:assert/strict');
const L=require('./levels'),P=require('./physics'),S=require('./soft-body');
function scene(height=0){const map=L.blank();map.size=8;for(let x=1;x<=6;x++)for(let z=1;z<=6;z++)map.blocks.push({x,y:height,z});map.spawns=[{x:2,y:height,z:2},{x:5,y:height,z:5},null,null];return L.instantiate(L.read(map),P,S);}
test('a runaway jelly dies once and respawns with a reset lattice and no launch velocity',()=>{
 const g=scene(),p=g.players[0];p.y=P.SKY_MARGIN+1;p.vy=100;p.launchTimer=2;
 const events=g.world.step(g.bodies,[]);assert.equal(p.state,'dead');assert.equal(p.deathReason,'sky');assert.equal(p.vy,0);assert.equal(p.launchTimer,0);assert.equal(events.filter(e=>e.type==='death'&&e.player===0).length,1);assert.equal(g.players[1].deaths,0);
 let deaths=0;for(let n=0;n<90;n++)deaths+=g.world.step(g.bodies,[]).filter(e=>e.type==='death'&&e.player===0).length;
 assert.equal(deaths,0);assert.equal(p.state,'alive');assert.equal(p.deaths,1);assert.equal(p.deathReason,null);assert.ok(Math.abs(p.y)<.1);assert.ok(g.soft.get(p).positions.every(q=>q[1]<1));
});
test('the safety ceiling follows high platforms, lifts and spawn heights without killing ordinary airborne jellies',()=>{
 const g=scene(12),p=g.players[0];p.y=16;assert.deepEqual(g.world.enforceHeightLimit(g.bodies),[]);
 g.world.lifts.push({x:4,z:4,top:18,height:12});p.y=25;assert.deepEqual(g.world.enforceHeightLimit(g.bodies),[]);
 p.y=27;assert.equal(g.world.enforceHeightLimit(g.bodies).length,1);
});
test('a solver step crossing the ceiling is caught immediately',()=>{
 const g=scene(),p=g.players[0];p.y=7.9;p.state='falling';p.vy=1000;g.soft.get(p).reset(p);
 assert.ok(g.world.step(g.bodies,[]).some(e=>e.type==='death'&&e.reason==='sky'));assert.equal(p.state,'dead');
});
