const {test}=require('node:test');
const assert=require('node:assert/strict');
const {target}=require('./shared-camera');
const GPU=require('./webgpu-renderer');
const map={blocks:[{x:1,z:1},{x:6,z:6}]};
const p=(x,z,y=0)=>({x,z,y,state:'alive'});
test('shared camera widens for separated heroes and fits the full roster at every angle and aspect',()=>{
 for(const mode of ['ortho','perspective'])for(const [width,height] of [[1280,800],[390,844]])for(let q=0;q<4;q++){
  const camera={mode,pitch:55,fov:45},angle=q*Math.PI/2;
  const near=target([p(3,4),p(4,4)],map,camera,angle,width,height),players=[p(1,1),p(6,6)];
  const far=target(players,map,camera,angle,width,height);
  assert.ok(near.zoom>=far.zoom);
  const frame=GPU.cameraFrame({...camera,...far},angle,width,height,Math.min(width/16,height/12)*far.zoom);
  for(const player of players)for(const y of [0,1]){const projected=GPU.projectPoint(frame,player.x,y,player.z,width,height);assert.ok(projected.visible);assert.ok(projected.x>width*.12&&projected.x<width*.88);assert.ok(projected.y>height*.15&&projected.y<height*.86);}
 }
});
test('first-level camera zoom stays identical throughout a complete orbit',()=>{
 const L=require('./levels'),level=L.standardLevel(1),players=level.spawns.filter(Boolean).map(p=>({...p,state:'alive'}));
 for(const mode of ['perspective','ortho'])for(const [w,h] of [[1280,800],[390,844]]){
  const camera={mode,pitch:55,fov:45},initial=target(players,level,camera,0,w,h);
  for(let step=0;step<64;step++){
   const angle=step*Math.PI/32,result=target(players,level,camera,angle,w,h);assert.equal(result.zoom,initial.zoom);
   const frame=GPU.cameraFrame({...camera,...result},angle,w,h,Math.min(w/16,h/12)*result.zoom);
   for(const p of players){const q=GPU.projectPoint(frame,p.x,p.y+.42,p.z,w,h);assert.ok(q.visible&&q.x>0&&q.x<w&&q.y>0&&q.y<h);}
  }
 }
});
test('on a landscape display, spreading out widens the camera',()=>{
 const camera={mode:'perspective',pitch:55,fov:45};
 assert.ok(target([p(3,4),p(4,4)],map,camera,0,1280,800).zoom>target([p(1,1),p(6,6)],map,camera,0,1280,800).zoom);
});
test('shared camera uses height of the group and respawn positions instead of following a fall into the void',()=>{
 const camera={mode:'perspective',pitch:55,fov:45};
 const high=target([p(2,2),p(4,4,3)],map,camera,0,1280,800);assert.equal(high.targetY,1.5);
 const falling={...p(4,4,-20),state:'falling',spawn:{x:4,z:4,y:0}};
 const result=target([p(2,2),falling],map,camera,0,1280,800);assert.equal(result.targetY,0);assert.ok(result.zoom>0);
});
