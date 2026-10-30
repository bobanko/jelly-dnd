export const compute = `
 struct Bind { param:vec4f, rest:vec4f, normal:vec4f };
 struct Vertex { position:vec4f, normal:vec4f, info:vec4f };
 @group(0) @binding(0) var<storage,read> nodes:array<vec4f>;
 @group(0) @binding(1) var<storage,read> restNodes:array<vec4f>;
 @group(0) @binding(2) var<storage,read> binds:array<Bind>;
 @group(0) @binding(3) var<storage,read_write> output:array<Vertex>;
 @compute @workgroup_size(64) fn deform(@builtin(global_invocation_id) id:vec3u){
  if(id.x>=6750u){return;}let instance=id.x/1350u;if(nodes[instance*64u].w<0.){return;}let bind=binds[id.x%1350u];
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
  output[id.x].position=vec4f(bind.rest.xyz+displacement,1.);output[id.x].normal=vec4f(normalize(cofactor*bind.normal.xyz),0.);output[id.x].info=vec4f(bind.param.xyz,nodes[instance*64u].w);
 }
 `;
