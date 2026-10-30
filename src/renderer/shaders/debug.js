import { PORTAL_LIMIT } from '../layout.js';
export const latticeShader = `
 struct Portal { position:vec4f, color:vec4f, animation:vec4f };
 struct Goal { position:vec4f, color:vec4f };
 struct Scene { vp:mat4x4f, lightVP:mat4x4f, eye:vec4f, light:vec4f, body0:vec4f, body1:vec4f, body2:vec4f, options:vec4f, portals:array<Portal,${PORTAL_LIMIT}>, goals:array<Goal,5>, torches:array<vec4f,8>, body3:vec4f, body4:vec4f, bodySlots:array<vec4f,2>, finish:vec4f, goalSlots:array<vec4f,2>, depthGlow:vec4f };
 @group(0) @binding(0) var<uniform> scene:Scene;
 @group(0) @binding(1) var<storage,read> nodes:array<vec4f>;
 @group(0) @binding(2) var<storage,read> edges:array<u32>;
 @vertex fn latticeVS(@builtin(vertex_index) id:u32,@builtin(instance_index) body:u32)->@builtin(position) vec4f{return scene.vp*vec4f(nodes[edges[id]+body*64u].xyz,1);}
 @fragment fn latticeFS()->@location(0) vec4f{return vec4f(.7,1.,.55,.48);}
 `;
export const colliderShader = `
 struct View { vp:mat4x4f };
 @group(0) @binding(0) var<uniform> view:View;
 struct Line { @builtin(position) clip:vec4f,@location(0) color:vec3f };
 @vertex fn colliderVS(@location(0) position:vec3f,@location(1) color:vec3f)->Line{var o:Line;o.clip=view.vp*vec4f(position,1);o.color=color;return o;}
 @fragment fn colliderFS(o:Line)->@location(0) vec4f{return vec4f(o.color,.72);}
 `;
