const {test}=require('node:test');
const assert=require('node:assert/strict');
const L=require('./levels'),{Model}=require('./editor-model'),Physics=require('./physics'),Soft=require('./soft-body');

test('original map roundtrips without live state and produces the existing scene',()=>{
 const map=L.read(JSON.stringify(L.defaultLevel()));assert.deepEqual(L.issues(map),[]);
 assert.deepEqual(L.read(JSON.stringify(map)),map);
 const runtime=L.instantiate(map,Physics,Soft);
 assert.equal(runtime.floor.size,78);assert.equal(runtime.players.length,3);assert.equal(runtime.crates[0].y,1);
 assert.equal(runtime.world.portals.length,4);assert.equal(runtime.world.archers.length,1);
 assert.equal(runtime.world.heightAt(6,9),1);assert.equal(runtime.world.heightAt(5,7),0);
 runtime.players[0].shield='test';runtime.world.archers[0].state='dead';
 assert.equal(map.spawns[0].shield,undefined);assert.equal(map.archers[0].state,undefined);
});

test('schema rejects malformed coordinates, unsafe quantities, duplicate ids and invalid directions',()=>{
 for(const modify of [
  m=>m.version=2,m=>m.size=100,m=>m.tiles[0].x=16,m=>m.tiles[0].height=Infinity,
  m=>m.spawns=[],m=>m.tiles.push({...m.tiles[0]}),m=>m.archers[0].dx=1,
  m=>m.portals[0].color='unknown',m=>m.pickups[0].kind='staff',m=>m.plates[1].id=m.plates[0].id,
  m=>m.crates=Array.from({length:5},(_,x)=>({x,z:3}))
 ]){const map=L.defaultLevel();modify(map);assert.throws(()=>L.read(map));}
 const map=L.defaultLevel();map.arbitrary='<script>';map.archers[0].state='dead';map.tiles[0].extra=true;
 const clean=L.read(map);assert.equal(clean.arbitrary,undefined);assert.equal(clean.archers[0].state,undefined);assert.equal(clean.tiles[0].extra,undefined);
});

test('draft validation finds missing spawns, unpaired portals, unsafe markers and broken bridge links',()=>{
 assert.equal(L.issues(L.blank()).length,1);
 const map=L.read(L.defaultLevel());map.portals.pop();map.plates.pop();map.spawns[0]={x:5,z:5};map.goals[1]={...map.goals[2]};
 const errors=L.issues(map);assert.ok(errors.some(e=>e.includes('ровно два')));assert.ok(errors.some(e=>e.includes('не привязан')));assert.ok(errors.some(e=>e.includes('постоянной площадке')));assert.ok(errors.some(e=>e.includes('Финиши должны')));
 assert.throws(()=>L.forGame({getItem:()=>JSON.stringify(map)},'?level=editor'));
 assert.throws(()=>L.forGame({getItem:()=>null},'?level=editor'));
 assert.deepEqual(L.issues(L.forGame({getItem:()=>'{bad'},'')),[],'default game never reads the draft');
});

test('one painted gesture undoes as one operation; redo and invalid changes preserve the map',()=>{
 const m=new Model(L.blank());m.begin();for(let x=1;x<=4;x++)m.paint('floor',x,2,{height:1});assert.equal(m.commit(),true);
 assert.equal(m.undoStack.length,1);assert.equal(m.map.tiles.length,4);m.undo();assert.equal(m.map.tiles.length,0);m.redo();assert.equal(m.map.tiles.length,4);
 const before=L.copy(m.map);assert.throws(()=>m.change(map=>map.tiles[0].x=99));assert.deepEqual(m.map,before);
 m.undo();m.change(()=>m.paint('floor',8,8));assert.equal(m.redoStack.length,0);
});

test('editor places the full arsenal, preserves floor height and relinks buttons by stable id',()=>{
 const m=new Model(L.blank());
 const catalog=['floor','wall','torch','spawn-0','spawn-1','spawn-2','spawn-3','goal-0','goal-1','goal-2','goal-3','plate','bridge','lift','spikes','portal-violet','portal-amber','crate','archer','shield','sword'];
 catalog.forEach((tool,i)=>m.change(()=>m.paint(tool,i%8,Math.floor(i/8),{height:1})));
 assert.equal(m.map.archers.length,1);assert.equal(m.map.pickups.length,2);assert.equal(m.map.walls.length,2);assert.ok(m.map.spawns.every(Boolean));
 const plate=m.map.plates[0],bridge=m.map.bridges[0];assert.equal(bridge.plate,plate.id);assert.equal(bridge.y,1);
 m.move('plates',0,12,12);assert.equal(m.map.bridges[0].plate,plate.id);
 m.change(()=>m.paint('plate',11,12));m.change(map=>map.plates.reverse());
 const runtime=L.instantiate(m.map,Physics,Soft);assert.equal(runtime.bridges[0].plate,1);
 const original={...m.map.spawns[0]};m.change(()=>m.paint('spawn-0',13,13));assert.deepEqual(m.map.spawns[0],{x:13,z:13});m.undo();assert.deepEqual(m.map.spawns[0],original);
});

test('eraser, resize, entity move and map replacement are reversible and enforce limits',()=>{
 const m=new Model(L.defaultLevel()),initial=L.copy(m.map);
 m.change(()=>m.erase(9,7));assert.equal(m.map.spawns[2],null);m.undo();assert.deepEqual(m.map,initial);
 m.resize(8);assert.equal(m.map.spawns[1],null);assert.ok(m.map.tiles.every(p=>p.x<8&&p.z<8));m.undo();assert.deepEqual(m.map,initial);
 m.move('pickups',0,12,12);assert.equal(m.map.pickups[0].x,12);m.undo();assert.deepEqual(m.map,initial);
 m.load(L.blank());assert.equal(m.map.tiles.length,0);m.undo();assert.deepEqual(m.map,initial);
 assert.throws(()=>m.change(()=>m.paint('portal-violet',12,12)));assert.deepEqual(m.map,initial);
});

test('raised spawns, ground crates, elevated bridges and lifts use the same heights as the editor',()=>{
 const map=L.read(L.defaultLevel());map.spawns[0]={x:5,z:9};map.crates=[{x:6,z:7}];map.bridges[0].y=1;
 const r=L.instantiate(map,Physics,Soft);assert.equal(r.start[0].y,1);assert.equal(r.players[0].y,1);assert.equal(r.crates[0].spawn.y,0);
 r.bridges[0].progress=1;assert.equal(r.world.heightAt(8,4),1);assert.equal(r.world.bridgeBounds(0).maxY,1);
 r.world.lifts[0].base=1;r.world.lifts[0].top=2;r.world.resetFeatures();assert.equal(r.world.heightAt(5,7),1);
});

test('torch placement limits and moving a torch to a raised platform preserve its real light height',()=>{
 const m=new Model(L.blank());
 for(let x=0;x<8;x++)m.change(()=>m.paint('torch',x,1));
 assert.throws(()=>m.change(()=>m.paint('torch',9,1)));assert.equal(m.map.walls.length,8);
 m.change(()=>m.paint('floor',9,2,{height:2}));m.move('walls',0,9,2);
 assert.equal(m.map.walls[0].base,2);const runtime=L.instantiate(m.map,Physics,Soft);assert.equal(runtime.world.obstacles[0].minY,2);
 const imported=L.copy(m.map);imported.walls.push({x:10,z:1,half:.17,base:0,height:.56});assert.throws(()=>L.read(imported));
});

test('any one to four colours form a valid party, and only their matching markers are required',()=>{
 for(const slots of [[0],[1],[2],[3],[0,1],[1,3],[0,1,2],[0,1,2,3]]){
  const m=new Model(L.blank());for(const slot of slots){m.change(()=>m.paint('spawn-'+slot,slot*2+1,2));m.change(()=>m.paint('goal-'+slot,slot*2+1,4));}
  assert.deepEqual(L.issues(m.map),[]);const r=L.instantiate(m.map,Physics,Soft);
  assert.deepEqual(r.players.map(p=>p.slot),slots);assert.equal(r.bodies.length,slots.length);assert.equal(r.goals.length,slots.length);
  r.world.step(r.bodies,[]);assert.ok(r.players.every(p=>p.state==='alive'));
  const original=L.copy(m.map);m.remove('spawns',slots[0]);assert.equal(L.issues(m.map).length,slots.length===1?1:0);m.undo();assert.deepEqual(m.map,original);
  m.remove('goals',slots[0]);assert.ok(L.issues(m.map).some(e=>e.includes('Финиш')));
 }
 const old=L.defaultLevel();old.spawns.pop();old.goals.pop();const migrated=L.read(old);
 assert.equal(migrated.spawns.length,4);assert.equal(migrated.spawns[3],null);assert.deepEqual(L.issues(migrated),[]);
 const short=L.blank();short.tiles=[{x:1,z:1,height:0},{x:2,z:1,height:0}];short.spawns=[{x:1,z:1}];short.goals=[{x:2,z:1}];assert.deepEqual(L.issues(L.read(short)),[]);
 short.spawns=Array(5).fill(null);assert.throws(()=>L.read(short));
 assert.equal(L.instantiate(L.blank(),Physics,Soft).players.length,0,'empty editor previews have no hidden respawning bodies');
 const reduced=L.defaultLevel();reduced.spawns[1]=reduced.spawns[2]=null;assert.deepEqual(L.issues(reduced),[],'unused finish tiles do not require absent characters');
});
