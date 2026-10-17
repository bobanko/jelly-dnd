const {test}=require('node:test');
const assert=require('node:assert/strict');
const {cameraFrame,projectPoint}=require('./webgpu-renderer');
const frame=(mode='perspective',extra={},angle=0,w=1440,h=1000)=>cameraFrame({x:5,z:6,mode,pitch:55,fov:45,...extra},angle,w,h,Math.min(w/16,h/12));
const project=(f,p,w=1440,h=1000)=>projectPoint(f,...p,w,h);

test('both cameras keep their follow anchor at all rotations, tilts, FOVs and aspect ratios',()=>{
 for(const mode of ['ortho','perspective'])for(const pitch of [25,55,80])for(const fov of [25,45,85])for(const [w,h] of [[1440,1000],[390,844]])for(let q=0;q<4;q++){
  const f=frame(mode,{pitch,fov},q*Math.PI/2,w,h),p=project(f,[5,0,6],w,h);
  assert.ok(Math.abs(p.x-w*.5)<.002);assert.ok(Math.abs(p.y-h*.56)<.002);
  assert.equal(p.visible,true);assert.ok(f.vp.every(Number.isFinite));
 }
});

test('perspective makes near objects larger; orthographic scale stays constant with depth',()=>{
 for(const mode of ['ortho','perspective']){
  const f=frame(mode),near=[5,0,6].map((v,k)=>v+f.view[k]*3),far=[5,0,6].map((v,k)=>v-f.view[k]*3);
  const a=project(f,near),b=project(f,far);
  assert.ok(a.depth<b.depth);
  if(mode==='perspective')assert.ok(a.scale>b.scale*1.4);
  else assert.ok(Math.abs(a.scale-b.scale)<1e-8);
 }
});

test('FOV compensates camera distance to preserve the followed cube size at either height',()=>{
 for(const focusHeight of [.42,1.42])for(const pitch of [25,55,80])for(const scale of [55,150]){
  const make=fov=>cameraFrame({x:5,z:6,mode:'perspective',pitch,fov,focusHeight},0,1440,1000,scale);
  const narrow=make(25),normal=make(45),wide=make(85),focus=[5,focusHeight,6];
  assert.ok(narrow.distance>normal.distance&&normal.distance>wide.distance);
  assert.ok(Math.abs(project(narrow,focus).scale-project(wide,focus).scale)<.001);
  assert.ok(Math.abs(project(normal,focus).scale-project(wide,focus).scale)<.001);
  const near=focus.map((v,k)=>v+wide.view[k]*1.5);
  assert.ok(project(wide,near).scale/project(wide,focus).scale>project(narrow,near).scale/project(narrow,focus).scale,'wide FOV increases perspective depth scaling');
 }
});

test('wheel zoom still controls apparent size independently of the FOV setting',()=>{
 const wide=frame('perspective',{fov:45});
 const zoomed=cameraFrame({x:5,z:6,mode:'perspective',pitch:55,fov:45},0,1440,1000,150);
 assert.ok(zoomed.distance<wide.distance);
 assert.ok(project(zoomed,[5,0,6]).scale>project(frame(),[5,0,6]).scale);
});

test('perspective clips the eye and points behind it, with WebGPU zero-to-one depth',()=>{
 const f=frame(),at=t=>f.eye.map((v,k)=>v-f.view[k]*t);
 assert.equal(project(f,at(-1)).visible,false);
 assert.equal(project(f,at(.02)).visible,false);
 assert.ok(Math.abs(project(f,at(.1)).depth)<.0001);
 assert.ok(Math.abs(project(f,at(120)).depth-1)<.0001);
 assert.equal(project(f,at(130)).visible,false);
});

test('narrow FOV remains visible at the furthest portrait zoom',()=>{
 const f=cameraFrame({x:5,z:6,mode:'perspective',pitch:55,fov:25},0,320,844,320/16*.65);
 assert.ok(f.distance>120);assert.equal(project(f,[5,.42,6],320,844).visible,true);
});
