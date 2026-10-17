// Shared editable map format. No live physics state is stored in level files.
(function(root){
 'use strict';
 const DRAFT_KEY='jelly-dnd.editor.v1',PLAY_KEY='jelly-dnd.play.v1';
 const copy=value=>JSON.parse(JSON.stringify(value));
 const limits={tiles:256,walls:256,plates:16,bridges:16,lifts:16,spikes:32,portals:4,conveyors:256,crates:4,archers:4,pickups:8};
 function blank(){return {version:1,name:'Новое подземелье',size:16,tiles:[],walls:[],spawns:[null,null,null],goals:[null,null,null],plates:[],bridges:[],lifts:[],spikes:[],portals:[],conveyors:[],crates:[],archers:[],pickups:[]};}
 function defaultLevel(){
  const map=blank();map.name='Затонувшее святилище';
  for(let z=1;z<=10;z++)for(let x=1;x<=10;x++)if(z>=5||(z<=3&&x>=2&&x<=9)||(z===4&&(x===3||x===8)))map.tiles.push({x,z,height:0});
  const holes=new Set(['5,5','6,5','5,6','6,6','1,5','10,5','1,6','10,6','4,8','7,8','4,9','7,9','5,10','6,10']);
  map.tiles=map.tiles.filter(p=>!holes.has(`${p.x},${p.z}`));
  for(const x of [5,6,7])for(const z of [8,9,10]){map.tiles=map.tiles.filter(p=>p.x!==x||p.z!==z);map.tiles.push({x,z,height:1});}
  for(const z of [5,6])map.tiles.push({x:10,z,height:0});
  for(const [x,z] of [[1,2],[10,2],[1,9],[10,9]])map.walls.push({x,z,half:.17,height:.56,base:0});
  for(let x=1;x<=10;x++)for(const z of [0,11])if(x!==5&&x!==6)map.walls.push({x,z,half:.5,height:1.8,base:-.4});
  for(const x of [0,11])for(let z=1;z<=10;z++)if(z!==7&&z!==8)map.walls.push({x,z,half:.5,height:1.8,base:-.4});
  map.spawns=[{x:2,z:8},{x:9,z:8},{x:9,z:7}];map.goals=[{x:3,z:2},{x:8,z:3},{x:9,z:2}];
  map.plates=[{id:'plate-1',x:2,z:5,color:'red'},{id:'plate-2',x:8,z:2,color:'blue'}];
  map.bridges=[{x:8,z:4,plate:'plate-1'},{x:3,z:4,plate:'plate-2'}];
  map.lifts=[{x:5,z:7,base:0,top:1}];map.spikes=[{x:3,z:9,offset:0},{x:9,z:6,offset:2.9}];
  map.portals=[{x:3,z:6,color:'violet'},{x:6,z:9,color:'violet'},{x:9,z:9,color:'amber'},{x:7,z:2,color:'amber'}];
  map.crates=[{x:7,z:9}];map.archers=[{x:10,z:5,dx:0,dz:1,interval:2.4,firstShot:1.6}];
  map.pickups=[{id:'oak-shield',kind:'shield',x:8,z:8},{id:'iron-sword',kind:'sword',x:8,z:7}];
  map.conveyors=[1,2,3].map(x=>({x,z:10,dx:1,dz:0,speed:.85}));
  return map;
 }
 function read(input){
  const data=typeof input==='string'?JSON.parse(input):input;
  const fail=message=>{throw new Error(message);};
  if(!data||typeof data!=='object'||Array.isArray(data)||data.version!==1)fail('Нужен файл уровня Jelly & Bones версии 1.');
  if(!Number.isInteger(data.size)||data.size<8||data.size>16)fail('Размер карты должен быть от 8 до 16 клеток.');
  const map=blank();map.size=data.size;map.name=typeof data.name==='string'?data.name.trim().slice(0,80)||'Без названия':'Без названия';
  const number=(value,fallback,min,max)=>{if(value===undefined)return fallback;if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail('Недопустимое числовое свойство объекта.');return value;};
  const id=(value,fallback)=>{if(value===undefined)return fallback;if(typeof value!=='string'||!value.trim()||value.length>64)fail('Неверный идентификатор объекта.');return value;};
  const point=p=>{if(!p||!Number.isInteger(p.x)||!Number.isInteger(p.z)||p.x<0||p.z<0||p.x>=map.size||p.z>=map.size)fail('Объект находится за границами карты.');return {x:p.x,z:p.z};};
  const list=(key,convert,max=limits[key])=>{
   const items=data[key]??[];if(!Array.isArray(items)||items.length>max)fail(`Слишком много объектов: ${key}.`);
   const cells=new Set();map[key]=items.map((p,i)=>{const q=point(p),cell=`${q.x},${q.z}`;if(cells.has(cell))fail(`Два объекта одного типа в одной клетке: ${key}.`);cells.add(cell);return {...q,...convert(p,i)};});
  };
  list('tiles',p=>({height:number(p.height,0,0,3)}));
  list('walls',p=>({half:number(p.half,.5,.1,.5),base:number(p.base,0,-.4,3),height:number(p.height,1.4,.1,6)}));
  if(map.walls.filter(p=>p.half<.4).length>8)fail('На карте может быть не более восьми факелов.');
  for(const key of ['spawns','goals']){if(!Array.isArray(data[key])||data[key].length!==3)fail('Нужно три слота спавна и три слота финиша.');map[key]=data[key].map(p=>p===null?null:point(p));}
  list('plates',(p,i)=>({id:id(p.id,`plate-${i+1}`),color:['red','blue','amber','dark'].includes(p.color)?p.color:'red'}));
  if(new Set(map.plates.map(p=>p.id)).size!==map.plates.length)fail('Идентификаторы кнопок должны быть уникальными.');
  list('bridges',p=>({plate:typeof p.plate==='string'?p.plate:'',y:number(p.y,0,0,3)}));
  list('lifts',p=>({base:number(p.base,0,0,3),top:number(p.top,1,0,3)}));
  list('spikes',p=>({offset:number(p.offset,0,0,5.8)}));
  list('portals',p=>{if(!['violet','amber'].includes(p.color))fail('Неизвестный цвет портала.');return {color:p.color};});
  list('crates',()=>({}));
  list('conveyors',p=>{const dx=number(p.dx,0,-1,1),dz=number(p.dz,1,-1,1);if(Math.abs(dx)+Math.abs(dz)!==1||!Number.isInteger(dx)||!Number.isInteger(dz))fail('Конвейер должен двигаться вдоль сетки.');return {dx,dz,speed:number(p.speed,.85,.2,2.5)};});
  list('archers',p=>{const dx=number(p.dx,0,-1,1),dz=number(p.dz,1,-1,1);if(Math.abs(dx)+Math.abs(dz)!==1||!Number.isInteger(dx)||!Number.isInteger(dz))fail('Лучник должен смотреть вдоль сетки.');return {dx,dz,interval:number(p.interval,2.4,.6,10),firstShot:number(p.firstShot,1.6,.1,10)};});
  list('pickups',(p,i)=>{if(!['shield','sword'].includes(p.kind))fail('Неизвестный предмет.');return {id:id(p.id,`item-${i+1}`),kind:p.kind};});
  if(new Set(map.pickups.map(p=>p.id)).size!==map.pickups.length)fail('Идентификаторы предметов должны быть уникальными.');
  return map;
 }
 function issues(map){
  const result=[],tile=p=>map.tiles.find(t=>t.x===p.x&&t.z===p.z),at=(a,p)=>a.some(q=>q&&q.x===p.x&&q.z===p.z);
  const names=['Мох','Иней','Уголёк'];
  for(const key of ['spawns','goals'])map[key].forEach((p,i)=>{
   const label=`${key==='spawns'?'Спавн':'Финиш'}: ${names[i]}`;
   if(!p){result.push(`${label} не установлен.`);return;}
   if(!tile(p)||at(map.bridges,p)||at(map.lifts,p))result.push(`${label} должен стоять на постоянной площадке.`);
   if(at(map.walls,p)||at(map.spikes,p)||at(map.portals,p)||at(map.archers,p)||key==='spawns'&&at(map.crates,p))result.push(`${label} перекрыт другим объектом.`);
   if(key==='goals'&&at(map.conveyors,p))result.push(`${label} не должен находиться на конвейере.`);
  });
  if(map.spawns.filter(Boolean).some((p,i,a)=>a.some((q,j)=>j!==i&&q.x===p.x&&q.z===p.z)))result.push('Спавны персонажей должны находиться в разных клетках.');
  if(map.goals.filter(Boolean).some((p,i,a)=>a.some((q,j)=>j!==i&&q.x===p.x&&q.z===p.z)))result.push('Финиши должны находиться в разных клетках.');
  for(const color of ['violet','amber']){const count=map.portals.filter(p=>p.color===color).length;if(count!==0&&count!==2)result.push(`${color==='violet'?'Фиолетовые':'Янтарные'} порталы: нужно ровно два.`);}
  for(const b of map.bridges)if(!map.plates.some(p=>p.id===b.plate))result.push(`Мост ${b.x}, ${b.z} не привязан к кнопке.`);
  for(const l of map.lifts)if(l.top<=l.base)result.push(`Верх лифта ${l.x}, ${l.z} должен быть выше основания.`);
  const features=['plates','lifts','spikes','portals','conveyors','crates','archers','pickups'];
  for(const key of [...features,'bridges'])for(const p of map[key]){
   if(!tile(p))result.push(`Нет пола под объектом ${p.x}, ${p.z}.`);
   if(at(map.walls,p))result.push(`Объект ${p.x}, ${p.z} перекрыт стеной.`);
   if(key!=='bridges'&&at(map.bridges,p))result.push(`Объект ${p.x}, ${p.z} стоит на мосту.`);
  }
  for(const p of map.lifts)if(features.some(key=>key!=='lifts'&&at(map[key],p)))result.push(`Лифт ${p.x}, ${p.z} перекрыт другим объектом.`);
  for(const p of map.conveyors)if(['plates','spikes','portals'].some(key=>at(map[key],p)))result.push(`Конвейер ${p.x}, ${p.z} перекрыт другим механизмом.`);
  return [...new Set(result)];
 }
 function instantiate(map,Physics,Soft){
  const floor=new Set(map.tiles.map(p=>`${p.x},${p.z}`)),plates=copy(map.plates),bridges=map.bridges.map(p=>({...p,plate:plates.findIndex(q=>q.id===p.plate)}));
  const world=new Physics.World(floor,bridges,plates,map.walls.map(p=>({x:p.x,z:p.z,half:p.half,minY:p.base,height:p.base+p.height})));
  for(const p of map.tiles)if(p.height)world.heights.set(`${p.x},${p.z}`,p.height);
  world.lifts=map.lifts.map(p=>({...p,height:p.base,target:p.base}));world.spikes=copy(map.spikes);world.portals=copy(map.portals);world.conveyors=copy(map.conveyors);world.archers=copy(map.archers);world.pickups=map.pickups.map(p=>({...p,holder:null,durability:3,destroyed:false}));
  const soft=new Soft.System();world.soft=soft;
  const start=map.spawns.map(p=>p?{...p,y:world.heightAt(p.x,p.z)??0}:{x:-20,z:-20,y:0});
  const players=start.map((p,i)=>({...p,spawn:{...p},state:map.spawns[i]?'alive':'dead',vy:0,vx:0,vz:0,deaths:0,respawnTimer:0,respawnFlash:0,rx:p.x,rz:p.z,bounce:0,impact:0,squish:0,squishVelocity:0,portalLock:null,portalCooldown:0,portalFlash:0,portalBlocked:false,deathReason:null,shield:null,shieldHP:0,sword:null,facingX:0,facingZ:1,launchTimer:0,bashCooldown:0,attackTime:0,attackCooldown:0}));
  const crates=map.crates.map(p=>{const y=world.heightAt(p.x,p.z)??0;return {...p,y,spawn:{...p,y},kind:'crate',state:'alive',vx:0,vy:0,vz:0,deaths:0};});
  return {definition:map,floor,world,soft,start,players,crates,bodies:[...players,...crates],plates,bridges,goals:copy(map.goals)};
 }
 function forGame(storage,search=''){
  if(!/(?:^|[?&])level=editor(?:&|$)/.test(search))return read(defaultLevel());
  const saved=storage?.getItem(PLAY_KEY);if(!saved)throw new Error('Тестовый уровень не найден. Откройте редактор и нажмите «Играть».');
  const map=read(saved),errors=issues(map);if(errors.length)throw new Error(errors.join('\n'));return map;
 }
 const api={DRAFT_KEY,PLAY_KEY,limits,copy,blank,defaultLevel,read,issues,instantiate,forGame};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JellyLevels=api;
})(globalThis);
