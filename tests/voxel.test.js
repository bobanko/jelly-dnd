const {test}=require('node:test'),assert=require('node:assert/strict');
const L=require('../levels'),{Model}=require('../editor-model'),P=require('../physics'),S=require('../soft-body'),Space=require('../editor-space');
const runtime=map=>L.instantiate(L.read(map),P,S);
function room(){const m=L.blank();m.size=8;for(let x=0;x<8;x++)for(let z=0;z<8;z++)m.blocks.push({x,y:0,z});m.spawns[0]={x:1,y:0,z:3};m.goals[0]={x:6,y:0,z:3};return m;}
function step(r,n,input=[]){const events=[];for(let i=0;i<n;i++)events.push(...r.world.step(r.bodies,input));return events;}

test('XYZ cubes serialize individually, migrate old geometry and retain sparse air gaps',()=>{
 const m=new Model(L.blank());for(const y of [-2,0,3,12])m.change(()=>m.paint('cube',2,3,{y}));assert.equal(m.map.blocks.length,4);
 assert.equal(m.map.tiles.length,0);assert.deepEqual(L.read(JSON.stringify(m.map)),m.map);
 m.change(()=>m.erase(2,3,3));assert.deepEqual(m.map.blocks.map(b=>b.y),[-2,0,12]);m.undo();assert.equal(m.map.blocks.length,4);
 const i=m.map.blocks.findIndex(b=>b.y===3);m.move('blocks',i,4,5,6);assert.deepEqual(m.map.blocks[i],{x:4,y:6,z:5});m.undo();assert.equal(m.map.blocks[i].y,3);
 for(const y of [13,-3,.5])assert.throws(()=>L.read({...m.map,blocks:[{x:1,y,z:1}]}));
 assert.throws(()=>L.read({...m.map,blocks:[{x:1,y:0,z:1},{x:1,y:0,z:1}]}));
 const migrated=L.voxelize(L.copy(require('../levels/05-sunken-sanctum.json')));assert.equal(migrated.tiles.length,0);assert.ok(migrated.walls.every(w=>w.half<.4));assert.ok(migrated.blocks.length>100);assert.deepEqual(L.issues(migrated),[]);assert.deepEqual(L.voxelize(migrated),migrated);
});
test('several surfaces in one column have distinct support, colliders, markers and selection',()=>{
 const map=room();map.blocks.push({x:3,y:3,z:3});map.spawns[1]={x:3,y:3,z:3};map.goals[1]={x:3,y:0,z:3};
 assert.deepEqual(L.issues(map),[]);const r=runtime(map);assert.equal(r.world.heightAt(3,3),3);assert.equal(r.world.heightAt(3,3,.2),0);assert.equal(r.world.heightAt(3,3,2.9),0);assert.equal(r.players[1].y,3);
 assert.equal(r.world.collisionBoxes().filter(b=>b.x===3&&b.z===3&&b.kind==='block').length,2);
 const hit=Space.pick({origin:[3,8,3],direction:[0,-1,0]},Space.boxes(map),8);assert.equal(hit.key,'spawns');assert.equal(hit.y,3);
 const blocked=L.copy(map);blocked.blocks.push({x:1,y:1,z:3});assert.ok(L.issues(blocked).some(s=>s.includes('недостаточно места')));
});
test('jelly crosses underneath a suspended row while a stacked row is a solid wall',()=>{
 const map=room();for(let x=2;x<=5;x++)map.blocks.push({x,y:3,z:3});const r=runtime(map);step(r,180,[{x:1,z:0}]);assert.ok(r.players[0].x>4.2);assert.ok(Math.abs(r.players[0].y)<.08);assert.equal(r.players[0].state,'alive');
 const wall=room();for(let z=0;z<8;z++)for(const y of [1,2,3])wall.blocks.push({x:3,y,z});const w=runtime(wall);step(w,180,[{x:1,z:0}]);assert.ok(w.players[0].x<2.2);assert.ok(Math.abs(w.players[0].y)<.1);
 const mixed=room();mixed.tiles=mixed.blocks.map(p=>({x:p.x,z:p.z,height:0}));mixed.blocks=[{x:3,y:3,z:3}];const legacy=runtime(mixed);step(legacy,150,[{x:1,z:0}]);assert.ok(legacy.players[0].x>3.5&&Math.abs(legacy.players[0].y)<.1,'legacy floor plus a new floating cube retains its air gap');
});
test('falling jelly and rotating crate land on a lower storey, not on the roof above it',()=>{
 const map=room();map.blocks.push({x:3,y:3,z:3});map.spawns[0]={x:3,y:3,z:3};map.crates=[{x:3,y:3,z:4}];map.blocks.push({x:3,y:3,z:4});const r=runtime(map);
 step(r,75,[{x:1,z:0}]);step(r,180);assert.equal(r.players[0].state,'alive');assert.ok(Math.abs(r.players[0].y)<.08,`foot=${r.players[0].y}`);
 const crate=r.crates[0];r.soft.translate(crate,1,0,0);crate.state='falling';step(r,180);assert.equal(crate.state,'alive');assert.ok(Math.abs(crate.y)<.1);
 // Respawn keeps the lower spawn height even with an upper block in the same column.
 const low=runtime(room());low.world.blocks.push({x:1,y:3,z:3});low.world.blockColumns.get('1,3').push(3);low.players[0].state='dead';low.players[0].respawnTimer=.01;step(low,3);assert.equal(low.players[0].state,'alive');assert.ok(Math.abs(low.players[0].y)<.08);
});
test('upward motion collides with cube undersides instead of embedding in a ceiling',()=>{
 const map=room();map.blocks.push({x:1,y:2,z:3});const r=runtime(map),p=r.players[0],b=r.soft.get(p);p.state='falling';p.launchTimer=1;b.velocities.forEach(v=>v[1]=5);p.vy=5;step(r,60);
 assert.ok(Math.max(...b.positions.map(n=>n[1]))<1.05);assert.ok(p.y<.12);assert.equal(p.deaths,0);
});
test('lift and portal support their selected XYZ layer, with an independent lower tunnel',()=>{
 const m=new Model(room());m.change(()=>m.paint('lift',3,3,{voxel:true,y:3}));const r=runtime(m.map);assert.equal(r.world.heightAt(3,3,.2),0);assert.equal(r.world.heightAt(3,3),3);
 m.change(()=>m.paint('portal-violet',2,3,{voxel:true,y:0}));m.change(()=>m.paint('portal-violet',2,3,{voxel:true,y:3}));assert.equal(m.map.portals.length,2);assert.deepEqual(m.map.portals.map(p=>p.y),[0,3]);
 assert.deepEqual(L.issues(m.map),[]);
});
