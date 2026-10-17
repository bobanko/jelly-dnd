(function(root){
 'use strict';
 const Levels=typeof module!=='undefined'&&module.exports?require('./levels.js'):root.JellyLevels;
 const PORTAL_LIMIT=Levels.limits.portals,GOALS_OFFSET=56+PORTAL_LIMIT*8,TORCHES_OFFSET=GOALS_OFFSET+32,BODY3_OFFSET=TORCHES_OFFSET+32,BODY_SLOTS_OFFSET=BODY3_OFFSET+4,FINISH_OFFSET=BODY_SLOTS_OFFSET+4,GOAL_SLOTS_OFFSET=FINISH_OFFSET+4,SCENE_FLOATS=GOAL_SLOTS_OFFSET+4;
 const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const normalize=a=>{const l=Math.hypot(...a)||1;return a.map(v=>v/l);};
 function viewMatrix(center,view,width,height,offset=0){
  const right=normalize(cross([0,1,0],view)),up=normalize(cross(view,right)),m=new Float32Array(16);
  for(let k=0;k<3;k++){m[k*4]=right[k]*2/width;m[k*4+1]=up[k]*2/height;m[k*4+2]=-view[k]/40;}
  m[12]=-dot(right,center)*2/width;m[13]=-dot(up,center)*2/height+offset;m[14]=.5+dot(view,center)/40;m[15]=1;return m;
 }
 function cameraFrame(camera,angle,width,height,scale){
  const perspective=camera.mode==='perspective',pitch=(camera.pitch??30)*Math.PI/180,azimuth=angle+Math.PI/4;
  const view=[Math.sin(azimuth)*Math.cos(pitch),Math.sin(pitch),Math.cos(azimuth)*Math.cos(pitch)],target=[camera.x,camera.targetY??0,camera.z];
  const referenceDistance=Math.max(5,height/scale/(2*Math.tan(Math.PI/8))),focusDepth=view[1]*((camera.focusHeight??.42)-(camera.targetY??0));
  // Compensate focal length at the followed jelly's centre: FOV changes
  // perspective strength while keeping that character's apparent size stable.
  const distance=perspective?focusDepth+(referenceDistance-focusDepth)*Math.tan(Math.PI/8)/Math.tan((camera.fov??45)*Math.PI/360):20;
  const eye=target.map((v,k)=>v+view[k]*distance);
  if(!perspective)return {vp:viewMatrix(target,view,width/scale,height/scale,-.12),view,eye,perspective,distance};
  const right=normalize(cross([0,1,0],view)),up=normalize(cross(view,right)),f=1/Math.tan((camera.fov??45)*Math.PI/360);
  const near=.1,far=Math.max(120,distance+60),a=far/(far-near),b=near*a,offset=-.12,vp=new Float32Array(16),eyeDepth=distance+dot(view,target);
  // WebGPU uses a zero-to-one depth range. The offset keeps the followed cube
  // at the same screen anchor in both projection modes.
  for(let k=0;k<3;k++){vp[k*4]=right[k]*f*height/width;vp[k*4+1]=up[k]*f-offset*view[k];vp[k*4+2]=-a*view[k];vp[k*4+3]=-view[k];}
  vp[12]=-dot(right,target)*f*height/width;vp[13]=-dot(up,target)*f+offset*eyeDepth;vp[14]=a*eyeDepth-b;vp[15]=eyeDepth;
  return {vp,view,eye,perspective,distance};
 }
 function projectPoint(frame,x,y,z,width,height){
  const m=frame.vp,w=m[3]*x+m[7]*y+m[11]*z+m[15],depth=(m[2]*x+m[6]*y+m[10]*z+m[14])/w;
  return {x:((m[0]*x+m[4]*y+m[8]*z+m[12])/w*.5+.5)*width,y:(.5-(m[1]*x+m[5]*y+m[9]*z+m[13])/w*.5)*height,depth,visible:w>0&&depth>=0&&depth<=1,scale:Math.hypot(m[0],m[4],m[8])*width*.5/w};
 }
 function box(mesh,center,size,color,bevel=.04,material=0,steps=4){
  const h=size.map(v=>v*.5),radius=Math.min(bevel,...h);
  const faces=[[0,1,2,1],[0,1,2,-1],[1,2,0,1],[1,2,0,-1],[2,0,1,1],[2,0,1,-1]];
  for(const [axis,u,v,sign] of faces){const verts=[];
   for(let j=0;j<=steps;j++)for(let i=0;i<=steps;i++){
    const p=[0,0,0];p[axis]=h[axis]*sign;p[u]=(i/steps*2-1)*h[u];p[v]=(j/steps*2-1)*h[v];
    if(material===17){const samples=half=>[-half,-half+radius*.5,-half+radius,0,half-radius,half-radius*.5,half];p[u]=samples(h[u])[i];p[v]=samples(h[v])[j];}
    const core=p.map((x,k)=>Math.max(-h[k]+radius,Math.min(h[k]-radius,x))),d=p.map((x,k)=>x-core[k]),n=normalize(d);
    const position=core.map((x,k)=>x+n[k]*radius+center[k]);let uv=[0,0];
    if(material===17){uv=[p[u]/h[u],p[v]/h[v]];}
    else if(material<.5){
     const tile=Math.abs(Math.round(center[0]*73+center[1]*41+center[2]*137)+axis*5+(sign>0?3:0))%16;
     const a=(tile%2?j:i)/steps,b=(tile%2?i:j)/steps;uv=[(tile%4+.02+a*.96)/4,(Math.floor(tile/4)+.02+b*.96)/4];
    }else if(material===11){
     const seed=Math.abs(Math.sin(dot(center,[19.7,31.1,47.3]))),a=(size[u]>size[v]?j:i)/steps,b=(size[u]>size[v]?i:j)/steps;
     uv=[seed*.72+a*.2,.04+b*.92];
    }
    verts.push([...position,...n,...color,material,...uv]);
   }
   for(let j=0;j<steps;j++)for(let i=0;i<steps;i++){
    const a=j*(steps+1)+i,b=a+1,c=a+steps+1,d=c+1;
    for(const tri of sign>0?[[a,b,d],[a,d,c]]:[[a,d,b],[a,c,d]])mesh.push(...tri.flatMap(k=>verts[k]));
   }
  }
 }
 function crateGeometry(){
  const mesh=[],wood=[.39,.28,.17],rim=[.52,.37,.23],iron=[.16,.17,.17];
  box(mesh,[0,0,0],[.71,.71,.71],[.055,.033,.017],.012,13,2);
  for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
   const from=mesh.length;
   for(let j=0;j<4;j++)box(mesh,[(j-1.5)*.155,0,.367],[.149,.63,.032],wood.map(v=>v*(.92+j*.045)),.004,11,2);
   for(const edge of [-1,1]){
    box(mesh,[edge*.315,0,.395],[.095,.73,.045],rim,.006,11,2);
    box(mesh,[0,edge*.315,.398],[.73,.095,.045],rim,.006,11,2);
   }
   if(axis!==1)for(const direction of [-1,1]){
    const start=mesh.length,a=direction*Math.PI/4,c=Math.cos(a),s=Math.sin(a);
    box(mesh,[0,0,.416],[.072,.76,.026],rim,.004,11,2);
    for(let k=start;k<mesh.length;k+=12)for(const offset of [0,3]){const x=mesh[k+offset],y=mesh[k+offset+1];mesh[k+offset]=x*c-y*s;mesh[k+offset+1]=x*s+y*c;}
   }
   for(const x of [-.31,.31])for(const y of [-.31,.31]){
    box(mesh,[x,y,.43],[.14,.14,.022],iron,.008,12,2);
    for(const dx of [-.034,.034])for(const dy of [-.034,.034])for(let k=0;k<8;k++){
     const a=k*Math.PI/4,b=(k+1)*Math.PI/4;
     for(const [px,py,pz,nx,ny,nz] of [[0,0,.006,0,0,1],[Math.cos(a)*.01,Math.sin(a)*.01,0,Math.cos(a)*.5,Math.sin(a)*.5,.866],[Math.cos(b)*.01,Math.sin(b)*.01,0,Math.cos(b)*.5,Math.sin(b)*.5,.866]])mesh.push(x+dx+px,y+dy+py,.443+pz,nx,ny,nz,.42,.35,.25,12,0,0);
    }
   }
   const u=axis===0?[0,0,-sign]:axis===1?[1,0,0]:[sign,0,0],v=axis===1?[0,0,-sign]:[0,1,0],normal=[0,0,0];normal[axis]=sign;
   for(let k=from;k<mesh.length;k+=12)for(const offset of [0,3]){const x=mesh[k+offset],y=mesh[k+offset+1],z=mesh[k+offset+2];for(let n=0;n<3;n++)mesh[k+offset+n]=u[n]*x+v[n]*y+normal[n]*z;}
  }
  return mesh;
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
 function rod(mesh,a,b,width,color,material=1){
  const v=normalize(b.map((x,k)=>x-a[k])),u=normalize(Math.abs(v[1])>.95?cross(v,[0,0,1]):cross(v,[0,1,0])),w=cross(u,v),from=mesh.length;
  box(mesh,[0,0,0],[width,Math.hypot(...b.map((x,k)=>x-a[k])),width],color,width*.25,material,2);
  for(let k=from;k<mesh.length;k+=12)for(const offset of [0,3]){
   const x=mesh[k+offset],y=mesh[k+offset+1],z=mesh[k+offset+2];
   for(let n=0;n<3;n++)mesh[k+offset+n]=(offset?0:(a[n]+b[n])*.5)+u[n]*x+v[n]*y+w[n]*z;
  }
 }
 function shieldGeometry(){
  const mesh=[],iron=[.27,.28,.26],wood=[.44,.29,.13];
  pressureSurface(mesh,[0,0,0],[[0,0],[.27,0],[.27,.052],[0,.052]],wood,11,0,32);
  pressureSurface(mesh,[0,0,0],[[.265,0],[.31,0],[.31,.025],[.3,.07],[.27,.075],[.265,.055],[.265,0]],iron,12,0,32);
  // Turn the lathed disc upright and give it the oval proportions of an oak shield.
  for(let k=0;k<mesh.length;k+=12){const y=mesh[k+1],ny=mesh[k+4];mesh[k]*=.9;mesh[k+1]=-mesh[k+2]*1.1;mesh[k+2]=y;mesh[k+4]=-mesh[k+5];mesh[k+5]=ny;if(mesh[k+9]===11){mesh[k+10]=.5+mesh[k]*1.6;mesh[k+11]=.5-mesh[k+1]*1.4;}}
  for(const x of [-.16,-.08,0,.08,.16]){const h=.58*Math.sqrt(1-(x/.245)**2);box(mesh,[x,0,.054],[.005,h,.003],[.07,.045,.02],.001,13,1);}
  for(let i=0;i<12;i++){const a=i*Math.PI/6;sphere(mesh,[Math.cos(a)*.259,Math.sin(a)*.318,.069],[.013,.013,.012],[.55,.51,.38],12);}
  sphere(mesh,[0,0,.065],[.085,.085,.025],iron,12);sphere(mesh,[0,0,.093],[.047,.047,.045],[.46,.46,.39],12);
  return mesh;
 }
 const beamColors=[[.12,1.,.16],[.035,.22,1.],[1.,.065,.035],[.72,.12,1.]];
 function droneGeometry(color){
  const mesh=[],rings=[[-.56,0],[-.2,.17],[0,.22],[.2,.17],[.56,0]],bronze=[.38,.24,.1];
  for(let r=0;r<rings.length-1;r++)for(let i=0;i<8;i++){
   const a=i*Math.PI/4,b=(i+1)*Math.PI/4,p=(ring,angle)=>[Math.cos(angle)*ring[1],ring[0],Math.sin(angle)*ring[1]],quad=[p(rings[r],a),p(rings[r+1],a),p(rings[r+1],b),p(rings[r],b)];
   for(const triangle of [[0,1,2],[0,2,3]]){const ps=triangle.map(i=>quad[i]),n=normalize(cross(ps[1].map((v,k)=>v-ps[0][k]),ps[2].map((v,k)=>v-ps[0][k])));if(Math.hypot(...n)<.1)continue;for(const q of ps)mesh.push(...q,...n,...color.map(v=>v*(.65+i%3*.14)),4,0,0);}
  }
  for(const y of [-.23,.16]){
   pressureSurface(mesh,[0,y,0],[[.19,0],[.29,0],[.31,.025],[.31,.075],[.28,.095],[.19,.095],[.19,0]],bronze,12,0,8);
   for(let i=0;i<4;i++){const a=i*Math.PI/2+.4;sphere(mesh,[Math.cos(a)*.296,y+.055,Math.sin(a)*.296],[.027,.027,.027],[.68,.45,.18],12);}
  }
  for(let i=0;i<4;i++){const a=i*Math.PI/2+.4,x=Math.cos(a)*.27,z=Math.sin(a)*.27;rod(mesh,[x,-.16,z],[x,.18,z],.032,bronze,12);}
  sphere(mesh,[0,0,0],[.12,.12,.12],color.map(v=>v*1.8),4);return mesh;
 }
 function arrowGeometry(){
  const mesh=[];rod(mesh,[0,0,-.34],[0,0,.08],.017,[.46,.31,.12],11);
  // Four triangular metal faces form a readable arrowhead, with pale fletching behind.
  const tip=[0,0,.19],base=[[.042,0,.06],[0,.042,.06],[-.042,0,.06],[0,-.042,.06]];
  for(let i=0;i<4;i++){const a=base[i],b=base[(i+1)%4],normal=normalize(cross(b.map((v,k)=>v-a[k]),tip.map((v,k)=>v-a[k])));for(const p of [a,b,tip])mesh.push(...p,...normal,.63,.64,.58,12,0,0);}
  for(const a of [0,Math.PI/2]){
   const from=mesh.length;box(mesh,[0,.035,-.27],[.012,.08,.12],[.7,.65,.5],.002,1,1);
   for(let k=from;k<mesh.length;k+=12)for(const offset of [0,3]){const x=mesh[k+offset],y=mesh[k+offset+1];mesh[k+offset]=x*Math.cos(a)-y*Math.sin(a);mesh[k+offset+1]=x*Math.sin(a)+y*Math.cos(a);}
  }
  return mesh;
 }
 function swordGeometry(){
  const mesh=[],steel=[.57,.63,.64],gold=[.55,.34,.085];
  box(mesh,[0,-.235,0],[.05,.18,.052],[.105,.055,.024],.008,13,2);
  sphere(mesh,[0,-.335,0],[.044,.04,.04],gold,12);
  box(mesh,[0,-.13,0],[.25,.048,.065],gold,.013,12,2);
  // Diamond section blade, with bevels meeting along a central ridge.
  const section=[[-.057,0],[0,.025],[.057,0],[0,-.025]];
  for(let j=0;j<4;j++){
   const a=section[j],b=section[(j+1)%4],lo=[a[0],-.1,a[1]],hi=[a[0],.43,a[1]],next=[b[0],.43,b[1]],bottom=[b[0],-.1,b[1]],tip=[0,.61,0];
   for(const tri of [[lo,hi,next],[lo,next,bottom],[hi,tip,next]]){const n=normalize(cross(tri[1].map((v,k)=>v-tri[0][k]),tri[2].map((v,k)=>v-tri[0][k])));for(const p of tri)mesh.push(...p,...n,...steel,12,0,0);}
  }
  sphere(mesh,[0,-.13,.038],[.022,.022,.011],[.12,.42,.8],4);
  return mesh;
 }
 function archerGeometry(){
  const mesh=[],bone=[.72,.67,.47],dark=[.028,.023,.018],joint=(p,r=.037)=>sphere(mesh,p,[r,r,r],bone),limb=(a,b,w=.05)=>{rod(mesh,a,b,w,bone);joint(a,w*.65);joint(b,w*.65);};
  // Skull, separate jaw, sockets, nasal cavity and individual teeth.
  sphere(mesh,[0,1.04,0],[.158,.17,.14],bone);sphere(mesh,[0,.905,.025],[.108,.065,.108],bone);
  for(const s of [-1,1]){sphere(mesh,[s*.061,1.06,.125],[.046,.052,.025],dark);sphere(mesh,[s*.061,1.06,.148],[.012,.016,.009],[1.6,.38,.035],4);}
  sphere(mesh,[0,.996,.14],[.022,.028,.012],dark);
  for(const x of [-.067,-.022,.022,.067])box(mesh,[x,.922,.12],[.027,.037,.024],bone,.005,1,2);
  limb([0,.41,0],[0,.88,0],.055);
  for(let i=0;i<4;i++)for(const s of [-1,1]){
   const y=.79-i*.073;rod(mesh,[s*.02,y,-.025],[s*(.17-i*.013),y-.017,.005],.028,bone);
   rod(mesh,[s*(.17-i*.013),y-.017,.005],[s*.07,y-.043,.095],.026,bone);
  }
  limb([-.17,.83,0],[.17,.83,0],.045);sphere(mesh,[0,.43,0],[.12,.07,.075],bone);
  for(const s of [-1,1]){limb([s*.075,.41,0],[s*.115,.22,s*.025],.055);limb([s*.115,.22,s*.025],[s*.14,.04,.035],.045);box(mesh,[s*.14,.035,.09],[.09,.065,.18],bone,.02,1,2);}
  // One arm holds the bow, the other draws the string back to the ribs.
  limb([-.17,.83,0],[-.22,.65,.16],.044);limb([-.22,.65,.16],[-.09,.57,.34],.038);
  limb([.17,.83,0],[.27,.64,-.045],.044);limb([.27,.64,-.045],[.025,.57,.09],.038);
  sphere(mesh,[-.09,.57,.34],[.043,.043,.048],bone);sphere(mesh,[.025,.57,.09],[.042,.042,.042],bone);
  return mesh;
 }
 function bowGeometry(){
  const mesh=[],points=[[-.09,.19,.21],[-.09,.29,.32],[-.09,.43,.4],[-.09,.57,.42],[-.09,.71,.4],[-.09,.85,.32],[-.09,.95,.21]];
  for(let i=1;i<points.length;i++)rod(mesh,points[i-1],points[i],.035,[.44,.23,.075],11);
  rod(mesh,[-.09,.51,.42],[-.09,.63,.42],.047,[.13,.08,.04],13);
  return mesh;
 }
 const spikeTints=[[.16,.75,.09],[.045,.24,.95],[.95,.045,.025],[.63,.12,.88]];
 const spikeTint=trap=>trap.color===undefined?[.58,.63,.68]:spikeTints[trap.color];
 function spikeSocket(mesh,x,z,tint){
  const profile=[[.082,.003],[.125,.003],[.132,.011],[.121,.028],[.085,.028],[.08,.014],[.082,.003]],color=tint.map(c=>c*.72+.02);
  for(let band=0;band<profile.length-1;band++){
   const [r0,y0]=profile[band],[r1,y1]=profile[band+1],a=[[-1,-1],[1,-1],[1,1],[-1,1]];
   for(let side=0;side<4;side++){
    const p=a[side],q=a[(side+1)%4],vertices=[[x+p[0]*r0,y0,z+p[1]*r0],[x+p[0]*r1,y1,z+p[1]*r1],[x+q[0]*r1,y1,z+q[1]*r1],[x+q[0]*r0,y0,z+q[1]*r0]];
    const n=normalize(cross(vertices[1].map((v,k)=>v-vertices[0][k]),vertices[2].map((v,k)=>v-vertices[0][k])));
    for(const i of [0,1,2,0,2,3])mesh.push(...vertices[i],...n,...color,24,0,0);
   }
  }
  box(mesh,[x,.004,z],[.16,.006,.16],[.008,.01,.012],.002,13,1);
 }
 function spike(mesh,x,y,z,tint){
  const profile=[[-.075,-.075],[.075,-.075],[.075,.075],[-.075,.075]];
  for(let i=0;i<profile.length;i++){
   const a=profile[i],b=profile[(i+1)%profile.length],p=[x+a[0],y,z+a[1]],q=[x+b[0],y,z+b[1]],top=[x,y+.24,z],n=normalize(cross(top.map((v,k)=>v-p[k]),q.map((v,k)=>v-p[k]))),color=tint.map(c=>c*(i%2?1:.82));
   for(const v of [p,top,q])mesh.push(...v,...n,...color,1,0,0);
  }
 }
 function portalRing(mesh,x,y,z,color){
  const vertex=(a,b)=>{const radius=.3+Math.cos(b)*.024;return [x+Math.cos(a)*radius,y+Math.sin(b)*.024,z+Math.sin(a)*radius,Math.cos(a)*Math.cos(b),Math.sin(b),Math.sin(a)*Math.cos(b),...color,4,x,z];};
  for(let i=0;i<32;i++)for(let j=0;j<6;j++){const a=i/32*Math.PI*2,b=j/6*Math.PI*2,da=Math.PI/16,db=Math.PI/3;mesh.push(...vertex(a,b),...vertex(a+da,b+db),...vertex(a+da,b),...vertex(a,b),...vertex(a,b+db),...vertex(a+da,b+db));}
 }
 function pressureSurface(mesh,center,profile,color,material,tile=0,segments=48){
  for(let band=0;band<profile.length-1;band++){
   const [r0,y0]=profile[band],[r1,y1]=profile[band+1],dr=r1-r0,dy=y1-y0,length=Math.hypot(dr,dy);
   const vertex=(a,r,y)=>{
    const x=Math.cos(a)*r,z=Math.sin(a)*r,uv=[(tile%4+.02+(.5+x/.6)*.96)/4,(Math.floor(tile/4)+.02+(.5+z/.6)*.96)/4];
    return [center[0]+x,center[1]+y,center[2]+z,Math.cos(a)*dy/length,-dr/length,Math.sin(a)*dy/length,...color,material,...uv];
   };
   for(let k=0;k<segments;k++){
    const a=k/segments*Math.PI*2,b=(k+1)/segments*Math.PI*2;
    mesh.push(...vertex(a,r0,y0),...vertex(a,r1,y1),...vertex(b,r1,y1),...vertex(a,r0,y0),...vertex(b,r1,y1),...vertex(b,r0,y0));
   }
  }
 }
 const runePaths=[
   [[[0,.26],[0,-.26]],[[0,.02],[-.18,-.17]],[[0,.02],[.18,-.17]]],
   [[[0,-.25],[.2,0],[0,.25],[-.2,0],[0,-.25]],[[-.2,0],[.2,0]]],
   [[[.17,-.25],[-.12,-.04],[.12,.04],[-.17,.25]]],
   [[[0,-.25],[.2,0],[0,.25],[-.2,0],[0,-.25]]]
 ];
 const runeGlyphShader=`
 fn runeSegment(p:vec2f,a:vec2f,b:vec2f)->f32{let ab=b-a;return length(p-a-ab*clamp(dot(p-a,ab)/dot(ab,ab),0.,1.));}
 fn runeDistance(p:vec2f,glyph:u32)->f32{var distance=10.;
 ${runePaths.map((paths,index)=>`if(glyph==${index}u){${paths.flatMap(path=>path.slice(1).map((b,j)=>`distance=min(distance,runeSegment(p,vec2f(${path[j].join(',')}),vec2f(${b.join(',')})));`)).join('')}}`).join('')}
 return distance;}
 `;
 function goalRune(mesh,center,index,color,material=10){
  const paths=runePaths[index];
  for(const path of paths)for(let j=0;j<path.length-1;j++){
   const a=path[j],b=path[j+1],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),s=dx/length,c=dz/length,from=mesh.length;
   box(mesh,[0,0,0],[.034,.007,length+.018],color,.003,material,2);
   for(let k=from;k<mesh.length;k+=12){
    const x=mesh[k],z=mesh[k+2],nx=mesh[k+3],nz=mesh[k+5];
    mesh[k]=center[0]+(a[0]+b[0])*.5+x*c+z*s;mesh[k+1]+=center[1];mesh[k+2]=center[2]+(a[1]+b[1])*.5-x*s+z*c;
    mesh[k+3]=nx*c+nz*s;mesh[k+5]=-nx*s+nz*c;
   }
  }
 }
 function colorBlockRunes(mesh,block,color,axis,sign){
   const from=mesh.length,n=[0,0,0];n[axis]=sign;const u=axis===1?[1,0,0]:[n[2],0,-n[0]],v=cross(u,n);
   // A signed-distance sigil has a luminous core and halo without opaque plates.
   for(const [x,z] of [[-1,-1],[1,1],[1,-1],[-1,-1],[-1,1],[1,1]])mesh.push(x*.35,0,z*.35,0,1,0,...color,19+block.color,x,z);
   for(let k=from;k<mesh.length;k+=12)for(const offset of [0,3]){const x=mesh[k+offset],y=mesh[k+offset+1],z=mesh[k+offset+2];for(let j=0;j<3;j++)mesh[k+offset+j]=u[j]*x+n[j]*y+v[j]*z+(offset===0?[block.x,block.y-.5,block.z][j]+n[j]*(axis===1?.504:.489):0);}
 }
 function phaseBlock(mesh,faces,block,color){
  const shell=[];box(shell,[block.x,block.y-.5,block.z],[.97,1,.97],color,.075,17,6);
  // Keep each face and its rune together, so a jelly inside the block can be
  // composited between the far and near surfaces without opaque depth writes.
  const faceSize=shell.length/6;
  for(let face=0;face<6;face++){
   const axis=Math.floor(face/2),sign=face%2?-1:1,from=mesh.length/12,center=[block.x,block.y-.5,block.z],normal=[0,0,0];normal[axis]=sign;center[axis]+=sign*.5;
   mesh.push(...shell.slice(face*faceSize,(face+1)*faceSize));colorBlockRunes(mesh,block,color,axis,sign);
   faces.push({kind:'phase',center,normal,first:from,count:mesh.length/12-from});
  }
 }
 function phaseGroundGlow(mesh,faces,block,color){
  const first=mesh.length/12,center=[block.x,block.y-.995,block.z];
  for(const [x,z] of [[-1,-1],[1,1],[1,-1],[-1,-1],[-1,1],[1,1]])mesh.push(center[0]+x*.9,center[1],center[2]+z*.9,0,1,0,...color,23,x,z);
  faces.push({kind:'phase',center,normal:[0,1,0],first,count:6});
 }
 function colliderLines(boxes){
  const data=[],colors={floor:[.12,.65,1],block:[.22,.75,1],wall:[.8,.88,.95],lift:[1,.65,.04],bridge:[1,.7,.2],conveyor:[.7,.9,.3],spikes:[1,.1,.12],portal:[.85,.2,1]};
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
 struct Scene { vp:mat4x4f, lightVP:mat4x4f, eye:vec4f, light:vec4f, body0:vec4f, body1:vec4f, body2:vec4f, options:vec4f, portals:array<Portal,${PORTAL_LIMIT}>, goals:array<Goal,4>, torches:array<vec4f,8>, body3:vec4f, bodySlots:vec4f, finish:vec4f, goalSlots:vec4f };
 @group(0) @binding(0) var<uniform> scene:Scene;
 struct Out { @builtin(position) clip:vec4f, @location(0) world:vec3f, @location(1) normal:vec3f, @location(2) color:vec3f, @location(3) material:f32, @location(4) local:vec3f };
 struct Vertex { position:vec4f, normal:vec4f, info:vec4f };
 @group(0) @binding(1) var<storage,read> vertices:array<Vertex>;
 @group(0) @binding(4) var stoneAtlas:texture_2d<f32>;
 @group(0) @binding(5) var oakTexture:texture_2d<f32>;
 @group(0) @binding(6) var materialSampler:sampler;
 ${runeGlyphShader}
 @vertex fn solidVS(@location(0) p:vec3f,@location(1) n:vec3f,@location(2) color:vec3f,@location(3) material:vec3f)->Out{
  var o:Out;o.clip=scene.vp*vec4f(p,1);o.world=p;o.normal=n;o.color=color;o.material=material.x;o.local=vec3f(material.y,0,material.z);return o;
 }
 @vertex fn softVS(@builtin(vertex_index) id:u32,@builtin(instance_index) instance:u32)->Out{
  let v=vertices[id+instance*1350u];var o:Out;o.clip=scene.vp*v.position;o.world=v.position.xyz;o.normal=v.normal.xyz;
  let colors=array<vec3f,4>(vec3f(.045,.72,.095),vec3f(.025,.15,.95),vec3f(.95,.055,.025),vec3f(.58,.045,.92));
  o.color=colors[u32(v.info.w)];o.material=2.+v.info.w;o.local=v.info.xyz;return o;
 }
 @vertex fn portalHaloVS(@location(0) p:vec3f,@builtin(instance_index) instance:u32)->Out{
  let portal=scene.portals[instance];var o:Out;o.world=portal.position.xyz+vec3f(p.x*.78,.033,p.z*.78);o.clip=scene.vp*vec4f(o.world,1.);
  o.normal=vec3f(0,1,0);o.color=select(portal.color.rgb,mix(vec3f(.2,.22,.25),portal.color.rgb,.16),portal.position.w<0.);o.material=9.;o.local=vec3f(p.x,select(.065+portal.position.w*.3,.035,portal.position.w<0.),p.z);return o;
 }
 @vertex fn portalRingVS(@location(0) p:vec3f,@location(1) n:vec3f,@builtin(instance_index) instance:u32)->Out{
  let portal=scene.portals[instance/3u];let phase=fract(scene.options.z*.42+f32(instance%3u)/3.+portal.color.w);let radius=.85+phase*.8;
  var o:Out;o.world=portal.position.xyz+vec3f(p.x*radius,.065+phase*.92+p.y*(1.-phase*.6),p.z*radius);o.clip=scene.vp*vec4f(o.world,1.);
  let charge=max(0.,portal.position.w);
  if(portal.position.w<0.){o.clip=vec4f(2,2,2,1);}
  o.normal=normalize(vec3f(n.x/radius,n.y/(1.-phase*.6),n.z/radius));o.color=portal.color.rgb*(1.+charge*1.15);o.material=10.;
  o.local=vec3f(0.,smoothstep(0.,.1,phase)*pow(1.-phase,1.6)*(.22+charge*.38),0.);return o;
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
 @fragment fn runeFS(o:Out)->@location(0) vec4f{
  let distance=runeDistance(o.local.xy,u32(o.material));let aa=max(.001,fwidth(distance));
  let stroke=1.-smoothstep(.022-aa,.022+aa,distance);let glow=exp(-distance*35.)*.22;
  return vec4f(o.color,(stroke*.85+glow)*o.local.z);
 }
 @vertex fn beamVS(@location(0) p:vec3f,@location(4) start:vec4f,@location(5) end:vec4f,@location(6) tint:vec4f)->Out{
  let direction=normalize(end.xyz-start.xyz);let view=normalize(scene.eye.xyz-(start.xyz+end.xyz)*.5);let side=cross(direction,view);
  let fallback=cross(direction,select(vec3f(0,1,0),vec3f(1,0,0),abs(direction.y)>.9));
  let right=normalize(select(fallback,side,dot(side,side)>.0001));let uv=vec2f(p.x,(p.z+1.)*.5);var o:Out;
  o.world=mix(start.xyz,end.xyz,uv.y)+right*uv.x*.075;o.clip=scene.vp*vec4f(o.world,1.);o.normal=view;o.color=tint.rgb;o.material=0.;o.local=vec3f(uv,tint.w);return o;
 }
 @fragment fn beamFS(o:Out)->@location(0) vec4f{
  let core=exp(-o.local.x*o.local.x*100.);let glow=exp(-o.local.x*o.local.x*6.);
  let alpha=(core*.95+glow*.2)*o.local.z;return vec4f(mix(o.color*2.4,vec3f(3.),core*.65),alpha);
 }
 @vertex fn goalGlowVS(@location(0) p:vec3f,@builtin(instance_index) instance:u32)->Out{
  let goal=scene.goals[instance];var o:Out;
  o.world=goal.position.xyz+vec3f(p.x*.68,.061,p.z*.68);o.clip=scene.vp*vec4f(o.world,1.);
  o.normal=vec3f(0,1,0);o.color=goal.color.rgb;o.material=9.;o.local=vec3f(p.x,goal.position.w*.55,p.z);return o;
 }
 // The seal sits outside the jelly's footprint, so its charge remains readable.
 @vertex fn goalSealVS(@location(0) p:vec3f,@builtin(instance_index) instance:u32)->Out{
  let goal=scene.goals[instance];var o:Out;
  o.world=goal.position.xyz+vec3f(p.x*.86,.064,p.z*.86);o.clip=scene.vp*vec4f(o.world,1.);
  if(scene.goalSlots[instance]<0.){o.clip=vec4f(2,2,2,1);}
  o.normal=vec3f(0,1,0);o.color=goal.color.rgb;o.material=scene.goalSlots[instance];o.local=vec3f(p.x*.86,scene.finish.x,p.z*.86);return o;
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
  let uv=o.local.xz;let dx=dpdx(uv);let dy=dpdy(uv);
  if(o.material<.5||(o.material>16.5&&o.material<17.5)){
   let texel=textureSampleGrad(stoneAtlas,materialSampler,uv,dx,dy).rgb;
   let value=dot(texel,vec3f(.25,.6,.15));
   let wear=clamp(value*3.6,.38,1.22);
   color*=mix(vec3f(wear),texel*3.6,.2);
   let tile=fract(uv*4.);let edge=min(min(tile.x,tile.y),min(1.-tile.x,1.-tile.y));
   color*=mix(.58,1.,smoothstep(.023,.055,edge));
   if(o.material<.5&&abs(n.y)<.72){
    let row=floor(o.world.y*2.);let along=select(o.world.x,o.world.z,abs(n.x)>.7);
    let seam=min(abs(fract(o.world.y*2.)-.5),abs(fract(along+row*.5+.5)-.5));
    color*=mix(.38,1.,smoothstep(.009,.035,seam));
   }
  }
  if(o.material>17.5&&o.material<18.5){color*=.86+.14*sin(o.world.y*97.)*sin(o.world.x*113.+o.world.z*113.);}
  if(o.material>10.5&&o.material<11.5){color*=textureSampleGrad(oakTexture,materialSampler,uv,dx,dy).rgb*3.;}
  if(o.material>11.5&&o.material<12.5){let age=.5+.5*sin(o.world.x*11.+sin(o.world.y*7.))*sin(o.world.z*13.+o.world.y*5.);color=mix(color,vec3f(.065,.125,.095),smoothstep(.67,.95,age)*.32);}
  if(o.material>13.5&&o.material<14.5){let stone=textureSampleGrad(stoneAtlas,materialSampler,uv,dx,dy).rgb;let wear=clamp(dot(stone,vec3f(.25,.6,.15))*3.5,.3,1.35);color*=wear;}
  if(o.material>15.5&&o.material<16.5){
   let axes=array<vec2f,4>(vec2f(0,1),vec2f(1,0),vec2f(0,-1),vec2f(-1,0));let axis=axes[min(u32(round(o.local.x)),3u)];
   let across=dot(o.world.xz-round(o.world.xz),vec2f(axis.y,-axis.x));let track=dot(o.world.xz,axis)-scene.options.z*o.local.z;
   let groove=1.-smoothstep(.02,.055,abs(fract(track*5.)-.5));
   let chevron=(1.-smoothstep(.035,.065,abs(fract((track+abs(across)*.7)*2.)-.5)))*(1.-smoothstep(.2,.24,abs(across)));
   color=mix(vec3f(.18,.23,.18),vec3f(.035,.05,.04),groove)+chevron*vec3f(.55,.38,.12);
  }
  var light=vec3f(.105,.13,.18)+vec3f(1.04,.85,.59)*max(0.,dot(n,l))*shadow(o.world,n)+vec3f(.105,.16,.255)*max(0.,dot(n,normalize(vec3f(-.6,.4,-.6))));
  for(var i=0;i<8;i++){
   if(scene.torches[i].w<.5){continue;}
   let delta=scene.torches[i].xyz-o.world;let distance=length(delta);let attenuation=pow(1.-smoothstep(.1,3.4,distance),2.);
   let flicker=1.+sin(scene.options.z*8.+f32(i)*2.)*.035;
   light+=vec3f(4.1,1.5,.22)*attenuation*max(.12,dot(n,normalize(delta)))*flicker;
  }
  // Soft, coloured transmission shadows; wider and lighter when a cube lifts off.
  let bodies=array<vec4f,4>(scene.body0,scene.body1,scene.body2,scene.body3);
  let tints=array<vec3f,4>(vec3f(.09,.85,.18),vec3f(.035,.17,1.),vec3f(1.,.08,.035),vec3f(.65,.08,1.));
  for(var i=0;i<4;i++){
   let body=bodies[i];let delta=o.world.xz-body.xz;
   let height=max(0.,body.y-.42-(body.w-4.));let radius=.28+height*.18;
   let amount=exp(-dot(delta,delta)/(radius*radius))*.36/(1.+height*2.);
   if(body.w>0.&&o.world.y<body.y-.2){
    let tint=tints[u32(scene.bodySlots[i])];
    light*=mix(vec3f(1.),tint*.6+vec3f(.2),amount);
    light+=tint*exp(-dot(delta,delta)/.34)*.22/(1.+height*3.);
   }
  }
  var result=color*light;
  if(o.material>16.5&&o.material<17.5){result+=color*.22;}
  if(o.material>.5&&o.material<1.5){result+=vec3f(.28)*pow(max(0.,dot(n,h)),55.);}
  if(o.material>3.5&&o.material<4.5){result=color*(1.4+sin(scene.options.z*4.)*.08);}
  if(o.material>11.5&&o.material<12.5){result+=vec3f(.56,.4,.21)*pow(max(0.,dot(n,h)),45.);}
  if(o.material>13.5&&o.material<14.5){result+=color*.12+vec3f(.18)*pow(max(0.,dot(n,h)),80.);}
  if(o.material>23.5&&o.material<24.5){result+=color*.3+vec3f(.25)*pow(max(0.,dot(n,h)),65.);}
  if(o.material>4.5&&o.material<5.5){let portal=scene.portals[u32(o.local.x)];let inactive=portal.position.w<0.;let charge=max(0.,portal.position.w);let delta=o.world.xz-portal.position.xz;let radius=length(delta);let swirl=.5+.5*sin(atan2(delta.y,delta.x)*3.-radius*35.+scene.options.z*select(3.,.35,inactive));let tint=select(color,mix(vec3f(.19,.21,.24),color,.16),inactive);result=(tint*(.55+swirl*select(1.8,.35,inactive))+vec3f(.06)*exp(-radius*12.))*select(.55+charge*1.9,.7,inactive);}
  if(o.material>7.5&&o.material<8.5){let portal=scene.portals[u32(o.local.x)];result=select(color*(.65+max(0.,portal.position.w)*2.8),mix(vec3f(.16,.18,.2),color,.12),portal.position.w<0.);}
  if(o.material>9.5&&o.material<10.5){let goal=scene.goals[u32(o.local.x)];let charge=goal.position.w;
   result=mix(color*light,goal.color.rgb*.9,charge);
   if(o.local.z>.5){
    let strokePosition=clamp((o.world.z-goal.position.z+.42)/.84,0.,1.);
    let inscribed=(1.-smoothstep(scene.finish.x-.025,scene.finish.x+.025,strokePosition))*smoothstep(0.,.04,scene.finish.x)*step(0.,scene.goalSlots[u32(o.local.x)]);
    result=color*(mix(.32,2.7,charge)+inscribed*3.);
   }
  }
  return vec4f(result,1.);
 }
 fn energyRune(p:vec2f,glyph:u32)->f32{
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
 @fragment fn phaseFS(o:Out)->@location(0) vec4f{
  let uv=o.local.xz;let aa=max(.002,length(fwidth(uv))*.6);
  if(o.material>22.5){let radius=length(uv);let glow=exp(-radius*radius*3.5)*(1.-smoothstep(.55,1.,radius));return vec4f(o.color*2.4,glow*.18);}
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
  return vec4f(color,clamp(o.local.x,0.,1.));
 }
 `;
 const skin=`
 @group(1) @binding(0) var behind:texture_2d<f32>;
 @group(1) @binding(1) var backFaces:texture_2d<f32>;
 @group(1) @binding(2) var linearSampler:sampler;
 // Embedded ivory marks use rest coordinates, so they stretch with the actual gel.
 fn inlay(p:vec3f)->f32{
  // Opposites sum to seven: +Y/-Y = 1/6, +Z/-Z = 2/5, +X/-X = 3/4.
  let a=abs(p);var face=p.xy;var count=select(5u,2u,p.z>=0.);
  if(a.x>=a.y&&a.x>=a.z){face=p.zy;count=select(4u,3u,p.x>=0.);}
  else if(a.y>=a.z){face=p.xz;count=select(6u,1u,p.y>=0.);}
  var distance=10.;
  if(count%2u==1u){distance=length(face);}
  if(count==2u||count==3u){distance=min(distance,min(length(face-vec2f(-.185)),length(face-vec2f(.185))));}
  if(count>=4u){distance=min(distance,length(abs(face)-vec2f(.185)));}
  if(count==6u){distance=min(distance,length(vec2f(abs(face.x)-.185,face.y)));}
  let aa=max(.0015,fwidth(distance)*.8);
  return 1.-smoothstep(.041-aa,.041+aa,distance);
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
  let transmission=exp(-absorption*thick*1.35);
  let background=textureSampleLevel(behind,linearSampler,refractedUV,0.).rgb;
  var color=background*transmission+pigment*(1.-transmission)*.55;
  let farInlay=clamp(exit.w-1.,0.,1.);
  color=mix(color,vec3f(.65,.6,.33)*transmission+pigment*.11,farInlay*.22);
  let frontInlay=inlay(o.local);
  color=mix(color,vec3f(.72,.68,.42)*(.76+.24*max(0.,dot(n,normalize(scene.light.xyz-o.world))))+pigment*.07,frontInlay*.83);
  let f=.025+.975*pow(1.-max(0.,dot(n,-ray)),5.);
  color=mix(color,environment(reflect(ray,n)),min(.85,f*.78+.025));
  color+=pigment*pow(1.-max(0.,dot(n,-ray)),3.)*.34;
  let l=normalize(scene.light.xyz-o.world);let h=normalize(l-ray);
  color+=vec3f(2.6,2.3,1.8)*pow(max(0.,dot(n,h)),150.);
  color+=pigment*.07;
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
  if(id.x>=5400u){return;}let instance=id.x/1350u;if(nodes[instance*64u].w<0.){return;}let bind=binds[id.x%1350u];
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
 const post=`
 @group(0) @binding(0) var image:texture_2d<f32>;
 @group(0) @binding(1) var linearSampler:sampler;
 @vertex fn postVS(@builtin(vertex_index) i:u32)->@builtin(position) vec4f{let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(p[i],0,1);}
 fn tone(input:vec3f)->vec3f{var c=max(input,vec3f(0));let x=min(c.r,min(c.g,c.b));c-=vec3f(select(.04,x-6.25*x*x,x<.08));let peak=max(c.r,max(c.g,c.b));if(peak<.76){return c;}let newPeak=1.-.0576/(peak+.24-.76);c*=newPeak/peak;return mix(c,vec3f(newPeak),1.-1./(.15*(peak-newPeak)+1.));}
 @fragment fn postFS(@builtin(position) p:vec4f)->@location(0) vec4f{let uv=p.xy/vec2f(textureDimensions(image));var hdr=textureSampleLevel(image,linearSampler,uv,0.).rgb;let vignette=1.-.12*smoothstep(.25,.76,length(uv-vec2f(.5)));hdr*=vignette;var c=tone(hdr);c=pow(max(c,vec3f(0)),vec3f(1./2.2));let noise=fract(sin(dot(p.xy,vec2f(12.9898,78.233)))*43758.5453)-.5;return vec4f(c+noise/255.,1);}
 `;
 const latticeShader=`
 struct Portal { position:vec4f, color:vec4f };
 struct Goal { position:vec4f, color:vec4f };
 struct Scene { vp:mat4x4f, lightVP:mat4x4f, eye:vec4f, light:vec4f, body0:vec4f, body1:vec4f, body2:vec4f, options:vec4f, portals:array<Portal,${PORTAL_LIMIT}>, goals:array<Goal,4>, torches:array<vec4f,8>, body3:vec4f, bodySlots:vec4f, finish:vec4f, goalSlots:vec4f };
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
   this.uniform=this.buffer(new Float32Array(SCENE_FLOATS),GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);
   const bindings=surfaceBindings(this.soft);this.bindingCount=bindings.count;
   this.bindBuffer=this.buffer(bindings.vertices,GPUBufferUsage.STORAGE);this.indexBuffer=this.buffer(bindings.indices,GPUBufferUsage.INDEX);this.indexCount=bindings.indices.length;
   this.nodes=this.buffer(new Float32Array(256*4),GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);
   this.restNodes=this.buffer(new Float32Array(this.soft.rest.flatMap(p=>[...p,0])),GPUBufferUsage.STORAGE);
   this.deformed=d.createBuffer({size:5400*48,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.VERTEX});
   this.compute=d.createComputePipeline({layout:'auto',compute:{module:deform,entryPoint:'deform'}});
   this.computeGroup=d.createBindGroup({layout:this.compute.getBindGroupLayout(0),entries:[this.nodes,this.restNodes,this.bindBuffer,this.deformed].map((buffer,binding)=>({binding,resource:{buffer}}))});
   this.sceneLayout=d.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}},{binding:1,visibility:GPUShaderStage.VERTEX,buffer:{type:'read-only-storage'}},{binding:2,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'depth'}},{binding:3,visibility:GPUShaderStage.FRAGMENT,sampler:{type:'comparison'}},{binding:4,visibility:GPUShaderStage.FRAGMENT,texture:{}},{binding:5,visibility:GPUShaderStage.FRAGMENT,texture:{}},{binding:6,visibility:GPUShaderStage.FRAGMENT,sampler:{}}]});
   this.skinLayout=d.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.FRAGMENT,texture:{}},{binding:1,visibility:GPUShaderStage.FRAGMENT,texture:{}},{binding:2,visibility:GPUShaderStage.FRAGMENT,sampler:{}}]});
   const layout=d.createPipelineLayout({bindGroupLayouts:[this.sceneLayout,this.skinLayout]});
   const vertexBuffers=[{arrayStride:48,attributes:[{shaderLocation:0,offset:0,format:'float32x3'},{shaderLocation:1,offset:12,format:'float32x3'},{shaderLocation:2,offset:24,format:'float32x3'},{shaderLocation:3,offset:36,format:'float32x3'}]}];
   const pipeline=(vertexEntry,fragmentEntry,cullMode='back',samples=4,depthCompare='less',depthWrite=true,blend=undefined,buffers=['solidVS','portalHaloVS','portalRingVS','goalBeamVS','goalGlowVS','goalSealVS'].includes(vertexEntry)?vertexBuffers:[])=>d.createRenderPipeline({layout,vertex:{module:main,entryPoint:vertexEntry,buffers},fragment:{module:main,entryPoint:fragmentEntry,targets:[{format:'rgba16float',blend}]},primitive:{topology:'triangle-list',cullMode,frontFace:'ccw'},depthStencil:{format:'depth32float',depthWriteEnabled:depthWrite,depthCompare},multisample:{count:samples}});
   this.opaque=pipeline('solidVS','solidFS');this.skin=pipeline('softVS','skinFS');this.back=pipeline('softVS','backFS','front',1,'greater');
   this.effectPipeline=pipeline('solidVS','effectFS','back',4,'less',false,{color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}});
   this.phasePipeline=pipeline('solidVS','phaseFS','back',4,'less',false,{color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}});
   const additive={color:{srcFactor:'src-alpha',dstFactor:'one',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}};
   this.runePipeline=pipeline('runeVS','runeFS','none',4,'less',false,additive,[vertexBuffers[0],{arrayStride:48,stepMode:'instance',attributes:[{shaderLocation:4,offset:0,format:'float32x4'},{shaderLocation:5,offset:16,format:'float32x4'},{shaderLocation:6,offset:32,format:'float32x4'}]}]);
   this.runeData=new Float32Array(32*12);this.runeBuffer=d.createBuffer({size:this.runeData.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});
   this.beamPipeline=pipeline('beamVS','beamFS','none',4,'less',false,additive,[vertexBuffers[0],{arrayStride:48,stepMode:'instance',attributes:[{shaderLocation:4,offset:0,format:'float32x4'},{shaderLocation:5,offset:16,format:'float32x4'},{shaderLocation:6,offset:32,format:'float32x4'}]}]);
   this.beamData=new Float32Array(16*12);this.beamBuffer=d.createBuffer({size:this.beamData.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});
   this.portalHaloPipeline=pipeline('portalHaloVS','portalFXFS','none',4,'less',false,additive);
   this.portalRingPipeline=pipeline('portalRingVS','portalFXFS','back',4,'less',false,additive);
   this.goalBeamPipeline=pipeline('goalBeamVS','goalBeamFS','none',4,'less',false,additive);
   this.goalGlowPipeline=pipeline('goalGlowVS','portalFXFS','none',4,'less',false,additive);
   this.goalSealPipeline=pipeline('goalSealVS','goalSealFS','none',4,'less',false,additive);
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
   [this.stoneTexture,this.woodTexture]=await Promise.all(['dungeon-stone-atlas.png','crate-oak.png'].map(name=>this.loadMaterialTexture('assets/materials/'+name)));
   this.materialSampler=d.createSampler({magFilter:'linear',minFilter:'linear',mipmapFilter:'linear',maxAnisotropy:4});
   const materialEntries=[{binding:4,resource:this.stoneTexture.createView()},{binding:5,resource:this.woodTexture.createView()},{binding:6,resource:this.materialSampler}];
   this.sceneGroup=d.createBindGroup({layout:this.sceneLayout,entries:[{binding:0,resource:{buffer:this.uniform}},{binding:1,resource:{buffer:this.deformed}},{binding:2,resource:this.shadowTexture.createView()},{binding:3,resource:this.compareSampler},...materialEntries]});
   // A distinct unsampled depth texture avoids attachment/sampling hazards in the shadow pass.
   this.dummyShadow=d.createTexture({size:[1,1],format:'depth32float',usage:GPUTextureUsage.TEXTURE_BINDING});
   this.shadowGroup=d.createBindGroup({layout:this.sceneLayout,entries:[{binding:0,resource:{buffer:this.uniform}},{binding:1,resource:{buffer:this.deformed}},{binding:2,resource:this.dummyShadow.createView()},{binding:3,resource:this.compareSampler},...materialEntries]});
   this.staticBuffer=d.createBuffer({size:4e6,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});
   this.phaseBuffer=d.createBuffer({size:65536,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});this.phaseFaces=[];
   this.propBuffer=d.createBuffer({size:2e6,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});
   this.bridgeBuffer=d.createBuffer({size:1e6,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});
   this.effectBuffer=d.createBuffer({size:4e6,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});
   this.decorationBuffer=d.createBuffer({size:2e6,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});
   this.ready=true;return this;
  }
  buffer(data,usage){const b=this.device.createBuffer({size:Math.max(4,data.byteLength),usage,mappedAtCreation:true});new Uint8Array(b.getMappedRange()).set(new Uint8Array(data.buffer,data.byteOffset,data.byteLength));b.unmap();return b;}
  async loadMaterialTexture(url){
   const response=await fetch(url);if(!response.ok)throw Error('Cannot load material: '+url);
   const bitmap=await createImageBitmap(await response.blob()),{width,height}=bitmap,mipLevelCount=1+Math.floor(Math.log2(Math.max(width,height)));
   const texture=this.device.createTexture({label:url,size:[width,height],mipLevelCount,format:'rgba8unorm-srgb',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});
   for(let mip=0;mip<mipLevelCount;mip++){
    const w=Math.max(1,width>>mip),h=Math.max(1,height>>mip),canvas=new OffscreenCanvas(w,h),ctx=canvas.getContext('2d');
    ctx.drawImage(bitmap,0,0,w,h);this.device.queue.copyExternalImageToTexture({source:canvas},{texture,mipLevel:mip},[w,h]);
   }
   bitmap.close();return texture;
  }
  resize(){
   const rect=this.canvas.getBoundingClientRect(),width=Math.max(1,rect.width),height=Math.max(1,rect.height);
   const ratio=Math.min(devicePixelRatio||1,1.25,Math.sqrt(2e6/(width*height))),w=Math.max(1,Math.round(width*ratio)),h=Math.max(1,Math.round(height*ratio));
   if(this.canvas.width===w&&this.canvas.height===h&&this.hdr)return;
   this.canvas.width=w;this.canvas.height=h;const d=this.device;
   for(const t of [this.hdr,this.background,this.msaa,this.depth,this.exitDepth,...(this.exits||[])])t?.destroy();
   const create=(format,sampleCount=1,extra=0)=>d.createTexture({size:[w,h],format,sampleCount,usage:GPUTextureUsage.RENDER_ATTACHMENT|extra});
   this.hdr=create('rgba16float',1,GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_SRC);
   this.background=create('rgba16float',1,GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST);
   this.msaa=create('rgba16float',4);this.depth=create('depth32float',4);this.exitDepth=create('depth32float');
   this.exits=Array.from({length:4},()=>create('rgba16float',1,GPUTextureUsage.TEXTURE_BINDING));
   this.skinGroups=this.exits.map(t=>d.createBindGroup({layout:this.skinLayout,entries:[{binding:0,resource:this.background.createView()},{binding:1,resource:t.createView()},{binding:2,resource:this.sampler}]}));
   this.postGroup=d.createBindGroup({layout:this.post.getBindGroupLayout(0),entries:[{binding:0,resource:this.hdr.createView()},{binding:1,resource:this.sampler}]});
  }
  buildScene(level){
   const mesh=[],phaseMesh=[],blocks=(level.world.blocks||[]).filter(b=>!level.bridges.some(p=>p.x===b.x&&p.z===b.z&&p.y===b.y)&&!level.world.lifts.some(p=>p.x===b.x&&p.z===b.z&&p.base===b.y)),occupied=new Set(blocks.filter(b=>b.color===undefined).map(b=>[b.x,b.y,b.z].join(',')));
   const blockTints=[[.08,.88,.12],[.025,.48,1.],[1.,.045,.015],[.64,.07,1.]];this.phaseFaces=[];
   for(const b of blocks){
    if([[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].every(d=>occupied.has([b.x+d[0],b.y+d[1],b.z+d[2]].join(','))))continue;
    if(b.color!==undefined){phaseBlock(phaseMesh,this.phaseFaces,b,blockTints[b.color]);const support=level.world.heightAt(b.x,b.z,b.y-.99);if(support!==null&&Math.abs(support-(b.y-1))<.01)phaseGroundGlow(phaseMesh,this.phaseFaces,b,blockTints[b.color]);continue;}
    const n=((b.x*73+b.y*31+b.z*137)%19+19)%19/19,color=b.y>0?[.135+n*.028,.15+n*.028,.18+n*.032]:[.265+n*.04,.225+n*.035,.18+n*.03];box(mesh,[b.x,b.y-.5,b.z],[.97,1,.97],color,.045,0,2);
   }
   for(const key of level.floor){const [x,z]=key.split(',').map(Number);if(level.bridges.some(b=>b.x===x&&b.z===z))continue;const height=0;
    const noise=((x*73+z*137)%19)/19,color=[.265+noise*.04,.225+noise*.035,.18+noise*.03];
    if(level.world.lifts.some(l=>l.x===x&&l.z===z)){
     const base=level.world.lifts.find(l=>l.x===x&&l.z===z).base||0;box(mesh,[x,base-.52,z],[.99,.25,.99],[.12,.14,.12],.025);
    }else{box(mesh,[x,height-.36,z],[.97,.72,.97],color,.045);const upper=level.world.heights.get(key)||0;for(let y=0;y<upper;y++){const span=Math.min(1,upper-y);box(mesh,[x,y+span*.5,z],[.97,span,.97],color,.045);}}
   }
   for(const o of level.world.collisionBoxes().filter(o=>o.kind==='wall'))box(mesh,[o.x,(o.minY+o.maxY)*.5,o.z],[o.half*2-.03,o.maxY-o.minY,o.half*2-.03],o.half>.4?[.12,.145,.18]:[.105,.12,.115],.045);
   const data=new Float32Array(mesh);if(data.byteLength>this.staticBuffer.size){this.staticBuffer.destroy();this.staticBuffer=this.device.createBuffer({size:Math.ceil(data.byteLength/65536)*65536,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});}
   this.staticCount=mesh.length/12;this.device.queue.writeBuffer(this.staticBuffer,0,data);
   const phaseData=new Float32Array(phaseMesh);if(phaseData.byteLength>this.phaseBuffer.size){this.phaseBuffer.destroy();this.phaseBuffer=this.device.createBuffer({size:Math.ceil(phaseData.byteLength/65536)*65536,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});}
   if(phaseData.length)this.device.queue.writeBuffer(this.phaseBuffer,0,phaseData);
  }
  bridges(level){
   const mesh=[];
   level.bridges.forEach((bridge,i)=>{
    const from=mesh.length;
    const bounds=level.world.bridgeBounds(i);if(!bounds)return;
    const length=bounds.halfZ*2,x=bounds.x,z=bounds.z,anchor=bridge.z-.5,front=anchor+length;
    box(mesh,[x,-.13,z],[.97,.26,length],[.14,.10,.065],.018,11,2);
    for(let n=0;n<4;n++)box(mesh,[x+(n-1.5)*.195,.004,z],[.184,.026,length],[.42+n*.017,.245+n*.013,.105+n*.009],.008,11,2);
    for(const side of [-1,1])box(mesh,[x+side*.42,.012,z],[.085,.04,length],[.29,.215,.13],.009,12,2);
    box(mesh,[x,.012,front-.024],[.95,.035,Math.min(.07,length)],[.42,.30,.145],.009,12,2);
    for(const side of [-1,1])for(const offset of [.13,.55,.9]){const position=front-offset;if(position>anchor+.02)box(mesh,[x+side*.42,.04,position],[.032,.018,.032],[.62,.46,.25],.004,12,1);}
    if(bridge.y)for(let k=from;k<mesh.length;k+=12)mesh[k+1]+=bridge.y;
   });
   if(mesh.length){const data=new Float32Array(mesh);if(data.byteLength>this.bridgeBuffer.size){this.bridgeBuffer.destroy();this.bridgeBuffer=this.device.createBuffer({size:Math.ceil(data.byteLength/65536)*65536,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});}this.device.queue.writeBuffer(this.bridgeBuffer,0,data);}return mesh.length/12;
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
    for(let j=0;j<5;j++){const mesh=[],phase=j*2.4+i;const position=[Math.sin(phase)*.22,-.26+j*.097,Math.cos(phase)*.2];sphere(mesh,position,[.015,.015,.015],[[.55,.72,.23],[.25,.62,.7],[.9,.3,.12],[.7,.3,.9]][players[i].slot??i],1);append('bubble',i,mesh,{bubble:j});}
   }
   for(let i=0;i<(level.crates||[]).length;i++)append('crate',i,crateGeometry());
   for(let i=0;i<(level.world.drones||[]).length;i++)append('drone',i,droneGeometry(beamColors[level.world.drones[i].color]));
   const shield=shieldGeometry(),heldShield=shield.slice();
   rod(heldShield,[0,-.02,-.25],[-.045,-.07,-.11],.043,bone);rod(heldShield,[-.045,-.07,-.11],[0,-.04,-.012],.035,bone);sphere(heldShield,[0,-.04,-.012],[.044,.037,.035],bone);
   for(let i=0;i<players.length;i++)append('shield',i,heldShield);
   for(let i=0;i<players.length;i++)for(let damage=1;damage<=2;damage++){
    const mesh=[],points=damage===1?[[-.13,.24,.057],[-.05,.12,.057],[-.1,.035,.057]]:[[.1,-.27,.057],[.04,-.18,.057],[.13,-.08,.057]];
    for(let k=1;k<points.length;k++)for(const depth of [.057,-.004])rod(mesh,[points[k-1][0],points[k-1][1],depth],[points[k][0],points[k][1],depth],.009,[.025,.015,.008],13);append('shieldCrack',i,mesh,{damage});
   }
   const sword=swordGeometry(),heldSword=sword.slice();rod(heldSword,[0,-.08,-.25],[-.03,-.22,-.11],.043,bone);rod(heldSword,[-.03,-.22,-.11],[0,-.22,-.02],.035,bone);sphere(heldSword,[0,-.22,-.025],[.043,.036,.035],bone);
   for(let i=0;i<players.length;i++)append('sword',i,heldSword);
   for(let i=0;i<level.world.pickups.length;i++)append('pickup',i,level.world.pickups[i].kind==='sword'?sword:shield);
   const arrow=arrowGeometry();
   for(let i=0;i<12;i++)append('arrow',i,arrow);
   for(let i=0;i<level.world.archers.length;i++){
    append('archer',i,archerGeometry());append('archerBow',i,bowGeometry());
    const string=[];rod(string,[-.09,.19,.21],[-.09,.57,.21],.008,[.72,.62,.42],1);rod(string,[-.09,.57,.21],[-.09,.95,.21],.008,[.72,.62,.42],1);append('archerString',i,string);
    append('nockedArrow',i,arrow);
   }
   for(let i=0;i<level.plates.length;i++){
    const mesh=[],plate=level.plates[i],palette={red:[.78,.026,.012],blue:[.018,.25,.78],amber:[.78,.36,.012],dark:[.12,.135,.14]},color=palette[plate.color]||[palette.red,palette.blue][i%2];
    pressureSurface(mesh,[0,0,0],[[0,0],[.285,0],[.3,.009],[.3,.032],[.287,.045],[0,.045]],color,14,(i*7+2)%16);
    append('pressureButton',i,mesh);
   }
   for(let i=0;i<level.world.lifts.length;i++){
    const mesh=[],lift={x:0,z:0,height:0};
    box(mesh,[0,-.08,0],[.95,.16,.95],[.12,.105,.08],.025,12,2);
    for(let n=0;n<4;n++)box(mesh,[(n-1.5)*.21,.004,0],[.2,.024,.83],[.43+n*.02,.27+n*.012,.12+n*.008],.008,11,2);
    for(const dx of [-.4,.4])box(mesh,[dx,.017,0],[.085,.04,.93],[.40,.285,.13],.01,12,2);
    for(const dz of [-.4,.4])box(mesh,[0,.017,dz],[.93,.04,.085],[.40,.285,.13],.01,12,2);
    for(const dx of [-.4,.4])for(const dz of [-.4,.4])sphere(mesh,[dx,.044,dz],[.026,.014,.026],[.65,.49,.26],12);
    for(const sign of [-1,1]){rod(mesh,[-.12,-.15,sign*.471],[.12,-.15,sign*.471],.035,[.5,.35,.16],12);}
    append('lift',i,mesh);
   }
   for(let i=0;i<level.world.spikes.length;i++){
    const mesh=[],trap=level.world.spikes[i],color=spikeTint(trap);
    for(const dx of [-.21,.21])for(const dz of [-.21,.21])spike(mesh,dx,0,dz,color);append('spikes',i,mesh);
   }
   this.propPieces=pieces;this.propData=new Float32Array(pieces.reduce((sum,p)=>sum+p.data.length,0));
   if(this.propData.byteLength>this.propBuffer.size){this.propBuffer.destroy();this.propBuffer=this.device.createBuffer({size:this.propData.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});}
  }
  props(level,players,angle,time,dt=1/60){
   const key=[players.length,(level.crates||[]).length,level.world.lifts.length,level.world.spikes.length,level.plates.length,level.world.archers.length,level.world.pickups.length,(level.world.drones||[]).map(d=>d.color).join('.')].join(',');
   if(this.propGeometryKey!==key){this.buildProps(level,players);this.propGeometryKey=key;}
   this.platePress??=[];
   const plateBodies=[...players,...(level.crates||[])],pressFade=level.reducedMotion?1:1-Math.exp(-Math.min(dt,.1)*14);
   level.plates.forEach((plate,i)=>{const target=level.world.active(i,plateBodies)?1:0;this.platePress[i]=(this.platePress[i]||0)+(target-(this.platePress[i]||0))*pressFade;});
   const data=this.propData,c=Math.cos(angle),s=Math.sin(angle),rx=(c-s)*.7071,rz=-(s+c)*.7071,fx=(c+s)*.7071,fz=(c-s)*.7071;
   let cursor=0;
   // Reuse immutable local meshes and one upload array. No per-frame tessellation
   // or large JS number arrays for rigid decorations.
   for(const piece of this.propPieces){
    const i=piece.index,source=piece.data;let x=0,y=0,z=0,rotate=false,matrix=null,stringPull=0,swing=0;
    if(piece.kind==='jelly'||piece.kind==='bubble'){
     const p=players[i];if(p.state==='dead')continue;
     const core=level.soft.get(p).core;x=core[0];y=core[1];z=core[2];rotate=piece.kind==='jelly';
     if(piece.kind==='bubble')y+=(piece.bubble*.097+time*.018)%.51-piece.bubble*.097;
    }else if(piece.kind==='drone'){
     [x,y,z]=level.world.droneOrigin(level.world.drones[i]);const spin=level.reducedMotion?0:time*.35;matrix=[Math.cos(spin),0,Math.sin(spin),0,1,0,-Math.sin(spin),0,Math.cos(spin)];
    }else if(piece.kind==='crate'){
     const p=level.crates[i];if(p.state==='dead')continue;x=p.x;y=(p.y||0)+.42;z=p.z;matrix=level.soft.get(p).r;
    }else if(piece.kind==='shield'||piece.kind==='shieldCrack'||piece.kind==='sword'){
     const p=players[i],sword=piece.kind==='sword';if(!(sword?p.sword:p.shield)||p.state==='dead')continue;
     if(piece.kind==='shieldCrack'&&(p.shieldHP??3)>3-piece.damage)continue;
     const core=level.soft.get(p).core,fx=p.facingX||0,fz=p.facingZ??1;x=core[0]+fx*.55;y=core[1];z=core[2]+fz*.55;matrix=[fz,0,fx,0,1,0,-fx,0,fz];
     if(sword&&p.attackTime>0&&!level.reducedMotion)swing=Math.sin((1-p.attackTime/.32)*Math.PI)*1.15;
    }else if(piece.kind==='pickup'){
     const p=level.world.pickups[i];if(p.destroyed||p.holder!==null&&p.holder!==undefined)continue;
     x=p.x;y=(p.y??level.world.heightAt(p.x,p.z)??0)+.065+(level.reducedMotion?0:Math.sin(time*2)*.012);z=p.z;matrix=[1,0,0,0,0,1,0,-1,0];
    }else if(piece.kind==='arrow'){
     const p=level.world.arrows[i];if(!p)continue;x=p.x;y=p.y;z=p.z;matrix=[p.dz,0,p.dx,0,1,0,-p.dx,0,p.dz];
    }else if(piece.kind.startsWith('archer')||piece.kind==='nockedArrow'){
     const a=level.world.archers[i],length=Math.hypot(a.dx||0,a.dz??1)||1,fx=(a.dx||0)/length,fz=(a.dz??1)/length;
     if(a.state==='dead')continue;
     x=a.x;y=a.y??level.world.heightAt(a.x,a.z)??0;z=a.z;matrix=[fz,0,fx,0,1,0,-fx,0,fz];
     const pull=Math.max(0,1-(a.cooldown??a.firstShot??1.6)/.65)*.22;
     if(piece.kind==='archerString')stringPull=pull;
     if(piece.kind==='nockedArrow'){if((a.cooldown??1.6)>.85)continue;x+=fx*(.21-pull)-fz*.09;y+=.57;z+=fz*(.21-pull)+fx*.09;}
    }else if(piece.kind==='pressureButton'){
     const p=level.plates[i];x=p.x;y=(p.y??level.world.heightAt(p.x,p.z)??0)+.02-this.platePress[i]*.045;z=p.z;
    }else if(piece.kind==='lift'){
     const lift=level.world.lifts[i];x=lift.x;y=lift.height;z=lift.z;
    }else{
     const trap=level.world.spikes[i],state=level.world.spikeState(trap);if(state.extension<=0)continue;
     const f=level.world.spikeFrame(trap);[x,y,z]=f.origin.map((p,k)=>p+f.n[k]*(.015-.24*(1-state.extension)));
     matrix=[0,1,2].flatMap(k=>[f.u[k],f.n[k],f.v[k]]);
    }
    data.set(source,cursor);
    if(swing){const c=Math.cos(swing),s=Math.sin(swing);for(let n=0;n<source.length;n+=12)for(const offset of [0,3]){const k=cursor+n+offset,a=data[k],b=data[k+1]+(offset?0:.13);data[k]=a*c-b*s;data[k+1]=a*s+b*c-(offset?0:.13);}}
    if(matrix){for(let n=0;n<source.length;n+=12){const k=cursor+n,px=data[k],py=data[k+1],localZ=data[k+2]-stringPull*Math.max(0,1-Math.abs(py-.57)/.38),nx=data[k+3],ny=data[k+4],nz=data[k+5];for(let axis=0;axis<3;axis++){const a=axis*3;data[k+axis]=(axis===0?x:axis===1?y:z)+matrix[a]*px+matrix[a+1]*py+matrix[a+2]*localZ;data[k+3+axis]=matrix[a]*nx+matrix[a+1]*ny+matrix[a+2]*nz;}}}
    else if(rotate){for(let n=0;n<source.length;n+=12){const k=cursor+n;data[k]=x+rx*source[n]+fx*source[n+2];data[k+1]=y+source[n+1];data[k+2]=z+rz*source[n]+fz*source[n+2];data[k+3]=rx*source[n+3]+fx*source[n+5];data[k+5]=rz*source[n+3]+fz*source[n+5];}}
    else{for(let n=0;n<source.length;n+=12){const k=cursor+n;data[k]=x+source[n];data[k+1]=y+source[n+1];data[k+2]=z+source[n+2];}}
    cursor+=source.length;
   }
   const dynamicCount=cursor/12;this.device.queue.writeBuffer(this.propBuffer,0,data.buffer,0,cursor*4);
   const decorationKey=[level.goals.length,level.plates.length,level.world.spikes.length,level.world.portals.length,level.world.conveyors.length,JSON.stringify(level.world.torches||[])].join(',');
   if(this.decorationKey!==decorationKey){const mesh=[];
   level.goals.forEach((g,i)=>{
    if(!g)return;
    const y=g.y??level.world.heightAt(g.x,g.z)??0,color=[[.45,1.,.08],[.035,.17,1.],[1.,.055,.025],[.68,.12,1.]][g.slot??i],base=mesh.length;
    box(mesh,[g.x,y+.023,g.z],[.86,.045,.86],[.065,.08,.095],.025,10);
    for(let n=base;n<mesh.length;n+=12)mesh[n+10]=i;
    const trim=mesh.length;
    for(let k=0;k<4;k++){const x=k<2?g.x+(k?1:-1)*.39:g.x,z=k>=2?g.z+(k===2?1:-1)*.39:g.z;box(mesh,[x,y+.05,z],k<2?[.026,.012,.8]:[.8,.012,.026],color,.005,10);}
    goalRune(mesh,[g.x,y+.053,g.z],g.slot??i,color);
    for(let n=trim;n<mesh.length;n+=12){mesh[n+10]=i;mesh[n+11]=1;}
   });
   level.plates.forEach(p=>{
    const y=p.y??level.world.heightAt(p.x,p.z)??0;
    pressureSurface(mesh,[p.x,y,p.z],[[.293,.003],[.342,.003],[.346,.014],[.334,.038],[.304,.038],[.293,.024],[.293,.003]],[.09,.095,.093],12);
    pressureSurface(mesh,[p.x,y+.004,p.z],[[0,0],[.294,0],[.294,.012],[0,.012]],[.027,.03,.029],13);
   });
   for(const torch of level.world.torches||[]){
    const from=mesh.length,f=Levels.torchFrame(torch),iron=[.085,.1,.105],bronze=[.4,.255,.10];
    box(mesh,[0,-.05,.025],[.18,.44,.065],iron,.02,12,2);
    for(const y of [-.21,.11])sphere(mesh,[0,y,.064],[.026,.026,.018],bronze,12);
    rod(mesh,[0,-.2,.065],[0,-.13,.23],.035,iron,12);
    rod(mesh,[0,-.23,.15],[0,.1,.25],.042,[.22,.115,.035],11);
    for(const y of [-.12,.04])box(mesh,[0,y,.21+(y+.12)*.3],[.11,.035,.11],bronze,.007,12,2);
    pressureSurface(mesh,[0,.08,.25],[[0,0],[.055,0],[.11,.12],[.11,.145],[.08,.145],[.04,.06],[0,.06]],iron,12,0,12);
    sphere(mesh,[0,.27,.25],[.07,.13,.07],[2.8,.48,.025],4);
    sphere(mesh,[-.015,.375,.25],[.035,.105,.038],[2.5,.65,.035],4);
    sphere(mesh,[0,.235,.275],[.041,.085,.04],[4.,1.85,.18],4);
    for(let k=from;k<mesh.length;k+=12)for(const off of [0,3]){const u=mesh[k+off],y=mesh[k+off+1],n=mesh[k+off+2];for(let axis=0;axis<3;axis++)mesh[k+off+axis]=(off?0:f.origin[axis])+f.u[axis]*u+(axis===1?y:0)+f.n[axis]*n;}
   }
   for(const trap of level.world.spikes){
    const from=mesh.length,f=level.world.spikeFrame(trap);
    for(const dx of [-.21,.21])for(const dz of [-.21,.21])spikeSocket(mesh,dx,dz,spikeTint(trap));
    for(let k=from;k<mesh.length;k+=12)for(const off of [0,3]){const a=mesh[k+off],b=mesh[k+off+1],c=mesh[k+off+2];for(let axis=0;axis<3;axis++)mesh[k+off+axis]=(off?0:f.origin[axis])+f.u[axis]*a+f.n[axis]*b+f.v[axis]*c;}
   }
   for(const belt of level.world.conveyors){
    const from=mesh.length,y=belt.y??level.world.heightAt(belt.x,belt.z)??0,dx=belt.dx||0,dz=belt.dz??1,code=dx>0?1:dx<0?3:dz<0?2:0;
    box(mesh,[0,.005,0],[.78,.018,1],[.18,.23,.18],.004,16,2);
    for(let k=from;k<mesh.length;k+=12){mesh[k+10]=code;mesh[k+11]=belt.speed??.85;}
    for(const side of [-1,1]){
     box(mesh,[side*.435,.019,0],[.065,.045,1],[.22,.25,.23],.01,12,2);
     for(const z of [-.31,.31])box(mesh,[side*.435,.046,z],[.026,.012,.027],[.5,.43,.29],.004,12,1);
     if(!level.world.conveyorJoined(belt,side))box(mesh,[0,.012,side*.46],[.8,.055,.075],[.24,.26,.23],.018,12,2);
    }
    for(let k=from;k<mesh.length;k+=12)for(const offset of [0,3]){const x=mesh[k+offset],py=mesh[k+offset+1],z=mesh[k+offset+2];mesh[k+offset]=(offset?0:belt.x)+dz*x+dx*z;mesh[k+offset+1]=(offset?0:y)+py;mesh[k+offset+2]=(offset?0:belt.z)-dx*x+dz*z;}
   }
   level.world.portals.forEach((portal,i)=>{const y=portal.y??level.world.heightAt(portal.x,portal.z)??0,color=portal.color==='violet'?[.7,.045,1.]:[1.,.34,.025];box(mesh,[portal.x,y+.012,portal.z],[.75,.024,.75],[.08,.075,.095],.05);const rim=mesh.length;portalRing(mesh,portal.x,y+.053,portal.z,color);for(let n=rim;n<mesh.length;n+=12){mesh[n+9]=8;mesh[n+10]=i;mesh[n+11]=0;}const from=mesh.length;sphere(mesh,[portal.x,y+.04,portal.z],[.267,.012,.267],color,5);for(let n=from;n<mesh.length;n+=12){mesh[n+10]=i;mesh[n+11]=0;}});
   const decorations=new Float32Array(mesh);
   if(decorations.byteLength>this.decorationBuffer.size){this.decorationBuffer.destroy();this.decorationBuffer=this.device.createBuffer({size:Math.ceil(decorations.byteLength/65536)*65536,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});}
   this.decorationCount=mesh.length/12;this.device.queue.writeBuffer(this.decorationBuffer,0,decorations);this.decorationKey=decorationKey;
   }return dynamicCount;
  }
  effects(system,view){
   if(!system||(!system.particles.length&&!system.rings.length&&!system.bones?.length))return 0;
   const mesh=[],items=[...system.particles,...system.rings,...(system.bones||[])].sort((a,b)=>dot(a.position||a.center,view)-dot(b.position||b.center,view));
   for(const item of items){
    const t=item.age/item.life,fade=item.kind==='bone'?1:1-t*t*(3-2*t),from=mesh.length;
    if(item.position){
     const a=item.phase+Math.min(item.age,.8)*8,c=Math.cos(a),s=Math.sin(a),size=item.size*(.65+.35*fade),jelly=item.kind==='jelly',bone=item.kind==='bone',wood=item.kind==='wood',wobble=1+Math.sin(a*1.8)*.22;
     sphere(mesh,item.position,bone?(item.skull?[size,size*1.1,size]:[size*.4,size*1.6,size*.4]):wood?[size*.4,size*1.8,size*.3]:[size*wobble,size/(wobble*(jelly?1.3:1)),size],item.color,bone||wood?15:jelly?6:7,[[c,s,0],[-s,c,0],[0,0,1]]);
     if(bone&&item.skull)for(const side of [-1,1])sphere(mesh,[item.position[0]+side*size*.4,item.position[1]+size*.12,item.position[2]+size*.9],[size*.27,size*.31,size*.1],[.02,.018,.014],15);
    }else{
     const [x,y,z]=item.center;
     portalRing(mesh,x,y+.075+t*.09,z,item.color);
     // An expanding horizontal shock ring and a brief, translucent volume flash.
     for(let k=from;k<mesh.length;k+=12){mesh[k]=x+(mesh[k]-x)*(1+t*2.5);mesh[k+2]=z+(mesh[k+2]-z)*(1+t*2.5);}
     const flash=Math.max(0,1-t*3);
     if(flash>0)sphere(mesh,[x,y+.36,z],[.35*flash,.48*flash,.35*flash],item.color,7);
    }
    for(let k=from;k<mesh.length;k+=12){mesh[k+9]=item.kind==='bone'||item.kind==='wood'?15:item.kind==='jelly'?6:7;mesh[k+10]=fade*(item.kind==='bone'?1:item.position ? .85 : .45);mesh[k+11]=0;}
   }
   this.device.queue.writeBuffer(this.effectBuffer,0,new Float32Array(mesh));return mesh.length/12;
  }
  updateRunes(system){
   const runes=system?.runes||[],count=Math.min(32,runes.length),data=this.runeData;
   for(let i=0;i<count;i++){
    const p=runes[i],k=i*12,t=p.age/p.life,enter=Math.min(1,p.age/.18),end=Math.max(0,Math.min(1,(1-t)/.4)),opacity=enter*enter*(3-2*enter)*end*end*(3-2*end)*.8;
    data[k]=p.position[0];data[k+1]=p.position[1];data[k+2]=p.position[2];data[k+3]=p.size;
    data[k+4]=p.color[0];data[k+5]=p.color[1];data[k+6]=p.color[2];data[k+7]=opacity;
    data[k+8]=p.glyph;data[k+9]=Math.sin(p.phase+p.age*.9)*.12;data[k+10]=data[k+11]=0;
   }
   if(count)this.device.queue.writeBuffer(this.runeBuffer,0,data.buffer,0,count*48);this.runeCount=count;
  }
  updateBeams(level){
   const beams=[...(level.world.droneBeams||[]),...(level.effects?.lasers||[])].filter(b=>Math.hypot(...b.to.map((v,k)=>v-b.from[k]))>.001).slice(0,16);this.beamCount=beams.length;
   beams.forEach((b,i)=>{const k=i*12;this.beamData.set([...b.from,0,...b.to,0,...beamColors[b.color],b.life?Math.max(0,1-b.age/b.life):1],k);});
   if(beams.length)this.device.queue.writeBuffer(this.beamBuffer,0,this.beamData.buffer,0,beams.length*48);
  }
  drawEffects(pass,level,effectCount){
   pass.setBindGroup(0,this.sceneGroup);pass.setBindGroup(1,this.skinGroups[0]);
   if(effectCount){pass.setPipeline(this.effectPipeline);pass.setVertexBuffer(0,this.effectBuffer);pass.draw(effectCount);}
   if(this.runeCount){pass.setPipeline(this.runePipeline);pass.setVertexBuffer(0,this.portalHaloBuffer);pass.setVertexBuffer(1,this.runeBuffer);pass.draw(6,this.runeCount);}
   if(this.beamCount){pass.setPipeline(this.beamPipeline);pass.setVertexBuffer(0,this.portalHaloBuffer);pass.setVertexBuffer(1,this.beamBuffer);pass.draw(6,this.beamCount);}
   const count=Math.min(PORTAL_LIMIT,level.world.portals.length);
   if(count){pass.setPipeline(this.portalHaloPipeline);pass.setVertexBuffer(0,this.portalHaloBuffer);pass.draw(6,count);pass.setPipeline(this.portalRingPipeline);pass.setVertexBuffer(0,this.portalRingBuffer);pass.draw(this.portalRingCount,count*3);}
   if(level.goals.length){pass.setVertexBuffer(0,this.portalHaloBuffer);pass.setPipeline(this.goalGlowPipeline);pass.draw(6,Math.min(4,level.goals.length));if(level.finishProgress>0){pass.setPipeline(this.goalSealPipeline);pass.draw(6,Math.min(4,level.goals.length));}if(this.goalWinGlow>.001){pass.setPipeline(this.goalBeamPipeline);pass.draw(6,Math.min(4,level.goals.length));}}
  }
  render(level,players,camera,angle,time,scale,dt=1/60){
   if(!this.ready)return;this.resize();const d=this.device,w=this.canvas.width,h=this.canvas.height;
   const rect=this.canvas.getBoundingClientRect(),frame=this.cameraState=cameraFrame(camera,angle,rect.width,rect.height,scale),{vp,view,eye}=frame;
   const extent=level.definition?.size??12,lightVP=viewMatrix([(extent-1)*.5,0,(extent-1)*.5],normalize([-.45,1.,.35]),Math.max(18,extent+4),Math.max(18,extent+4));
   const uniforms=new Float32Array(SCENE_FLOATS);uniforms.set(vp);uniforms.set(lightVP,16);uniforms.set([...eye,frame.perspective?1:0],32);uniforms.set([-2,12,9,1],36);uniforms[FINISH_OFFSET]=Math.max(0,Math.min(1,level.finishProgress||0));
   (level.world.torches||[]).slice(0,8).forEach((p,i)=>uniforms.set([...Levels.torchFrame(p).light,1],TORCHES_OFFSET+i*4));
   players.forEach((p,i)=>uniforms.set([p.x,(p.y||0)+.42,p.z,p.state==='dead'?0:4+(level.world.heightAt(p.x,p.z,(p.y||0)+.2,p)||0)],i===3?BODY3_OFFSET:40+i*4));uniforms.set([w,h,time,this.mesh?1:0],52);
   const portalBodies=level.bodies||[...players,...(level.crates||[])];
   level.world.portals.slice(0,PORTAL_LIMIT).forEach((p,i)=>{const charge=level.world.portalInactive(p,portalBodies)?-1:level.world.portalCharge(p,portalBodies,true);uniforms.set([p.x,p.y??level.world.heightAt(p.x,p.z)??0,p.z,charge],56+i*8);uniforms.set([...(p.color==='violet'?[.7,.045,1.]:[1.,.34,.025]),i*.23],60+i*8);});
   this.goalGlowStrength??=[];this.goalWinGlow??=0;
   const fade=level.reducedMotion?1:1-Math.exp(-Math.min(dt,.1)*8),celebrate=level.reducedMotion?1:1-Math.exp(-Math.min(dt,.1)*4);
   this.goalWinGlow+=((level.won?1:0)-this.goalWinGlow)*celebrate;
   level.goals.slice(0,4).forEach((g,i)=>{if(!g)return;const player=players.find((p,j)=>(p.slot??j)===(g.slot??i)),target=level.world.goalCharge(g,player);this.goalGlowStrength[i]=(this.goalGlowStrength[i]||0)+(target-(this.goalGlowStrength[i]||0))*fade;uniforms.set([g.x,g.y??level.world.heightAt(g.x,g.z)??0,g.z,this.goalGlowStrength[i]],GOALS_OFFSET+i*8);uniforms.set([...[[.45,1.,.08],[.035,.17,1.],[1.,.055,.025],[.68,.12,1.]][g.slot??i],this.goalWinGlow],GOALS_OFFSET+4+i*8);uniforms[GOAL_SLOTS_OFFSET+i]=player?(g.slot??i):-1;});players.forEach((p,i)=>uniforms[BODY_SLOTS_OFFSET+i]=p.slot??i);d.queue.writeBuffer(this.uniform,0,uniforms);
   const nodes=new Float32Array(256*4);for(let i=0;i<4;i++)nodes[i*256+3]=-1;players.forEach((p,i)=>level.soft.get(p).positions.forEach((q,j)=>nodes.set([q[0],p.state==='dead'?-100:q[1],q[2],p.slot??i],(i*64+j)*4)));d.queue.writeBuffer(this.nodes,0,nodes);
   if(this.bridgeKey===undefined){this.buildScene(level);this.bridgeKey='static';}
   const bridgeCount=this.bridges(level),propCount=this.props(level,players,angle,time,dt),effectCount=this.effects(level.effects,view);
   this.updateRunes(level.effects);this.updateBeams(level);const encoder=d.createCommandEncoder();
   const computePass=encoder.beginComputePass();computePass.setPipeline(this.compute);computePass.setBindGroup(0,this.computeGroup);computePass.dispatchWorkgroups(Math.ceil(players.length*1350/64));computePass.end();
   const shadowPass=encoder.beginRenderPass({colorAttachments:[],depthStencilAttachment:{view:this.shadowTexture.createView(),depthClearValue:1,depthLoadOp:'clear',depthStoreOp:'store'}});
   shadowPass.setPipeline(this.shadow);shadowPass.setBindGroup(0,this.shadowGroup);shadowPass.setVertexBuffer(0,this.staticBuffer);shadowPass.draw(this.staticCount);if(bridgeCount){shadowPass.setVertexBuffer(0,this.bridgeBuffer);shadowPass.draw(bridgeCount);}shadowPass.end();
   const opaque=encoder.beginRenderPass({colorAttachments:[{view:this.msaa.createView(),resolveTarget:this.hdr.createView(),clearValue:{r:.009,g:.011,b:.014,a:1},loadOp:'clear',storeOp:'store'}],depthStencilAttachment:{view:this.depth.createView(),depthClearValue:1,depthLoadOp:'clear',depthStoreOp:'store'}});
   opaque.setPipeline(this.opaque);opaque.setBindGroup(0,this.sceneGroup);opaque.setBindGroup(1,this.skinGroups[0]);opaque.setVertexBuffer(0,this.staticBuffer);opaque.draw(this.staticCount);if(bridgeCount){opaque.setVertexBuffer(0,this.bridgeBuffer);opaque.draw(bridgeCount);}opaque.setVertexBuffer(0,this.propBuffer);opaque.draw(propCount);opaque.setVertexBuffer(0,this.decorationBuffer);opaque.draw(this.decorationCount);opaque.end();
   const order=players.flatMap((p,i)=>p.state==='dead'?[]:[{kind:'jelly',i,center:[p.x,(p.y||0)+.42,p.z]}]);
   for(const face of this.phaseFaces)if(dot(face.normal,eye.map((v,k)=>v-face.center[k]))>0)order.push(face);
   order.sort((a,b)=>dot(a.center,view)-dot(b.center,view));
   const layerPass=()=>encoder.beginRenderPass({colorAttachments:[{view:this.msaa.createView(),resolveTarget:this.hdr.createView(),loadOp:'load',storeOp:'store'}],depthStencilAttachment:{view:this.depth.createView(),depthLoadOp:'load',depthStoreOp:'store'}});
   for(let layer=0;layer<order.length;layer++){
    if(order[layer].kind==='phase'){
     const glass=layerPass();glass.setPipeline(this.phasePipeline);glass.setBindGroup(0,this.sceneGroup);glass.setBindGroup(1,this.skinGroups[0]);glass.setVertexBuffer(0,this.phaseBuffer);
     do{const face=order[layer];glass.draw(face.count,1,face.first);layer++;}while(layer<order.length&&order[layer].kind==='phase');
     if(layer===order.length)this.drawEffects(glass,level,effectCount);layer--;glass.end();continue;
    }
    const i=order[layer].i;
    const backPass=encoder.beginRenderPass({colorAttachments:[{view:this.exits[i].createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:'clear',storeOp:'store'}],depthStencilAttachment:{view:this.exitDepth.createView(),depthClearValue:0,depthLoadOp:'clear',depthStoreOp:'store'}});
    backPass.setPipeline(this.back);backPass.setBindGroup(0,this.sceneGroup);backPass.setBindGroup(1,this.skinGroups[(i+1)%4]);backPass.setIndexBuffer(this.indexBuffer,'uint32');backPass.drawIndexed(this.indexCount,1,0,0,i);backPass.end();
    encoder.copyTextureToTexture({texture:this.hdr},{texture:this.background},[w,h]);
    const skin=layerPass();
    skin.setPipeline(this.skin);skin.setBindGroup(0,this.sceneGroup);skin.setBindGroup(1,this.skinGroups[i]);skin.setIndexBuffer(this.indexBuffer,'uint32');skin.drawIndexed(this.indexCount,1,0,0,i);if(layer===order.length-1)this.drawEffects(skin,level,effectCount);skin.end();
   }
   if(!order.length&&(effectCount||this.beamCount||level.world.portals.length||level.goals.length)){const effects=encoder.beginRenderPass({colorAttachments:[{view:this.msaa.createView(),resolveTarget:this.hdr.createView(),loadOp:'load',storeOp:'store'}],depthStencilAttachment:{view:this.depth.createView(),depthLoadOp:'load',depthStoreOp:'store'}});this.drawEffects(effects,level,effectCount);effects.end();}
   if(this.mesh){const lattice=encoder.beginRenderPass({colorAttachments:[{view:this.msaa.createView(),resolveTarget:this.hdr.createView(),loadOp:'load',storeOp:'store'}]});lattice.setPipeline(this.latticePipeline);lattice.setBindGroup(0,this.latticeGroup);lattice.draw(this.edgeCount,players.length);lattice.end();}
   if(this.colliders){const lines=colliderLines(level.world.debugBoxes());if(lines.byteLength>this.colliderBuffer.size){this.colliderBuffer.destroy();this.colliderBuffer=d.createBuffer({size:Math.ceil(lines.byteLength/65536)*65536,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});}d.queue.writeBuffer(this.colliderBuffer,0,lines);const debug=encoder.beginRenderPass({colorAttachments:[{view:this.msaa.createView(),resolveTarget:this.hdr.createView(),loadOp:'load',storeOp:'store'}]});debug.setPipeline(this.colliderPipeline);debug.setBindGroup(0,this.colliderGroup);debug.setVertexBuffer(0,this.colliderBuffer);debug.draw(lines.length/6);debug.end();}
   const finish=encoder.beginRenderPass({colorAttachments:[{view:this.context.getCurrentTexture().createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:1}}]});finish.setPipeline(this.post);finish.setBindGroup(0,this.postGroup);finish.draw(3);finish.end();
   d.queue.submit([encoder.finish()]);this.frames++;
  }
 }
 const api={Renderer,viewMatrix,cameraFrame,projectPoint,surfaceBindings};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JellyGPU=api;
})(globalThis);
