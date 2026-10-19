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
  for(const player of players)for(const y of [0,1]){const projected=GPU.projectPoint(frame,player.x,y,player.z,width,height);assert.ok(projected.visible);assert.ok(projected.x>width*.14&&projected.x<width*.86);assert.ok(projected.y>height*.22&&projected.y<height*.82);}
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
