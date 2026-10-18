(function(root){
 'use strict';
 const L=typeof module!=='undefined'&&module.exports?require('./levels.js'):root.JellyLevels;
 const surface=['plates','bridges','lifts','spikes','portals','conveyors'],props=['crates','archers','pickups'];
 class Model{
  constructor(map){this.map=L.read(map);this.undoStack=[];this.redoStack=[];this.before=null;}
  begin(){if(!this.before)this.before=L.copy(this.map);}
  commit(){if(!this.before)return false;const before=this.before;this.before=null;if(JSON.stringify(before)===JSON.stringify(this.map))return false;this.undoStack.push(before);if(this.undoStack.length>80)this.undoStack.shift();this.redoStack=[];return true;}
  change(fn){this.begin();try{fn(this.map);this.map=L.read(this.map);return this.commit();}catch(error){this.map=this.before;this.before=null;throw error;}}
  undo(){if(!this.undoStack.length)return false;this.redoStack.push(L.copy(this.map));this.map=this.undoStack.pop();return true;}
  redo(){if(!this.redoStack.length)return false;this.undoStack.push(L.copy(this.map));this.map=this.redoStack.pop();return true;}
  load(map){const next=L.read(map);return this.change(()=>{this.map=next;});}
  id(prefix){const used=new Set([...this.map.plates,...this.map.pickups].map(p=>p.id));let n=1;while(used.has(`${prefix}-${n}`))n++;return `${prefix}-${n}`;}
  at(key,x,z,y){return this.map[key].find(p=>p&&p.x===x&&p.z===z&&(y===undefined||Math.abs((p.y??(key==='tiles'?p.height:L.surfaceY(this.map,x,z)??0))-y)<.01));}
  cube(x,y,z){if(!Number.isInteger(y)||y< -2||y>12)throw new Error('Слой Y должен быть целым от −2 до 12.');let p=this.at('blocks',x,z,y);if(!p){if(this.map.blocks.length>=L.limits.blocks)throw new Error('Достигнут лимит каменных кубов.');p={x,y,z};this.map.blocks.push(p);}return p;}
  paintVoxel(tool,x,y,z,options={}){
   if(tool==='select')return;
   if(tool==='erase'){this.erase(x,z,y);return;}
   if(tool==='floor'||tool==='cube'||tool==='wall'||/^color-[0-3]$/.test(tool)){const p=this.cube(x,y,z);if(tool.startsWith('color-'))p.color=Number(tool.slice(-1));else delete p.color;return;}
   if(/^(spawn|goal)-[0-3]$/.test(tool)){this.cube(x,y,z);this.map[tool.startsWith('spawn')?'spawns':'goals'][Number(tool.slice(-1))]={x,y,z};return;}
   if(tool==='drone'){
    const p=this.at('drones',x,z,y);if(p)return;
    if(this.map.drones.length>=L.limits.drones)throw new Error('На карте уже восемь дронов.');
    this.map.drones.push({x,y,z,color:3,target:-1,hover:0});return;
   }
   if(tool==='torch'){
    const face=options.face||'south';if(!Object.hasOwn(L.wallFaces,face))throw new Error('Факел крепится к боковой грани.');
    if(this.map.torches.some(p=>p.x===x&&p.y===y&&p.z===z&&p.face===face))return;
    if(this.map.torches.length>=L.limits.torches)throw new Error('На карте уже восемь факелов.');
    const block=this.at('blocks',x,z,y);if(block?.color!==undefined)throw new Error('Факелу нужен обычный каменный блок.');
    this.cube(x,y,z);this.map.torches.push({x,y,z,face});return;
   }
   const key=tool.startsWith('portal-')&&L.portalColor(tool.slice(7))?'portals':{plate:'plates',bridge:'bridges',lift:'lifts',spikes:'spikes',conveyor:'conveyors',crate:'crates',archer:'archers',shield:'pickups',sword:'pickups'}[tool];if(!key)return;
   if(key==='spikes'){
    const face=options.face||'top',same=p=>p.x===x&&p.z===z&&p.y===y,existing=this.map.spikes.find(p=>same(p)&&(p.face||'top')===face);
    if(!existing&&this.map.spikes.length>=L.limits.spikes)throw new Error('Достигнут лимит объектов.');
    this.cube(x,y,z);
    if(face==='top'){
     for(const other of surface.filter(k=>k!=='spikes'))this.map[other]=this.map[other].filter(p=>!same(p));
     this.map.walls=this.map.walls.filter(p=>!same(p));
    }
    this.map.spikes=this.map.spikes.filter(p=>!same(p)||(p.face||'top')!==face);
    const color=options.color===null?undefined:options.color??existing?.color;
    this.map.spikes.push({x,y,z,offset:existing?.offset||0,...(face==='top'?{}:{face}),...(color===undefined?{}:{color})});return;
   }
   const existing=this.at(key,x,z,y);if(!existing&&this.map[key].length>=L.limits[key])throw new Error('Достигнут лимит объектов.');
   if(key==='portals'&&existing?.color===tool.slice(7))return;
   this.cube(x,y,z);const groups=surface.includes(key)?surface:props.includes(key)?props:['walls',...surface,...props];
   for(const other of groups)this.map[other]=this.map[other].filter(p=>p.x!==x||p.z!==z||p.y!==y);
   if(key!=='walls')this.map.walls=this.map.walls.filter(p=>p.x!==x||p.z!==z||p.y!==y);
   const p={x,y,z};
   if(key==='walls')Object.assign(p,{half:.17,base:y,height:.56});
   if(key==='plates')Object.assign(p,{id:existing?.id||this.id('plate'),color:options.color||existing?.color||'red'});
   if(key==='bridges')Object.assign(p,{plate:existing?.plate||options.plate||this.map.plates[0]?.id||''});
   if(key==='lifts')Object.assign(p,{base:y,top:existing?.top??Math.min(12,y+1)});
   if(key==='spikes')p.offset=existing?.offset||0;
   if(key==='conveyors')Object.assign(p,{dx:options.dx??0,dz:options.dz??1,speed:options.speed??.85});
   if(key==='portals')p.color=tool.slice(7);
   if(key==='archers')Object.assign(p,{dx:existing?.dx??0,dz:existing?.dz??1,interval:existing?.interval??2.4,firstShot:existing?.firstShot??1.6});
   if(key==='pickups')Object.assign(p,{id:existing?.id||this.id(tool),kind:tool});this.map[key].push(p);
  }
  ensureFloor(x,z,height=0){let p=this.at('tiles',x,z);if(!p){p={x,z,height};this.map.tiles.push(p);}return p;}
  erase(x,z,y){const hit=p=>p&&p.x===x&&p.z===z&&(y===undefined||(p.y??p.height??0)===y);for(const key of Object.keys(L.limits))this.map[key]=this.map[key].filter(p=>!hit(p));for(const key of ['spawns','goals'])this.map[key]=this.map[key].map(p=>hit(p)?null:p);}
  paint(tool,x,z,options={}){
   if(x<0||z<0||x>=this.map.size||z>=this.map.size||tool==='select')return;
   if(tool==='torch'||tool==='drone'){this.paintVoxel(tool,x,options.y??options.height??0,z,options);return;}
   if(options.voxel||tool==='cube'||/^color-[0-3]$/.test(tool)){this.paintVoxel(tool,x,options.y??options.height??0,z,options);return;}
   const height=options.height??0;
   if(tool==='erase'){this.erase(x,z);return;}
   if(tool==='floor'){
    const tile=this.ensureFloor(x,z,height),old=tile.height;tile.height=height;
    const wall=this.at('walls',x,z);if(wall)wall.base+=height-old;
    const bridge=this.at('bridges',x,z);if(bridge)bridge.y=height;
    const lift=this.at('lifts',x,z);if(lift){lift.base=height;lift.top=Math.min(3,Math.max(height+1,lift.top+height-old));}return;
   }
   if(/^(spawn|goal)-[0-3]$/.test(tool)){this.ensureFloor(x,z,height);this.map[tool.startsWith('spawn')?'spawns':'goals'][Number(tool.slice(-1))]={x,z};return;}
   const key=tool.startsWith('portal-')&&L.portalColor(tool.slice(7))?'portals':{wall:'walls',plate:'plates',bridge:'bridges',lift:'lifts',spikes:'spikes',conveyor:'conveyors',crate:'crates',archer:'archers',shield:'pickups',sword:'pickups'}[tool];
   if(!key)return;
   if(!this.at(key,x,z)&&this.map[key].length>=L.limits[key])throw new Error(`Достигнут лимит объектов (${L.limits[key]}).`);
   const existing=this.at(key,x,z);
   if(existing&&key==='conveyors'){Object.assign(existing,{dx:options.dx??existing.dx,dz:options.dz??existing.dz,speed:options.speed??existing.speed});return;}
   if(existing&&((key==='pickups'&&existing.kind===tool)||(key==='portals'&&existing.color===tool.slice(7))||!['pickups','portals','walls'].includes(key)))return;
   const floor=this.ensureFloor(x,z,height);
   const group=surface.includes(key)?surface:props.includes(key)?props:['walls',...surface,...props];
   for(const other of group)this.map[other]=this.map[other].filter(p=>p.x!==x||p.z!==z);
   if(key!=='walls')this.map.walls=this.map.walls.filter(p=>p.x!==x||p.z!==z);
   const p={x,z};
   if(key==='walls')Object.assign(p,{half:.5,base:floor.height,height:1.4});
   if(key==='plates')Object.assign(p,{id:this.id('plate'),color:options.color||'red'});
   if(key==='bridges')Object.assign(p,{plate:options.plate||this.map.plates[0]?.id||'',y:floor.height});
   if(key==='lifts')Object.assign(p,{base:floor.height,top:Math.min(3,floor.height+1)});
   if(key==='spikes')Object.assign(p,{offset:0,...(Number.isInteger(options.color)?{color:options.color}:{})});
   if(key==='conveyors')Object.assign(p,{dx:options.dx??0,dz:options.dz??1,speed:options.speed??.85});
   if(key==='portals')p.color=tool.slice(7);
   if(key==='archers')Object.assign(p,{dx:0,dz:1,interval:2.4,firstShot:1.6});
   if(key==='pickups')Object.assign(p,{id:this.id(tool),kind:tool});
   this.map[key].push(p);
  }
  remove(key,index){return this.change(map=>{if(key==='spawns'||key==='goals')map[key][index]=null;else map[key].splice(index,1);});}
  orderPortal(index,order){return this.change(map=>{
   const portal=map.portals[index],indices=map.portals.flatMap((p,i)=>p.color===portal.color?[i]:[]);
   if(!Number.isInteger(order)||order<1||order>indices.length)throw new Error('Проверьте номер портала в цепочке.');
   const chain=indices.map(i=>map.portals[i]);chain.splice(chain.indexOf(portal),1);chain.splice(order-1,0,portal);indices.forEach((i,n)=>map.portals[i]=chain[n]);
  });}
  move(key,index,x,z,height=0){return this.change(map=>{const p=map[key][index],voxel=key==='blocks'||p.y!==undefined;if(this.map[key].some((q,j)=>j!==index&&q&&q.x===x&&q.z===z&&(!voxel||q.y===height)&&(!['spikes','torches'].includes(key)||(q.face||'top')===(p.face||'top'))))throw new Error('В этой клетке уже есть такой объект.');if(voxel){if(key==='blocks'){if(!Number.isInteger(height))throw new Error('Y должен быть целым.');}else if(key!=='drones')this.cube(x,height,z);const delta=height-(p.y||0);Object.assign(p,{x,y:height,z});if(key==='walls')p.base+=delta;if(key==='lifts'){p.base=height;p.top=Math.min(12,p.top+delta);}return;}const previousHeight=this.at('tiles',p.x,p.z)?.height||0,floor=this.ensureFloor(x,z,height);Object.assign(p,{x,z});if(key==='walls')p.base+=floor.height-previousHeight;if(key==='bridges')p.y=floor.height;if(key==='lifts'){p.base=floor.height;p.top=Math.min(3,p.base+1);}});}
  resize(size){return this.change(map=>{map.size=size;for(const key of Object.keys(L.limits))map[key]=map[key].filter(p=>p.x<size&&p.z<size);for(const key of ['spawns','goals'])map[key]=map[key].map(p=>p&&(p.x>=size||p.z>=size)?null:p);});}
 }
 const api={Model,surface,props};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JellyEditorModel=api;
})(globalThis);
