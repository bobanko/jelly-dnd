const {test}=require('node:test'),assert=require('node:assert/strict');
const L=require('./levels'),{Model}=require('./editor-model'),P=require('./physics'),S=require('./soft-body');
function room(slot=0){const m=L.blank();m.size=8;for(let x=0;x<8;x++)for(let z=0;z<8;z++)m.blocks.push({x,y:0,z});m.spawns[slot]={x:1,y:0,z:3};m.goals[slot]={x:6,y:0,z:3};return m;}
const runtime=m=>L.instantiate(L.read(m),P,S);
function step(r,n,input=[]){const events=[];for(let i=0;i<n;i++)events.push(...r.world.step(r.bodies,input));return events;}

test('colour blocks serialize, repaint, move and undo without duplicate voxels',()=>{
 const m=new Model(room());for(let color=0;color<4;color++)m.change(()=>m.paint('color-'+color,3,3,{y:1}));
 assert.equal(m.map.blocks.filter(b=>b.x===3&&b.y===1&&b.z===3).length,1);assert.equal(m.at('blocks',3,3,1).color,3);
 assert.deepEqual(L.read(JSON.stringify(m.map)),m.map);assert.deepEqual(L.voxelize(m.map),m.map);
 m.undo();assert.equal(m.at('blocks',3,3,1).color,2);m.redo();assert.equal(m.at('blocks',3,3,1).color,3);
 m.change(()=>m.paint('floor',3,3,{voxel:true,y:1}));assert.equal(m.at('blocks',3,3,1).color,undefined);m.undo();
 m.move('blocks',m.map.blocks.findIndex(b=>b.color===3),4,3,2);assert.equal(m.at('blocks',4,3,2).color,3);
 m.change(()=>m.paint('goal-1',4,3,{voxel:true,y:2}));assert.equal(m.at('blocks',4,3,2).color,3,'placing an object preserves the support pigment');
 for(const color of [-1,4,.5,'0',null])assert.throws(()=>L.read({...room(),blocks:[{x:3,y:1,z:3,color}]}));
});

test('all sixteen hero/block combinations use colour identity, including sparse parties',()=>{
 for(let slot=0;slot<4;slot++)for(let color=0;color<4;color++){
  const m=room(slot);for(let z=0;z<8;z++)m.blocks.push({x:3,y:1,z,color});const r=runtime(m),p=r.players[0];
  assert.equal(p.slot,slot);assert.equal(r.world.blockSolid(p,r.world.collisionBoxes().find(b=>b.color===color)),slot!==color);
  step(r,175,[{x:1,z:0}]);assert.equal(p.state,'alive');assert.ok(Math.abs(p.y)<.1);
  assert.ok(slot===color?p.x>4.1:p.x<2.3,`hero ${slot}, block ${color}, x ${p.x}`);
 }
});

test('matching colour ignores support and ceilings; other heroes and crates retain solid contact',()=>{
 const m=room(3);m.blocks.push({x:1,y:2,z:3,color:3});const r=runtime(m),p=r.players[0];
 assert.equal(r.world.heightAt(1,3,Infinity,p),0);assert.equal(r.world.heightAt(1,3,Infinity,{slot:2}),2);assert.equal(r.world.heightAt(1,3,Infinity,{kind:'crate',slot:3}),2);
 p.state='falling';p.launchTimer=1;p.vy=6;r.soft.get(p).velocities.forEach(v=>v[1]=6);let top=0;for(let i=0;i<55;i++){step(r,1);top=Math.max(top,...r.soft.get(p).positions.map(n=>n[1]));}assert.ok(top>1.5,`passed through underside: top=${top}`);
 const fall=room(0);fall.blocks.find(b=>b.x===3&&b.z===3).color=0;fall.spawns[0]={x:3,y:0,z:3};const f=runtime(fall);const events=step(f,145);assert.ok(events.some(e=>e.type==='death'));assert.ok(f.players[0].deaths>0);
 const crateMap=room();crateMap.blocks.push({x:3,y:2,z:4,color:0});crateMap.crates=[{x:3,y:2,z:4}];const c=runtime(crateMap);step(c,150);assert.equal(c.crates[0].state,'alive');assert.ok(Math.abs(c.crates[0].y-2)<.1);
});

test('validation and respawn apply the hero colour to support and overhead clearance',()=>{
 const m=room(2);m.blocks.push({x:1,y:1,z:3,color:2});assert.deepEqual(L.issues(m),[]);m.blocks.at(-1).color=0;assert.ok(L.issues(m).some(s=>s.includes('недостаточно места')));m.blocks.at(-1).color=2;
 const r=runtime(m),p=r.players[0];p.state='dead';p.respawnTimer=.001;step(r,3);assert.equal(p.state,'alive');assert.ok(Math.abs(p.x-1)<.01);
 m.blocks.find(b=>b.x===1&&b.y===0&&b.z===3).color=2;assert.ok(L.issues(m).some(s=>s.includes('провалится')));
});

test('arrows and the rigid baseline still see coloured stone as solid for nonmatching bodies',()=>{
 for(let slot=0;slot<4;slot++){
  const m=room(slot);m.blocks.push({x:3,y:1,z:3,color:3});const r=runtime(m);r.world.soft=null;
  step(r,175,[{x:1,z:0}]);assert.ok(slot===3?r.players[0].x>4.1:r.players[0].x<2.3);
  assert.equal(r.world.combatLineClear([1,.42,3],[5,.42,3]),false,'projectile line blocked independently of hero colour');
  Object.assign(r.players[0],{x:5,z:3});r.world.archers=[{x:1,z:3,dx:1,dz:0,cooldown:0}];r.world._collisionCache=null;r.world.afterCombat(r.bodies,null,.7);assert.equal(r.players[0].state,'alive');assert.equal(r.world.arrows.length,0,'stone consumes the actual swept arrow');
 }
});
