(function(root){
 'use strict';
 const GPU=typeof module!=='undefined'&&module.exports?require('./webgpu-renderer'):root.JellyGPU;
 function target(players,definition,camera,angle,width,height){
  const points=players.map(p=>p.state==='alive'||!p.state?{x:p.rx??p.x,z:p.rz??p.z,y:p.y||0}:{x:p.spawn?.x??p.x,z:p.spawn?.z??p.z,y:p.spawn?.y||0});
  const bounds=axis=>[Math.min(...points.map(p=>p[axis])),Math.max(...points.map(p=>p[axis]))];
  const [x0,x1]=bounds('x'),[z0,z1]=bounds('z'),[y0,y1]=bounds('y');
  const floor=[...(definition.blocks||[]),...(definition.tiles||[])];
  const fx=floor.length?(Math.min(...floor.map(p=>p.x))+Math.max(...floor.map(p=>p.x)))/2:(x0+x1)/2;
  const fz=floor.length?(Math.min(...floor.map(p=>p.z))+Math.max(...floor.map(p=>p.z)))/2:(z0+z1)/2;
  const result={x:(x0+x1)*.45+fx*.1,z:(z0+z1)*.45+fz*.1,targetY:(y0+y1)/2,focusHeight:(y0+y1)/2+.42};
  // A circular envelope fits every orbit angle. Fitting the current projection
  // alone made quarter-turns alternate between close and distant zoom levels.
  const radius=(Math.max(...points.map(p=>Math.hypot(p.x-result.x,p.z-result.z)))+.65*Math.SQRT2)*1.005;
  const corners=Array.from({length:32},(_,i)=>i*Math.PI/16).flatMap(a=>[y0,y1+1.15].map(y=>[result.x+Math.cos(a)*radius,y,result.z+Math.sin(a)*radius]));
  const base=Math.min(width/16,height/12);
  let zoom=2.05;
  // Fit the whole roster with room for the HUD and nearby puzzle geometry.
  for(let attempt=0;attempt<40;attempt++){
   const frame=GPU.cameraFrame({...camera,...result},0,width,height,base*zoom);
   if(corners.every(p=>{const q=GPU.projectPoint(frame,...p,width,height);return q.visible&&q.x>width*.12&&q.x<width*.88&&q.y>height*.15&&q.y<height*.86;}))break;
   zoom*=.92;
  }
  return {...result,zoom};
 }
 const api={target};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JellySharedCamera=api;
})(globalThis);
