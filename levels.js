// Shared editable map format. No live physics state is stored in level files.
(function(root){
 'use strict';
 const DRAFT_KEY='jelly-dnd.editor.v1',PLAY_KEY='jelly-dnd.play.v1';
 const copy=value=>JSON.parse(JSON.stringify(value));
 const characters=[{name:'Мох',color:'#9ddd56',glyph:'ᛉ',keys:'W A S D'},{name:'Иней',color:'#477bff',glyph:'ᛟ',keys:'↑ ← ↓ →'},{name:'Уголёк',color:'#ef5346',glyph:'ᛋ',keys:'I J K L'},{name:'Аметист',color:'#bb70ef',glyph:'ᛜ',keys:'T F G H'}];
 const portalColors=[
  {id:'green',name:'Зелёный',color:characters[0].color,glow:[.12,.9,.16]},
  {id:'blue',name:'Синий',color:characters[1].color,glow:[.025,.17,1.]},
  {id:'red',name:'Красный',color:characters[2].color,glow:[1.,.065,.035]},
  {id:'violet',name:'Фиолетовый',color:characters[3].color,glow:[.7,.045,1.]},
  {id:'amber',name:'Янтарный',color:'#edb65b',glow:[1.,.34,.025]}
 ];
 const portalColor=id=>portalColors.find(p=>p.id===id);
 const limits={blocks:4096,tiles:256,walls:256,torches:8,drones:8,plates:16,bridges:16,lifts:16,spikes:32,portals:64,conveyors:256,crates:4,archers:4,pickups:8};
 const wallFaces={north:[0,0,-1],east:[1,0,0],south:[0,0,1],west:[-1,0,0]};
 function torchFrame(p){const n=wallFaces[p.face]||wallFaces.south,origin=[p.x+n[0]*.49,p.y-.5,p.z+n[2]*.49];return {origin,n,u:[n[2],0,-n[0]],light:origin.map((v,k)=>v+n[k]*.25+(k===1?.32:0))};}
 // Hover measures extra clearance above a crystal resting just clear of its tile.
 function droneOrigin(p,base=0){return [p.x,(p.y??base)+.64+(p.hover??0),p.z];}
 function blank(){return {version:1,name:'Новое подземелье',size:16,blocks:[],tiles:[],walls:[],torches:[],drones:[],spawns:[null,null,null,null],goals:[null,null,null,null],plates:[],bridges:[],lifts:[],spikes:[],portals:[],conveyors:[],crates:[],archers:[],pickups:[]};}
 function surfaceY(map,x,z,ceiling=Infinity){const ys=[...map.tiles.filter(p=>p.x===x&&p.z===z).map(p=>p.height),...(map.blocks||[]).filter(p=>p.x===x&&p.z===z).map(p=>p.y)].filter(y=>y<=ceiling+.001);return ys.length?Math.max(...ys):null;}
 function voxelize(input){
  const map=read(input),occupied=new Set(map.blocks.map(p=>`${p.x},${p.y},${p.z}`));
  const add=(x,y,z)=>{const key=`${x},${y},${z}`;if(!occupied.has(key)){occupied.add(key);map.blocks.push({x,y,z});}};
  for(const key of ['spawns','goals','plates','bridges','spikes','portals','conveyors','crates','archers','pickups','drones'])for(const p of map[key])if(p)p.y??=surfaceY(map,p.x,p.z)??0;
  for(const p of map.lifts)p.y=p.base;
  for(const p of map.tiles)for(let y=0;y<=Math.ceil(p.height);y++)add(p.x,y,p.z);
  for(const p of map.walls)if(p.half>=.4)for(let y=Math.max(-2,Math.floor(p.base)+1);y<=Math.ceil(p.base+p.height);y++)add(p.x,y,p.z);
  map.tiles=[];map.walls=map.walls.filter(p=>p.half<.4).map(p=>({...p,y:p.base}));return read(map);
 }
 function catalog(){return typeof module!=='undefined'&&module.exports?require('./levels/catalog.json'):root.JellyLevelCatalog;}
 function standardLevel(id){
  const file=catalog()?.standard[id-1];if(!file)throw Error('Unknown standard level: '+id);
  const data=typeof module!=='undefined'&&module.exports?require('./levels/'+file):root.JellyLevelMaps?.[id];
  if(!data)throw Error('Level has not been loaded: '+id);return copy(data);
 }
 function defaultLevel(){return standardLevel(catalog().standard.indexOf(catalog().defaultLevel)+1);}
 function displayName(map,language='en'){return map.names?.[language]||map.name;}
 function read(input){
  const data=typeof input==='string'?JSON.parse(input):input;
  const fail=message=>{throw new Error(message);};
  if(!data||typeof data!=='object'||Array.isArray(data)||data.version!==1)fail('Нужен файл уровня Jelly & Bones версии 1.');
  if(!Number.isInteger(data.size)||data.size<8||data.size>16)fail('Размер карты должен быть от 8 до 16 клеток.');
  const map=blank();map.size=data.size;map.name=typeof data.name==='string'?data.name.trim().slice(0,80)||'Без названия':'Без названия';
  if(data.names&&typeof data.names==='object'&&!Array.isArray(data.names))map.names=Object.fromEntries(Object.entries(data.names).filter(([lang,value])=>/^[a-z]{2,8}(?:-[a-z0-9]{2,8})?$/i.test(lang)&&typeof value==='string'&&value.trim()).map(([lang,value])=>[lang,value.trim().slice(0,80)]));
  const number=(value,fallback,min,max)=>{if(value===undefined)return fallback;if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail('Недопустимое числовое свойство объекта.');return value;};
  const id=(value,fallback)=>{if(value===undefined)return fallback;if(typeof value!=='string'||!value.trim()||value.length>64)fail('Неверный идентификатор объекта.');return value;};
  const point=p=>{if(!p||!Number.isInteger(p.x)||!Number.isInteger(p.z)||p.x<0||p.z<0||p.x>=map.size||p.z>=map.size)fail('Объект находится за границами карты.');return {x:p.x,z:p.z,...(p.y===undefined?{}:{y:number(p.y,0,-2,12)})};};
  const list=(key,convert,max=limits[key])=>{
   const items=data[key]??[];if(!Array.isArray(items)||items.length>max)fail(`Слишком много объектов: ${key}.`);
   const cells=new Set();map[key]=items.map((p,i)=>{const q=point(p),cell=`${q.x},${q.y??''},${q.z}`+(key==='spikes'||key==='torches'?','+(p.face||'top'):'');if(cells.has(cell))fail(`Два объекта одного типа в одной клетке: ${key}.`);cells.add(cell);return {...q,...convert(p,i)};});
  };
  list('blocks',p=>{if(!Number.isInteger(p.y))fail('Координата Y куба должна быть целой.');if(p.color!==undefined&&(!Number.isInteger(p.color)||p.color<0||p.color>3))fail('Цвет куба должен соответствовать одному из четырёх персонажей.');return {y:p.y,...(p.color===undefined?{}:{color:p.color})};});
  list('tiles',p=>({height:number(p.height,0,0,3)}));
  list('walls',p=>({half:number(p.half,.5,.1,.5),base:number(p.base,0,-2,12),height:number(p.height,1.4,.1,6)}));
  list('torches',p=>{if(!Number.isInteger(p.y))fail('Для факела укажите целый Y блока крепления.');if(!Object.hasOwn(wallFaces,p.face))fail('Выберите боковую грань крепления факела.');return {face:p.face};});
  // Older maps stored free-standing torches as narrow walls. Attach those lights
  // to the nearest existing masonry face once, while importing the definition.
  const oldTorches=map.walls.filter(p=>p.half<.4);map.walls=map.walls.filter(p=>p.half>=.4);
  if(oldTorches.length+map.torches.length>limits.torches)fail('На карте может быть не более восьми факелов.');
  for(const old of oldTorches){
   const candidates=[];
   for(const b of [...map.blocks,...map.walls.map(w=>({x:w.x,y:Math.max(-2,Math.min(12,Math.round(old.base)+1)),z:w.z,base:w.base,height:w.height}))]){
    if(b.color!==undefined||b.base!==undefined&&(b.y-.5<b.base||b.y-.5>b.base+b.height))continue;
    for(const [face,n] of Object.entries(wallFaces)){const distance=Math.hypot(old.x-b.x-n[0]*.7,old.z-b.z-n[2]*.7,(old.base+.5)-(b.y-.5));candidates.push({x:b.x,y:b.y,z:b.z,face,distance});}
   }
   candidates.sort((a,b)=>a.distance-b.distance);const best=candidates[0]||{x:old.x,y:Math.min(12,Math.round(old.base)+1),z:old.z,face:'south'};const {x,y,z,face}=best;
   if(!map.torches.some(p=>p.x===x&&p.y===y&&p.z===z&&p.face===face))map.torches.push({x,y,z,face});
  }
  if(map.torches.length>limits.torches)fail('На карте может быть не более восьми факелов.');
  for(const key of ['spawns','goals']){if(!Array.isArray(data[key])||data[key].length<1||data[key].length>4)fail('Допустимо от одного до четырёх слотов персонажей.');map[key]=Array.from({length:4},(_,i)=>data[key][i]==null?null:point(data[key][i]));}
  list('plates',(p,i)=>({id:id(p.id,`plate-${i+1}`),color:['red','blue','amber','dark'].includes(p.color)?p.color:'red'}));
  if(new Set(map.plates.map(p=>p.id)).size!==map.plates.length)fail('Идентификаторы кнопок должны быть уникальными.');
  list('bridges',p=>({plate:typeof p.plate==='string'?p.plate:'',y:number(p.y,0,-2,12)}));
  list('lifts',p=>({base:number(p.base,0,-2,12),top:number(p.top,1,-2,12)}));
  list('spikes',p=>{
   if(p.face!==undefined&&!['top','north','east','south','west'].includes(p.face))fail('Неизвестная сторона крепления шипов.');
   if(p.color!==undefined&&(!Number.isInteger(p.color)||p.color<0||p.color>3))fail('Неизвестный цвет шипов.');
   if(p.face&&p.face!=='top'&&!Number.isInteger(p.y))fail('Для настенных шипов укажите целый Y блока крепления.');
   return {offset:number(p.offset,0,0,5.8),...(p.face&&p.face!=='top'?{face:p.face}:{}),...(p.color===undefined?{}:{color:p.color})};
  });
  list('portals',p=>{if(!portalColor(p.color))fail('Неизвестный цвет портала.');return {color:p.color};});
  list('crates',()=>({}));
  list('drones',p=>{const color=p.color??3,target=p.target??-1;if(!Number.isInteger(color)||color<0||color>3)fail('Неизвестный цвет луча дрона.');if(!Number.isInteger(target)||target< -1||target>3)fail('Неизвестная цель дрона.');return {color,target,hover:number(p.hover,0,0,6)};});
  list('conveyors',p=>{const dx=number(p.dx,0,-1,1),dz=number(p.dz,1,-1,1);if(Math.abs(dx)+Math.abs(dz)!==1||!Number.isInteger(dx)||!Number.isInteger(dz))fail('Конвейер должен двигаться вдоль сетки.');return {dx,dz,speed:number(p.speed,.85,.2,2.5)};});
  list('archers',p=>{const dx=number(p.dx,0,-1,1),dz=number(p.dz,1,-1,1);if(Math.abs(dx)+Math.abs(dz)!==1||!Number.isInteger(dx)||!Number.isInteger(dz))fail('Лучник должен смотреть вдоль сетки.');return {dx,dz,interval:number(p.interval,2.4,.6,10),firstShot:number(p.firstShot,1.6,.1,10)};});
  list('pickups',(p,i)=>{if(!['shield','sword'].includes(p.kind))fail('Неизвестный предмет.');return {id:id(p.id,`item-${i+1}`),kind:p.kind};});
  if(new Set(map.pickups.map(p=>p.id)).size!==map.pickups.length)fail('Идентификаторы предметов должны быть уникальными.');
  return map;
 }
 function issues(map){
  const result=[],height=p=>p.y??surfaceY(map,p.x,p.z),tile=p=>height(p)!==null&&(map.tiles.some(t=>t.x===p.x&&t.z===p.z&&Math.abs(t.height-height(p))<.01)||map.blocks?.some(t=>t.x===p.x&&t.z===p.z&&t.y===height(p))),at=(a,p)=>a.some(q=>q&&q.x===p.x&&q.z===p.z&&Math.abs((q.y??surfaceY(map,q.x,q.z)??0)-(height(p)??0))<.1);
  const names=characters.map(p=>p.name);
  if(!map.spawns.some(Boolean))result.push('Добавьте хотя бы одного персонажа.');
  for(const key of ['spawns','goals'])map[key].forEach((p,i)=>{
   const label=`${key==='spawns'?'Спавн':'Финиш'}: ${names[i]}`;
   if(!p){if(key==='goals'&&map.spawns[i])result.push(`${label} не установлен.`);return;}
   if(!tile(p)||at(map.bridges,p)||at(map.lifts,p))result.push(`${label} должен стоять на постоянной площадке.`);
   if(map.blocks?.some(b=>b.x===p.x&&b.z===p.z&&b.y===height(p)&&b.color===i)&&!map.tiles.some(t=>t.x===p.x&&t.z===p.z&&t.height===height(p)))result.push(`${label}: куб провалится сквозь площадку своего цвета.`);
   if(at(map.walls,p)||at(map.spikes.filter(s=>!s.face&&(s.color===undefined||s.color!==i)),p)||at(map.portals,p)||at(map.archers,p)||key==='spawns'&&at(map.crates,p))result.push(`${label} перекрыт другим объектом.`);
   if(key==='goals'&&at(map.conveyors,p))result.push(`${label} не должен находиться на конвейере.`);
   if(map.blocks?.some(b=>b.color!==i&&b.x===p.x&&b.z===p.z&&b.y>height(p)&&b.y-1<height(p)+.86))result.push(`${label}: недостаточно места над кубом.`);
  });
  if(map.spawns.filter(Boolean).some((p,i,a)=>a.some((q,j)=>j!==i&&at([q],p))))result.push('Спавны персонажей должны находиться в разных клетках.');
  if(map.goals.filter(Boolean).some((p,i,a)=>a.some((q,j)=>j!==i&&at([q],p))))result.push('Финиши должны находиться в разных клетках.');
  for(const color of portalColors){const count=map.portals.filter(p=>p.color===color.id).length;if(count===1)result.push(`${color.name} портал: нужно минимум два одного цвета.`);}
  for(const b of map.bridges)if(!map.plates.some(p=>p.id===b.plate))result.push(`Мост ${b.x}, ${b.z} не привязан к кнопке.`);
  for(const l of map.lifts)if(l.top<=l.base)result.push(`Верх лифта ${l.x}, ${l.z} должен быть выше основания.`);
  const features=['plates','lifts','spikes','portals','conveyors','crates','archers','pickups'];
  for(const key of [...features,'bridges'])for(const p of map[key]){
   if(key==='spikes'&&p.face){if(!map.blocks.some(b=>b.x===p.x&&b.z===p.z&&b.y===p.y))result.push(`Настенным шипам ${p.x}, ${p.y}, ${p.z} нужен блок крепления.`);continue;}
   if(!tile(p))result.push(`Нет пола под объектом ${p.x}, ${p.z}.`);
   if(at(map.walls,p))result.push(`Объект ${p.x}, ${p.z} перекрыт стеной.`);
   if(key!=='bridges'&&at(map.bridges,p))result.push(`Объект ${p.x}, ${p.z} стоит на мосту.`);
  }
  for(const p of map.lifts)if(features.some(key=>key!=='lifts'&&at(key==='spikes'?map[key].filter(s=>!s.face):map[key],p)))result.push(`Лифт ${p.x}, ${p.z} перекрыт другим объектом.`);
  for(const p of map.conveyors)if(['plates','spikes','portals'].some(key=>at(key==='spikes'?map[key].filter(s=>!s.face):map[key],p)))result.push(`Конвейер ${p.x}, ${p.z} перекрыт другим механизмом.`);
  for(const p of map.torches||[])if(!map.blocks.some(b=>b.x===p.x&&b.z===p.z&&b.y===p.y&&b.color===undefined)&&!map.walls.some(w=>w.x===p.x&&w.z===p.z&&p.y-.5>=w.base&&p.y-.5<=w.base+w.height))result.push(`Факелу ${p.x}, ${p.y}, ${p.z} нужен каменный блок крепления.`);
  for(const p of map.drones||[]){
   if(p.target>=0&&!map.spawns[p.target])result.push(`Дрон ${p.x}, ${p.z}: выбранная цель не участвует в уровне.`);
   const y=droneOrigin(p,surfaceY(map,p.x,p.z)??0)[1];
   if(map.blocks.some(b=>b.x===p.x&&b.z===p.z&&b.y>y-.56&&b.y-1<y+.56)||map.walls.some(w=>w.x===p.x&&w.z===p.z&&w.base<y+.56&&w.base+w.height>y-.56))result.push(`Дрон ${p.x}, ${p.z} находится внутри камня.`);
  }
  return [...new Set(result)];
 }
 function instantiate(map,Physics,Soft){
  const floor=new Set(map.tiles.map(p=>`${p.x},${p.z}`)),plates=copy(map.plates),bridges=map.bridges.map(p=>({...p,plate:plates.findIndex(q=>q.id===p.plate)}));
  const world=new Physics.World(floor,bridges,plates,map.walls.map(p=>({x:p.x,z:p.z,half:p.half,minY:p.base,height:p.base+p.height})));
  world.torches=copy(map.torches||[]);world.drones=copy(map.drones||[]);world.blocks=copy(map.blocks||[]);world.blockColumns=new Map();for(const b of world.blocks){const key=`${b.x},${b.z}`;if(!world.blockColumns.has(key))world.blockColumns.set(key,[]);world.blockColumns.get(key).push(b.y);}
  world.blockColors=new Map(world.blocks.filter(b=>b.color!==undefined).map(b=>[`${b.x},${b.y},${b.z}`,b.color]));
  for(const p of map.tiles)if(p.height)world.heights.set(`${p.x},${p.z}`,p.height);
  world.lifts=map.lifts.map(p=>({...p,height:p.base,target:p.base}));world.spikes=copy(map.spikes);world.portals=copy(map.portals);world.conveyors=copy(map.conveyors);world.archers=copy(map.archers);world.pickups=map.pickups.map(p=>({...p,holder:null,durability:3,destroyed:false}));
  const soft=new Soft.System();world.soft=soft;
  const slots=map.spawns.flatMap((p,slot)=>p?[slot]:[]),start=slots.map(slot=>({...map.spawns[slot],y:map.spawns[slot].y??world.heightAt(map.spawns[slot].x,map.spawns[slot].z)??0}));
  const players=start.map((p,i)=>({...p,slot:slots[i],spawn:{...p},state:'alive',vy:0,vx:0,vz:0,deaths:0,respawnTimer:0,respawnFlash:0,rx:p.x,rz:p.z,bounce:0,impact:0,squish:0,squishVelocity:0,portalLock:null,portalCooldown:0,portalFlash:0,portalBlocked:false,deathReason:null,shield:null,shieldHP:0,sword:null,facingX:0,facingZ:1,launchTimer:0,bashCooldown:0,attackTime:0,attackCooldown:0}));
  const crates=map.crates.map(p=>{const y=p.y??world.heightAt(p.x,p.z)??0;return {...p,y,spawn:{...p,y},kind:'crate',state:'alive',vx:0,vy:0,vz:0,deaths:0};});
  return {definition:map,floor,world,soft,start,players,crates,bodies:[...players,...crates],plates,bridges,goals:map.goals.flatMap((p,slot)=>p?[{...p,slot}]:[])};
 }
 function forGame(storage,search=''){
  const standard=/(?:^|[?&])level=(\d+)(?:&|$)/.exec(search);
  if(standard)return read(standardLevel(Number(standard[1])));
  if(!/(?:^|[?&])level=editor(?:&|$)/.test(search))return read(defaultLevel());
  const saved=storage?.getItem(PLAY_KEY);if(!saved)throw new Error('Тестовый уровень не найден. Откройте редактор и нажмите «Играть».');
  const map=read(saved),errors=issues(map);if(errors.length)throw new Error(errors.join('\n'));return map;
 }
 const api={DRAFT_KEY,PLAY_KEY,characters,portalColors,portalColor,limits,copy,blank,defaultLevel,read,issues,instantiate,forGame,surfaceY,voxelize,wallFaces,torchFrame,droneOrigin,get standardNames(){return catalog()?.standard.map((_,i)=>standardLevel(i+1).name)||[];},standardLevel,displayName};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JellyLevels=api;
})(globalThis);
