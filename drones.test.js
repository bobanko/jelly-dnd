const {test}=require('node:test'),assert=require('node:assert/strict');
const L=require('./levels'),P=require('./physics'),S=require('./soft-body'),{Model}=require('./editor-model'),Effects=require('./game-effects');
function scene(slots=[1]){
 const m=L.blank();m.size=8;for(let x=0;x<8;x++)for(let z=0;z<8;z++)m.blocks.push({x,y:0,z});
 slots.forEach((slot,i)=>{m.spawns[slot]={x:6,y:0,z:2+i*2};m.goals[slot]={x:7,y:0,z:2+i*2};});
 m.drones=[{x:1,y:0,z:2,hover:1.16,color:2,target:slots[0]}];return L.instantiate(L.read(m),P,S);
}
test('laser tracks the selected identity in sparse rosters, including height and diagonal aim',()=>{
 const r=scene([3,1]),d=r.world.drones[0],blue=r.players.find(p=>p.slot===1),purple=r.players.find(p=>p.slot===3);d.target=1;blue.y=2;blue.z=5;
 const beams=r.world.traceDrones(r.bodies,null);assert.equal(beams.length,1);assert.equal(beams[0].hit,r.players.indexOf(blue));assert.equal(beams[0].target,1);assert.ok(beams[0].to[1]>2&&beams[0].to[2]>4);
 blue.state='dead';assert.equal(r.world.traceDrones(r.bodies,null).length,0);d.target=0;assert.equal(r.world.traceDrones(r.bodies,null).length,0);
 d.target=-1;purple.x=2;assert.equal(r.world.traceDrones(r.bodies,null)[0].target,3);
});
test('all sixteen colour pairs use colour immunity, death events, inventory cleanup and a short beam afterglow',()=>{
 for(let color=0;color<4;color++)for(let slot=0;slot<4;slot++){
  const r=scene([slot]),p=r.players[0];r.world.drones[0].color=color;p.shield='test';p.shieldHP=3;p.sword='sword';r.world.pickups=[{id:'test',holder:0}];
  const events=r.world.afterDrones(r.bodies,null);assert.equal(p.state,color===slot?'alive':'dead');
  if(color!==slot){assert.equal(p.deathReason,'beam');assert.equal(p.deaths,1);assert.equal(p.shield,null);assert.equal(p.sword,null);assert.equal(r.world.pickups[0].holder,null);assert.equal(events.length,1);
   const effects=new Effects.System();effects.burst(events[0],r.players,r.soft);assert.equal(effects.lasers.length,1);effects.step(.1,r.world);effects.step(.1,r.world);assert.equal(effects.lasers.length,0);
  }else assert.equal(events.length,0);
 }
});
test('stone, colour glass, raised surfaces, closed walls, crates and the first jelly occlude the beam',()=>{
 for(const kind of ['block','colour block','legacy wall','crate','safe jelly','other jelly']){
  const r=scene([1,0]),w=r.world,victim=r.players.find(p=>p.slot===1),blocker=r.players.find(p=>p.slot===0);Object.assign(victim,{x:6,z:2});Object.assign(blocker,{x:3,y:.8,z:2});w.drones[0].color=0;
  if(kind!=='safe jelly'&&kind!=='other jelly')blocker.z=6;
  if(kind==='block'||kind==='colour block'){w.blocks.push({x:3,y:2,z:2,...(kind==='colour block'?{color:0}:{})});w._blockBoxes=null;}
  if(kind==='legacy wall')w.obstacles.push({x:3,z:2,half:.5,minY:0,height:3});
  if(kind==='crate')r.bodies.push({kind:'crate',state:'alive',x:3,y:.65,z:2});
  if(kind==='other jelly'){w.drones[0].color=2;}
  w.afterDrones(r.bodies,null);assert.equal(victim.state,'alive',kind);assert.ok(w.droneBeams[0].to[0]<4,kind);
  if(kind==='safe jelly')assert.equal(blocker.state,'alive');if(kind==='other jelly')assert.equal(blocker.state,'dead');
 }
});
test('a hole does not block a diagonal beam, floating ceilings block only at their own height, torches do not block',()=>{
 const r=scene(),w=r.world;w.blocks=[];w._blockBoxes=null;w.torches=[{x:3,y:1,z:2,face:'east'}];
 assert.equal(w.traceDrones(r.bodies,null)[0].hit,0);
 w.blocks=[{x:3,y:4,z:2}];w._blockBoxes=null;w._collisionCache=null;assert.equal(w.traceDrones(r.bodies,null)[0].hit,0);
 w.blocks=[{x:3,y:2,z:2}];w._blockBoxes=null;w._collisionCache=null;assert.equal(w.traceDrones(r.bodies,null)[0].hit,-1);
});
test('real soft body dies, respawns and reset/undo clears derived beams without changing drone definitions',()=>{
 const r=scene(),w=r.world,events=w.step(r.bodies,[{x:0,z:0}]);assert.ok(events.some(e=>e.reason==='beam'));assert.equal(r.players[0].state,'dead');
 const snapshot=w.featureSnapshot();w.drones[0].color=1;
 for(let i=0;i<100;i++)w.step(r.bodies,[{x:0,z:0}]);assert.equal(r.players[0].state,'alive');assert.equal(r.players[0].deaths,1);
 w.restoreFeatures(snapshot);assert.equal(w.droneBeams.length,0);w.resetFeatures();assert.equal(w.droneBeams.length,0);assert.equal(w.drones.length,1);
});
test('editor supports free hovering drones, settings, moving, history, picking, persistence and validation',()=>{
 const E=require('./editor-space'),m=new Model(L.blank());m.change(()=>m.paint('drone',3,4,{voxel:true,y:2}));assert.equal(m.map.blocks.length,0);assert.equal(m.map.tiles.length,0);
 m.change(map=>Object.assign(map.drones[0],{color:1,target:3,hover:2.5}));m.move('drones',0,5,4,3);assert.equal(m.map.blocks.length,0);assert.deepEqual(m.map.drones[0],{x:5,y:3,z:4,color:1,target:3,hover:2.5});
 m.undo();assert.equal(m.map.drones[0].x,3);m.redo();assert.equal(m.map.drones[0].x,5);assert.deepEqual(L.read(JSON.stringify(m.map)),m.map);
 assert.ok(L.issues(m.map).some(s=>s.includes('выбранная цель')));const b=E.boxes(m.map).find(b=>b.key==='drones');assert.ok(Math.abs(b.min[1]-5.58)<1e-9);assert.ok(Math.abs(b.max[1]-6.7)<1e-9);
 for(const bad of [{color:5},{target:4},{target:.5},{hover:-.1},{hover:Infinity}]){const map=L.copy(m.map);Object.assign(map.drones[0],bad);assert.throws(()=>L.read(map));}
 m.remove('drones',0);assert.equal(m.map.drones.length,0);m.undo();assert.equal(m.map.drones.length,1);
 const old=L.defaultLevel();delete old.drones;assert.deepEqual(L.read(old).drones,[]);
});

test('zero hover leaves a small floor gap and shares its origin with aiming, picking and stone validation',()=>{
 const E=require('./editor-space'),m=new Model(L.blank());m.change(()=>m.paint('drone',3,4,{voxel:true,y:2}));
 assert.equal(m.map.drones[0].hover,0);m.change(map=>{map.blocks.push({x:3,y:2,z:4});});
 const d=m.map.drones[0],origin=L.droneOrigin(d),box=E.boxes(m.map).find(b=>b.key==='drones');
 assert.ok(Math.abs(origin[1]-2.64)<1e-9);assert.ok(Math.abs(box.min[1]-2.08)<1e-9);assert.ok(!L.issues(m.map).some(s=>s.includes('внутри камня')));
 const r=L.instantiate(m.map,P,S);assert.deepEqual(r.world.droneOrigin(r.world.drones[0]),origin);
 m.change(map=>{map.blocks.push({x:3,y:3,z:4});});assert.ok(L.issues(m.map).some(s=>s.includes('внутри камня')));
 const map=L.blank();map.drones=[{x:1,z:1}];assert.equal(L.read(map).drones[0].hover,0);
 const low=scene();low.world.drones[0].hover=0;assert.equal(low.world.traceDrones(low.bodies,null)[0].hit,0,'floor must not block a low beam');
});
