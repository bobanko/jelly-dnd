const {test}=require('node:test');
const assert=require('node:assert/strict');
const {World}=require('../physics');
const {System}=require('../soft-body');
function scene(positions=[[2,2,0]]){
 const floor=new Set();for(let x=0;x<=9;x++)for(let z=0;z<=9;z++)floor.add(`${x},${z}`);
 const world=new World(floor,[],[]),soft=new System();world.soft=soft;
 const players=positions.map(([x,z,y])=>({x,z,y,vx:0,vz:0,vy:0,state:'alive',deaths:0,spawn:{x,z}}));
 return {world,soft,players,step(input=[],count=1){const events=[];for(let n=0;n<count;n++)events.push(...world.step(players,input));return events;}};
}

test('same-color plates activate every linked bridge and spike from either plate',()=>{
 const {world}=scene();
 world.plates=[{id:'a',color:'red',x:2,z:2,y:0},{id:'b',color:'red',x:5,z:2,y:1},{id:'c',color:'blue',x:7,z:2,y:0}];
 world.bridges=[{plate:0},{plate:1},{plate:2}];
 for(const body of [{x:2,z:2,y:0},{x:5,z:2,y:1},{x:5,z:2,y:1,kind:'crate'}]){
  world.refresh([body]);assert.deepEqual([...world.held],[0,1]);
  for(const plate of ['a','b','red'])assert.equal(world.spikeState({plate}).dangerous,true);
  assert.equal(world.spikeState({plate:'c'}).dangerous,false);
 }
 for(const body of [{x:5,z:2,y:0},{x:5,z:2,y:1,state:'dead'}]){
  world.refresh([body]);assert.equal(world.held.size,0);
 }
 world.refresh([{x:2,z:2,y:0},{x:5,z:2,y:1}]);assert.equal(world.active(0,world.bodies),true);
 world.refresh([{x:5,z:2,y:1}]);assert.equal(world.active(0,world.bodies),true);
 world.refresh([]);assert.equal(world.active(0,world.bodies),false);
});

test('spikes support constant states and proportional custom cycles without changing legacy timing',()=>{
 const g=scene();
 for(const time of [0,2.8,100]){g.world.featureTime=time;assert.equal(g.world.spikeState({cycle:0}).dangerous,true);assert.deepEqual(g.world.spikeState({cycle:0,enabled:false}),{extension:0,stage:'hidden',dangerous:false,warning:false});}
 for(const time of [0,2.15,3,4.8,5.65]){g.world.featureTime=time;const legacy=g.world.spikeState({});g.world.featureTime=time*2;const slower=g.world.spikeState({cycle:11.6});assert.equal(slower.stage,legacy.stage);assert.ok(Math.abs(slower.extension-legacy.extension)<1e-10);}
 g.world.featureTime=0;assert.equal(g.world.spikeState({enabled:false,cycle:10}).stage,'hidden');
});

test('a bound pressure plate directly controls floor or wall spikes and ignores timer and flag',()=>{
 const g=scene(),plate={id:'trigger',x:2,z:2,y:1},trap={plate:'trigger',cycle:0,enabled:false,face:'north'};g.world.plates.push(plate);g.world.refresh(g.players);
 assert.equal(g.world.spikeState(trap).dangerous,false);
 g.players[0].y=1;assert.equal(g.world.spikeState(trap).extension,1);
 g.players[0].x=3;assert.equal(g.world.spikeState(trap).extension,0);
 g.players[0].x=2;g.players[0].state='dead';assert.equal(g.world.spikeState(trap).extension,0);
 const crate={x:2,z:2,y:1,kind:'crate',state:'alive'};g.world.refresh([crate]);assert.equal(g.world.spikeState(trap).dangerous,true);
 assert.equal(g.world.spikeState({...trap,plate:'missing'}).extension,0);
});
test('goal activation requires a living jelly centred on the same floor',()=>{
 const g=scene(),goal={x:2,z:2},p=g.players[0];
 assert.equal(g.world.goalActive(goal,p),true);
 for(const override of [{x:2.4},{y:.8},{state:'dead'},{kind:'crate'}]){
  assert.equal(g.world.goalActive(goal,{...p,...override}),false);
 }
 assert.equal(g.world.goalActive(goal,undefined),false);
 g.world.heights.set('2,2',1);
 assert.equal(g.world.goalActive(goal,p),false);
 assert.equal(g.world.goalActive(goal,{...p,y:1}),true);
});

test('finish tile charge increases with approach and ignores unsupported or dead bodies',()=>{
 const {world}=scene(),goal={x:2,z:2},p={x:2,z:2,y:0,state:'alive'};
 const charges=[.8,.65,.5,.32,0].map(offset=>world.goalCharge(goal,{...p,x:2+offset}));
 assert.equal(charges[0],0);assert.equal(charges.at(-1),1);
 assert.ok(charges[1]>0&&charges[1]<charges[2]&&charges[2]<charges[3]);
 for(const override of [{y:.8},{state:'falling'},{state:'dead'},{kind:'crate'}])assert.equal(world.goalCharge(goal,{...p,...override}),0);
});

test('lift carries the whole lattice up one unit, permits an upper exit and returns empty',()=>{
 const g=scene();g.world.lifts.push({x:2,z:2,base:0,top:1,height:0,target:0});g.world.heights.set('3,2',1);
 g.step([],230);assert.equal(g.world.lifts[0].height,1);assert.ok(Math.abs(g.players[0].y-1)<.08);assert.equal(g.players[0].state,'alive');
 const b=g.soft.get(g.players[0]);assert.ok(Math.min(...b.positions.map(p=>p[1]))>.95);
 g.step([{x:1,z:0}],55);g.step([],300);
 assert.ok(g.players[0].x>2.65);assert.ok(Math.abs(g.players[0].y-1)<.08);assert.equal(g.players[0].deaths,0);assert.equal(g.world.lifts[0].height,0);
});
test('upper platform side blocks entry from below; dropping to a lower floor lands safely',()=>{
 const g=scene([[1,2,0]]);g.world.heights.set('2,2',1);
 g.step([{x:1,z:0}],90);assert.ok(g.players[0].x<1.4);assert.ok(g.players[0].y<.1);
 const h=scene([[2,2,1]]);h.world.heights.set('2,2',1);h.step([{x:1,z:0}],70);h.step([],180);
 assert.ok(h.players[0].x>2.7);assert.ok(Math.abs(h.players[0].y)<.08);assert.equal(h.players[0].deaths,0);assert.equal(h.players[0].state,'alive');
});
test('low spikes kill on contact and only the affected cube respawns',()=>{
 const g=scene([[2,2,0],[6,6,0]]);g.world.spikes.push({x:3,z:2});let events=[];
 for(let n=0;n<100&&g.players[0].state!=='dead';n++)events.push(...g.step([{x:1,z:0}]));
 assert.equal(g.players[0].state,'dead');assert.equal(g.players[0].deaths,1);assert.ok(events.some(e=>e.reason==='spikes'));assert.equal(g.players[1].state,'alive');
 g.step([],200);assert.equal(g.players[0].state,'alive');assert.ok(Math.abs(g.players[0].x-2)<.04);assert.equal(g.players[1].deaths,0);
});
test('a pushed cube can be killed by spikes',()=>{
 const g=scene([[2,2,0],[2.82,2,0]]);g.world.spikes.push({x:3.55,z:2});
 for(let n=0;n<150&&g.players[1].state!=='dead';n++)g.step([{x:1,z:0}]);
 assert.equal(g.players[1].state,'dead');assert.equal(g.players[1].deathReason,'spikes');assert.equal(g.players[0].state,'alive');
});

test('spikes show harmless tips for a warning beat before the next full rise',()=>{
 const g=scene(),trap={x:3,z:2};g.world.spikes.push(trap);
 g.world.featureTime=2;assert.equal(g.world.spikeState(trap).extension,1);
 g.world.featureTime=2.15;assert.ok(Math.abs(g.world.spikeState(trap).extension-.5)<1e-10);
 for(const time of [2.31,3,4,4.49]){g.world.featureTime=time;const state=g.world.spikeState(trap);assert.equal(state.extension,0);assert.equal(state.dangerous,false);assert.equal(g.world.debugBoxes().some(b=>b.kind==='spikes'),false);}
 g.world.featureTime=4.575;assert.ok(Math.abs(g.world.spikeState(trap).extension-.15)<1e-10);
 for(const time of [4.66,5,5.49]){g.world.featureTime=time;const state=g.world.spikeState(trap);assert.equal(state.stage,'peeking');assert.equal(state.extension,.3);assert.equal(state.warning,true);assert.equal(state.dangerous,false);assert.equal(g.world.debugBoxes().some(b=>b.kind==='spikes'),false);}
 g.world.featureTime=5.65;const state=g.world.spikeState(trap),box=g.world.debugBoxes().find(b=>b.kind==='spikes');
 assert.ok(Math.abs(state.extension-.65)<1e-10);assert.ok(state.dangerous);assert.ok(Math.abs(box.maxY-(.015+.24*state.extension))<1e-10);
 g.world.featureTime=5.8;assert.equal(g.world.spikeState(trap).extension,1);
});

test('a jelly can cross a hidden spike trap, but camping there is lethal when it rises',()=>{
 const pass=scene([[2,2,0]]);pass.world.spikes.push({x:3,z:2});pass.world.featureTime=2.4;
 pass.step([{x:1,z:0}],115);pass.step([],50);
 assert.ok(pass.players[0].x>3.65);assert.equal(pass.players[0].state,'alive');assert.equal(pass.players[0].deaths,0);
 const camp=scene([[3,2,0]]);camp.world.spikes.push({x:3,z:2});camp.world.featureTime=2.4;
 camp.step([],240);assert.equal(camp.players[0].state,'alive');assert.equal(camp.players[0].deaths,0);
 camp.step([],120);assert.equal(camp.world.spikeState(camp.world.spikes[0]).stage,'peeking');assert.equal(camp.players[0].state,'alive');
 for(let n=0;n<80&&camp.players[0].state!=='dead';n++)camp.step();
 assert.equal(camp.players[0].state,'dead');assert.equal(camp.players[0].deathReason,'spikes');
});

test('spike phase offsets differ, snapshots rewind their shared clock and reset restarts the cycle',()=>{
 const g=scene(),a={x:3,z:2},b={x:6,z:6,offset:2.4};g.world.spikes.push(a,b);
 assert.equal(g.world.spikeState(a).extension,1);assert.equal(g.world.spikeState(b).extension,0);
 g.world.featureTime=2.15;const saved=g.world.featureSnapshot(),state=g.world.spikeState(a);
 g.world.beforeFeatures(g.players,g.soft,.1);assert.notDeepEqual(g.world.spikeState(a),state);
 g.world.restoreFeatures(saved);assert.deepEqual(g.world.spikeState(a),state);
 g.world.resetFeatures();assert.equal(g.world.featureTime,0);assert.equal(g.world.spikeState(a).extension,1);assert.equal(g.world.spikeState(b).extension,0);
});
test('matching floor portals preserve deformation, transfer height and do not bounce repeatedly',()=>{
 const g=scene();g.world.heights.set('6,6',1);g.world.heights.set('7,6',1);
 g.world.portals.push({x:2,z:2,color:'violet'},{x:6,z:6,color:'violet'},{x:3,z:3,color:'amber'},{x:8,z:8,color:'amber'});
 const events=g.step();assert.ok(events.some(e=>e.type==='portal'));assert.ok(Math.abs(g.players[0].x-6)<.01);assert.ok(Math.abs(g.players[0].y-1)<.05);assert.equal(g.players[0].portalLock,'violet');
 g.step([],200);assert.ok(Math.abs(g.players[0].x-6)<.04);assert.equal(g.players[0].deaths,0);
 const p=g.players[0],exit=g.world.portals[1];assert.equal(g.world.portalInactive(exit,g.players),true);
 g.soft.translate(p,.7,0,0,true);g.step();assert.equal(p.portalLock,'violet');assert.equal(g.world.portalInactive(exit,g.players),true);
 g.soft.translate(p,.3,0,0,true);g.step();assert.equal(p.portalLock,null);assert.equal(g.world.portalInactive(exit,g.players),false);
 g.soft.translate(p,-1,0,0,true);g.step();assert.ok(Math.abs(p.x-2)<.04);assert.ok(Math.abs(p.y)<.05);
});

test('portal brightness grows smoothly as the jelly footprint covers the portal',()=>{
 const g=scene(),portal={x:3,z:3,color:'violet'};g.world.portals.push(portal,{x:8,z:8,color:'violet'});
 const charges=[.9,.65,.5,.38,0].map(offset=>g.world.portalCharge(portal,[{x:3+offset,z:3,y:0,state:'alive'}]));
 assert.equal(charges[0],0);assert.equal(charges.at(-1),1);
 for(let i=1;i<4;i++)assert.ok(charges[i]>charges[i-1]);
 assert.equal(g.world.portalCharge(portal,[{x:3,z:3,y:0,state:'alive',portalLock:'violet'}]),0,'arrival lock suppresses portal charging');
});

test('arrival locks remain local to the overlapped portal and respect height and life state',()=>{
 const g=scene(),portal={x:3,z:3,color:'violet'},p={x:3,z:3,y:0,state:'alive',portalLock:'violet'};
 assert.equal(g.world.portalLocked(portal,[p]),true);
 assert.equal(g.world.portalLocked(portal,[{...p,x:3.7}]),true,'part of the jelly still overlaps the portal slab');
 for(const override of [{x:3.8},{y:1},{state:'dead'},{state:'falling'},{kind:'crate'},{portalLock:null},{portalLock:'amber'}])assert.equal(g.world.portalLocked(portal,[{...p,...override}]),false);
 assert.equal(g.world.portalLocked({...portal,x:7},[p]),false,'the distant same-colour portal remains active');
});

test('another jelly waits until the arrival fully clears an inactive portal',()=>{
 const g=scene([[2.7,2,0],[2,2,0]]);g.world.portals.push({x:2,z:2,color:'violet'},{x:6,z:6,color:'violet'});
 g.players[0].portalLock='violet';
 assert.equal(g.world.afterFeatures(g.players,g.soft).length,0);assert.equal(g.players[1].portalBlocked,true);
 g.players[0].x=3;g.soft.reset();
 const events=g.world.afterFeatures(g.players,g.soft);
 assert.ok(events.some(e=>e.type==='portal'&&e.player===1));assert.ok(Math.abs(g.players[1].x-6)<.01);
});

test('portal charge ignores dead cubes, crates and cubes on a different floor',()=>{
 const g=scene(),portal={x:6,z:6,color:'amber'};g.world.portals.push(portal,{x:8,z:8,color:'amber'});g.world.heights.set('6,6',1);
 const bodies=[{x:6,z:6,y:1,state:'dead'},{x:6,z:6,y:0,state:'alive'},{x:6,z:6,y:1.8,state:'alive'},{x:6,z:6,y:1,state:'alive',kind:'crate'}];
 assert.equal(g.world.portalCharge(portal,bodies),0);
 bodies.pop();bodies.push({x:6,z:6,y:1,state:'alive'});assert.equal(g.world.portalCharge(portal,bodies),1);
});
test('an occupied portal exit waits rather than overlapping bodies',()=>{
 const g=scene([[2,2,0],[6,6,1]]);g.world.heights.set('6,6',1);g.world.portals.push({x:2,z:2,color:'violet'},{x:6,z:6,color:'violet'});
 g.step();assert.ok(Math.abs(g.players[0].x-2)<.01);assert.equal(g.players[0].portalBlocked,true);
 g.soft.translate(g.players[1],1.5,0,0,true);g.step();assert.ok(Math.abs(g.players[0].x-6)<.02);
});
test('feature snapshots restore lift state and collider bounds follow its current height',()=>{
 const g=scene();g.world.lifts.push({x:2,z:2,base:0,top:1,height:0,target:0});g.world.spikes.push({x:4,z:4});g.world.portals.push({x:5,z:5,color:'amber'});
 const before=g.world.featureSnapshot();g.step([],90);const height=g.world.lifts[0].height;assert.ok(height>0&&height<1);
 const boxes=g.world.debugBoxes();assert.equal(boxes.find(b=>b.kind==='lift').maxY,height);assert.ok(boxes.some(b=>b.kind==='spikes'));assert.ok(boxes.some(b=>b.kind==='portal'));
 g.world.restoreFeatures(before);assert.equal(g.world.lifts[0].height,0);assert.equal(g.world.debugBoxes().find(b=>b.kind==='lift').maxY,0);
});

test('bridge slides out and retracts continuously with matching partial floor and collider',()=>{
 const g=scene();g.world.plates.push({x:2,z:2});g.world.bridges.push({x:6,z:6,plate:0});
 assert.equal(g.world.heightAt(6,6),null);
 g.world.beforeFeatures(g.players,g.soft,1/120);
 const bridge=g.world.bridges[0];assert.ok(bridge.progress>0&&bridge.progress<.01);
 for(let n=0;n<17;n++)g.world.beforeFeatures(g.players,g.soft,1/120);
 assert.ok(bridge.progress>.2&&bridge.progress<.5);
 const bounds=g.world.debugBoxes().find(b=>b.kind==='bridge');
 assert.equal(bounds.halfZ*2,bridge.progress);assert.equal(bounds.z-bounds.halfZ,5.5);
 assert.equal(g.world.heightAt(6,5.55),0);assert.equal(g.world.heightAt(6,5.5+bridge.progress+.02),null);
 for(let n=0;n<150;n++)g.world.beforeFeatures(g.players,g.soft,1/120);
 assert.equal(bridge.progress,1);assert.equal(g.world.heightAt(6,6.4),0);
 g.players[0].x=3;g.world.beforeFeatures(g.players,g.soft,1/120);
 assert.ok(bridge.progress>0.99&&bridge.progress<1);
 for(let n=0;n<160;n++)g.world.beforeFeatures(g.players,g.soft,1/120);
 assert.equal(bridge.progress,0);assert.equal(g.world.heightAt(6,6),null);
 assert.equal(g.world.debugBoxes().some(b=>b.kind==='bridge'),false);
});

test('bridge motion is independent of step size and mid-motion snapshots preserve momentum',()=>{
 const setup=()=>{const g=scene();g.world.plates.push({x:2,z:2});g.world.bridges.push({x:6,z:6,plate:0});return g;};
 const a=setup(),b=setup();
 for(let n=0;n<20;n++)a.world.beforeFeatures(a.players,a.soft,.01);
 for(let n=0;n<24;n++)b.world.beforeFeatures(b.players,b.soft,1/120);
 assert.ok(Math.abs(a.world.bridges[0].progress-b.world.bridges[0].progress)<1e-12);
 const saved=a.world.featureSnapshot(),bounds=a.world.bridgeBounds(0);
 a.players[0].x=3;for(let n=0;n<12;n++)a.world.beforeFeatures(a.players,a.soft,.01);
 a.world.restoreFeatures(saved);assert.deepEqual(a.world.bridgeBounds(0),bounds);
 assert.equal(a.world.bridges[0].velocity,saved.bridges[0].velocity);
 a.world.resetFeatures();assert.equal(a.world.bridges[0].progress,0);assert.equal(a.world.bridges[0].velocity,0);
});

test('releasing the button retracts an occupied bridge and the crossing jelly falls',()=>{
 const g=scene([[2,2,0],[6,5.1,0]]);g.world.plates.push({x:2,z:2});g.world.bridges.push({x:6,z:6,plate:0});
 g.step([],160);assert.equal(g.world.bridges[0].progress,1);
 g.step([{}, {x:0,z:1}],60);g.step([],35);
 assert.ok(Math.abs(g.players[1].z-6)<.5);assert.equal(g.players[1].state,'alive');
 g.soft.translate(g.players[0],1,0,0,true);g.step([],1);
 assert.equal(g.world.held.has(0),false);assert.ok(g.world.bridges[0].progress<1);
 const events=g.step([],180);assert.ok(events.some(e=>e.type==='fall'&&e.player===1));
 assert.equal(g.world.bridges[0].progress,0);
});
