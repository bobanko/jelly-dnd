(function(root){
 'use strict';
 const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const normalize=a=>{const l=Math.hypot(...a)||1;return a.map(v=>v/l);};
 function viewMatrix(center,view,width,height,offset=0){
  const right=normalize(cross([0,1,0],view)),up=normalize(cross(view,right)),m=new Float32Array(16);
  for(let k=0;k<3;k++){m[k*4]=right[k]*2/width;m[k*4+1]=up[k]*2/height;m[k*4+2]=-view[k]/40;}
  m[12]=-dot(right,center)*2/width;m[13]=-dot(up,center)*2/height+offset;m[14]=.5+dot(view,center)/40;m[15]=1;return m;
 }
 function box(mesh,center,size,color,bevel=.04,material=0){
  const h=size.map(v=>v*.5),radius=Math.min(bevel,...h),steps=4;
  const faces=[[0,1,2,1],[0,1,2,-1],[1,2,0,1],[1,2,0,-1],[2,0,1,1],[2,0,1,-1]];
  for(const [axis,u,v,sign] of faces){const verts=[];
   for(let j=0;j<=steps;j++)for(let i=0;i<=steps;i++){
    const p=[0,0,0];p[axis]=h[axis]*sign;p[u]=(i/steps*2-1)*h[u];p[v]=(j/steps*2-1)*h[v];
    const core=p.map((x,k)=>Math.max(-h[k]+radius,Math.min(h[k]-radius,x))),d=p.map((x,k)=>x-core[k]),n=normalize(d);
    const position=core.map((x,k)=>x+n[k]*radius+center[k]);verts.push([...position,...n,...color,material,0,0]);
   }
   for(let j=0;j<steps;j++)for(let i=0;i<steps;i++){
    const a=j*(steps+1)+i,b=a+1,c=a+steps+1,d=c+1;
    for(const tri of sign>0?[[a,b,d],[a,d,c]]:[[a,d,b],[a,c,d]])mesh.push(...tri.flatMap(k=>verts[k]));
   }
  }
 }
 const unitSphere=(()=>{
  const result=[],vertex=(u,v)=>[Math.cos(u)*Math.sin(v),Math.cos(v),Math.sin(u)*Math.sin(v)];
  for(let j=0;j<6;j++)for(let i=0;i<10;i++){
   const u=i/10*Math.PI*2,v=j/6*Math.PI,du=Math.PI/5,dv=Math.PI/6;
   result.push(...vertex(u,v),...vertex(u+du,v),...vertex(u+du,v+dv),...vertex(u,v),...vertex(u+du,v+dv),...vertex(u,v+dv));
  }return new Float32Array(result);
 })();
 function sphere(mesh,center,size,color,material=1,basis=null){
  for(let i=0;i<unitSphere.length;i+=3){
   const x=unitSphere[i],y=unitSphere[i+1],z=unitSphere[i+2],px=x*size[0],py=y*size[1],pz=z*size[2];
   if(basis){const a=basis[0],b=basis[1],c=basis[2];mesh.push(center[0]+a[0]*px+b[0]*py+c[0]*pz,center[1]+a[1]*px+b[1]*py+c[1]*pz,center[2]+a[2]*px+b[2]*py+c[2]*pz,a[0]*x+b[0]*y+c[0]*z,a[1]*x+b[1]*y+c[1]*z,a[2]*x+b[2]*y+c[2]*z,...color,material,0,0);}
   else mesh.push(center[0]+px,center[1]+py,center[2]+pz,x,y,z,...color,material,0,0);
  }
 }
 function spike(mesh,x,y,z){
  for(let i=0;i<8;i++){const a=i/8*Math.PI*2,b=(i+1)/8*Math.PI*2,p=[x+Math.cos(a)*.058,y,z+Math.sin(a)*.058],q=[x+Math.cos(b)*.058,y,z+Math.sin(b)*.058],top=[x,y+.18,z],n=normalize(cross(top.map((v,k)=>v-p[k]),q.map((v,k)=>v-p[k])));
   for(const v of [p,top,q])mesh.push(...v,...n,.32,.38,.4,1,0,0);
  }
 }
 function portalRing(mesh,x,y,z,color){
  const vertex=(a,b)=>{const radius=.3+Math.cos(b)*.024;return [x+Math.cos(a)*radius,y+Math.sin(b)*.024,z+Math.sin(a)*radius,Math.cos(a)*Math.cos(b),Math.sin(b),Math.sin(a)*Math.cos(b),...color,4,x,z];};
  for(let i=0;i<32;i++)for(let j=0;j<6;j++){const a=i/32*Math.PI*2,b=j/6*Math.PI*2,da=Math.PI/16,db=Math.PI/3;mesh.push(...vertex(a,b),...vertex(a+da,b+db),...vertex(a+da,b),...vertex(a,b),...vertex(a,b+db),...vertex(a+da,b+db));}
 }
 function colliderLines(boxes){
  const data=[],colors={floor:[.12,.65,1],wall:[.8,.88,.95],lift:[1,.65,.04],bridge:[1,.7,.2],spikes:[1,.1,.12],portal:[.85,.2,1]};
  for(const b of boxes){const c=colors[b.kind]||colors.wall,points=[];for(let y=0;y<2;y++)for(let z=0;z<2;z++)for(let x=0;x<2;x++)points.push([b.x+(x?1:-1)*(b.halfX??b.half),y?b.maxY:b.minY,b.z+(z?1:-1)*(b.halfZ??b.half)]);
   for(let i=0;i<8;i++)for(const bit of [1,2,4])if(!(i&bit))data.push(...points[i],...c,...points[i|bit],...c);
  }return new Float32Array(data);
 }
 function surfaceBindings(soft){
  const vertices=[],indices=[],steps=14,half=soft.WIDTH/2;
  for(const [axis,u,v,sign] of [[0,1,2,1],[0,1,2,-1],[1,2,0,1],[1,2,0,-1],[2,0,1,1],[2,0,1,-1]]){
   const base=vertices.length/12;
   for(let j=0;j<=steps;j++)for(let i=0;i<=steps;i++){
    const p=[0,0,0];p[axis]=sign*half;p[u]=(i/steps*2-1)*half;p[v]=(j/steps*2-1)*half;
    const rest=soft.rounded(p),core=p.map(x=>Math.max(-half+.085,Math.min(half-.085,x))),n=normalize(p.map((x,k)=>x-core[k]));
    vertices.push(...p,0,...rest,0,...n,0);
   }
   for(let j=0;j<steps;j++)for(let i=0;i<steps;i++){const a=base+j*(steps+1)+i,b=a+1,c=a+steps+1,d=c+1;indices.push(...(sign>0?[a,b,d,a,d,c]:[a,d,b,a,c,d]));}
  }
  return {vertices:new Float32Array(vertices),indices:new Uint32Array(indices),count:vertices.length/12};
 }
 const shared=`
 struct Portal { position:vec4f, color:vec4f };
 struct Goal { position:vec4f, color:vec4f };
 struct Scene { vp:mat4x4f, lightVP:mat4x4f, eye:vec4f, light:vec4f, body0:vec4f, body1:vec4f, body2:vec4f, options:vec4f, portals:array<Portal,4>, goals:array<Goal,3> };
 @group(0) @binding(0) var<uniform> scene:Scene;
 struct Out { @builtin(position) clip:vec4f, @location(0) world:vec3f, @location(1) normal:vec3f, @location(2) color:vec3f, @location(3) material:f32, @location(4) local:vec3f };
 struct Vertex { position:vec4f, normal:vec4f, info:vec4f };
 @group(0) @binding(1) var<storage,read> vertices:array<Vertex>;
 @vertex fn solidVS(@location(0) p:vec3f,@location(1) n:vec3f,@location(2) color:vec3f,@location(3) material:vec3f)->Out{
  var o:Out;o.clip=scene.vp*vec4f(p,1);o.world=p;o.normal=n;o.color=color;o.material=material.x;o.local=vec3f(material.y,0,material.z);return o;
 }
 @vertex fn softVS(@builtin(vertex_index) id:u32,@builtin(instance_index) instance:u32)->Out{
  let v=vertices[id+instance*1350u];var o:Out;o.clip=scene.vp*v.position;o.world=v.position.xyz;o.normal=v.normal.xyz;
  let colors=array<vec3f,3>(vec3f(.045,.72,.095),vec3f(.025,.57,.95),vec3f(.95,.055,.025));
  o.color=colors[instance];o.material=2.+f32(instance);o.local=v.info.xyz;return o;
 }
 @vertex fn portalHaloVS(@location(0) p:vec3f,@builtin(instance_index) instance:u32)->Out{
  let portal=scene.portals[instance];var o:Out;o.world=portal.position.xyz+vec3f(p.x*.78,.033,p.z*.78);o.clip=scene.vp*vec4f(o.world,1.);
  o.normal=vec3f(0,1,0);o.color=portal.color.rgb;o.material=9.;o.local=vec3f(p.x,.065+portal.position.w*.3,p.z);return o;
 }
 @vertex fn portalRingVS(@location(0) p:vec3f,@location(1) n:vec3f,@builtin(instance_index) instance:u32)->Out{
  let portal=scene.portals[instance/3u];let phase=fract(scene.options.z*.42+f32(instance%3u)/3.+portal.color.w);let radius=.85+phase*.8;
  var o:Out;o.world=portal.position.xyz+vec3f(p.x*radius,.065+phase*.92+p.y*(1.-phase*.6),p.z*radius);o.clip=scene.vp*vec4f(o.world,1.);
  o.normal=normalize(vec3f(n.x/radius,n.y/(1.-phase*.6),n.z/radius));o.color=portal.color.rgb*(1.+portal.position.w*1.15);o.material=10.;
  o.local=vec3f(0.,smoothstep(0.,.1,phase)*pow(1.-phase,1.6)*(.22+portal.position.w*.38),0.);return o;
 }
 @fragment fn portalFXFS(o:Out)->@location(0) vec4f{
  var alpha=o.local.y;var color=o.color*1.8;
  if(o.material<9.5){let radius=length(o.local.xz);alpha*=exp(-radius*radius*4.)*(1.-smoothstep(.7,1.,radius));color=o.color*1.2;}
  return vec4f(color,alpha);
 }
 @vertex fn goalBeamVS(@location(0) p:vec3f,@builtin(instance_index) instance:u32)->Out{
  let goal=scene.goals[instance];let victory=goal.color.w;let uv=vec2f(p.x,(p.z+1.)*.5);
  let right=normalize(vec3f(scene.vp[0].x,scene.vp[1].x,scene.vp[2].x));let width=mix(.12,.4,victory);let height=mix(2.2,3.3,victory);
  var o:Out;o.world=goal.position.xyz+right*uv.x*width+vec3f(0,.04+uv.y*height,0);o.clip=scene.vp*vec4f(o.world,1.);
  if(goal.position.w<.001){o.clip=vec4f(2,2,2,1);}
  o.normal=vec3f(0,1,0);o.color=goal.color.rgb*mix(1.,2.4,victory);o.material=victory;o.local=vec3f(uv,goal.position.w);return o;
 }
 @fragment fn goalBeamFS(o:Out)->@location(0) vec4f{
  let edge=exp(-o.local.x*o.local.x*5.);let tip=1.-smoothstep(.5,1.,o.local.y);let base=smoothstep(0.,.035,o.local.y);
  let breath=.97+.03*sin(scene.options.z*2.+o.local.y*8.);let core=exp(-o.local.x*o.local.x*45.)*o.material*.1;
  let alpha=o.local.z*(edge*mix(.15,.34,o.material)+core)*tip*base*breath;
  return vec4f(o.color,alpha);
 }
 @vertex fn shadowVS(@location(0) p:vec3f)->@builtin(position) vec4f{return scene.lightVP*vec4f(p,1);}
 @group(0) @binding(2) var shadowMap:texture_depth_2d;
 @group(0) @binding(3) var shadowSampler:sampler_comparison;
 fn shadow(p:vec3f,n:vec3f)->f32{
  let clip=scene.lightVP*vec4f(p+n*.012,1);let uv=vec2f(clip.x*.5+.5,.5-clip.y*.5);var lit=0.;
  for(var y=-1;y<=1;y++){for(var x=-1;x<=1;x++){lit+=textureSampleCompareLevel(shadowMap,shadowSampler,uv+vec2f(f32(x),f32(y))/.1024e4,clip.z-.001);}}
  return lit/9.;
 }
 fn hash(p:vec3f)->f32{return fract(sin(dot(p,vec3f(127.1,311.7,74.7)))*43758.5453);}
 fn neutral(input:vec3f)->vec3f{
  var c=max(input,vec3f(0));let x=min(c.r,min(c.g,c.b));let offset=select(.04,x-6.25*x*x,x<.08);c-=vec3f(offset);
  let peak=max(c.r,max(c.g,c.b));if(peak<.76){return c;}
  let d=.24;let newPeak=1.-d*d/(peak+d-.76);c*=newPeak/peak;let g=1.-1./(.15*(peak-newPeak)+1.);return mix(c,vec3f(newPeak),g);
 }
 fn environment(r:vec3f)->vec3f{
  var color=mix(vec3f(.028,.045,.055),vec3f(.55,.57,.48),smoothstep(-.25,1.,r.y));
  let softbox=pow(max(0.,dot(r,normalize(vec3f(-.4,1.,.2)))),45.);
  let strip=pow(max(0.,dot(r,normalize(vec3f(.5,.55,-.65)))),75.);
  return color+vec3f(3.8,3.4,2.5)*softbox+vec3f(.8,1.4,2.1)*strip;
 }
 @fragment fn solidFS(o:Out)->@location(0) vec4f{
  let n=normalize(o.normal);let v=normalize(scene.eye.xyz-o.world);let l=normalize(scene.light.xyz-o.world);let h=normalize(v+l);
  var color=o.color;
  if(o.material<.5){
   let grain=hash(floor(o.world*150.));let broad=hash(floor(o.world*4.));color*=.88+grain*.15+broad*.12;
   let vein=abs(sin(o.world.x*29.+sin(o.world.z*12.)*4.+o.world.y*31.));color*=1.-smoothstep(.965,.995,vein)*.1;
  }
  var light=vec3f(.15,.19,.22)+vec3f(.94,.83,.63)*max(0.,dot(n,l))*shadow(o.world,n)*.95+vec3f(.12,.19,.28)*max(0.,dot(n,normalize(vec3f(-.6,.4,-.6))));
  let torches=array<vec3f,4>(vec3f(1,.85,2),vec3f(10,.85,2),vec3f(1,.85,9),vec3f(10,.85,9));
  for(var i=0;i<4;i++){
   let delta=torches[i]-o.world;let distance=length(delta);let attenuation=pow(1.-smoothstep(.1,3.4,distance),2.);
   let flicker=1.+sin(scene.options.z*8.+f32(i)*2.)*.035;
   light+=vec3f(3.5,1.22,.18)*attenuation*max(.12,dot(n,normalize(delta)))*flicker;
  }
  // Soft, coloured transmission shadows; wider and lighter when a cube lifts off.
  let bodies=array<vec4f,3>(scene.body0,scene.body1,scene.body2);
  let tints=array<vec3f,3>(vec3f(.09,.85,.18),vec3f(.06,.57,1.),vec3f(1.,.08,.035));
  for(var i=0;i<3;i++){
   let body=bodies[i];let delta=o.world.xz-body.xz;
   let height=max(0.,body.y-.42-(body.w-1.));let radius=.28+height*.18;
   let amount=exp(-dot(delta,delta)/(radius*radius))*.36/(1.+height*2.);
   if(body.w>0.&&o.world.y<body.y-.2){
    let tint=tints[i];
    light*=mix(vec3f(1.),tint*.6+vec3f(.2),amount);
    light+=tint*exp(-dot(delta,delta)/.34)*.22/(1.+height*3.);
   }
  }
  var result=color*light;
  if(o.material>.5&&o.material<1.5){result+=vec3f(.28)*pow(max(0.,dot(n,h)),55.);}
  if(o.material>3.5){result=color*(1.4+sin(scene.options.z*4.)*.08);}
  if(o.material>4.5&&o.material<5.5){let portal=scene.portals[u32(o.local.x)];let delta=o.world.xz-portal.position.xz;let radius=length(delta);let swirl=.5+.5*sin(atan2(delta.y,delta.x)*3.-radius*35.+scene.options.z*3.);result=(color*(.55+swirl*1.8)+vec3f(.06)*exp(-radius*12.))*(.55+portal.position.w*1.9);}
  if(o.material>7.5&&o.material<8.5){result=color*(.65+scene.portals[u32(o.local.x)].position.w*2.8);}
  return vec4f(result,1.);
 }
 @fragment fn effectFS(o:Out)->@location(0) vec4f{
  let n=normalize(o.normal);let v=normalize(scene.eye.xyz-o.world);let l=normalize(scene.light.xyz-o.world);
  let fresnel=pow(1.-abs(dot(n,v)),3.);
  var color=o.color*(.5+.65*max(0.,dot(n,l)))+o.color*fresnel*.7;
  color+=vec3f(1.8,1.9,1.6)*pow(max(0.,dot(n,normalize(v+l))),85.);
  if(o.material>6.5){color=o.color*2.2+vec3f(.16)*fresnel;}
  return vec4f(color,clamp(o.local.x,0.,1.));
 }
 `;
 const skin=`
 @group(1) @binding(0) var behind:texture_2d<f32>;
 @group(1) @binding(1) var backFaces:texture_2d<f32>;
 @group(1) @binding(2) var linearSampler:sampler;
 // Embedded ivory marks use rest coordinates, so they stretch with the actual gel.
 fn inlay(p:vec3f)->f32{
  let a=abs(p);var face=p.xy;if(a.x>=a.y&&a.x>=a.z){face=p.yz;}else if(a.y>=a.z){face=p.xz;}
  let corner=length(abs(face)-vec2f(.185));var center=10.;if(a.y>=a.x&&a.y>=a.z){center=length(face);}
  let distance=min(corner,center);let aa=max(.0015,fwidth(distance)*.8);
  return 1.-smoothstep(.041-aa,.041+aa,distance);
 }
 @fragment fn backFS(o:Out)->@location(0) vec4f{return vec4f(o.world,1.+inlay(o.local));}
 @fragment fn skinFS(o:Out)->@location(0) vec4f{
  let n=normalize(o.normal);let ray=normalize(vec3f(scene.vp[0].z,scene.vp[1].z,scene.vp[2].z));let uv=o.clip.xy/scene.options.xy;
  let back=textureSampleLevel(backFaces,linearSampler,uv,0.);var thick=max(.03,length(back.xyz-o.world));
  let inside=refract(ray,n,1./1.38);let estimated=o.world+inside*thick;
  let exitClip=scene.vp*vec4f(estimated,1);let exitUV=vec2f(exitClip.x*.5+.5,.5-exitClip.y*.5);
  let exit=textureSampleLevel(backFaces,linearSampler,clamp(exitUV,vec2f(.001),vec2f(.999)),0.);
  if(exit.w>.5){thick=clamp(dot(exit.xyz-o.world,inside),.03,1.4);}
  var refractedUV=mix(uv,exitUV,.55);refractedUV=clamp(refractedUV,vec2f(.002),vec2f(.998));
  let pigment=o.color;var absorption=select(vec3f(2.1,.13,1.95),vec3f(2.7,.55,.12),o.material>2.5);
  if(o.material>3.5){absorption=vec3f(.13,2.35,2.8);}
  let transmission=exp(-absorption*thick*1.35);
  let background=textureSampleLevel(behind,linearSampler,refractedUV,0.).rgb;
  var color=background*transmission+pigment*(1.-transmission)*.55;
  let farInlay=clamp(exit.w-1.,0.,1.);
  color=mix(color,vec3f(.65,.6,.33)*transmission+pigment*.11,farInlay*.22);
  let frontInlay=inlay(o.local);
  color=mix(color,vec3f(.72,.68,.42)*(.76+.24*max(0.,dot(n,normalize(scene.light.xyz-o.world))))+pigment*.07,frontInlay*.83);
  let f=.025+.975*pow(1.-max(0.,dot(n,-ray)),5.);
  color=mix(color,environment(reflect(ray,n)),min(.85,f*.78+.025));
  color+=pigment*pow(1.-max(0.,dot(n,-ray)),3.)*.18;
  let l=normalize(scene.light.xyz-o.world);let h=normalize(l-ray);
  color+=vec3f(2.,1.9,1.6)*pow(max(0.,dot(n,h)),170.);
  color+=pigment*.28*pow(max(0.,dot(-n,l)),2.)*exp(-thick*2.);
  return vec4f(color,1.);
 }
 `;
 const compute=`
 struct Bind { param:vec4f, rest:vec4f, normal:vec4f };
 struct Vertex { position:vec4f, normal:vec4f, info:vec4f };
 @group(0) @binding(0) var<storage,read> nodes:array<vec4f>;
 @group(0) @binding(1) var<storage,read> restNodes:array<vec4f>;
 @group(0) @binding(2) var<storage,read> binds:array<Bind>;
 @group(0) @binding(3) var<storage,read_write> output:array<Vertex>;
 @compute @workgroup_size(64) fn deform(@builtin(global_invocation_id) id:vec3u){
  if(id.x>=4050u){return;}let instance=id.x/1350u;let bind=binds[id.x%1350u];
  let grid=clamp((bind.param.xyz+vec3f(.38))/.76*3.,vec3f(0.),vec3f(2.99999));let cell=vec3u(floor(grid));let f=fract(grid);
  var displacement=vec3f(0);var dx=vec3f(0);var dy=vec3f(0);var dz=vec3f(0);
  for(var z=0u;z<2u;z++){for(var y=0u;y<2u;y++){for(var x=0u;x<2u;x++){
   let k=cell+vec3u(x,y,z);let index=k.x+4u*(k.y+4u*k.z);
   let w=select(vec3f(1.)-f,f,vec3u(x,y,z)==vec3u(1));let sign=vec3f(vec3u(x,y,z))*2.-vec3f(1.);
   let delta=nodes[index+instance*64u].xyz-restNodes[index].xyz;
   displacement+=delta*w.x*w.y*w.z;dx+=delta*sign.x*w.y*w.z*(3./.76);dy+=delta*w.x*sign.y*w.z*(3./.76);dz+=delta*w.x*w.y*sign.z*(3./.76);
  }}}
  // Cofactor(F) transforms normals correctly under non-rigid deformation.
  let a=vec3f(1,0,0)+dx;let b=vec3f(0,1,0)+dy;let c=vec3f(0,0,1)+dz;
  let cofactor=mat3x3f(cross(b,c),cross(c,a),cross(a,b));
  output[id.x].position=vec4f(bind.rest.xyz+displacement,1.);output[id.x].normal=vec4f(normalize(cofactor*bind.normal.xyz),0.);output[id.x].info=vec4f(bind.param.xyz,f32(instance));
 }
 `;
 const post=`
 @group(0) @binding(0) var image:texture_2d<f32>;
 @group(0) @binding(1) var linearSampler:sampler;
 @vertex fn postVS(@builtin(vertex_index) i:u32)->@builtin(position) vec4f{let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(p[i],0,1);}
 fn tone(input:vec3f)->vec3f{var c=max(input,vec3f(0));let x=min(c.r,min(c.g,c.b));c-=vec3f(select(.04,x-6.25*x*x,x<.08));let peak=max(c.r,max(c.g,c.b));if(peak<.76){return c;}let newPeak=1.-.0576/(peak+.24-.76);c*=newPeak/peak;return mix(c,vec3f(newPeak),1.-1./(.15*(peak-newPeak)+1.));}
 @fragment fn postFS(@builtin(position) p:vec4f)->@location(0) vec4f{let uv=p.xy/vec2f(textureDimensions(image));var c=tone(textureSampleLevel(image,linearSampler,uv,0.).rgb);c=pow(max(c,vec3f(0)),vec3f(1./2.2));let noise=fract(sin(dot(p.xy,vec2f(12.9898,78.233)))*43758.5453)-.5;return vec4f(c+noise/255.,1);}
 `;
 const latticeShader=`
 struct Portal { position:vec4f, color:vec4f };
 struct Goal { position:vec4f, color:vec4f };
 struct Scene { vp:mat4x4f, lightVP:mat4x4f, eye:vec4f, light:vec4f, body0:vec4f, body1:vec4f, body2:vec4f, options:vec4f, portals:array<Portal,4>, goals:array<Goal,3> };
 @group(0) @binding(0) var<uniform> scene:Scene;
 @group(0) @binding(1) var<storage,read> nodes:array<vec4f>;
 @group(0) @binding(2) var<storage,read> edges:array<u32>;
 @vertex fn latticeVS(@builtin(vertex_index) id:u32,@builtin(instance_index) body:u32)->@builtin(position) vec4f{return scene.vp*vec4f(nodes[edges[id]+body*64u].xyz,1);}
 @fragment fn latticeFS()->@location(0) vec4f{return vec4f(.7,1.,.55,.48);}
 `;
 const colliderShader=`
 struct View { vp:mat4x4f };
 @group(0) @binding(0) var<uniform> view:View;
 struct Line { @builtin(position) clip:vec4f,@location(0) color:vec3f };
 @vertex fn colliderVS(@location(0) position:vec3f,@location(1) color:vec3f)->Line{var o:Line;o.clip=view.vp*vec4f(position,1);o.color=color;return o;}
 @fragment fn colliderFS(o:Line)->@location(0) vec4f{return vec4f(o.color,.72);}
 `;
 class Renderer{
  constructor(canvas,soft){this.canvas=canvas;this.soft=soft;this.ready=false;this.error=null;this.mesh=false;this.frames=0;this.errors=[];}
  async init(){
   if(!navigator.gpu)throw Error('В этом браузере нет WebGPU. Откройте игру в актуальном Chrome или Edge с аппаратным ускорением.');
   const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('Браузер не предоставил WebGPU-адаптер. Проверьте аппаратное ускорение.');
   const d=this.device=await adapter.requestDevice();this.adapterInfo=adapter.info;
   d.addEventListener('uncapturederror',e=>{this.errors.push(e.error.message);console.error(e.error.message);});
   d.lost.then(info=>{this.ready=false;this.error=info.message||'Соединение с графическим устройством потеряно.';this.onFailure?.(this.error);});
   this.context=this.canvas.getContext('webgpu');this.format=navigator.gpu.getPreferredCanvasFormat();this.context.configure({device:d,format:this.format,alphaMode:'opaque'});
   const module=async(label,code)=>{const m=d.createShaderModule({label,code});const info=await m.getCompilationInfo();const errors=info.messages.filter(x=>x.type==='error');if(errors.length)throw Error(label+': '+errors.map(e=>e.message).join('\n'));return m;};
   const main=await module('Dungeon and candy',shared+skin),deform=await module('Cofactor deformation',compute),finish=await module('Khronos PBR Neutral',post),lattice=await module('XPBD lattice overlay',latticeShader),collider=await module('Level collision overlay',colliderShader);
   this.uniform=this.buffer(new Float32Array(112),GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);
   const bindings=surfaceBindings(this.soft);this.bindingCount=bindings.count;
   this.bindBuffer=this.buffer(bindings.vertices,GPUBufferUsage.STORAGE);this.indexBuffer=this.buffer(bindings.indices,GPUBufferUsage.INDEX);this.indexCount=bindings.indices.length;
   this.nodes=this.buffer(new Float32Array(192*4),GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);
   this.restNodes=this.buffer(new Float32Array(this.soft.rest.flatMap(p=>[...p,0])),GPUBufferUsage.STORAGE);
   this.deformed=d.createBuffer({size:4050*48,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.VERTEX});
   this.compute=d.createComputePipeline({layout:'auto',compute:{module:deform,entryPoint:'deform'}});
   this.computeGroup=d.createBindGroup({layout:this.compute.getBindGroupLayout(0),entries:[this.nodes,this.restNodes,this.bindBuffer,this.deformed].map((buffer,binding)=>({binding,resource:{buffer}}))});
   this.sceneLayout=d.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}},{binding:1,visibility:GPUShaderStage.VERTEX,buffer:{type:'read-only-storage'}},{binding:2,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'depth'}},{binding:3,visibility:GPUShaderStage.FRAGMENT,sampler:{type:'comparison'}}]});
   this.skinLayout=d.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.FRAGMENT,texture:{}},{binding:1,visibility:GPUShaderStage.FRAGMENT,texture:{}},{binding:2,visibility:GPUShaderStage.FRAGMENT,sampler:{}}]});
   const layout=d.createPipelineLayout({bindGroupLayouts:[this.sceneLayout,this.skinLayout]});
   const vertexBuffers=[{arrayStride:48,attributes:[{shaderLocation:0,offset:0,format:'float32x3'},{shaderLocation:1,offset:12,format:'float32x3'},{shaderLocation:2,offset:24,format:'float32x3'},{shaderLocation:3,offset:36,format:'float32x3'}]}];
   const pipeline=(vertexEntry,fragmentEntry,cullMode='back',samples=4,depthCompare='less',depthWrite=true,blend=undefined)=>d.createRenderPipeline({layout,vertex:{module:main,entryPoint:vertexEntry,buffers:['solidVS','portalHaloVS','portalRingVS','goalBeamVS'].includes(vertexEntry)?vertexBuffers:[]},fragment:{module:main,entryPoint:fragmentEntry,targets:[{format:'rgba16float',blend}]},primitive:{topology:'triangle-list',cullMode,frontFace:'ccw'},depthStencil:{format:'depth32float',depthWriteEnabled:depthWrite,depthCompare},multisample:{count:samples}});
   this.opaque=pipeline('solidVS','solidFS');this.skin=pipeline('softVS','skinFS');this.back=pipeline('softVS','backFS','front',1,'greater');
   this.effectPipeline=pipeline('solidVS','effectFS','back',4,'less',false,{color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}});
   const additive={color:{srcFactor:'src-alpha',dstFactor:'one',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}};
   this.portalHaloPipeline=pipeline('portalHaloVS','portalFXFS','none',4,'less',false,additive);
   this.portalRingPipeline=pipeline('portalRingVS','portalFXFS','back',4,'less',false,additive);
   this.goalBeamPipeline=pipeline('goalBeamVS','goalBeamFS','none',4,'less',false,additive);
   const ring=[];portalRing(ring,0,0,0,[1,1,1]);this.portalRingCount=ring.length/12;this.portalRingBuffer=this.buffer(new Float32Array(ring),GPUBufferUsage.VERTEX);
   const halo=[];for(const p of [[-1,0,-1],[1,0,1],[1,0,-1],[-1,0,-1],[-1,0,1],[1,0,1]])halo.push(...p,0,1,0,1,1,1,0,0,0);this.portalHaloBuffer=this.buffer(new Float32Array(halo),GPUBufferUsage.VERTEX);
   this.shadow=d.createRenderPipeline({layout:d.createPipelineLayout({bindGroupLayouts:[this.sceneLayout]}),vertex:{module:main,entryPoint:'shadowVS',buffers:vertexBuffers},primitive:{topology:'triangle-list',cullMode:'back'},depthStencil:{format:'depth32float',depthWriteEnabled:true,depthCompare:'less'}});
   this.post=d.createRenderPipeline({layout:'auto',vertex:{module:finish,entryPoint:'postVS'},fragment:{module:finish,entryPoint:'postFS',targets:[{format:this.format}]},primitive:{topology:'triangle-list'}});
   this.latticePipeline=d.createRenderPipeline({layout:'auto',vertex:{module:lattice,entryPoint:'latticeVS'},fragment:{module:lattice,entryPoint:'latticeFS',targets:[{format:'rgba16float',blend:{color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha'}}}]},primitive:{topology:'line-list'},multisample:{count:4}});
   const edgeData=new Uint32Array(this.soft.edges.flatMap(e=>[e.a,e.b]));this.edgeCount=edgeData.length;this.edgeBuffer=this.buffer(edgeData,GPUBufferUsage.STORAGE);
   this.latticeGroup=d.createBindGroup({layout:this.latticePipeline.getBindGroupLayout(0),entries:[this.uniform,this.nodes,this.edgeBuffer].map((buffer,binding)=>({binding,resource:{buffer}}))});
   this.colliderPipeline=d.createRenderPipeline({layout:'auto',vertex:{module:collider,entryPoint:'colliderVS',buffers:[{arrayStride:24,attributes:[{shaderLocation:0,offset:0,format:'float32x3'},{shaderLocation:1,offset:12,format:'float32x3'}]}]},fragment:{module:collider,entryPoint:'colliderFS',targets:[{format:'rgba16float',blend:{color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha'}}}]},primitive:{topology:'line-list'},multisample:{count:4}});
   this.colliderGroup=d.createBindGroup({layout:this.colliderPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniform}}]});
   this.colliderBuffer=d.createBuffer({size:256000,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});
   this.shadowTexture=d.createTexture({size:[1024,1024],format:'depth32float',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING});
   this.sampler=d.createSampler({magFilter:'linear',minFilter:'linear'});this.compareSampler=d.createSampler({compare:'less',magFilter:'linear',minFilter:'linear'});
   this.sceneGroup=d.createBindGroup({layout:this.sceneLayout,entries:[{binding:0,resource:{buffer:this.uniform}},{binding:1,resource:{buffer:this.deformed}},{binding:2,resource:this.shadowTexture.createView()},{binding:3,resource:this.compareSampler}]});
   // A distinct unsampled depth texture avoids attachment/sampling hazards in the shadow pass.
   this.dummyShadow=d.createTexture({size:[1,1],format:'depth32float',usage:GPUTextureUsage.TEXTURE_BINDING});
   this.shadowGroup=d.createBindGroup({layout:this.sceneLayout,entries:[{binding:0,resource:{buffer:this.uniform}},{binding:1,resource:{buffer:this.deformed}},{binding:2,resource:this.dummyShadow.createView()},{binding:3,resource:this.compareSampler}]});
   this.staticBuffer=d.createBuffer({size:4e6,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});
   this.propBuffer=d.createBuffer({size:2e6,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});
   this.bridgeBuffer=d.createBuffer({size:1e6,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});
   this.effectBuffer=d.createBuffer({size:4e6,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});
   this.decorationBuffer=d.createBuffer({size:2e6,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});
   this.ready=true;return this;
  }
  buffer(data,usage){const b=this.device.createBuffer({size:Math.max(4,data.byteLength),usage,mappedAtCreation:true});new Uint8Array(b.getMappedRange()).set(new Uint8Array(data.buffer,data.byteOffset,data.byteLength));b.unmap();return b;}
  resize(){
   const ratio=Math.min(devicePixelRatio||1,1.25,Math.sqrt(2e6/(innerWidth*innerHeight))),w=Math.round(innerWidth*ratio),h=Math.round(innerHeight*ratio);
   if(this.canvas.width===w&&this.canvas.height===h&&this.hdr)return;
   this.canvas.width=w;this.canvas.height=h;const d=this.device;
   for(const t of [this.hdr,this.background,this.msaa,this.depth,this.exitDepth,...(this.exits||[])])t?.destroy();
   const create=(format,sampleCount=1,extra=0)=>d.createTexture({size:[w,h],format,sampleCount,usage:GPUTextureUsage.RENDER_ATTACHMENT|extra});
   this.hdr=create('rgba16float',1,GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_SRC);
   this.background=create('rgba16float',1,GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST);
   this.msaa=create('rgba16float',4);this.depth=create('depth32float',4);this.exitDepth=create('depth32float');
   this.exits=Array.from({length:3},()=>create('rgba16float',1,GPUTextureUsage.TEXTURE_BINDING));
   this.skinGroups=this.exits.map(t=>d.createBindGroup({layout:this.skinLayout,entries:[{binding:0,resource:this.background.createView()},{binding:1,resource:t.createView()},{binding:2,resource:this.sampler}]}));
   this.postGroup=d.createBindGroup({layout:this.post.getBindGroupLayout(0),entries:[{binding:0,resource:this.hdr.createView()},{binding:1,resource:this.sampler}]});
  }
  buildScene(level){
   const mesh=[];
   for(const key of level.floor){const [x,z]=key.split(',').map(Number);if(level.bridges.some(b=>b.x===x&&b.z===z))continue;const height=0;
    const noise=((x*73+z*137)%19)/19,color=[.235+noise*.04,.205+noise*.035,.165+noise*.03];
    if(level.world.lifts.some(l=>l.x===x&&l.z===z)){
     box(mesh,[x,-.52,z],[.99,.25,.99],[.12,.14,.12],.025);
    }else{box(mesh,[x,height-.36,z],[.97,.72,.97],color,.045);const upper=level.world.heights.get(key)||0;if(upper>0)box(mesh,[x,upper*.5,z],[.97,upper,.97],color,.045);}
   }
   for(const o of level.world.collisionBoxes().filter(o=>o.kind==='wall'))box(mesh,[o.x,(o.minY+o.maxY)*.5,o.z],[o.half*2-.03,o.maxY-o.minY,o.half*2-.03],o.half>.4?[.145,.18,.17]:[.18,.19,.145],.035);
   this.staticCount=mesh.length/12;this.device.queue.writeBuffer(this.staticBuffer,0,new Float32Array(mesh));
  }
  bridges(level){
   const mesh=[];
   level.bridges.forEach((bridge,i)=>{
    const bounds=level.world.bridgeBounds(i);if(!bounds)return;
    const length=bounds.halfZ*2,x=bounds.x,z=bounds.z,anchor=bridge.z-.5,front=anchor+length;
    box(mesh,[x,-.13,z],[.97,.26,length],[.21,.24,.22],.018,1);
    for(const side of [-1,1])box(mesh,[x+side*.42,.006,z],[.035,.012,length],[.51,.34,.12],.006,1);
    box(mesh,[x,.008,front-.012],[.95,.016,Math.min(.025,length)],[.85,.49,.09],.006,4);
    for(const offset of [.2,.45,.7,.95]){const position=front-offset;if(position>anchor+.02)box(mesh,[x,.003,position],[.8,.008,.018],[.08,.11,.1],.003,1);}
   });
   if(mesh.length)this.device.queue.writeBuffer(this.bridgeBuffer,0,new Float32Array(mesh));return mesh.length/12;
  }
  buildProps(level,players){
   const pieces=[],bone=[.88,.84,.65],dark=[.018,.035,.027],r=[1,0,0],front=[0,0,1],basis=[r,[0,1,0],front];
   const append=(kind,index,mesh,extra={})=>pieces.push({kind,index,data:new Float32Array(mesh),...extra});
   for(let i=0;i<players.length;i++){
    const mesh=[],center=[0,0,0];
    sphere(mesh,center,[.145,.14,.126],bone,1,basis);
    sphere(mesh,[center[0],center[1]-.115,center[2]],[.095,.055,.095],bone,1,basis);
    for(const sign of [-1,1]){const eye=center.map((v,k)=>v+front[k]*.108+r[k]*sign*.055);eye[1]+=.022;sphere(mesh,eye,[.036,.043,.022],dark,1,basis);}
    const nose=center.map((v,k)=>v+front[k]*.125);nose[1]-=.042;sphere(mesh,nose,[.019,.022,.012],dark,1,basis);
    for(const t of [-1,0,1]){const tooth=center.map((v,k)=>v+front[k]*.085+r[k]*t*.047);tooth[1]-=.152;sphere(mesh,tooth,[.018,.022,.022],bone,1,basis);}
    for(const sign of [-1,1]){
     const tilt=sign*.38,axis=r.map((v,k)=>v*Math.cos(tilt)+(k===1?Math.sin(tilt):0)),other=r.map((v,k)=>-v*Math.sin(tilt)+(k===1?Math.cos(tilt):0));
     const origin=center.map((v,k)=>v-front[k]*.025);origin[1]-=.205;
     sphere(mesh,origin,[.145,.019,.019],bone,1,[axis,other,front]);
     for(const end of [-1,1])sphere(mesh,origin.map((v,k)=>v+axis[k]*end*.135),[.025,.025,.025],bone,1);
    }
    append('jelly',i,mesh);
    for(let j=0;j<5;j++){const mesh=[],phase=j*2.4+i;const position=[Math.sin(phase)*.22,-.26+j*.097,Math.cos(phase)*.2];sphere(mesh,position,[.015,.015,.015],[[.55,.72,.23],[.25,.62,.7],[.9,.3,.12]][i],1);append('bubble',i,mesh,{bubble:j});}
   }
   for(let i=0;i<(level.crates||[]).length;i++){
    const mesh=[],x=0,y=0,z=0,wood=[.34,.17,.065],rim=[.48,.27,.1],iron=[.13,.15,.14];
    box(mesh,[x,y,z],[.76,.76,.76],wood,.025);
    for(const d of [-.24,0,.24]){
     box(mesh,[x+d,y+.382,z],[.012,.009,.7],[.12,.065,.025],.002);
     for(const sign of [-1,1])box(mesh,[x+d,y,z+sign*.382],[.012,.7,.009],[.12,.065,.025],.002);
    }
    for(const side of [-1,1])for(const edge of [-1,1]){
     box(mesh,[x+edge*.32,y,z+side*.39],[.095,.77,.045],rim,.008);
     box(mesh,[x,y+edge*.32,z+side*.398],[.73,.095,.045],rim,.008);
     box(mesh,[x+side*.39,y+edge*.32,z],[.045,.095,.73],rim,.008);
     for(const height of [-.3,.3])sphere(mesh,[x+edge*.32,y+height,z+side*.426],[.022,.022,.012],iron,1);
    }
    append('crate',i,mesh);
   }
   for(let i=0;i<level.world.lifts.length;i++){
    const mesh=[],lift={x:0,z:0,height:0};
    box(mesh,[lift.x,lift.height-.08,lift.z],[.95,.16,.95],[.22,.24,.18],.035,1);
    for(const dx of [-.38,.38])box(mesh,[lift.x+dx,lift.height+.009,lift.z],[.035,.018,.78],[.7,.48,.12],.008,4);
    for(const dz of [-.38,.38])box(mesh,[lift.x,lift.height+.009,lift.z+dz],[.78,.018,.035],[.7,.48,.12],.008,4);
    box(mesh,[lift.x,lift.height+.013,lift.z],[.06,.025,.38],[.9,.65,.17],.008,4);
    append('lift',i,mesh);
   }
   for(let i=0;i<level.world.spikes.length;i++){
    const mesh=[];for(const dx of [-.21,0,.21])for(const dz of [-.21,0,.21])spike(mesh,dx,0,dz);append('spikes',i,mesh);
    const indicator=[];box(indicator,[0,0,0],[.65,.025,.03],[1,1,1],.006,4);append('indicator',i,indicator);
   }
   this.propPieces=pieces;this.propData=new Float32Array(pieces.reduce((sum,p)=>sum+p.data.length,0));
   if(this.propData.byteLength>this.propBuffer.size){this.propBuffer.destroy();this.propBuffer=this.device.createBuffer({size:this.propData.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});}
  }
  props(level,players,angle,time){
   const key=[players.length,(level.crates||[]).length,level.world.lifts.length,level.world.spikes.length].join(',');
   if(this.propGeometryKey!==key){this.buildProps(level,players);this.propGeometryKey=key;}
   const data=this.propData,c=Math.cos(angle),s=Math.sin(angle),rx=(c-s)*.7071,rz=-(s+c)*.7071,fx=(c+s)*.7071,fz=(c-s)*.7071;
   let cursor=0;
   // Reuse immutable local meshes and one upload array. No per-frame tessellation
   // or large JS number arrays for rigid decorations.
   for(const piece of this.propPieces){
    const i=piece.index,source=piece.data;let x=0,y=0,z=0,rotate=false,tint=null,matrix=null;
    if(piece.kind==='jelly'||piece.kind==='bubble'){
     const p=players[i];if(p.state==='dead')continue;
     const core=level.soft.get(p).core;x=core[0];y=core[1];z=core[2];rotate=piece.kind==='jelly';
     if(piece.kind==='bubble')y+=(piece.bubble*.097+time*.018)%.51-piece.bubble*.097;
    }else if(piece.kind==='crate'){
     const p=level.crates[i];if(p.state==='dead')continue;x=p.x;y=(p.y||0)+.42;z=p.z;matrix=level.soft.get(p).r;
    }else if(piece.kind==='lift'){
     const lift=level.world.lifts[i];x=lift.x;y=lift.height;z=lift.z;
    }else{
     const trap=level.world.spikes[i],state=level.world.spikeState(trap);x=trap.x;y=trap.y??level.world.heightAt(trap.x,trap.z)??0;z=trap.z;
     if(piece.kind==='spikes'){if(state.extension<=0)continue;y+=.03-.18*(1-state.extension);}
     else{y+=.035;z+=.33;const pulse=.65+.35*Math.sin((level.world.featureTime||0)*20);tint=state.warning?[pulse,.36*pulse,.02]:state.dangerous?[.7,.045,.025]:[.035,.38,.13];}
    }
    data.set(source,cursor);
    if(matrix){for(let n=0;n<source.length;n+=12){const k=cursor+n;for(let axis=0;axis<3;axis++){const a=axis*3;data[k+axis]=(axis===0?x:axis===1?y:z)+matrix[a]*source[n]+matrix[a+1]*source[n+1]+matrix[a+2]*source[n+2];data[k+3+axis]=matrix[a]*source[n+3]+matrix[a+1]*source[n+4]+matrix[a+2]*source[n+5];}}}
    else if(rotate){for(let n=0;n<source.length;n+=12){const k=cursor+n;data[k]=x+rx*source[n]+fx*source[n+2];data[k+1]=y+source[n+1];data[k+2]=z+rz*source[n]+fz*source[n+2];data[k+3]=rx*source[n+3]+fx*source[n+5];data[k+5]=rz*source[n+3]+fz*source[n+5];}}
    else{for(let n=0;n<source.length;n+=12){const k=cursor+n;data[k]=x+source[n];data[k+1]=y+source[n+1];data[k+2]=z+source[n+2];}}
    if(tint)for(let n=0;n<source.length;n+=12){const k=cursor+n;data[k+6]=tint[0];data[k+7]=tint[1];data[k+8]=tint[2];}
    cursor+=source.length;
   }
   const dynamicCount=cursor/12;this.device.queue.writeBuffer(this.propBuffer,0,data.buffer,0,cursor*4);
   const decorationKey=level.plates.map((p,i)=>level.world.active(i,players)).join(',');
   if(this.decorationKey!==decorationKey){const mesh=[];
   level.goals.forEach((g,i)=>{box(mesh,[g.x,.018,g.z],[.66,.025,.66],[.04,.09,.075],.08);const color=[[.45,1.,.08],[.035,.7,1.],[1.,.055,.025]][i];for(let k=0;k<4;k++){const x=k<2?g.x+(k?1:-1)*.25:g.x,z=k>=2?g.z+(k===2?1:-1)*.25:g.z;box(mesh,[x,.041,z],k<2?[.025,.025,.5]:[.5,.025,.025],color,.01,4);}});
   level.plates.forEach((p,i)=>{box(mesh,[p.x,.032,p.z],[.73,.06,.73],[.23,.2,.1],.07);sphere(mesh,[p.x,.076,p.z],[.24,.045,.24],level.world.active(i,players)?[1.,.7,.2]:[.5,.31,.08],level.world.active(i,players)?4:1);});
   for(const o of level.world.obstacles.filter(o=>o.half<.4))sphere(mesh,[o.x,.7,o.z],[.055,.13,.055],[2.,.65,.065],4);
   for(const trap of level.world.spikes){const y=trap.y??level.world.heightAt(trap.x,trap.z)??0;box(mesh,[trap.x,y+.015,trap.z],[.74,.03,.74],[.16,.11,.10],.025);for(const dx of [-.21,0,.21])for(const dz of [-.21,0,.21])box(mesh,[trap.x+dx,y+.031,trap.z+dz],[.115,.003,.115],[.025,.03,.03],.025);}
   level.world.portals.forEach((portal,i)=>{const y=portal.y??level.world.heightAt(portal.x,portal.z)??0,color=portal.color==='violet'?[.7,.045,1.]:[1.,.34,.025];box(mesh,[portal.x,y+.012,portal.z],[.75,.024,.75],[.08,.075,.095],.05);const rim=mesh.length;portalRing(mesh,portal.x,y+.053,portal.z,color);for(let n=rim;n<mesh.length;n+=12){mesh[n+9]=8;mesh[n+10]=i;mesh[n+11]=0;}const from=mesh.length;sphere(mesh,[portal.x,y+.04,portal.z],[.267,.012,.267],color,5);for(let n=from;n<mesh.length;n+=12){mesh[n+10]=i;mesh[n+11]=0;}});
   this.decorationCount=mesh.length/12;this.device.queue.writeBuffer(this.decorationBuffer,0,new Float32Array(mesh));this.decorationKey=decorationKey;
   }return dynamicCount;
  }
  effects(system,view){
   if(!system||(!system.particles.length&&!system.rings.length))return 0;
   const mesh=[],items=[...system.particles,...system.rings].sort((a,b)=>dot(a.position||a.center,view)-dot(b.position||b.center,view));
   for(const item of items){
    const t=item.age/item.life,fade=1-t*t*(3-2*t),from=mesh.length;
    if(item.position){
     const a=item.phase+item.age*8,c=Math.cos(a),s=Math.sin(a),size=item.size*(.65+.35*fade),jelly=item.kind==='jelly',wobble=1+Math.sin(a*1.8)*.22;
     sphere(mesh,item.position,[size*wobble,size/(wobble*(jelly?1.3:1)),size],item.color,jelly?6:7,[[c,s,0],[-s,c,0],[0,0,1]]);
    }else{
     const [x,y,z]=item.center;
     portalRing(mesh,x,y+.075+t*.09,z,item.color);
     // An expanding horizontal shock ring and a brief, translucent volume flash.
     for(let k=from;k<mesh.length;k+=12){mesh[k]=x+(mesh[k]-x)*(1+t*2.5);mesh[k+2]=z+(mesh[k+2]-z)*(1+t*2.5);}
     const flash=Math.max(0,1-t*3);
     if(flash>0)sphere(mesh,[x,y+.36,z],[.35*flash,.48*flash,.35*flash],item.color,7);
    }
    for(let k=from;k<mesh.length;k+=12){mesh[k+9]=item.kind==='jelly'?6:7;mesh[k+10]=fade*(item.position ? .85 : .45);mesh[k+11]=0;}
   }
   this.device.queue.writeBuffer(this.effectBuffer,0,new Float32Array(mesh));return mesh.length/12;
  }
  drawEffects(pass,level,effectCount){
   pass.setBindGroup(0,this.sceneGroup);pass.setBindGroup(1,this.skinGroups[0]);
   if(effectCount){pass.setPipeline(this.effectPipeline);pass.setVertexBuffer(0,this.effectBuffer);pass.draw(effectCount);}
   const count=Math.min(4,level.world.portals.length);
   if(count){pass.setPipeline(this.portalHaloPipeline);pass.setVertexBuffer(0,this.portalHaloBuffer);pass.draw(6,count);pass.setPipeline(this.portalRingPipeline);pass.setVertexBuffer(0,this.portalRingBuffer);pass.draw(this.portalRingCount,count*3);}
   if(level.goals.length){pass.setPipeline(this.goalBeamPipeline);pass.setVertexBuffer(0,this.portalHaloBuffer);pass.draw(6,Math.min(3,level.goals.length));}
  }
  render(level,players,camera,angle,time,scale,dt=1/60){
   if(!this.ready)return;this.resize();const d=this.device,w=this.canvas.width,h=this.canvas.height;
   const c=Math.cos(angle),s=Math.sin(angle),view=[(c+s)*.612372,.5,(c-s)*.612372],target=[camera.x,0,camera.z];
   const vp=viewMatrix(target,view,innerWidth/scale,innerHeight/scale,-.12),lightVP=viewMatrix([5.5,0,5.5],normalize([-.45,1.,.35]),18,18);
   const uniforms=new Float32Array(112);uniforms.set(vp);uniforms.set(lightVP,16);uniforms.set([...target.map((v,k)=>v+view[k]*20),1],32);uniforms.set([-2,12,9,1],36);
   players.forEach((p,i)=>uniforms.set([p.x,(p.y||0)+.42,p.z,p.state==='dead'?0:1+(level.world.heightAt(p.x,p.z)||0)],40+i*4));uniforms.set([w,h,time,this.mesh?1:0],52);
   level.world.portals.slice(0,4).forEach((p,i)=>{uniforms.set([p.x,p.y??level.world.heightAt(p.x,p.z)??0,p.z,level.world.portalCharge(p,players)],56+i*8);uniforms.set([...(p.color==='violet'?[.7,.045,1.]:[1.,.34,.025]),i*.23],60+i*8);});
   this.goalBeamStrength??=[];this.goalWinGlow??=0;
   const fade=level.reducedMotion?1:1-Math.exp(-Math.min(dt,.1)*8),celebrate=level.reducedMotion?1:1-Math.exp(-Math.min(dt,.1)*4);
   this.goalWinGlow+=((level.won?1:0)-this.goalWinGlow)*celebrate;
   level.goals.slice(0,3).forEach((g,i)=>{const target=level.world.goalActive(g,players[i])?1:0;this.goalBeamStrength[i]=(this.goalBeamStrength[i]||0)+(target-(this.goalBeamStrength[i]||0))*fade;uniforms.set([g.x,g.y??level.world.heightAt(g.x,g.z)??0,g.z,this.goalBeamStrength[i]],88+i*8);uniforms.set([...[[.45,1.,.08],[.035,.7,1.],[1.,.055,.025]][i],this.goalWinGlow],92+i*8);});d.queue.writeBuffer(this.uniform,0,uniforms);
   const nodes=new Float32Array(192*4);players.forEach((p,i)=>level.soft.get(p).positions.forEach((q,j)=>nodes.set([q[0],p.state==='dead'?-100:q[1],q[2],1],(i*64+j)*4)));d.queue.writeBuffer(this.nodes,0,nodes);
   if(this.bridgeKey===undefined){this.buildScene(level);this.bridgeKey='static';}
   const bridgeCount=this.bridges(level),propCount=this.props(level,players,angle,time),effectCount=this.effects(level.effects,view),encoder=d.createCommandEncoder();
   const computePass=encoder.beginComputePass();computePass.setPipeline(this.compute);computePass.setBindGroup(0,this.computeGroup);computePass.dispatchWorkgroups(Math.ceil(4050/64));computePass.end();
   const shadowPass=encoder.beginRenderPass({colorAttachments:[],depthStencilAttachment:{view:this.shadowTexture.createView(),depthClearValue:1,depthLoadOp:'clear',depthStoreOp:'store'}});
   shadowPass.setPipeline(this.shadow);shadowPass.setBindGroup(0,this.shadowGroup);shadowPass.setVertexBuffer(0,this.staticBuffer);shadowPass.draw(this.staticCount);if(bridgeCount){shadowPass.setVertexBuffer(0,this.bridgeBuffer);shadowPass.draw(bridgeCount);}shadowPass.end();
   const opaque=encoder.beginRenderPass({colorAttachments:[{view:this.msaa.createView(),resolveTarget:this.hdr.createView(),clearValue:{r:.012,g:.017,b:.022,a:1},loadOp:'clear',storeOp:'store'}],depthStencilAttachment:{view:this.depth.createView(),depthClearValue:1,depthLoadOp:'clear',depthStoreOp:'store'}});
   opaque.setPipeline(this.opaque);opaque.setBindGroup(0,this.sceneGroup);opaque.setBindGroup(1,this.skinGroups[0]);opaque.setVertexBuffer(0,this.staticBuffer);opaque.draw(this.staticCount);if(bridgeCount){opaque.setVertexBuffer(0,this.bridgeBuffer);opaque.draw(bridgeCount);}opaque.setVertexBuffer(0,this.propBuffer);opaque.draw(propCount);opaque.setVertexBuffer(0,this.decorationBuffer);opaque.draw(this.decorationCount);opaque.end();
   const order=[0,1,2].filter(i=>players[i].state!=='dead').sort((a,b)=>dot([players[a].x,players[a].y||0,players[a].z],view)-dot([players[b].x,players[b].y||0,players[b].z],view));
   for(const i of order){
    const backPass=encoder.beginRenderPass({colorAttachments:[{view:this.exits[i].createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:'clear',storeOp:'store'}],depthStencilAttachment:{view:this.exitDepth.createView(),depthClearValue:0,depthLoadOp:'clear',depthStoreOp:'store'}});
    backPass.setPipeline(this.back);backPass.setBindGroup(0,this.sceneGroup);backPass.setBindGroup(1,this.skinGroups[(i+1)%3]);backPass.setIndexBuffer(this.indexBuffer,'uint32');backPass.drawIndexed(this.indexCount,1,0,0,i);backPass.end();
    encoder.copyTextureToTexture({texture:this.hdr},{texture:this.background},[w,h]);
    const skin=encoder.beginRenderPass({colorAttachments:[{view:this.msaa.createView(),resolveTarget:this.hdr.createView(),loadOp:'load',storeOp:'store'}],depthStencilAttachment:{view:this.depth.createView(),depthLoadOp:'load',depthStoreOp:'store'}});
    skin.setPipeline(this.skin);skin.setBindGroup(0,this.sceneGroup);skin.setBindGroup(1,this.skinGroups[i]);skin.setIndexBuffer(this.indexBuffer,'uint32');skin.drawIndexed(this.indexCount,1,0,0,i);if(i===order[order.length-1])this.drawEffects(skin,level,effectCount);skin.end();
   }
   if(!order.length&&(effectCount||level.world.portals.length||level.goals.length)){const effects=encoder.beginRenderPass({colorAttachments:[{view:this.msaa.createView(),resolveTarget:this.hdr.createView(),loadOp:'load',storeOp:'store'}],depthStencilAttachment:{view:this.depth.createView(),depthLoadOp:'load',depthStoreOp:'store'}});this.drawEffects(effects,level,effectCount);effects.end();}
   if(this.mesh){const lattice=encoder.beginRenderPass({colorAttachments:[{view:this.msaa.createView(),resolveTarget:this.hdr.createView(),loadOp:'load',storeOp:'store'}]});lattice.setPipeline(this.latticePipeline);lattice.setBindGroup(0,this.latticeGroup);lattice.draw(this.edgeCount,3);lattice.end();}
   if(this.colliders){const lines=colliderLines(level.world.debugBoxes());d.queue.writeBuffer(this.colliderBuffer,0,lines);const debug=encoder.beginRenderPass({colorAttachments:[{view:this.msaa.createView(),resolveTarget:this.hdr.createView(),loadOp:'load',storeOp:'store'}]});debug.setPipeline(this.colliderPipeline);debug.setBindGroup(0,this.colliderGroup);debug.setVertexBuffer(0,this.colliderBuffer);debug.draw(lines.length/6);debug.end();}
   const finish=encoder.beginRenderPass({colorAttachments:[{view:this.context.getCurrentTexture().createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:1}}]});finish.setPipeline(this.post);finish.setBindGroup(0,this.postGroup);finish.draw(3);finish.end();
   d.queue.submit([encoder.finish()]);this.frames++;
  }
 }
 const api={Renderer,viewMatrix,surfaceBindings};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JellyGPU=api;
})(globalThis);
