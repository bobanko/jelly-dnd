import { PORTAL_LIMIT } from '../layout.js';
import { STONE_DETAIL } from '../mesh.js';
import { ASSEMBLY_BLOCK_END } from '../assembly.js';
import { runeGlyphShader } from '../geometry/runes.js';
// Linear HDR colour of the void at the bottom of the screen, shared by fog and sky.
export const VOID_COLOR = '.0026,.0034,.0068';
export const shared = `
 struct Portal { position:vec4f, color:vec4f, animation:vec4f };
 struct Goal { position:vec4f, color:vec4f };
 struct Scene { vp:mat4x4f, lightVP:mat4x4f, eye:vec4f, light:vec4f, body0:vec4f, body1:vec4f, body2:vec4f, options:vec4f, portals:array<Portal,${PORTAL_LIMIT}>, goals:array<Goal,5>, torches:array<vec4f,8>, body3:vec4f, body4:vec4f, bodySlots:array<vec4f,2>, finish:vec4f, goalSlots:array<vec4f,2> };
 @group(0) @binding(0) var<uniform> scene:Scene;
 struct Out { @builtin(position) clip:vec4f, @location(0) world:vec3f, @location(1) normal:vec3f, @location(2) color:vec3f, @location(3) material:f32, @location(4) local:vec3f };
 struct Vertex { position:vec4f, normal:vec4f, info:vec4f };
 @group(0) @binding(1) var<storage,read> vertices:array<Vertex>;
 @group(0) @binding(4) var stoneAtlas:texture_2d<f32>;
 @group(0) @binding(5) var oakTexture:texture_2d<f32>;
 @group(0) @binding(6) var materialSampler:sampler;
 ${runeGlyphShader}
 fn assemblyPosition(p:vec3f,block:vec4f)->vec3f{
  if(scene.finish.z>=1.){return p;}
  // Decorative pillars (order offset by 2) rise out of the fog once the level has formed.
  if(block.w>1.5){let t=clamp((scene.finish.z-.62-(block.w-2.)*.22)/.16,0.,1.);return p-vec3f(0,9.*pow(1.-t,3.),0);}
  let blockProgress=clamp(scene.finish.z/${ASSEMBLY_BLOCK_END},0.,1.);
  let t=clamp((blockProgress-block.w*.6)/.4,0.,1.);let remaining=pow(1.-t,3.);
  let right=normalize(vec3f(scene.vp[0].x,scene.vp[1].x,scene.vp[2].x));let up=normalize(vec3f(scene.vp[0].y,scene.vp[1].y,scene.vp[2].y));
  let seed=hash(block.xyz+vec3f(17,3,41));let side=u32(floor(seed*6.));var direction=right;
  switch(side){case 0u:{direction=-right;}case 1u:{direction=right;}case 2u:{direction=up;}case 3u:{direction=-up;}case 4u:{direction=vec3f(0,1,0);}default:{direction=vec3f(0,-1,0);}}
  let distance=max(12.,length(scene.eye.xyz-block.xyz)*1.25);
  return block.xyz+(p-block.xyz)*mix(1.,.7,remaining)+direction*distance*remaining;
 }
 @vertex fn assemblyVS(@location(0) p:vec3f,@location(1) n:vec3f,@location(2) color:vec3f,@location(3) material:vec3f,@location(4) block:vec4f)->Out{
  let position=assemblyPosition(p,block);var o:Out;o.clip=scene.vp*vec4f(position,1);o.world=position;o.normal=n;o.color=color;o.material=material.x;o.local=vec3f(material.y,0,material.z);return o;
 }
 @vertex fn assemblyShadowVS(@location(0) p:vec3f,@location(4) block:vec4f)->@builtin(position) vec4f{return scene.lightVP*vec4f(assemblyPosition(p,block),1);}
 @vertex fn solidVS(@location(0) p:vec3f,@location(1) n:vec3f,@location(2) color:vec3f,@location(3) material:vec3f)->Out{
  var position=p;
  if(material.x>3.5&&material.x<4.5){
   let flicker=scene.options.z;
   position.x+=sin(flicker*9.+p.y*8.)*.018;
   position.y+=sin(flicker*13.+p.y*11.)*.025;
   position.z+=cos(flicker*8.+p.y*9.)*.012;
  }
  var o:Out;o.clip=scene.vp*vec4f(position,1);o.world=position;o.normal=n;o.color=color;o.material=material.x;o.local=vec3f(material.y,0,material.z);return o;
 }
 @vertex fn softVS(@builtin(vertex_index) id:u32,@builtin(instance_index) instance:u32)->Out{
  let v=vertices[id+instance*1350u];var o:Out;o.clip=scene.vp*v.position;o.world=v.position.xyz;o.normal=v.normal.xyz;
  let colors=array<vec3f,5>(vec3f(.045,.72,.095),vec3f(.025,.15,.95),vec3f(.95,.055,.025),vec3f(.58,.045,.92),vec3f(.95,.61,.025));
  o.color=colors[u32(v.info.w)];o.material=2.+v.info.w;o.local=v.info.xyz;return o;
 }
 @vertex fn portalHaloVS(@location(0) p:vec3f,@builtin(instance_index) instance:u32)->Out{
  let portal=scene.portals[instance];var o:Out;o.world=portal.position.xyz+vec3f(p.x*.78,.033,p.z*.78);o.clip=scene.vp*vec4f(o.world,1.);
  let activation=portal.animation.x;o.normal=vec3f(0,1,0);o.color=mix(mix(vec3f(.2,.22,.25),portal.color.rgb,.16),portal.color.rgb,activation);o.material=9.;o.local=vec3f(p.x,mix(.035,.065+portal.position.w*.3,activation),p.z);return o;
 }
 @vertex fn portalRingVS(@location(0) p:vec3f,@location(1) n:vec3f,@builtin(instance_index) instance:u32)->Out{
  let portal=scene.portals[instance/3u];let phase=fract(scene.options.z*.42+f32(instance%3u)/3.+portal.color.w);let radius=.85+phase*.8;
  var o:Out;o.world=portal.position.xyz+vec3f(p.x*radius,.065+phase*.92+p.y*(1.-phase*.6),p.z*radius);o.clip=scene.vp*vec4f(o.world,1.);
  let charge=portal.position.w;let activation=portal.animation.x;
  if(activation<.001){o.clip=vec4f(2,2,2,1);}
  o.normal=normalize(vec3f(n.x/radius,n.y/(1.-phase*.6),n.z/radius));o.color=portal.color.rgb*(1.+charge*1.15);o.material=10.;
  o.local=vec3f(0.,smoothstep(0.,.1,phase)*pow(1.-phase,1.6)*(.22+charge*.38)*activation,0.);return o;
 }
 @fragment fn portalFXFS(o:Out)->@location(0) vec4f{
  var alpha=o.local.y;var color=o.color*1.8;
  if(o.material<9.5){let radius=length(o.local.xz);alpha*=exp(-radius*radius*4.)*(1.-smoothstep(.7,1.,radius));color=o.color*1.2;}
  return vec4f(color,alpha);
 }
 @vertex fn goalBeamVS(@location(0) p:vec3f,@builtin(instance_index) instance:u32)->Out{
  let goal=scene.goals[instance];let victory=goal.color.w;let uv=vec2f(p.x,(p.z+1.)*.5);
  let right=normalize(vec3f(scene.vp[0].x,scene.vp[1].x,scene.vp[2].x));let width=mix(.2,.4,victory);let height=3.3;
  var o:Out;o.world=goal.position.xyz+right*uv.x*width+vec3f(0,.04+uv.y*height,0);o.clip=scene.vp*vec4f(o.world,1.);
  if(victory<.001){o.clip=vec4f(2,2,2,1);}
  o.normal=vec3f(0,1,0);o.color=goal.color.rgb*2.4;o.material=victory;o.local=vec3f(uv,goal.position.w*victory);return o;
 }
 @fragment fn goalBeamFS(o:Out)->@location(0) vec4f{
  let edge=exp(-o.local.x*o.local.x*5.);let tip=1.-smoothstep(.5,1.,o.local.y);let base=smoothstep(0.,.035,o.local.y);
  let breath=.97+.03*sin(scene.options.z*2.+o.local.y*8.);let core=exp(-o.local.x*o.local.x*45.)*o.material*.1;
  let alpha=o.local.z*(edge*.34+core)*tip*base*breath;
  return vec4f(o.color,alpha);
 }
 @vertex fn runeVS(@location(0) p:vec3f,@location(4) positionSize:vec4f,@location(5) colorOpacity:vec4f,@location(6) info:vec4f)->Out{
  let right=normalize(vec3f(scene.vp[0].x,scene.vp[1].x,scene.vp[2].x));let view=normalize(-vec3f(scene.vp[0].z,scene.vp[1].z,scene.vp[2].z));let up=normalize(cross(view,right));
  let c=cos(info.y);let s=sin(info.y);let uv=vec2f(p.x*c-p.z*s,p.x*s+p.z*c);var o:Out;
  o.world=positionSize.xyz+(right*uv.x+up*uv.y)*positionSize.w;o.clip=scene.vp*vec4f(o.world,1.);
  o.normal=view;o.color=colorOpacity.rgb*2.5;o.material=info.x;o.local=vec3f(p.x*.3,-p.z*.3,colorOpacity.w);return o;
 }
 @vertex fn dustVS(@builtin(vertex_index) vertex:u32,@location(4) mote:vec4f)->Out{
  let corners=array<vec2f,6>(vec2f(-1,-1),vec2f(1,-1),vec2f(1,1),vec2f(-1,-1),vec2f(1,1),vec2f(-1,1));let uv=corners[vertex];
  let phase=mote.w;let t=scene.options.z*.24*scene.options.w+phase;
  let drift=vec3f(sin(t)*.28,sin(t*.73+phase)*.16,cos(t*.85)*.28);
  // Every mote fades in, drifts and fades out, then reappears at another nearby spot.
  let cycle=t*.11+fract(phase*.37);let life=fract(cycle);let respawn=floor(cycle)+phase*17.;
  let jump=(fract(sin(vec3f(respawn,respawn*1.37,respawn*2.11))*43758.55)-.5)*vec3f(3.,1.4,3.);
  let fade=smoothstep(0.,.2,life)*(1.-smoothstep(.7,1.,life));
  let right=normalize(vec3f(scene.vp[0].x,scene.vp[1].x,scene.vp[2].x));let up=normalize(vec3f(scene.vp[0].y,scene.vp[1].y,scene.vp[2].y));
  let size=.028+.022*fract(phase*13.71);var o:Out;
  o.world=mote.xyz+jump+drift+(right*uv.x+up*uv.y)*size;o.clip=scene.vp*vec4f(o.world,1.);
  o.normal=vec3f(0,1,0);o.color=mix(vec3f(.8,.56,.25),vec3f(1.,.85,.53),fract(phase*7.13));
  o.material=0.;o.local=vec3f(uv,(.28+.16*(.5+.5*sin(t*.8+phase)))*fade);return o;
 }
 @fragment fn dustFS(o:Out)->@location(0) vec4f{
  let radius=dot(o.local.xy,o.local.xy);let core=exp(-radius*18.);let halo=exp(-radius*4.)*(1.-smoothstep(.5,1.,sqrt(radius)));
  return vec4f(o.color*2.,(core+halo*.2)*o.local.z);
 }
 @fragment fn runeFS(o:Out)->@location(0) vec4f{
  let distance=runeDistance(o.local.xy,u32(o.material));let aa=max(.001,fwidth(distance));
  let stroke=1.-smoothstep(.022-aa,.022+aa,distance);let glow=exp(-distance*35.)*.22;
  return vec4f(o.color,(stroke*.85+glow)*o.local.z);
 }
 struct BeamOut { @builtin(position) clip:vec4f, @location(0) uv:vec2f, @location(1) tint:vec4f, @location(2) @interpolate(flat) beamLength:f32, @location(3) @interpolate(flat) impact:f32, @location(4) @interpolate(flat) tip:f32 };
 @vertex fn beamVS(@builtin(vertex_index) vertex:u32,@location(4) start:vec4f,@location(5) end:vec4f,@location(6) tint:vec4f)->BeamOut{
  let corners=array<vec2f,6>(vec2f(-1,-1),vec2f(1,-1),vec2f(1,1),vec2f(-1,-1),vec2f(1,1),vec2f(-1,1));let p=corners[vertex%6u];
  let direction=normalize(end.xyz-start.xyz);let view=normalize(scene.eye.xyz-(start.xyz+end.xyz)*.5);let side=cross(direction,view);
  let fallback=cross(direction,select(vec3f(0,1,0),vec3f(1,0,0),abs(direction.y)>.9));
  let right=normalize(select(fallback,side,dot(side,side)>.0001));let beamLength=length(end.xyz-start.xyz);
  // Leave room for rounded glow caps instead of cutting the quad at the raycast hit.
  let uv=vec2f(p.x,mix(-.22,beamLength+.22,(p.y+1.)*.5));var o:BeamOut;
  var world=start.xyz+direction*uv.y+right*uv.x*.24;o.uv=uv;o.tip=0.;
  if(vertex>=6u){
   // Face the contact halo toward the camera so it stays round at every beam angle.
   let cameraRight=normalize(vec3f(scene.vp[0].x,scene.vp[1].x,scene.vp[2].x));let cameraUp=normalize(vec3f(scene.vp[0].y,scene.vp[1].y,scene.vp[2].y));
   let towardEye=normalize(scene.eye.xyz-end.xyz);
   world=end.xyz-direction*.025+towardEye*.045+(cameraRight*p.x+cameraUp*p.y)*.2;o.uv=p;o.tip=1.;
  }
  o.clip=scene.vp*vec4f(world,1.);o.tint=tint;o.beamLength=beamLength;o.impact=end.w;return o;
 }
 fn arcNoise(x:f32,seed:f32)->f32{
  let cell=floor(x);let a=fract(sin(cell*127.1+seed*311.7)*43758.5453)*2.-1.;let b=fract(sin((cell+1.)*127.1+seed*311.7)*43758.5453)*2.-1.;
  return mix(a,b,fract(x));
 }
 @fragment fn beamFS(o:BeamOut)->@location(0) vec4f{
  let uv=o.uv;let time=scene.options.z;let along=uv.y;let progress=clamp(along/o.beamLength,0.,1.);let envelope=sin(progress*3.14159265);
  // Piecewise linear noise forms travelling lightning kinks. Both endpoints
  // stay attached to the emitter and the raycast hit, even on short beams.
  let epoch=floor(time*11.);let blend=smoothstep(0.,1.,fract(time*11.));
  let arc=mix(arcNoise(along*5.5,epoch),arcNoise(along*5.5,epoch+1.),blend)*.34*envelope;
  let branch=arc+arcNoise(along*9.-time*3.,19.)*.42*envelope;
  let distance=abs(uv.x-arc);let width=max(.08,fwidth(uv.x)*.7);let core=exp(-pow(distance/width,2.));
  let glow=exp(-pow(distance/.36,2.));let filament=exp(-pow((uv.x-branch)/max(.018,fwidth(uv.x)*.5),2.));
  let flow=.88+.12*sin(along*24.-time*17.);
  let endFade=1.-smoothstep(o.beamLength-min(.1,o.beamLength*.35),o.beamLength+.005,along);
  let startFade=smoothstep(-.025,min(.045,o.beamLength*.35),along);
  let outside=max(0.,max(-along,along-o.beamLength));let glowCap=exp(-pow(outside/.075,2.));
  let sourceFlare=exp(-uv.x*uv.x*15.-pow(along/.065,2.))*.35;
  var alpha=((core*.95+filament*.3)*startFade*endFade+glow*.23*glowCap+sourceFlare)*o.tint.w*flow;
  var color=mix(o.tint.rgb*2.3,vec3f(3.),core*.7);
  if(o.tip>.5){
   let radius=length(o.uv);let hot=exp(-radius*radius*25.);let halo=exp(-radius*radius*4.8)*(1.-smoothstep(.7,1.,radius));
   color=mix(o.tint.rgb*2.3,vec3f(3.),hot*.85);alpha=(hot*1.2+halo*.5)*o.tint.w*o.impact;
  }
  return vec4f(color,alpha);
 }
 @vertex fn goalGlowVS(@location(0) p:vec3f,@builtin(instance_index) instance:u32)->Out{
  let goal=scene.goals[instance];var o:Out;
  o.world=goal.position.xyz+vec3f(p.x*.68,.061,p.z*.68);o.clip=scene.vp*vec4f(o.world,1.);
  o.normal=vec3f(0,1,0);o.color=goal.color.rgb;o.material=9.;o.local=vec3f(p.x,.13+goal.position.w*.45,p.z);return o;
 }
 // The seal sits outside the jelly's footprint, so its charge remains readable.
 @vertex fn goalSealVS(@location(0) p:vec3f,@builtin(instance_index) instance:u32)->Out{
  let goal=scene.goals[instance];var o:Out;
  o.world=goal.position.xyz+vec3f(p.x*.86,.064,p.z*.86);o.clip=scene.vp*vec4f(o.world,1.);
  if(scene.goalSlots[instance/4u][instance%4u]<0.){o.clip=vec4f(2,2,2,1);}
  o.normal=vec3f(0,1,0);o.color=goal.color.rgb;o.material=scene.goalSlots[instance/4u][instance%4u];o.local=vec3f(p.x*.86,scene.finish.x,p.z*.86);return o;
 }
 @fragment fn goalSealFS(o:Out)->@location(0) vec4f{
  let uv=o.local.xz;let radius=length(uv);let progress=o.local.y;
  let phase=fract(atan2(uv.x,-uv.y)/6.2831853+1.);
  let filled=1.-smoothstep(progress-.006,progress+.006,phase);
  let node=select(vec2f(0.,sign(uv.y)*.73),vec2f(sign(uv.x)*.73,0.),abs(uv.x)>abs(uv.y));
  let distance=runeDistance((uv-node)/.25,u32(o.material))*.25;
  let aa=max(.001,fwidth(radius));
  let ring=1.-smoothstep(.009-aa,.009+aa,abs(radius-.59));
  let glyph=1.-smoothstep(.006-aa,.006+aa,distance);
  let halo=exp(-abs(radius-.59)*80.)*.12+exp(-distance*110.)*.13;
  let head=exp(-pow((phase-progress)*100.,2.))*(1.-step(1.,progress));
  let alpha=(ring*.7+glyph+halo)*(.12+filled*.75)+ring*head*.35;
  return vec4f(o.color*(2.+progress),alpha*smoothstep(0.,.045,progress));
 }
 @vertex fn shadowVS(@location(0) p:vec3f)->@builtin(position) vec4f{return scene.lightVP*vec4f(p,1);}
 @group(0) @binding(2) var shadowMap:texture_depth_2d;
 @group(0) @binding(3) var shadowSampler:sampler_comparison;
 fn shadow(p:vec3f,n:vec3f)->f32{
  let clip=scene.lightVP*vec4f(p+n*.012,1);let uv=vec2f(clip.x*.5+.5,.5-clip.y*.5);var lit=0.;
  for(var y=-1;y<=1;y++){for(var x=-1;x<=1;x++){lit+=textureSampleCompareLevel(shadowMap,shadowSampler,uv+vec2f(f32(x),f32(y))/.1024e4,clip.z-.001);}}
  return lit/9.;
 }
 // Arithmetic hash (no transcendental functions), cheap enough for per-pixel noise.
 fn hash(p:vec3f)->f32{var q=fract(p*.1031);q+=dot(q,q.zyx+31.32);return fract((q.x+q.y)*q.z);}
 // Lava crust: Voronoi plates whose centres drift slowly. Returns the distance to the nearest
 // plate centre and the gap to the second nearest (small along the glowing cracks).
 fn lavaCells(p:vec2f)->vec2f{
  let cell=floor(p);let f=fract(p);var d1=8.;var d2=8.;
  for(var j=-1;j<=1;j++){for(var i=-1;i<=1;i++){
   let g=vec2f(f32(i),f32(j));let seed=vec2f(hash(vec3f(cell+g,7.)),hash(vec3f(cell+g,13.)));
   let center=g+.15+seed*.7+.1*sin(scene.options.z*.35+seed*6.28)-f;let d=length(center);
   if(d<d1){d2=d1;d1=d;}else if(d<d2){d2=d;}
  }}
  return vec2f(d1,d2-d1);
 }
 // The void fog below the lowest floor fades into the sky colour painted by the post pass.
 const VOID_COLOR=vec3f(${VOID_COLOR});
 fn voidFog(p:vec3f,color:vec3f)->vec3f{return mix(color,VOID_COLOR,smoothstep(.05,1.2,scene.finish.y-p.y)*.96);}
 // Torch flames are camera-facing, additive billboards drawn after the opaque scene,
 // so jelly refraction still sees them. Each one sways with its own phase.
 @vertex fn flameVS(@location(0) p:vec3f,@builtin(instance_index) instance:u32)->Out{
  let torch=scene.torches[instance];var o:Out;
  let right=normalize(vec3f(scene.vp[0].x,scene.vp[1].x,scene.vp[2].x));let view=normalize(-vec3f(scene.vp[0].z,scene.vp[1].z,scene.vp[2].z));let up=normalize(cross(view,right));
  let height=(p.z+1.)*.5*.6-.08;
  o.world=torch.xyz+vec3f(0.,-.12,0.)+right*p.x*.2+up*height;o.clip=scene.vp*vec4f(o.world,1.);
  if(torch.w<.5){o.clip=vec4f(2,2,2,1);}
  o.normal=view;o.color=vec3f(1.);o.material=f32(instance);o.local=vec3f(p.x,height/.5,0.);return o;
 }
 @fragment fn flameFS(o:Out)->@location(0) vec4f{
  let t=scene.options.z*1.1+o.material*1.93;let y=o.local.y;
  let sway=(sin(y*5.2-t*6.1)*.12+sin(y*11.5-t*10.3)*.05)*clamp(y,0.,1.);
  let x=o.local.x-sway;
  let profile=.72*pow(clamp(1.-y,0.,1.),.9)*smoothstep(-.16,.22,y)+.0001;
  let d=abs(x)/profile;
  let body=(1.-smoothstep(.4,1.,d))*(1.-smoothstep(.62,1.,y));
  let edge=body*smoothstep(.25,.95,d+y*.35);
  let core=(1.-smoothstep(.05,.55,d+max(y,0.)*1.25))*smoothstep(-.14,.04,y);
  let flicker=.9+.1*sin(t*14.3+y*4.)*sin(t*6.7);
  let r=vec2f(o.local.x,(y-.2)*.8);let halo=exp(-dot(r,r)*5.)*.2;
  let color=vec3f(1.,.4,.05)*body+vec3f(.9,.12,.01)*edge*.6+vec3f(1.,.72,.3)*core*.62+vec3f(1.,.28,.03)*halo;
  return vec4f(color*flicker,1.);
 }
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
 struct Stone { albedo:vec3f, normal:vec3f, occlusion:f32 };
 // texel/value: the atlas sample; slope: screen derivatives of value, taken in uniform control flow.
 // Kept lean on purpose: it shades most of the screen on low-end integrated GPUs.
 // broad: the moss amount baked per vertex (see mossAt).
 fn stoneSurface(p:vec3f,normal:vec3f,base:vec3f,texel:vec3f,value:f32,slope:vec2f,uv:vec2f,dp1:vec3f,dp2:vec3f,masonry:bool,broad:f32)->Stone{
  // Painted cracks and pits become relief through the screen-derivative surface gradient.
  let r1=cross(dp2,normal);let r2=cross(normal,dp1);let det=dot(dp1,r1);
  var n=normal;if(abs(det)>1e-14){n-=(r1*slope.x+r2*slope.y)*(.012/det);}
  var albedo=base*mix(vec3f(clamp(value*3.6,.38,1.22)),texel*3.6,.2);
  let tile=fract(uv*4.);let edge=min(min(tile.x,tile.y),min(1.-tile.x,1.-tile.y));
  let axisPeak=max(abs(normal.x),max(abs(normal.y),abs(normal.z)));let bevel=smoothstep(.02,.24,1.-axisPeak);
  // Worn, lighter bevels, chipped where the painted stone is dark; the outermost line stays a dark joint.
  let chip=1.-smoothstep(.11,.19,value);
  albedo*=(1.+bevel*.34*(1.-chip))*mix(1.,.55,bevel*chip)*mix(.45,1.,smoothstep(.02,.034,edge));
  var occlusion=mix(.6,1.,smoothstep(.1,.32,value));var joint=0.;
  if(masonry&&abs(normal.y)<.72){
   // Two courses per block, each split into one to three stones; one hash seeds a whole course.
   let alongX=abs(normal.z)>abs(normal.x);let tangent=select(vec3f(0,0,1),vec3f(1,0,0),alongX);
   let along=select(p.z,p.x,alongX);let column=round(along);let a=along-column+.5;
   let course=floor(p.y*2.);let seed=hash(vec3f(column,course,round(select(p.x,p.z,alongX)*2.)));let count=1.+floor(seed*2.7);
   let j1=(1.+(fract(seed*13.7)-.5)*.2)/count;let j2=(2.+(fract(seed*29.3)-.5)*.2)/count;
   let d1=a-j1;let d2=select(9.,a-j2,count>2.5);let near=select(d1,d2,abs(d2)<abs(d1));
   let jointGap=select(1.,abs(near)*.97,count>1.5);let level=fract(p.y);let courseGap=abs(level-.5);
   let gap=min(jointGap,courseGap)+(value-.22)*.05;
   joint=1.-smoothstep(.006,.022,gap);let bend=(1.-smoothstep(.004,.045,gap))*.55;
   if(jointGap<courseGap){n-=tangent*sign(near)*bend;}else{n.y+=select(-1.,1.,level<.5)*bend;}
   let tone=fract(seed*71.3+step(j1,a)*.37+step(j2,a)*.61);
   albedo*=mix(.25,1.,1.-joint)*(.86+tone*.26)*mix(vec3f(1.),vec3f(1.07,.98,.88),step(.62,tone));
   occlusion*=mix(.45,1.,1.-joint);
  }
  // Moss gathers in cracks, joints and along worn edges, in broad irregular patches.
  let growth=broad+(.24-value)*.6;
  let crevice=1.-smoothstep(.1,.3,value);let rim=1.-smoothstep(.034,.09,edge);
  let moss=smoothstep(.56,.78,growth)*clamp(crevice*.9+joint*.8+bevel*.55+rim*.45,0.,1.);
  albedo=mix(albedo,vec3f(.075,.115,.035)*(.6+value*2.2),moss*.62);
  var s:Stone;s.albedo=albedo;s.normal=normalize(n);s.occlusion=occlusion;return s;
 }
 struct Lighting { light:vec3f, marks:vec3f, sun:f32 };
 fn jellyTint(slot:f32)->vec3f{
  if(slot<.5){return vec3f(.09,.85,.18);}if(slot<1.5){return vec3f(.035,.17,1.);}if(slot<2.5){return vec3f(1.,.08,.035);}if(slot<3.5){return vec3f(.65,.08,1.);}return vec3f(1.,.7,.025);
 }
 // One jelly's coloured transmission pool (scale/add) and glowing footprint outline (marks).
 // Called once per body with constant arguments: a dynamically indexed local array would
 // spill to slow memory on some GPUs.
 struct BodyLight { scale:vec3f, add:vec3f, marks:vec3f };
 fn bodyLight(p:vec3f,up:f32,body:vec4f,slot:f32,acc:BodyLight)->BodyLight{
  let delta=p.xz-body.xz;let d2=dot(delta,delta);
  // Beyond about 1.6 units every term below is negligible.
  if(body.w<=0.||d2>2.6||p.y>=body.y-.2){return acc;}
  let height=max(0.,body.y-.42-(body.w-4.));let radius=.28+height*.18;let tint=jellyTint(slot);var r=acc;
  r.scale*=mix(vec3f(1.),tint*.6+vec3f(.2),exp(-d2/(radius*radius))*.36/(1.+height*2.));
  r.add+=tint*exp(-d2/.34)*.22/(1.+height*3.);
  if(up>.6&&abs(p.y-(body.w-4.))<.12){
   let q=abs(delta)-vec2f(.33);let outline=length(max(q,vec2f(0.)))+min(max(q.x,q.y),0.)-.09;
   r.marks+=tint*(exp(-pow(outline/.015,2.))*1.15+exp(-max(outline,0.)*22.)*smoothstep(-.025,0.,outline)*.3)*(1.-smoothstep(.3,.65,height));
  }
  return r;
 }
 // Shared dungeon lighting: cool sky ambient and moonlit key with shadows, warm torches,
 // and each jelly's coloured transmission pool plus its glowing footprint outline (marks).
 fn dungeonLight(p:vec3f,n:vec3f,up:f32,occlusion:f32)->Lighting{
  let l=normalize(scene.light.xyz-p);
  let ambient=mix(vec3f(.04,.034,.032),vec3f(.092,.11,.165),n.y*.5+.5);
  let sun=shadow(p,n);
  var light=(ambient+vec3f(.08,.13,.27)*max(0.,dot(n,normalize(vec3f(-.6,.4,-.6)))))*occlusion+vec3f(.98,.85,.69)*max(0.,dot(n,l))*sun;
  var torchLight=vec3f(0.);
  for(var i=0;i<8;i++){
   let delta=scene.torches[i].xyz-p;let reach=dot(delta,delta);
   if(scene.torches[i].w<.5||reach>13.69){continue;}
   let distance=sqrt(reach);let falloff=1.-smoothstep(.1,3.7,distance);let attenuation=falloff*falloff;
   let flicker=1.+(sin(scene.options.z*8.+f32(i)*2.)*.6+sin(scene.options.z*13.7+f32(i)*5.)*.4)*.045;
   torchLight+=vec3f(4.5,1.75,.36)*attenuation*max(.12,dot(n,delta/distance))*flicker;
  }
  light+=torchLight*(.5+.5*occlusion);
  var bodies:BodyLight;bodies.scale=vec3f(1.);
  bodies=bodyLight(p,up,scene.body0,scene.bodySlots[0].x,bodies);bodies=bodyLight(p,up,scene.body1,scene.bodySlots[0].y,bodies);
  bodies=bodyLight(p,up,scene.body2,scene.bodySlots[0].z,bodies);bodies=bodyLight(p,up,scene.body3,scene.bodySlots[0].w,bodies);
  bodies=bodyLight(p,up,scene.body4,scene.bodySlots[1].x,bodies);
  var r:Lighting;r.light=light*bodies.scale+bodies.add;r.marks=bodies.marks;r.sun=sun;return r;
 }
 // Dedicated pass for the static masonry keeps the heavier stone code out of solidFS.
 @fragment fn stoneFS(o:Out)->@location(0) vec4f{
  let normal=normalize(o.normal);let v=normalize(scene.eye.xyz-o.world);let h=normalize(v+normalize(scene.light.xyz-o.world));
  let uv=o.local.xz;let dx=dpdx(uv);let dy=dpdy(uv);let dp1=dpdx(o.world);let dp2=dpdy(o.world);
  let atlas=textureSampleGrad(stoneAtlas,materialSampler,uv,dx,dy).rgb;let value=dot(atlas,vec3f(.25,.6,.15));
  let stone=stoneSurface(o.world,normal,o.color,atlas,value,vec2f(dpdxFine(value),dpdyFine(value)),uv,dp1,dp2,true,o.material/${STONE_DETAIL});
  let lit=dungeonLight(o.world,stone.normal,normal.y,stone.occlusion);
  let result=stone.albedo*lit.light+vec3f(.045,.05,.06)*pow(max(0.,dot(stone.normal,h)),26.)*lit.sun*stone.occlusion;
  // Optional warm light from far below the level: deep masonry catches it through the fog,
  // most on faces turned down, so the abyss feels like something is burning there.
  let deep=scene.finish.y-o.world.y;
  let flicker=.8+.2*sin(scene.options.z*1.3+o.world.x*.9+o.world.z*1.3);
  let underglow=vec3f(1.,.3,.06)*smoothstep(2.5,7.,deep)*(1.-smoothstep(8.,11.,deep))*(.15+.85*max(0.,-normal.y)+.2*(1.-abs(normal.y)))*flicker*scene.finish.w*stone.albedo*.9;
  return vec4f(voidFog(o.world,result+lit.marks)+underglow,1.);
 }
 @fragment fn solidFS(o:Out)->@location(0) vec4f{
  let n=normalize(o.normal);let v=normalize(scene.eye.xyz-o.world);let l=normalize(scene.light.xyz-o.world);let h=normalize(v+l);
  var color=o.color;var metalWear=0.;
  let uv=o.local.xz;let dx=dpdx(uv);let dy=dpdy(uv);
  let pixel=max(length(dpdx(o.world)),length(dpdy(o.world)));
  let spikeMetal=o.material>26.5&&o.material<28.5;
  if(spikeMetal){
   // Face-local UVs keep pitting and tool marks attached while spikes slide or mount on walls.
   let socket=o.material>27.5;let texScale=vec2f(select(.83,2.7,socket),.87);let texUV=vec2f(.51,.26)+fract(uv*texScale)*.22;
   let texel=textureSampleGrad(stoneAtlas,materialSampler,texUV,dx*texScale*.22,dy*texScale*.22).rgb;
   let relief=clamp(dot(texel,vec3f(.25,.6,.15))*3.6,0.,1.);
   let edge=min(uv.x-uv.y*.5,1.-uv.y*.5-uv.x);
   let bladeWear=max(1.-smoothstep(.008,.055,edge),smoothstep(.65,.98,uv.y)*.8);
   let socketWear=1.-smoothstep(.025,.09,abs(uv.y-.5));
   metalWear=select(bladeWear,socketWear,socket);
   let root=select(1.-smoothstep(.05,.6,uv.y),smoothstep(.6,.95,uv.y),socket);
   let patina=(1.-smoothstep(.18,.48,relief))*root;
   let footprint=max(length(dx),length(dy));
   let grooves=pow(.5+.5*sin(uv.x*310.+sin(uv.y*18.)*2.),18.)*(1.-smoothstep(.006,.035,footprint));
   color=o.color*(.54+relief*.4)*(1.-grooves*.18);
   color=mix(color,vec3f(.14,.075,.032),patina*.42);
   color=mix(color,o.color*.55+vec3f(.2,.21,.19),metalWear*.5);
  }
  if(o.material<.5||(o.material>16.5&&o.material<17.5)){
   let texel=textureSampleGrad(stoneAtlas,materialSampler,uv,dx,dy).rgb;color*=mix(vec3f(clamp(dot(texel,vec3f(.25,.6,.15))*3.6,.38,1.22)),texel*3.6,.2);
  }
  if(o.material>17.5&&o.material<18.5){color*=.86+.14*sin(o.world.y*97.)*sin(o.world.x*113.+o.world.z*113.);}
  if(o.material>10.5&&o.material<11.5){
   let timber=textureSampleGrad(oakTexture,materialSampler,uv,dx,dy).rgb;
   let grain=clamp(.48+dot(timber,vec3f(.25,.6,.15))*3.,.54,1.22);
   color*=mix(vec3f(grain),timber*2.7,.18);
  }
  if(o.material>11.5&&o.material<12.5){let age=.5+.5*sin(o.world.x*11.+sin(o.world.y*7.))*sin(o.world.z*13.+o.world.y*5.);color=mix(color,vec3f(.065,.125,.095),smoothstep(.67,.95,age)*.32);}
  if(o.material>13.5&&o.material<14.5){let stone=textureSampleGrad(stoneAtlas,materialSampler,uv,dx,dy).rgb;color*=clamp(dot(stone,vec3f(.25,.6,.15))*3.5,.3,1.35);}
  if(o.material>15.5&&o.material<16.5){
   let axes=array<vec2f,4>(vec2f(0,1),vec2f(1,0),vec2f(0,-1),vec2f(-1,0));let axis=axes[min(u32(round(o.local.x)),3u)];
   let across=dot(o.world.xz-round(o.world.xz),vec2f(axis.y,-axis.x));let track=dot(o.world.xz,axis)-scene.options.z*o.local.z;
   // Three tread plates per tile with wave-shaped seams, a lit leading bevel and an
   // engraved chevron pointing the way the belt moves.
   let w=clamp(across/.38,-1.,1.);let plate=track*3.+.15*clamp((.62-abs(w))/.22,0.,1.);let f=fract(plate);
   let seam=1.-smoothstep(.025,.075,min(f,1.-f));let bevel=smoothstep(.06,.1,f)*(1.-smoothstep(.1,.2,f));
   let grit=textureSampleGrad(stoneAtlas,materialSampler,vec2f(across*.9,fract(plate*.37))*.5+.25,dx,dy).rgb;
   let wear=clamp(dot(grit,vec3f(.25,.6,.15))*3.,.7,1.2);
   let arrow=abs(f-.72+.62*abs(w));let aa=max(pixel*3.,.004);
   let chevron=(1.-smoothstep(.09-aa,.09+aa,arrow))*(1.-smoothstep(.5,.56,abs(w)))*(1.-seam);
   color=o.color*wear*(1.+bevel*.9)*(1.-seam*.82);
   color=mix(color,vec3f(.78,.46,.16)*(.85+.15*wear),chevron);
  }
  let lit=dungeonLight(o.world,n,n.y,1.);let light=lit.light;let marks=lit.marks;
  var result=color*light;
  if(o.material>16.5&&o.material<17.5){result+=color*.22;}
  if(o.material>.5&&o.material<1.5){result+=vec3f(.28)*pow(max(0.,dot(n,h)),55.);}
  if(o.material>25.5&&o.material<26.5){let rim=pow(1.-max(0.,dot(n,v)),1.6);result=o.color*(.22+rim*1.25)+vec3f(1.5,1.5,1.4)*pow(max(0.,dot(n,h)),36.);}
  if(o.material>3.5&&o.material<4.5){result=color*(1.4+sin(scene.options.z*4.)*.08);}
  if(o.material>11.5&&o.material<12.5){result+=vec3f(.56,.4,.21)*pow(max(0.,dot(n,h)),45.);}
  if(o.material>13.5&&o.material<14.5){result+=color*.12+vec3f(.18)*pow(max(0.,dot(n,h)),80.);}
  if(spikeMetal){
   let reflected=environment(reflect(-v,n));let gloss=pow(max(0.,dot(n,h)),mix(32.,85.,metalWear));
   result+=reflected*mix(.045,.12,metalWear)+vec3f(.36,.33,.27)*gloss*lit.sun;
  }
  if(o.material>4.5&&o.material<5.5){let portal=scene.portals[u32(o.local.x)];let activation=portal.animation.x;let charge=portal.position.w;let delta=o.world.xz-portal.position.xz;let radius=length(delta);let swirl=.5+.5*sin(atan2(delta.y,delta.x)*3.-radius*35.+portal.animation.y);let tint=mix(mix(vec3f(.19,.21,.24),color,.16),color,activation);result=(tint*(.55+swirl*mix(.35,1.8,activation))+vec3f(.06)*exp(-radius*12.))*mix(.7,.55+charge*1.9,activation);}
  if(o.material>7.5&&o.material<8.5){let portal=scene.portals[u32(o.local.x)];result=mix(mix(vec3f(.16,.18,.2),color,.12),color*(.65+portal.position.w*2.8),portal.animation.x);}
  if(o.material>9.5&&o.material<10.5){let goal=scene.goals[u32(o.local.x)];let charge=goal.position.w;
   result=mix(color*light,goal.color.rgb*.9,charge);
   if(o.local.z>.5){
    let strokePosition=clamp((o.world.z-goal.position.z+.42)/.84,0.,1.);
    let inscribed=(1.-smoothstep(scene.finish.x-.025,scene.finish.x+.025,strokePosition))*smoothstep(0.,.04,scene.finish.x)*step(0.,scene.goalSlots[u32(o.local.x)/4u][u32(o.local.x)%4u]);
    // Idle runes keep a soft neon glow, so every finish reads at a glance.
    result=color*(mix(1.1,2.8,charge)*(.93+.07*sin(scene.options.z*2.2+o.local.x*1.7))+inscribed*3.);
   }
  }
  if(o.material>28.5&&o.material<29.5){
   // Emissive lava: dark cooled plates, reddish towards their rims, bright cracks between them.
   let cells=lavaCells(o.world.xz*2.6);let pulse=.82+.18*sin(scene.options.z*1.6+cells.x*7.);
   let crack=1.-smoothstep(.02,.11,cells.y);let rim=1.-smoothstep(.0,.3,cells.y);
   let crust=mix(vec3f(.2,.032,.008),vec3f(.028,.009,.005),smoothstep(.05,.5,cells.x));
   result=crust+vec3f(.9,.2,.03)*rim*rim*.55*pulse+vec3f(3.4,1.45,.28)*crack*pulse;
   return vec4f(result,1.);
  }
  return vec4f(voidFog(o.world,result+marks),1.);
 }
 fn energyRune(p:vec2f,glyph:u32)->f32{
  if(glyph==4u){return runeDistance(p*.45,4u)/.45;}
  if(glyph==0u){
   let a=vec2f(0,-.63);let b=vec2f(.58,.43);let c=vec2f(-.58,.43);
   let outer=min(runeSegment(p,a,b),min(runeSegment(p,b,c),runeSegment(p,c,a)));
   let inner=min(runeSegment(p,a*.35,b*.35),min(runeSegment(p,b*.35,c*.35),runeSegment(p,c*.35,a*.35)));
   return min(outer,inner);
  }
  if(glyph==1u){return min(abs(length(p)-.51),max(0.,length(p)-.065));}
  if(glyph==2u){let d=abs(p.x)+abs(p.y);return min(abs(d-.66),abs(d-.15))*.7071;}
  var distance=abs(length(p)-.29);
  for(var i=0;i<8;i++){let a=f32(i)*.785398;let axis=vec2f(cos(a),sin(a));distance=min(distance,runeSegment(p,axis*.43,axis*.61));}
  return distance;
 }
 @fragment fn crystalFS(o:Out)->@location(0) vec4f{
  let n=normalize(o.normal);let v=normalize(scene.eye.xyz-o.world);let l=normalize(scene.light.xyz-o.world);
  let fresnel=pow(1.-abs(dot(n,v)),3.);let reflection=environment(reflect(-v,n));let gloss=pow(abs(dot(n,normalize(v+l))),80.);
  let uv=o.local.xz;let edge=min(min(uv.x,1.-uv.x),min(uv.y,1.-uv.y));let aa=max(.002,length(fwidth(uv))*.6);
  let seam=1.-smoothstep(.008-aa,.016+aa,edge);let lit=.45+max(0.,dot(n,l))*.55;
  let color=o.color*(lit+fresnel*.7)+reflection*(.12+fresnel*.28)+vec3f(1.4,1.65,1.9)*(gloss*.7+seam*.17);
  return vec4f(color,.23+fresnel*.23+seam*.17);
 }
 @fragment fn phaseFS(o:Out)->@location(0) vec4f{
  let uv=o.local.xz;let aa=max(.002,length(fwidth(uv))*.6);
  if(o.material>24.5){let radius=length(uv);let glow=exp(-radius*radius*3.5)*(1.-smoothstep(.55,1.,radius));return vec4f(o.color*2.4,glow*.18);}
  if(o.material>18.5){
   let distance=energyRune(uv,u32(round(o.material-19.)));
   let stroke=1.-smoothstep(.047-aa,.047+aa,distance);let halo=exp(-distance*14.);
   return vec4f(o.color*3.2+vec3f(.26,.2,.12),min(.97,stroke*.86+halo*.42));
  }
  let n=normalize(o.normal);let v=normalize(scene.eye.xyz-o.world);let l=normalize(scene.light.xyz-o.world);
  let edge=1.-max(abs(uv.x),abs(uv.y));let rim=1.-smoothstep(.025,.17,edge);let lip=1.-smoothstep(.012,.055,edge);
  let fresnel=pow(1.-abs(dot(n,v)),3.);let reflection=environment(reflect(-v,n));
  let haze=.5+.5*sin(o.world.y*9.+sin(o.world.x*7.+scene.options.z*.3)+sin(o.world.z*8.-scene.options.z*.2));
  let bead=length((abs(uv)-vec2f(.66,.65))*vec2f(1.,1.25));let inclusions=exp(-abs(bead-.043)*100.);
  let gloss=pow(max(0.,dot(n,normalize(v+l))),110.);
  let color=o.color*(.6+max(0.,dot(n,l))*.3+rim*1.65+fresnel*.7+inclusions*.9)+reflection*(.08+fresnel*.18)+vec3f(1.5,1.65,1.8)*gloss;
  return vec4f(color,.18+rim*.25+lip*.09+fresnel*.1+inclusions*.12+haze*.018);
 }
 @fragment fn effectFS(o:Out)->@location(0) vec4f{
  let n=normalize(o.normal);let v=normalize(scene.eye.xyz-o.world);let l=normalize(scene.light.xyz-o.world);
  let fresnel=pow(1.-abs(dot(n,v)),3.);
  var color=o.color*(.5+.65*max(0.,dot(n,l)))+o.color*fresnel*.7;
  color+=vec3f(1.8,1.9,1.6)*pow(max(0.,dot(n,normalize(v+l))),85.);
  if(o.material>6.5&&o.material<14.5){color=o.color*2.2+vec3f(.16)*fresnel;}
  if(o.material>14.5){color=o.color*(.55+.7*max(0.,dot(n,l)));}
  if(o.material>15.5&&o.material<16.5){let edge=min(min(o.local.x,1.-o.local.x),min(o.local.z,1.-o.local.z));let rim=1.-smoothstep(.035,.16,edge);return vec4f(color*(.75+rim*1.8)+vec3f(.18,.32,.48)*rim,.14+rim*.44+fresnel*.08);}
  return vec4f(color,clamp(o.local.x,0.,1.));
 }
 `;
