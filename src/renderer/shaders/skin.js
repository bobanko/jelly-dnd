export const skin = `
 @group(1) @binding(0) var behind:texture_2d<f32>;
 @group(1) @binding(1) var backFaces:texture_2d<f32>;
 @group(1) @binding(2) var linearSampler:sampler;
 // Embedded ivory marks use rest coordinates, so they stretch with the actual gel.
 fn inlay(p:vec3f)->f32{return pipShape(p).x;}
 // Dice face of a rest-space point and its 2D face coordinates; opposite faces sum to seven:
 // +Y/-Y = 1/6, +Z/-Z = 2/5, +X/-X = 3/4. Returns (mask, offset from the nearest pip centre / radius).
 fn pipShape(p:vec3f)->vec3f{
  let a=abs(p);var face=p.xy;var count=select(5u,2u,p.z>=0.);
  if(a.x>=a.y&&a.x>=a.z){face=p.zy;count=select(4u,3u,p.x>=0.);}
  else if(a.y>=a.z){face=p.xz;count=select(6u,1u,p.y>=0.);}
  var nearest=vec2f(10.);
  if(count%2u==1u){nearest=face;}
  if(count==2u||count==3u){
   for(var k=-1.;k<=1.;k+=2.){let d=face-vec2f(k*.185);if(length(d)<length(nearest)){nearest=d;}}
  }
  if(count>=4u){let d=(abs(face)-vec2f(.185))*sign(face);if(length(d)<length(nearest)){nearest=d;}}
  if(count==6u){let d=vec2f((abs(face.x)-.185)*sign(face.x),face.y);if(length(d)<length(nearest)){nearest=d;}}
  let radius=.058;let distance=length(nearest);
  let aa=max(.0015,fwidth(distance)*.8);
  return vec3f(1.-smoothstep(radius-aa,radius+aa,distance),nearest/radius);
 }
 // Lifts a 2D face-frame vector back into rest space (inverse of the face pick in pipShape).
 fn faceToLocal(p:vec3f,v:vec2f)->vec3f{
  let a=abs(p);
  if(a.x>=a.y&&a.x>=a.z){return vec3f(0.,v.y,v.x);}
  if(a.y>=a.z){return vec3f(v.x,0.,v.y);}
  return vec3f(v.x,v.y,0.);
 }
 // Pips are bowls pressed into the gel. Height h=-depth*(1-x^2)^2 with x=offset/radius:
 // returns the rest-space gradient of h, steepest on the bowl wall and flat at rim and floor.
 fn pipSlope(p:vec3f,pip:vec3f)->vec3f{
  let x2=dot(pip.yz,pip.yz);if(x2>=1.){return vec3f(0.);}
  let depth=.07;let radius=.058;
  return faceToLocal(p,pip.yz*(4.*depth/radius)*(1.-x2));
 }
 // Bump mapping without tangents (Mikkelsen 2010): the rest-space slope is turned into
 // screen-space height derivatives, then into a world normal tilt. Works on the deformed gel.
 fn bumpNormal(n:vec3f,world:vec3f,slope:vec3f,local:vec3f)->vec3f{
  let dwx=dpdx(world);let dwy=dpdy(world);
  let dhx=dot(slope,dpdx(local));let dhy=dot(slope,dpdy(local));
  let r1=cross(dwy,n);let r2=cross(n,dwx);let det=dot(dwx,r1);
  let tilted=abs(det)*n-sign(det)*(dhx*r1+dhy*r2);
  return select(n,normalize(tilted),abs(det)>1e-14&&dot(tilted,tilted)>0.);
 }
 @fragment fn backFS(o:Out)->@location(0) vec4f{return vec4f(o.world,1.+inlay(o.local));}
 @fragment fn skinFS(o:Out)->@location(0) vec4f{
  let n=normalize(o.normal);let ray=select(normalize(vec3f(scene.vp[0].z,scene.vp[1].z,scene.vp[2].z)),normalize(o.world-scene.eye.xyz),scene.eye.w>.5);let uv=o.clip.xy/scene.options.xy;
  let back=textureSampleLevel(backFaces,linearSampler,uv,0.);var thick=max(.03,length(back.xyz-o.world));
  let inside=refract(ray,n,1./1.38);let estimated=o.world+inside*thick;
  let exitClip=scene.vp*vec4f(estimated,1);let exitUV=vec2f(exitClip.x/exitClip.w*.5+.5,.5-exitClip.y/exitClip.w*.5);
  let exit=textureSampleLevel(backFaces,linearSampler,clamp(exitUV,vec2f(.001),vec2f(.999)),0.);
  if(exit.w>.5){thick=clamp(dot(exit.xyz-o.world,inside),.03,1.4);}
  var refractedUV=mix(uv,exitUV,.55);refractedUV=clamp(refractedUV,vec2f(.002),vec2f(.998));
  let pigment=o.color;var absorption=select(vec3f(2.1,.13,1.95),vec3f(2.9,1.7,.12),o.material>2.5);
  if(o.material>3.5){absorption=vec3f(.13,2.35,2.8);}
  if(o.material>4.5){absorption=vec3f(.75,2.8,.13);}
  if(o.material>5.5){absorption=vec3f(.12,.4,3.1);}
  let transmission=exp(-absorption*thick*1.2);
  let background=textureSampleLevel(behind,linearSampler,refractedUV,0.).rgb;
  var color=background*transmission+pigment*(1.-transmission)*.55;
  let farInlay=clamp(exit.w-1.,0.,1.);
  color=mix(color,vec3f(.85,.82,.75)*transmission+pigment*.11,farInlay*.3);
  // White pips are hollows: the bumped normal drives their shading, reflection and glint,
  // so the light side of each bowl falls into shadow and the far wall catches the light.
  let pip=pipShape(o.local);let toLight=normalize(scene.light.xyz-o.world);
  let bn=bumpNormal(n,o.world,pipSlope(o.local,pip),o.local);
  let x=length(pip.yz);let centre=1.-min(x*x,1.);
  // The paint spills a little past the hole onto the flat face around it.
  let spill=1.32;let aa=max(.02,fwidth(x)*.8);
  let paint=max(pip.x,1.-smoothstep(spill-aa,spill+aa,x));
  // Soft shading only: walls turned from the light dim gently instead of going dark.
  let lit=.6+.55*max(0.,dot(bn,toLight))-.28*max(0.,dot(n,toLight)-dot(bn,toLight));
  let dimple=vec3f(.96,.94,.89)*max(lit,.36)*(1.-.06*centre);
  color=mix(color,dimple+pigment*.12,paint*.92);
  // Matte paint barely mirrors the room; otherwise grazing views fill the bowls with dark reflections.
  let f=.025+.975*pow(1.-max(0.,dot(bn,-ray)),5.);
  color=mix(color,environment(reflect(ray,bn)),min(.85,f*.78+.025)*(1.-.6*paint));
  // A faint inner glow, tinted by the gel, with a short halo onto the surrounding jelly.
  let halo=exp(-max(x-spill,0.)*5.)*(1.-paint);
  color+=(vec3f(1.,.96,.88)*.1+pigment*.14)*paint+pigment*.1*halo;
  color+=pigment*pow(1.-max(0.,dot(n,-ray)),3.)*.34;
  let l=normalize(scene.light.xyz-o.world);let h=normalize(l-ray);
  // A tight glint: flat faces would otherwise flare white across their whole area.
  color+=(vec3f(1.25,1.15,.95)+pigment*.3)*pow(max(0.,dot(bn,h)),260.);
  color+=pigment*.07;
  color+=pigment*.28*pow(max(0.,dot(-n,l)),2.)*exp(-thick*2.);
  // Glassy rounded edges catch light; the rest-space face grid locates the bevel band.
  let a=abs(o.local);let mid=a.x+a.y+a.z-max(a.x,max(a.y,a.z))-min(a.x,min(a.y,a.z));
  let band=smoothstep(.3,.365,mid);let facing=pow(1.-abs(dot(n,ray)),1.4);
  color+=(vec3f(1.,.98,.93)*(.05+.6*smoothstep(-.1,.9,n.y))+pigment*.28)*band*(.35+.4*facing+.35*max(0.,dot(n,l)));
  // Light scattered inside the gel pools near its base.
  color+=pigment*.16*(1.-smoothstep(-.38,.06,o.local.y));
  return vec4f(voidFog(o.world,color),1.);
 }
 `;
