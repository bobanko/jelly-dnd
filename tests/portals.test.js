const {test}=require('node:test'),assert=require('node:assert/strict');
const L=require('../levels'),P=require('../physics'),S=require('../soft-body'),{Model}=require('../editor-model');
function chamber(count=4){
 const m=L.blank();m.size=10;for(let x=0;x<10;x++)for(let z=0;z<10;z++)m.blocks.push({x,y:0,z});
 m.spawns[0]={x:2,y:0,z:2};m.goals[0]={x:8,y:0,z:8};m.portals=[[2,2],[6,2],[6,6],[2,6]].slice(0,count).map(([x,z])=>({x,y:0,z,color:'violet'}));return L.instantiate(L.read(m),P,S);
}

test('all hero portal colours roundtrip through both editor placement paths and route only within their own chain',()=>{
 for(const voxel of [false,true]){
  const m=new Model(L.blank());m.change(()=>m.paint('spawn-0',15,15));m.change(()=>m.paint('goal-0',15,14));
  L.portalColors.forEach((c,i)=>{
   m.change(()=>m.paint('portal-'+c.id,i*2,2,{voxel,y:0}));
   assert.ok(L.issues(m.map).some(s=>s.startsWith(c.name+' портал:')),'a lone new colour needs another endpoint');
   m.change(()=>m.paint('portal-'+c.id,i*2,5,{voxel,y:0}));
  });
  assert.deepEqual(L.issues(m.map),[]);assert.deepEqual(L.read(JSON.stringify(m.map)),m.map);
  const r=L.instantiate(m.map,P,S),w=r.world,p=r.players[0];
  for(const c of L.portalColors){
   const [a,b]=w.portals.filter(q=>q.color===c.id);
   assert.equal(w.portalDestination(a),b);assert.equal(w.portalDestination(b),a);
   Object.assign(p,{...a,vx:0,vz:0,vy:0,portalLock:null,portalCooldown:0});r.soft.reset();
   const events=w.step(r.bodies,[{x:0,z:0}]);
   assert.ok(events.some(e=>e.type==='portal'&&e.color===c.id));assert.equal(p.portalLock,c.id);
   assert.ok(Math.hypot(p.x-b.x,p.z-b.z)<.01);assert.ok(w.portalInactive(a,r.bodies)&&w.portalInactive(b,r.bodies));
  }
 }
 const bad=L.blank();bad.portals=[{x:1,z:1,color:'invalid'}];assert.throws(()=>L.read(bad));
});
test('three and four portals cycle in placement order, wrap, preserve height and wait for full departure',()=>{
 for(const count of [3,4]){
  const r=chamber(count),p=r.players[0],w=r.world;
  for(let hop=1;hop<=count;hop++){
   const next=w.portals[hop%count],events=w.step(r.bodies,[{x:0,z:0}]);assert.ok(events.some(e=>e.type==='portal'));assert.ok(Math.abs(p.x-next.x)<.01&&Math.abs(p.z-next.z)<.01);
   for(let n=0;n<90;n++)w.step(r.bodies,[{x:0,z:0}]);assert.ok(Math.abs(p.x-next.x)<.04&&Math.abs(p.z-next.z)<.04);assert.equal(p.portalLock,'violet');
   r.soft.translate(p,1,0,0,true);w.step(r.bodies,[{x:0,z:0}]);assert.equal(p.portalLock,null);r.soft.translate(p,-1,0,0,true);
  }
 }
 const r=chamber(3);r.world.blocks.push({x:6,y:2,z:2});r.world.blockColumns.get('6,2').push(2);r.world.portals[1].y=2;r.world._blockBoxes=null;
 r.world.step(r.bodies,[{x:0,z:0}]);assert.ok(Math.abs(r.players[0].y-2)<.01);
});
test('an arrival disables its own portal and immediate predecessor without disabling an entire longer chain',()=>{
 const r=chamber(),w=r.world,p=r.players[0];Object.assign(p,{x:6,z:2,portalLock:'violet'});r.soft.reset();
 assert.deepEqual(w.portals.map(q=>w.portalInactive(q,r.bodies)),[true,true,false,false]);
 assert.equal(w.portalCharge(w.portals[0],r.bodies),0);
 r.soft.translate(p,.7,0,0,true);assert.deepEqual(w.portals.map(q=>w.portalInactive(q,r.bodies)),[true,true,false,false]);
 r.soft.translate(p,.11,0,0,true);assert.ok(w.portals.every(q=>!w.portalInactive(q,r.bodies)));
 const pair=chamber(2);Object.assign(pair.players[0],{x:6,z:2,portalLock:'violet'});assert.deepEqual(pair.world.portals.map(q=>pair.world.portalInactive(q,pair.bodies)),[true,true]);
});
test('a blocked next destination is never skipped; crates and terrain block transport and display consistently',()=>{
 for(const kind of ['crate','wall','jelly']){
  const r=chamber(3),w=r.world,p=r.players[0];
  const blocker={x:6,y:0,z:2,state:'alive',kind:kind==='crate'?'crate':undefined,portalLock:'violet',vx:0,vz:0,vy:0};
  if(kind==='wall')w.obstacles.push({x:6,z:2,half:.3,minY:0,height:1});else r.bodies.push(blocker);
  const events=w.step(r.bodies,[{x:0,z:0}]);assert.ok(!events.some(e=>e.type==='portal'));assert.ok(Math.abs(p.x-2)<.01);assert.equal(p.portalBlocked,true);assert.equal(w.portalInactive(w.portals[0],r.bodies),true);
  if(kind==='wall'){w.obstacles=[];w._collisionCache=null;}else{blocker.x=8;r.soft.reset();}
  const released=w.step(r.bodies,[{x:0,z:0}]);assert.ok(released.some(e=>e.type==='portal'&&e.player===0));assert.ok(Math.abs(p.x-6)<.01&&Math.abs(p.z-2)<.01,'must use portal two rather than skipping to three');
 }
});
test('chains of different colours and portals on different floors stay independent, including lock release',()=>{
 const r=chamber(3),w=r.world,p=r.players[0];w.portals.splice(1,0,{x:1,y:0,z:8,color:'amber'},{x:8,y:0,z:1,color:'amber'});
 assert.equal(w.portalDestination(w.portals[0]),w.portals[3]);assert.equal(w.portalDestination(w.portals[1]),w.portals[2]);assert.equal(w.portalDestination(w.portals[4]),w.portals[0]);
 Object.assign(p,{x:6,z:2,y:1,portalLock:'violet',portalCooldown:0});w.beforeFeatures(r.bodies,r.soft,.01);assert.equal(p.portalLock,null);
 assert.ok(!w.portalLocked(w.portals[3],r.bodies));
 const lone={x:3,y:0,z:3,color:'amber'};w.portals=[lone];assert.equal(w.portalInactive(lone,r.bodies),true);assert.equal(w.portalCharge(lone,r.bodies),0);
});
test('editor accepts large chains, preserves order on repaint, allows ordering and moving, and roundtrips with history',()=>{
 const m=new Model(L.blank());m.change(()=>m.paint('spawn-0',15,15));m.change(()=>m.paint('goal-0',15,14));
 for(let n=0;n<20;n++)m.change(()=>m.paint('portal-violet',n%10,Math.floor(n/10),{voxel:true,y:0}));
 for(let n=0;n<3;n++)m.change(()=>m.paint('portal-amber',n,4,{voxel:true,y:0}));
 assert.equal(m.map.portals.length,23);assert.deepEqual(L.issues(m.map),[]);const before=L.copy(m.map);
 m.change(()=>m.paint('portal-violet',0,0,{voxel:true,y:0}));assert.deepEqual(m.map,before);
 m.orderPortal(0,20);assert.deepEqual(m.map.portals[19],before.portals[0]);assert.deepEqual(m.map.portals.filter(p=>p.color==='amber'),before.portals.filter(p=>p.color==='amber'));
 m.undo();assert.deepEqual(m.map,before);m.redo();m.move('portals',19,10,7,2);assert.equal(m.map.portals[19].x,10);assert.deepEqual(L.read(JSON.stringify(m.map)),m.map);
 assert.throws(()=>m.orderPortal(0,21));m.remove('portals',1);assert.equal(m.map.portals.filter(p=>p.color==='violet').length,19);
});
