const {test}=require('node:test'),assert=require('node:assert/strict');
const {World}=require('./physics'),{System}=require('./soft-body'),L=require('./levels'),{Model}=require('./editor-model');
function scene(positions=[[2,3,0]],rigid=false){
 const floor=new Set();for(let x=0;x<=10;x++)for(let z=0;z<=6;z++)floor.add(`${x},${z}`);
 const world=new World(floor,[],[]),soft=new System();world.soft=soft;
 const players=positions.map(([x,z,y],i)=>({x,z,y,state:'alive',kind:rigid&&i===0?'crate':undefined,vx:0,vy:0,vz:0,spawn:{x,z},deaths:0}));
 return {world,soft,players,step(count,input=[]){const events=[];for(let i=0;i<count;i++)events.push(...world.step(players,input));return events;}};
}
function lane(world,speed=1.2){world.conveyors=Array.from({length:7},(_,i)=>({x:i+1,z:3,dx:1,dz:0,speed}));}

test('contact coverage blends at entry and remains constant at adjacent conveyor seams',()=>{
 const g=scene();lane(g.world);
 for(const x of [1,1.5,2,2.5,3,3.5,4])assert.ok(Math.abs(g.world.conveyorVelocity({...g.players[0],x}).x-1.2)<1e-10);
 const edge=g.world.conveyorVelocity({...g.players[0],x:.5});assert.ok(Math.abs(edge.x-.6)<1e-10);
 assert.equal(g.world.conveyorJoined(g.world.conveyors[0],1),true);assert.equal(g.world.conveyorJoined(g.world.conveyors[0],-1),false);
 for(const override of [{state:'dead'},{state:'falling'},{y:.8},{launchTimer:1},{vy:2}])assert.deepEqual(g.world.conveyorVelocity({...g.players[0],...override}),{x:0,z:0});
 g.world.heights.set('2,3',1);assert.equal(g.world.conveyorVelocity(g.players[0]).x,0);assert.ok(Math.abs(g.world.conveyorVelocity({...g.players[0],y:1}).x-1.2)<1e-10);
 assert.equal(g.world.conveyorJoined(g.world.conveyors[0],1),false,'different elevations are separate belts');
});

test('jelly accelerates gradually and crosses several tiles without seam stalls',()=>{
 const g=scene();lane(g.world);g.step(1);assert.ok(g.players[0].vx>0&&g.players[0].vx<.3);
 let minimum=Infinity;
 for(let n=0;n<420;n++){g.step(1);if(g.players[0].x>2.5&&g.players[0].x<6.4)minimum=Math.min(minimum,g.players[0].vx);}
 assert.ok(g.players[0].x>5.7,`x=${g.players[0].x}`);assert.ok(minimum>1,`seam speed=${minimum}`);
 assert.equal(g.players[0].state,'alive');assert.ok(Math.abs(g.players[0].y)<.05);assert.equal(g.soft.get(g.players[0]).sleeping,false);
});

test('walking combines with belt motion, including against it and across it',()=>{
 const g=scene([[4,3,0]]);lane(g.world);g.step(80,[{x:-1,z:0}]);assert.ok(g.players[0].x<3.5);
 const h=scene([[4,3,0]]);lane(h.world);h.step(28,[{x:0,z:1}]);assert.ok(h.players[0].x>4.1&&h.players[0].z>3.3);
});

test('conveyor wakes a resting crate and carries a stacked passenger once',()=>{
 const g=scene([[2,3,0],[2,3,.83]],true);g.step(340);
 assert.ok(g.soft.get(g.players[0]).sleeping);assert.ok(g.soft.get(g.players[1]).sleeping);
 lane(g.world,.85);g.step(180);
 const [crate,passenger]=g.players;
 assert.ok(crate.x>2.9);assert.ok(Math.abs(passenger.x-crate.x)<.16,`stack separation ${passenger.x-crate.x}`);
 assert.ok(passenger.y>crate.y+.65);assert.equal(crate.state,'alive');assert.equal(passenger.state,'alive');
});

test('belt direction works on all four axes and walls still stop transported jellies',()=>{
 for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
  const g=scene([[4,3,0]]);g.world.conveyors=[{x:4,z:3,dx,dz,speed:.8}];g.step(40);
  assert.ok((g.players[0].x-4)*dx+(g.players[0].z-3)*dz>.12);
 }
 const g=scene([[2.5,3,0]]);lane(g.world);g.world.obstacles.push({x:4,z:3,half:.5,height:2});g.step(280);
 assert.ok(g.players[0].x<3.2);assert.equal(g.players[0].state,'alive');
});

test('a conveyor can push a jelly off an open edge into the normal death and respawn lifecycle',()=>{
 const g=scene([[2,3,0]]);for(const key of [...g.world.floor])if(Number(key.split(',')[0])>3)g.world.floor.delete(key);
 g.world.conveyors=[2,3].map(x=>({x,z:3,dx:1,dz:0,speed:1.2}));
 const events=g.step(480);assert.ok(events.some(e=>e.type==='fall'));assert.ok(events.some(e=>e.type==='death'));assert.ok(events.some(e=>e.type==='respawn'));
});

test('conveyor editing, directions, speed, height and old version-1 map files roundtrip',()=>{
 const m=new Model(L.blank());m.begin();for(let x=1;x<=4;x++)m.paint('conveyor',x,2,{height:1,dx:1,dz:0,speed:1.5});m.commit();
 assert.equal(m.map.conveyors.length,4);m.undo();assert.equal(m.map.conveyors.length,0);m.redo();
 const map=L.read(JSON.stringify(m.map)),runtime=L.instantiate(map,require('./physics'),require('./soft-body'));
 assert.deepEqual(runtime.world.conveyors,map.conveyors);assert.equal(runtime.world.heightAt(2,2),1);
 m.change(()=>m.paint('conveyor',2,2,{dx:0,dz:-1,speed:.5}));assert.equal(m.at('conveyors',2,2).dz,-1);
 m.move('conveyors',1,5,2);assert.equal(m.at('conveyors',5,2).speed,.5);
 m.change(()=>m.paint('lift',5,2));assert.equal(m.at('conveyors',5,2),undefined);
 const old=L.defaultLevel();delete old.conveyors;assert.deepEqual(L.read(old).conveyors,[]);
 for(const values of [{dx:1,dz:1,speed:1},{dx:0,dz:0,speed:1},{dx:1,dz:0,speed:0},{dx:1,dz:0,speed:10}]){const invalid=L.defaultLevel();invalid.conveyors=[{x:2,z:2,...values}];assert.throws(()=>L.read(invalid));}
});
