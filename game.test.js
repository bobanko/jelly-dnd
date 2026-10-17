const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function game(){
 const noop=()=>{},ctx=new Proxy({createRadialGradient:()=>({addColorStop:noop})},{get:(o,k)=>o[k]??noop});
 const element=()=>({addEventListener:noop,getContext:()=>ctx,classList:{toggle:noop},setAttribute:noop});
 const elements={},listeners={};
 const sandbox={innerWidth:1440,innerHeight:900,devicePixelRatio:1,JellyEffects:require('./game-effects.js'),JellyPhysics:require('./physics.js'),JellySoftBody:require('./soft-body.js'),JellyGPU:{...require('./webgpu-renderer.js'),Renderer:class {constructor(){this.ready=true;}async init(){}render(){}}},document:{addEventListener:()=>{},querySelector:s=>elements[s]??=element(),querySelectorAll:()=>[element(),element()]},addEventListener:(k,f)=>listeners[k]=f,requestAnimationFrame:noop};
 vm.createContext(sandbox);vm.runInContext(fs.readFileSync('game.js','utf8'),sandbox);
 const codeFor=key=>({arrowup:'ArrowUp',arrowdown:'ArrowDown',arrowleft:'ArrowLeft',arrowright:'ArrowRight'}[key]||(/^\d$/.test(key)?'Digit'+key:'Key'+key.toUpperCase()));
 return {run:s=>vm.runInContext(s,sandbox),key:(key,code=codeFor(key),options={})=>listeners.keydown({key,code,preventDefault:noop,...options}),up:(key,code=codeFor(key))=>listeners.keyup({key,code,preventDefault:noop}),blur:()=>listeners.blur()};
}
test('physical WASD works on Russian layout and releases after a layout change',()=>{
 for(const [key,code,axis,sign] of [['ц','KeyW','z',-1],['ф','KeyA','x',-1],['ы','KeyS','z',1],['в','KeyD','x',1]]){
  const g=game(),before=g.run('players[0].'+axis);
  g.key(key,code);g.run('simulate(.05)');
  assert.ok((g.run('players[0].'+axis)-before)*sign>0);
  g.up(code.slice(3).toLowerCase(),code);
  assert.equal(g.run('heldKeys.size'),0);
 }
});
test('shortcuts follow physical positions and movement ignores repeat and modifier shortcuts',()=>{
 const g=game();g.key('Ц','KeyW');g.key('Ц','KeyW',{repeat:true});
 assert.equal(g.run('moves'),1);
 g.run('simulate(.05)');g.key('я','KeyZ');assert.equal(g.run('players[0].z'),8);
 g.key('й','KeyQ');assert.equal(g.run('targetAngle'),-Math.PI/2);
 g.key('у','KeyE');assert.equal(g.run('targetAngle'),0);
 g.key('@','Digit2');assert.equal(g.run('followedPlayer'),1);
 g.key('к','KeyR');assert.equal(g.run('followedPlayer'),0);
 for(const modifier of ['ctrlKey','metaKey','altKey'])g.key('ц','KeyW',{[modifier]:true});
 assert.equal(g.run('heldKeys.size'),0);
 // A printed Latin W on another physical key must not activate WASD.
 g.key('w','KeyP');assert.equal(g.run('heldKeys.size'),0);
});

test('red jelly uses physical IJKL positions on either keyboard layout and camera key 3',()=>{
 for(const [key,code,axis,sign] of [['ш','KeyI','z',-1],['о','KeyJ','x',-1],['л','KeyK','z',1],['д','KeyL','x',1]]){
  const g=game(),before=g.run('players[2].'+axis);g.key(key,code);g.run('simulate(.05)');g.up(key,code);
  assert.ok((g.run('players[2].'+axis)-before)*sign>0);assert.equal(g.run('followedPlayer'),2);
  assert.equal(g.run('heldKeys.size'),0);g.key('3');assert.equal(g.run('followedPlayer'),2);
 }
});
test('camera follows rendered position smoothly and centers either cube at all four angles',()=>{
 const g=game();g.key('2');
 assert.equal(g.run('followedPlayer'),1);
 g.run('frame(16)');
 assert.ok(g.run('camera.x>2&&camera.x<9'));
 g.run('for(let t=32;t<4000;t+=16)frame(t)');
 assert.ok(g.run('Math.abs(camera.x-players[1].rx)<.001'));
 for(let q=0;q<4;q++){
  g.run(`angle=${q}*Math.PI/2`);
  assert.ok(g.run('Math.abs(project(players[1].rx,0,players[1].rz).x-W*.5)<.1'));
  assert.ok(g.run('Math.abs(project(players[1].rx,0,players[1].rz).y-H*.56)<.1'));
 }
 g.key('1');assert.equal(g.run('followedPlayer'),0);
 g.key('r');assert.equal(g.run('camera.x'),2);
});
test('FOV compensation follows upper floors without diving into the void during a fall',()=>{
 const g=game();
 g.run('won=true;camera.fov=85;players[0].y=1;frame(16)');
 assert.equal(g.run('camera.focusHeight'),1.42);
 g.run('players[0].y=-.01;frame(24)');
 assert.ok(g.run('Math.abs(camera.focusHeight-.41)<1e-10'));
 g.run('players[0].y=-3;players[0].state="falling";frame(32)');
 assert.equal(g.run('camera.focusHeight'),.42);
});

test('continuous keyboard motion, release friction, undo and camera-relative input',()=>{
 const g=game();g.key('w');g.run('simulate(.05)');
 assert.ok(g.run('players[0].z<8&&players[0].z>7.9'));
 assert.equal(g.run('players[0].rz===players[0].z'),true);
 g.key('z');assert.equal(g.run('players[0].z'),8);assert.equal(g.run('heldKeys.size'),0);
 g.run('targetAngle=Math.PI/2');g.key('d');g.run('simulate(.05)');assert.ok(g.run('players[0].z<8'));assert.ok(Math.abs(g.run('players[0].x')-2)<.025);
 g.up('d');g.run('for(let n=0;n<40;n++)simulate(.05)');assert.ok(Math.abs(g.run('players[0].vz'))<.002);
 g.key('arrowdown');assert.equal(g.run('followedPlayer'),1);g.blur();assert.equal(g.run('heldKeys.size'),0);
});
test('continuous route activates both plates and finishes the puzzle',()=>{
 const g=game();
 function travel(i,axis,target){
  g.run('var routeGuard=0');
  while(true){
   const position=g.run('players['+i+'].'+axis),velocity=g.run('players['+i+'].v'+axis),error=target-position;
   if(g.run('won')||Math.abs(error)<.065&&Math.abs(velocity)<.08)break;
   const direction=Math.sign(error),key=axis==='x'?(i?(direction>0?'arrowright':'arrowleft'):(direction>0?'d':'a')):(i?(direction>0?'arrowdown':'arrowup'):(direction>0?'s':'w'));
   if(Math.abs(error)>.04)g.key(key);
   g.run('simulate(1/120)');g.up(key);
   if(g.run('++routeGuard')>3000)throw Error('Route failed at '+i+' '+axis+' '+target+' current '+position+' state '+g.run('players['+i+'].state'));
  }

 }
 travel(0,'z',5);assert.equal(g.run('active(0)'),true);
 travel(1,'x',8);travel(1,'z',2);assert.equal(g.run('active(1)'),true);
 // The red companion takes the same bridge and steps aside to its own rune.
 const redTravel=(axis,target)=>{
  const sign=Math.sign(target-g.run('players[2].'+axis)),key=axis==='x'?(sign>0?'l':'j'):(sign>0?'k':'i');
  for(let n=0;n<1800&&Math.abs(target-g.run('players[2].'+axis))>.035;n++){g.key(key);g.run('simulate(1/120)');g.up(key);}
  assert.ok(Math.abs(target-g.run('players[2].'+axis))<.05);
 };
 redTravel('x',8);redTravel('z',3);redTravel('x',9);redTravel('z',2);
 travel(0,'x',3);travel(0,'z',2);
 // Blue leaves the bridge button for its separate finish tile.
 travel(1,'z',3);
 g.run('simulate(.05)');assert.equal(g.run('won'),true);
 g.key('z');assert.equal(g.run('won'),false);
});

test('each finish has a floor tile separate from bridge buttons and portals',()=>{
 const g=game();
 assert.equal(g.run('goals.length'),3);
 assert.equal(g.run('goals.every(g=>world.heightAt(g.x,g.z)!==null&&!plates.some(p=>p.x===g.x&&p.z===g.z)&&!world.portals.some(p=>p.x===g.x&&p.z===g.z))'),true);
 assert.equal(g.run('new Set(goals.map(g=>`${g.x},${g.z}`)).size'),3);
});
test('fall clears only the affected controls; respawn resets height and undo restores life',()=>{
 const g=game();
 // Start just before the internal pit at (4,8).
 g.run('players[0].x=3.4');g.key('d');g.key('arrowup');
 g.run('for(let n=0;n<10;n++)simulate(.05)');
 assert.equal(g.run('players[0].state'),'falling');
 assert.equal(g.run('heldKeys.has("KeyD")'),false);
 assert.equal(g.run('heldKeys.has("ArrowUp")'),true);
 const z=g.run('players[1].z');g.run('simulate(.05)');assert.ok(g.run('players[1].z')<z);
 g.up('arrowup');g.run('for(let n=0;n<35&&players[0].state!=="dead";n++)simulate(.05)');
 assert.equal(g.run('players[0].state'),'dead');
 // The companion may also hit its spike trap; count the scraps below the level.
 assert.equal(g.run('effects.particles.filter(p=>p.position[1]<-3).length'),22);
 g.run('for(let n=0;n<35;n++)simulate(.05)');
 assert.equal(g.run('players[0].state'),'alive');assert.equal(g.run('players[0].deaths'),1);
 assert.ok(Math.abs(g.run('players[0].x')-2)<.025);assert.ok(Math.abs(g.run('players[0].y'))<.05);
 g.key('z');assert.equal(g.run('players[0].x'),3.4);assert.equal(g.run('players[0].state'),'alive');assert.equal(g.run('players[0].deaths'),0);
 g.run('players[0].state="falling";players[0].y=-2');g.key('r');
 assert.equal(g.run('players[0].state'),'alive');assert.equal(g.run('players[0].y'),0);
});
test('undo restores a raised lift and the full passenger lattice',()=>{
 const g=game();g.run('players[0].x=4.1;players[0].z=7;players[0].rx=4.1;players[0].rz=7;soft.reset()');g.key('d');
 g.run('for(let n=0;n<120&&players[0].x<4.95;n++)simulate(1/120)');g.up('d');g.run('for(let n=0;n<50;n++)simulate(.05)');
 assert.equal(g.run('world.lifts[0].height'),1);assert.ok(g.run('players[0].y')>.85);
 g.key('z');assert.equal(g.run('world.lifts[0].height'),0);assert.equal(g.run('players[0].x'),4.1);assert.equal(g.run('players[0].y'),0);assert.ok(g.run('Math.abs(soft.get(players[0]).center[1]-.42)<.001'));
});
test('spike death clears held input and undo restores a living character',()=>{
 const g=game();g.run('players[0].x=2.2;players[0].z=9;soft.reset()');g.key('d');g.run('for(let n=0;n<20&&players[0].state!=="dead";n++)simulate(.05)');
 assert.equal(g.run('players[0].state'),'dead');assert.equal(g.run('heldKeys.size'),0);assert.equal(g.run('players[0].deathReason'),'spikes');
 assert.ok(g.run('effects.particles.length')>0);
 g.run('for(let n=0;n<30;n++)simulate(.05)');assert.equal(g.run('players[0].state'),'alive');g.key('z');assert.equal(g.run('players[0].x'),2.2);assert.equal(g.run('players[0].deaths'),0);
 assert.equal(g.run('effects.particles.length'),0);
});
test('undo of the first portal trip restores position, height and portal lock',()=>{
 const g=game();g.run('players[0].x=3;players[0].z=5.4;soft.reset()');g.key('s');g.run('for(let n=0;n<20&&players[0].portalLock===null;n++)simulate(.05)');g.up('s');
 assert.equal(g.run('players[0].portalLock'),'violet');assert.ok(g.run('players[0].y')>.85);
 assert.equal(g.run('effects.rings.length'),2);
 g.key('z');assert.equal(g.run('players[0].portalLock'),null);assert.equal(g.run('players[0].x'),3);assert.equal(g.run('players[0].z'),5.4);assert.equal(g.run('players[0].y'),0);
 assert.equal(g.run('effects.rings.length+effects.particles.length'),0);
 g.run("effects.burst({type:'portal',color:'amber',source:[1,0,1],destination:[2,1,2]},players,soft)");g.key('r');
 assert.equal(g.run('effects.rings.length+effects.particles.length'),0);
});
