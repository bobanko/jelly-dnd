const {test}=require('node:test');
const assert=require('node:assert/strict');
const {World,SIZE,HALF,STEP}=require('../physics.js');
const body=(x,z)=>({x,z,vx:0,vz:0,impact:0});
function arena(){const floor=new Set();for(let x=0;x<12;x++)for(let z=0;z<12;z++)floor.add(`${x},${z}`);return new World(floor,[],[]);}
function advance(w,b,input,n=120){for(let i=0;i<n;i++)w.step(b,input);}
function separated(b){if(b.some(p=>p.state&&p.state!=='alive'))return;assert.ok(Math.abs(b[0].x-b[1].x)>=SIZE-1e-6||Math.abs(b[0].z-b[1].z)>=SIZE-1e-6,'bodies overlap');}
function supported(w,p){if(!p.state||p.state==='alive')assert.equal(w.supported(p),true,'grounded body has no support');}
test('acceleration, normalized diagonal movement and friction',()=>{
 const w=arena(),a=[body(3,3)],b=[body(3,3)];
 advance(w,a,[{x:1,z:0}],30);advance(w,b,[{x:1,z:1}],30);
 assert.ok(a[0].x>3&&a[0].x<4);assert.ok(Math.abs(Math.hypot(b[0].x-3,b[0].z-3)-(a[0].x-3))<1e-7);
 const x=a[0].x;advance(w,a,[{x:0,z:0}]);assert.ok(a[0].x>x);assert.equal(a[0].vx,0);
});
test('contact pushes an idle cube and transfers momentum',()=>{
 const w=arena(),b=[body(3,5),body(4,5)];advance(w,b,[{x:1,z:0},{x:0,z:0}]);
 assert.ok(b[1].x>4.5);assert.ok(b[1].vx>0);separated(b);
});
test('pushing into a wall cannot send either cube through it',()=>{
 const w=arena();w.obstacles.push({x:12,z:5,half:.5});const b=[body(9.8,5),body(10.8,5)];
 for(let n=0;n<600;n++){w.step(b,[{x:1,z:0},{x:0,z:0}]);separated(b);b.forEach(p=>supported(w,p));}
 assert.ok(b[1].x<=11.5-HALF+1e-6);
});
test('opposing input remains separated in a narrow corridor',()=>{
 const floor=new Set();for(let x=0;x<10;x++)floor.add(`${x},3`);
 const walls=[];for(let x=0;x<10;x++)for(const z of [2,4])walls.push({x,z,half:.5});const w=new World(floor,[],[],walls),b=[body(3,3),body(5,3)];
 for(let n=0;n<600;n++){w.step(b,[{x:1,z:.2},{x:-1,z:-.2}]);separated(b);b.forEach(p=>supported(w,p));}
});
test('walking into a hole falls under gravity, dies and respawns with no momentum',()=>{
 const w=arena();w.floor.delete('4,4');const b=[body(3,3)],events=[];
 for(let n=0;n<120&&b[0].state!=='falling';n++)events.push(...w.step(b,[{x:1,z:1}]));
 assert.equal(b[0].state,'falling');assert.ok(events.some(e=>e.type==='fall'));
 advance(w,b,[],15);assert.ok(b[0].y<0&&b[0].vy<0);
 for(let n=0;n<120&&b[0].state!=='dead';n++)w.step(b,[]);
 assert.equal(b[0].state,'dead');assert.equal(b[0].deaths,1);
 advance(w,b,[],90);assert.equal(b[0].state,'alive');assert.equal(b[0].x,3);assert.equal(b[0].z,3);assert.equal(b[0].y,0);assert.equal(b[0].vx,0);
});
test('a cube can push its companion off the edge',()=>{
 const w=arena(),b=[body(10.1,5),body(11.1,5)];let pushedOff=false;
 for(let n=0;n<200;n++){w.step(b,[{x:1,z:0},{x:0,z:0}]);if(b[1].state==='falling'){pushedOff=true;break;}}
 assert.ok(pushedOff);assert.equal(b[0].state,'alive');
});
test('static obstacles still collide, but missing floor is not a wall',()=>{
 const w=arena();w.obstacles=[{x:6,z:3,half:.17}];const b=[body(5,3)];
 advance(w,b,[{x:1,z:0}],240);assert.ok(b[0].x<=6-.17-HALF+1e-6);assert.equal(b[0].state,'alive');
});
test('closed bridges cause a fall; powered bridges hold grounded cubes only',()=>{
 const floor=new Set(['0,0','1,0','2,0','3,0','0,2']);
 const make=()=>new World(floor,[{x:1,z:0,plate:0}],[{x:0,z:2}]);
 const closed=make(),a=[body(0,0)];for(let n=0;n<90&&a[0].state!=='falling';n++)closed.step(a,[{x:1,z:0}]);assert.equal(a[0].state,'falling');
 const w=make(),b=[body(0,0),body(.1,2.1)];advance(w,b,[{x:1,z:0}],45);assert.ok(b[0].x>.5);assert.equal(b[0].state,'alive');
 b[1].state='falling';w.refresh(b);assert.equal(w.active(0,b),false);assert.equal(w.held.has(0),false);
 w.step(b,[]);assert.equal(b[0].state,'falling');
});
test('respawn finds a free nearby tile when the starting point is occupied',()=>{
 const w=arena(),a=body(2,2),b=body(2,2);Object.assign(a,{state:'dead',spawn:{x:2,z:2},respawnTimer:0,y:-4,deaths:1});
 w.step([a,b],[]);assert.equal(a.state,'alive');assert.ok(Math.hypot(a.x-2,a.z-2)>0);separated([a,b]);supported(w,a);
});
test('both cubes can fall and respawn independently',()=>{
 const w=arena(),b=[body(3,3),body(5,3)];w.step(b,[]);b.forEach(p=>p.z=15);
 advance(w,b,[],220);assert.ok(b.every(p=>p.state==='alive'&&p.deaths===1&&p.z===3));separated(b);
});
test('long deterministic two-body run preserves map and contact constraints',()=>{
 const w=arena(),b=[body(4,5),body(5,5)];w.floor.delete('6,6');
 let seed=1234;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296*2-1;};
 let input=[];
 for(let n=0;n<6000;n++){if(n%30===0)input=b.map(()=>({x:random(),z:random()}));w.step(b,input,STEP);separated(b);b.forEach(p=>supported(w,p));}
});
