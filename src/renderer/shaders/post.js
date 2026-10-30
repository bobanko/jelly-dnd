import { VOID_COLOR } from './shared.js';
export const post = `
 @group(0) @binding(0) var image:texture_2d<f32>;
 @group(0) @binding(1) var linearSampler:sampler;
 @group(0) @binding(2) var bloomImage:texture_2d<f32>;
 @group(0) @binding(3) var<uniform> film:vec4f;
 const BLOOM_STRENGTH=.15;
 const VOID_COLOR=vec3f(${VOID_COLOR});
 // Indigo haze behind the diorama. The scene clears to zero alpha, so the sky only
 // shows where nothing was drawn and stays out of the MSAA and refraction buffers.
 fn skyColor(uv:vec2f,aspect:f32)->vec3f{
  let p=(uv-vec2f(.5,.38))*vec2f(aspect,1.);let falloff=max(0.,1.-dot(p,p)*.9);
  return mix(vec3f(.0038,.0049,.0088),VOID_COLOR,uv.y)+vec3f(.0036,.0056,.0118)*falloff*falloff;
 }
 @vertex fn postVS(@builtin(vertex_index) i:u32)->@builtin(position) vec4f{let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(p[i],0,1);}
 fn tone(input:vec3f)->vec3f{var c=max(input,vec3f(0));let x=min(c.r,min(c.g,c.b));c-=vec3f(select(.04,x-6.25*x*x,x<.08));let peak=max(c.r,max(c.g,c.b));if(peak<.76){return c;}let newPeak=1.-.0576/(peak+.24-.76);c*=newPeak/peak;return mix(c,vec3f(newPeak),1.-1./(.15*(peak-newPeak)+1.));}
 @fragment fn postFS(@builtin(position) p:vec4f)->@location(0) vec4f{
  let size=vec2f(textureDimensions(image));let uv=p.xy/size;let scene=textureSampleLevel(image,linearSampler,uv,0.);
  var hdr=scene.rgb;let cover=clamp(scene.a,0.,1.);if(cover<.999){hdr+=skyColor(uv,size.x/size.y)*(1.-cover);}
  hdr+=textureSampleLevel(bloomImage,linearSampler,uv,0.).rgb*BLOOM_STRENGTH;
  let vignette=1.-.24*smoothstep(.22,.8,length((uv-vec2f(.5))*vec2f(1.,.86)));hdr*=vignette;
  var c=tone(hdr);c=pow(max(c,vec3f(0)),vec3f(1./2.2));
  var q=fract(vec3f(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);let noise=fract((q.x+q.y)*q.z)-.5;
  // Monochrome film grain at 24 Hz, independent of the subtle static output dither.
  let cell=floor(p.xy/max(.5,film.z));let tick=floor(film.x*24.);
  var g=fract(vec3f(cell.x,cell.y,tick)*.1031);g+=dot(g,g.yzx+33.33);
  let grain=fract((g.x+g.y)*g.z)-.5;let luma=dot(c,vec3f(.2126,.7152,.0722));
  c+=vec3f(grain*film.y*(.3+.7*sqrt(clamp(luma,0.,1.))));
  return vec4f(clamp(c+noise/255.,vec3f(0),vec3f(1)),1);
 }
 `;
// Bright emissive pixels feed a four-level dual-filter blur from quarter resolution down:
// runes, flames, beams and jelly glints glow without extra full-resolution passes.
export const BLOOM_LEVELS = 4;
export const bloomShader = `
 @group(0) @binding(0) var source:texture_2d<f32>;
 @group(0) @binding(1) var linearSampler:sampler;
 struct V { @builtin(position) clip:vec4f, @location(0) uv:vec2f };
 @vertex fn bloomVS(@builtin(vertex_index) i:u32)->V{let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));var o:V;o.clip=vec4f(p[i],0,1);o.uv=vec2f(p[i].x*.5+.5,.5-p[i].y*.5);return o;}
 fn tap(uv:vec2f)->vec3f{return textureSampleLevel(source,linearSampler,uv,0.).rgb;}
 fn down(uv:vec2f)->vec3f{let h=.5/vec2f(textureDimensions(source));return (tap(uv)*4.+tap(uv-h)+tap(uv+h)+tap(uv+vec2f(h.x,-h.y))+tap(uv-vec2f(h.x,-h.y)))/8.;}
 // The first level reads the full-resolution scene: four bilinear taps average its 4x4 block.
 @fragment fn bloomPrefilterFS(o:V)->@location(0) vec4f{
  let t=1./vec2f(textureDimensions(source));
  let c=(tap(o.uv-t)+tap(o.uv+t)+tap(o.uv+vec2f(t.x,-t.y))+tap(o.uv-vec2f(t.x,-t.y)))*.25;let peak=max(c.r,max(c.g,c.b));let threshold=.92;let knee=.45;
  var soft=clamp(peak-threshold+knee,0.,2.*knee);soft=soft*soft/(4.*knee);
  return vec4f(min(c*max(soft,peak-threshold)/max(peak,.0001),vec3f(14.)),1.);
 }
 @fragment fn bloomDownFS(o:V)->@location(0) vec4f{return vec4f(down(o.uv),1.);}
 @fragment fn bloomUpFS(o:V)->@location(0) vec4f{
  let h=.5/vec2f(textureDimensions(source));let uv=o.uv;
  let c=tap(uv+vec2f(-h.x*2.,0.))+tap(uv+vec2f(0.,h.y*2.))+tap(uv+vec2f(h.x*2.,0.))+tap(uv+vec2f(0.,-h.y*2.))+(tap(uv+vec2f(-h.x,h.y))+tap(uv+h)+tap(uv+vec2f(h.x,-h.y))+tap(uv-h))*2.;
  return vec4f(c/12.,1.);
 }
 `;
