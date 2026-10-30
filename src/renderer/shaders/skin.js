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
 // Projects a direction onto the same 2D face frame pipShape uses for this point.
 fn faceFrame(p:vec3f,v:vec3f)->vec2f{
  let a=abs(p);
  if(a.x>=a.y&&a.x>=a.z){return v.zy;}
  if(a.y>=a.z){return v.xz;}
  return v.xy;
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
  // White pips read as concave dimples: the wall facing the light is bright, the near wall
  // falls into shadow, a dark ring marks the edge and a small glint sits inside.
  let pip=pipShape(o.local);let toLight=normalize(scene.light.xyz-o.world);
  let lightDir=faceFrame(o.local,toLight);let lf=lightDir/max(length(lightDir),.001);
  let q=pip.yz;let r=min(length(q),1.);
  // The rim on the light's side casts a crescent shadow into the hollow.
  let shadow=smoothstep(.5,1.02,length(q-lf*.42));
  let litWall=smoothstep(.62,1.,r)*max(0.,-dot(q,lf))*.45;
  let edge=1.-.35*smoothstep(.86,1.,r);let glint=exp(-dot(q+lf*.5,q+lf*.5)*18.)*.3;
  let dimple=vec3f(.97,.95,.9)*(1.-.62*shadow)*edge*(.8+.2*max(0.,dot(n,toLight)))+vec3f(litWall+glint);
  color=mix(color,dimple+pigment*.04,pip.x*.96);
  let f=.025+.975*pow(1.-max(0.,dot(n,-ray)),5.);
  color=mix(color,environment(reflect(ray,n)),min(.85,f*.78+.025));
  color+=pigment*pow(1.-max(0.,dot(n,-ray)),3.)*.34;
  let l=normalize(scene.light.xyz-o.world);let h=normalize(l-ray);
  // A tight glint: flat faces would otherwise flare white across their whole area.
  color+=(vec3f(1.25,1.15,.95)+pigment*.3)*pow(max(0.,dot(n,h)),260.);
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
