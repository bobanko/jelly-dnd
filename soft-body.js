// CPU XPBD tetrahedral solids. No rendering code or graphics-library dependency.
(function(root){
 'use strict';
 const RES=3, WIDTH=.76, RADIUS=.085, NODE_COUNT=(RES+1)**3;
 const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,s)=>a.map(x=>x*s);
 const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const len=a=>Math.hypot(...a),ident=()=>[1,0,0,0,1,0,0,0,1];
 const mv=(m,v)=>[dot(m.slice(0,3),v),dot(m.slice(3,6),v),dot(m.slice(6,9),v)];
 const det=m=>dot(m.slice(0,3),cross(m.slice(3,6),m.slice(6,9)));
 function inverse(m){const d=det(m);if(Math.abs(d)<1e-10)return ident();const a=cross(m.slice(3,6),m.slice(6,9)),b=cross(m.slice(6,9),m.slice(0,3)),c=cross(m.slice(0,3),m.slice(3,6));return [a[0],b[0],c[0],a[1],b[1],c[1],a[2],b[2],c[2]].map(v=>v/d);}
 function rotation(a){
  const r=a.slice();if(det(r)<0){r[2]*=-1;r[5]*=-1;r[8]*=-1;}
  for(let k=0;k<4;k++){
   const a=r[0],b=r[1],c=r[2],d=r[3],e=r[4],f=r[5],g=r[6],h=r[7],i=r[8];
   const A=e*i-f*h,B=f*g-d*i,C=d*h-e*g,D=c*h-b*i,E=a*i-c*g,F=b*g-a*h,G=b*f-c*e,H=c*d-a*f,I=a*e-b*d;
   const determinant=a*A+b*B+c*C;if(Math.abs(determinant)<1e-9)return ident();const t=1/determinant;
   r[0]=(a+A*t)*.5;r[1]=(b+B*t)*.5;r[2]=(c+C*t)*.5;r[3]=(d+D*t)*.5;r[4]=(e+E*t)*.5;r[5]=(f+F*t)*.5;r[6]=(g+G*t)*.5;r[7]=(h+H*t)*.5;r[8]=(i+I*t)*.5;
  }
  return r.every(Number.isFinite)?r:ident();
 }
 function rounded(p,radius=RADIUS){const b=WIDTH/2-radius,c=p.map(v=>Math.max(-b,Math.min(b,v))),d=sub(p,c),l=len(d);return l>radius?add(c,mul(d,radius/l)):p.slice();}
 const index=(x,y,z)=>x+(RES+1)*(y+(RES+1)*z);
 const rest=[],cells=[],tets=[],edges=[],edgeSet=new Set();
 for(let z=0;z<=RES;z++)for(let y=0;y<=RES;y++)for(let x=0;x<=RES;x++)rest.push(rounded([x/RES*WIDTH-WIDTH/2,y/RES*WIDTH-WIDTH/2,z/RES*WIDTH-WIDTH/2]));
 for(let z=0;z<RES;z++)for(let y=0;y<RES;y++)for(let x=0;x<RES;x++){
  const ids=[index(x,y,z),index(x+1,y,z),index(x,y+1,z),index(x+1,y+1,z),index(x,y,z+1),index(x+1,y,z+1),index(x,y+1,z+1),index(x+1,y+1,z+1)];cells.push(ids);
  for(const local of [[0,1,3,7],[0,3,2,7],[0,2,6,7],[0,6,4,7],[0,4,5,7],[0,5,1,7]]){
   const ids2=local.map(i=>ids[i]);let [a,b,c,d]=ids2.map(i=>rest[i]);let volume=dot(sub(b,a),cross(sub(c,a),sub(d,a)))/6;
   if(volume<0){[ids2[1],ids2[2]]=[ids2[2],ids2[1]];volume=-volume;}
   tets.push({ids:ids2,volume});
   for(let i=0;i<4;i++)for(let j=i+1;j<4;j++){const ia=Math.min(ids2[i],ids2[j]),ib=Math.max(ids2[i],ids2[j]),key=ia+','+ib;if(!edgeSet.has(key)){edgeSet.add(key);edges.push({a:ia,b:ib,length:len(sub(rest[ia],rest[ib]))});}}
  }
 }
 const crateRest=[];for(let z=0;z<=RES;z++)for(let y=0;y<=RES;y++)for(let x=0;x<=RES;x++)crateRest.push(rounded([x/RES*WIDTH-WIDTH/2,y/RES*WIDTH-WIDTH/2,z/RES*WIDTH-WIDTH/2],.025));
 function group(ids,points=rest){const center=[0,0,0];ids.forEach(i=>points[i].forEach((v,k)=>center[k]+=v/ids.length));const q=ids.map(i=>sub(points[i],center)),a=new Array(9).fill(0);q.forEach(v=>{for(let j=0;j<3;j++)for(let k=0;k<3;k++)a[j*3+k]+=v[j]*v[k];});return {ids,q,inverse:inverse(a)};}
 const groups=[...cells.map(ids=>group(ids)),...tets.map(t=>group(t.ids))],globalShape=group(rest.map((_,i)=>i));
 const crateShape=group(rest.map((_,i)=>i),crateRest);
 class Lattice{
  constructor(p){this.reset(p);}
  reset(p){this.rigid=p.kind==='crate';this.positions=(this.rigid?crateRest:rest).map(q=>[q[0]+p.x,q[1]+.42+(p.y||0),q[2]+p.z]);this.velocities=rest.map(()=>[p.vx||0,p.vy||0,p.vz||0]);this.old=this.positions.map(p=>p.slice());this.sleeping=false;this.calm=0;this.r=ident();this.center=[p.x,.42+(p.y||0),p.z];this.previousCenter=this.center.slice();this.core=this.center.slice();this.coreVelocity=[0,0,0];this.support=null;this.carryVelocity=[0,0,0];this.state=p.state;this.deaths=p.deaths||0;}
  shape(g,stiffness){
   const center=[0,0,0];g.ids.forEach(i=>this.positions[i].forEach((v,k)=>center[k]+=v/g.ids.length));const apq=new Array(9).fill(0);
   g.ids.forEach((i,n)=>{const p=sub(this.positions[i],center),q=g.q[n];for(let j=0;j<3;j++)for(let k=0;k<3;k++)apq[j*3+k]+=p[j]*q[k];});
   const f=new Array(9).fill(0);for(let j=0;j<3;j++)for(let k=0;k<3;k++)for(let n=0;n<3;n++)f[j*3+k]+=apq[j*3+n]*g.inverse[n*3+k];
   const r=rotation(f);
   for(let n=0;n<g.ids.length;n++){const p=this.positions[g.ids[n]],q=g.q[n];for(let k=0;k<3;k++){const j=k*3,target=center[k]+r[j]*q[0]+r[j+1]*q[1]+r[j+2]*q[2];p[k]+=(target-p[k])*stiffness;}}return r;
  }
  volume(t,lambda,dt){
   const [a,b,c,d]=t.ids.map(i=>this.positions[i]),ab=sub(b,a),ac=sub(c,a),ad=sub(d,a),v=dot(ab,cross(ac,ad))/6;
   const gb=mul(cross(ac,ad),1/6),gc=mul(cross(ad,ab),1/6),gd=mul(cross(ab,ac),1/6),ga=mul(add(add(gb,gc),gd),-1),gs=[ga,gb,gc,gd];
   const alpha=2e-11/(dt*dt),denom=gs.reduce((s,g)=>s+dot(g,g),alpha),dl=(-(v-t.volume)-alpha*lambda)/Math.max(1e-12,denom);
   const bound=Math.max(...gs.map(len))*Math.abs(dl),limited=dl*Math.min(1,.045/(bound||1));
   t.ids.forEach((id,j)=>{for(let k=0;k<3;k++)this.positions[id][k]+=gs[j][k]*limited;});return lambda+limited;
  }
  strain(){for(const e of edges){const a=this.positions[e.a],b=this.positions[e.b],d=sub(b,a),l=len(d),target=Math.max(e.length*.65,Math.min(e.length*1.35,l));if(l>1e-9&&l!==target){const correction=mul(d,(l-target)/l*.5);for(let k=0;k<3;k++){a[k]+=correction[k];b[k]-=correction[k];}}}}
  summarize(){this.center=[0,0,0];this.positions.forEach(p=>p.forEach((v,k)=>this.center[k]+=v/NODE_COUNT));return this.center;}
  orientation(){
   const points=this.rigid?crateRest:rest,shape=this.rigid?crateShape:globalShape;
   const a=new Array(9).fill(0);for(let n=0;n<NODE_COUNT;n++){const p=sub(this.positions[n],this.center),q=points[n];for(let j=0;j<3;j++)for(let k=0;k<3;k++)a[j*3+k]+=p[j]*q[k];}
   const f=new Array(9).fill(0);for(let j=0;j<3;j++)for(let k=0;k<3;k++)for(let n=0;n<3;n++)f[j*3+k]+=a[j*3+n]*shape.inverse[n*3+k];this.r=rotation(f);
  }
  snapshot(){return {positions:this.positions.map(p=>p.slice()),velocities:this.velocities.map(v=>v.slice()),core:this.core.slice(),coreVelocity:this.coreVelocity.slice(),sleeping:this.sleeping,calm:this.calm};}
  restore(s){this.positions=s.positions.map(p=>p.slice());this.old=this.positions.map(p=>p.slice());this.velocities=s.velocities.map(v=>v.slice());this.sleeping=s.sleeping;this.calm=s.calm;this.summarize();this.orientation();this.core=(s.core||this.center).slice();this.coreVelocity=(s.coreVelocity||[0,0,0]).slice();}
 }
 class System{
  constructor(){this.bodies=new WeakMap();this.softness=.5;this.decay=.5;this.iterations=5;}
  get(p){let b=this.bodies.get(p);if(!b){b=new Lattice(p);this.bodies.set(p,b);}return b;}
  reset(){this.bodies=new WeakMap();}
  translate(p,x,y,z,stop=false){
   const b=this.get(p),delta=[x,y,z];
   for(const collection of [b.positions,b.old])for(const point of collection)for(let k=0;k<3;k++)point[k]+=delta[k];
   for(const point of [b.center,b.previousCenter,b.core])for(let k=0;k<3;k++)point[k]+=delta[k];
   p.x+=x;p.y=(p.y||0)+y;p.z+=z;p.rx=p.x;p.rz=p.z;b.sleeping=false;b.calm=0;
   if(stop){p.vx=p.vy=p.vz=0;b.velocities.forEach(v=>v.fill(0));b.coreVelocity.fill(0);}
  }
  snapshot(players){return players.map(p=>this.get(p).snapshot());}
  restore(players,snapshots){this.reset();players.forEach((p,i)=>{if(snapshots?.[i])this.get(p).restore(snapshots[i]);});}
  poke(p,point=[p.x,.8+(p.y||0),p.z]){const b=this.get(p);b.sleeping=false;b.calm=0;b.disturbance=.3;for(let i=0;i<NODE_COUNT;i++){const d=len(sub(b.positions[i],point));b.velocities[i][1]-=2.8*Math.exp(-d*d/ .045);}}
  contacts(world,p,b){
   if(p.state==='dead')return;
   for(let i=0;i<NODE_COUNT;i++){
    const node=b.positions[i];
    const height=world.heightAt(node[0],node[2]),old=b.old[i];
    if(height!==null&&height<=(p.y||0)+.2&&node[1]<height+.035&&(old[1]>height-.14||p.state==='alive'&&Math.abs((p.y||0)-height)<.18)){
     const penetration=height+.035-node[1];node[1]=height+.035;
     const dx=node[0]-old[0],dz=node[2]-old[2],slip=Math.hypot(dx,dz);
     // Coulomb floor friction: static contact sticks; sliding uses a smaller coefficient.
     const friction=!b.driven&&slip<penetration*.65?1:Math.min(1,penetration*(b.driven?.12:.38)/(slip||1));
     node[0]-=dx*friction;node[2]-=dz*friction;
    }
    for(const o of b.collisionBoxes||[]){if(node[1]>o.maxY-.005||node[1]<o.minY)continue;const dx=node[0]-o.x,dz=node[2]-o.z,ex=(o.halfX??o.half)+.015-Math.abs(dx),ez=(o.halfZ??o.half)+.015-Math.abs(dz);if(ex>0&&ez>0){if(ex<ez)node[0]+=Math.sign(dx||1)*ex;else node[2]+=Math.sign(dz||1)*ez;}}
   }
  }
  stackContact(pa,pb,a,b){
   if(pa.state==='dead'||pb.state==='dead')return false;
   const ac=a.summarize(),bc=b.summarize(),dy=ac[1]-bc[1];
   if(Math.abs(dy)<.36||Math.abs(ac[0]-bc[0])>.66||Math.abs(ac[2]-bc[2])>.66)return false;
   const upper=dy>0?a:b,lower=dy>0?b:a;
   const top=Math.max(...lower.positions.map(n=>n[1])),bottom=Math.min(...upper.positions.map(n=>n[1]));
   if(bottom>top+.065)return false;
   // Keep a consistent upward contact normal during a fall. Whole-body separation
   // prevents deeply embedded nodes from choosing opposite exit faces.
   const lift=top+.012-bottom;
   if(lift>0){for(const n of upper.positions)n[1]+=lift;upper.summarize();}
   upper.support=dy>0?pb:pa;
   return true;
  }
  pair(pa,pb,a,b){
   if(pa.state==='dead'||pb.state==='dead'||a.sleeping&&b.sleeping||len(sub(a.summarize(),b.summarize()))>1.5)return;
   if(this.stackContact(pa,pb,a,b))return;
   // Symmetric node/rounded-body contacts. Contact corrections deform the lattice,
   // and their opposite impulses are distributed across the neighbour's mass.
   for(const [src,dst] of [[a,b],[b,a]])for(let nodeIndex=0;nodeIndex<NODE_COUNT;nodeIndex++){
    const node=src.positions[nodeIndex];
    const worldDelta=sub(node,dst.center),r=dst.r;
    const d=[r[0]*worldDelta[0]+r[3]*worldDelta[1]+r[6]*worldDelta[2],r[1]*worldDelta[0]+r[4]*worldDelta[1]+r[7]*worldDelta[2],r[2]*worldDelta[0]+r[5]*worldDelta[1]+r[8]*worldDelta[2]];
    const q=d.map(v=>Math.abs(v)-(dst.rigid?.355:.315)),outside=q.map(v=>Math.max(0,v)),l=len(outside),distance=l+Math.min(Math.max(...q),0)-(dst.rigid?.025:.045);
    if(distance>=0)continue;
    let n;if(l>1e-7)n=outside.map((v,k)=>v/l*Math.sign(d[k]||1));else{const axis=q.indexOf(Math.max(...q));n=[0,0,0];n[axis]=Math.sign(d[axis]||1);}
    n=mv(r,n);
    const push=Math.min(.08,-distance)*.65;
    for(let k=0;k<3;k++)node[k]+=n[k]*push;
    for(const other of dst.positions)for(let k=0;k<3;k++)other[k]-=n[k]*push/NODE_COUNT;
    const relative=sub(sub(node,src.old[nodeIndex]),sub(dst.center,dst.previousCenter));
    const tangent=sub(relative,mul(n,dot(relative,n))),distanceMoved=len(tangent),friction=Math.min(1,push*.28/(distanceMoved||1));
    for(let k=0;k<3;k++)node[k]-=tangent[k]*friction;
    for(const other of dst.positions)for(let k=0;k<3;k++)other[k]+=tangent[k]*friction/NODE_COUNT;
   }
  }
  step(world,players,inputs,dt){
   const events=[],lattices=players.map(p=>this.get(p));world.refresh(players);
   const previousCenters=lattices.map(b=>b.summarize().slice());
   const supports=lattices.map((b,i)=>{
    const support=b.support,j=players.indexOf(support);
    return j>=0&&support.state!=='dead'&&Math.abs(players[i].x-support.x)<.68&&Math.abs(players[i].z-support.z)<.68?j:-1;
   });
   players.forEach((p,i)=>{
    p.spawn??={x:p.x,z:p.z};p.state??='alive';p.y??=0;p.vy??=0;p.deaths??=0;p.respawnFlash=Math.max(0,(p.respawnFlash||0)-dt);
    const b=lattices[i],input=inputs[i]||{x:0,z:0},magnitude=p.launchTimer>0?0:Math.hypot(input.x,input.z);b.driven=magnitude>0;
    if(p.state==='dead'){
     p.respawnTimer-=dt;const spawn=p.respawnTimer<=0&&world.respawnPosition(p,players);
     if(spawn){Object.assign(p,spawn,{state:'alive',y:spawn.y||0,vy:0,vx:0,vz:0,impact:0,respawnFlash:.65,portalLock:null,portalCooldown:0,deathReason:null});b.reset(p);events.push({type:'respawn',player:i});}
     return;
    }
    if(Math.hypot(p.x-b.center[0],p.z-b.center[2])>.25||Math.abs((p.y||0)+.42-b.center[1])>.5)b.reset(p);
    b.collisionBoxes=world.collisionBoxes().filter(o=>Math.abs(o.x-p.x)<o.half+1&&Math.abs(o.z-p.z)<o.half+1);
    b.disturbance=Math.max(0,(b.disturbance||0)-dt);
    const neighbour=players.some((other,j)=>j!==i&&other.state!=='dead'&&!lattices[j].sleeping&&(Math.hypot(other.vx,other.vy||0,other.vz)>.05||lattices[j].disturbance>0||Math.hypot(inputs[j]?.x||0,inputs[j]?.z||0)>0)&&Math.hypot(p.x-other.x,p.z-other.z)<1.25);
    if(magnitude||neighbour||p.state==='falling'||!world.supported(p)){b.sleeping=false;b.calm=0;}
    if(b.sleeping)return;
    b.old=b.positions.map(p=>p.slice());b.previousCenter=b.center.slice();
    // Drive relative to the supporting body. Its displacement is added once below,
    // avoiding both sliding passengers and doubled carrier velocity.
    if(supports[i]>=0){p.vx-=b.carryVelocity[0];p.vz-=b.carryVelocity[2];for(const v of b.velocities){v[0]-=b.carryVelocity[0];v[1]-=b.carryVelocity[1];v[2]-=b.carryVelocity[2];}}
    b.carryVelocity=[0,0,0];
    const ax=p.state==='alive'&&!p.launchTimer?((magnitude?input.x/magnitude*2.6:0)-(p.vx||0))*(magnitude?13:18):0;
    const az=p.state==='alive'&&!p.launchTimer?((magnitude?input.z/magnitude*2.6:0)-(p.vz||0))*(magnitude?13:18):0;
    for(let n=0;n<NODE_COUNT;n++){const v=b.velocities[n];v[0]+=ax*dt;v[1]-=15*dt;v[2]+=az*dt;for(let k=0;k<3;k++)b.positions[n][k]+=v[k]*dt;}
   });
   const ascending=players.map((_,i)=>i).sort((a,b)=>previousCenters[a][1]-previousCenters[b][1]);
   for(const i of ascending){const b=lattices[i],j=supports[i];if(j<0||b.sleeping||players[i].state==='dead')continue;
    const delta=sub(lattices[j].summarize(),previousCenters[j]);
    for(const n of b.positions)for(let k=0;k<3;k++)n[k]+=delta[k];b.carryVelocity=mul(delta,1/dt);
   }
   lattices.forEach(b=>b.support=null);
   const lambdas=players.map(()=>new Float64Array(tets.length));
   for(let iter=0;iter<this.iterations;iter++){
    players.forEach((p,i)=>{
     const b=lattices[i];if(p.state==='dead'||b.sleeping)return;
     if(p.kind==='crate'){b.r=b.shape(crateShape,1);b.summarize();this.contacts(world,p,b);return;}
     for(let g=0;g<groups.length;g++)if(g<cells.length||iter===0)b.shape(groups[g],(g<cells.length?.045:.008)*(1.3-this.softness*.95));
     tets.forEach((t,j)=>{lambdas[i][j]=b.volume(t,lambdas[i][j],dt);});b.strain();this.contacts(world,p,b);
    });
    for(let i=0;i<players.length;i++)for(let j=i+1;j<players.length;j++)this.pair(players[i],players[j],lattices[i],lattices[j]);
   }
   // Resolve from the bottom up, including sleeping supports and fast falling bodies.
   for(const i of ascending)for(const j of ascending)if(previousCenters[i][1]>previousCenters[j][1]+.35)this.stackContact(players[i],players[j],lattices[i],lattices[j]);
   players.forEach((p,i)=>{
    const b=lattices[i];if(p.state==='dead'||b.sleeping)return;
    const center=b.summarize(),vcom=[0,0,0];b.orientation();
    for(let n=0;n<NODE_COUNT;n++){b.velocities[n]=mul(sub(b.positions[n],b.old[n]),1/dt);b.velocities[n].forEach((v,k)=>vcom[k]+=v/NODE_COUNT);}
    if(b.support){const support=this.get(b.support),supportV=(support.summarize()[1]-support.previousCenter[1])/dt;if(vcom[1]<supportV+.08){const correction=supportV-vcom[1];for(const v of b.velocities)v[1]+=correction;vcom[1]=supportV;}}
    // Remove only internal wobble, leaving translation and rigid angular motion intact.
    let inertia=new Array(9).fill(0),angular=[0,0,0];
    b.positions.forEach((node,n)=>{const r=sub(node,center),v=sub(b.velocities[n],vcom),r2=dot(r,r);angular=add(angular,cross(r,v));for(let j=0;j<3;j++)for(let k=0;k<3;k++)inertia[j*3+k]+=(j===k?r2:0)-r[j]*r[k];});
    const crateGrounded=b.rigid&&b.positions.some(node=>{const height=world.heightAt(node[0],node[2]);return height!==null&&Math.abs(node[1]-height-.035)<.025;});
    let omega=mv(inverse(inertia),angular);
    if(b.rigid)omega=mul(omega,Math.exp(-dt*(crateGrounded?2.5:.12)));
    else if(p.state==='alive')omega=mul(omega,Math.exp(-dt*12));
    const damping=Math.exp(-dt*(3+this.decay*10));let energy=0;
    b.positions.forEach((node,n)=>{const rigid=add(vcom,cross(omega,sub(node,center))),internal=sub(b.velocities[n],rigid);b.velocities[n]=add(rigid,mul(internal,damping));energy+=dot(b.velocities[n],b.velocities[n])/NODE_COUNT;});
    Object.assign(p,{x:center[0],z:center[2],y:center[1]-.42,vx:vcom[0],vz:vcom[2],vy:vcom[1]});
    for(let k=0;k<3;k++){b.coreVelocity[k]+=((center[k]-b.core[k])*64-8*b.coreVelocity[k])*dt;b.core[k]+=b.coreVelocity[k]*dt;b.core[k]=Math.max(center[k]-.12,Math.min(center[k]+.12,b.core[k]));}
    const driving=Math.hypot(inputs[i]?.x||0,inputs[i]?.z||0)>0;
    const ground=world.heightAt(p.x,p.z);
    const grounded=b.rigid?crateGrounded:ground!==null&&Math.abs(p.y-ground)<.15&&p.vy<.7;
    if(p.state==='falling'&&(b.support||grounded)){p.state='alive';p.launchTimer=0;events.push({type:'land',player:i});}
    if(p.state==='alive'&&!b.support&&(b.rigid?!crateGrounded:ground===null||p.y<ground-.2||p.y>ground+.23)){p.state='falling';events.push({type:'fall',player:i});}
    if(p.state==='falling'&&p.y<-4){p.state='dead';p.deaths++;p.respawnTimer=.55;p.vx=p.vz=0;events.push({type:'death',player:i});}
    if(p.state==='alive'&&!driving&&energy<.003){b.calm+=dt;if(b.calm>.65){b.sleeping=true;b.velocities.forEach(v=>v.fill(0));p.vx=p.vy=p.vz=0;}}else b.calm=0;
   });
   world.refresh(players);return events;
  }
 }
 const api={System,Lattice,rest,tets,edges,cells,RES,WIDTH,NODE_COUNT,rounded,det,rotation};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JellySoftBody=api;
})(globalThis);
