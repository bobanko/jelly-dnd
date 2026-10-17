'use strict';
const L=JellyLevels,M=JellyEditorModel,S=JellyEditorSpace,$=id=>document.getElementById(id);
let startupError='';
let initial=L.defaultLevel();
try{const saved=localStorage.getItem(L.DRAFT_KEY);if(saved)initial=L.read(saved);}catch(error){startupError='Черновик не удалось открыть: '+error.message;}
const model=new M.Model(initial);
const groups=[
 ['Основание',[['floor','▱','Камень'],['wall','▦','Стена'],['torch','♨','Факел']]],
 ['Персонажи',L.characters.map((p,i)=>['spawn-'+i,'▣',p.name,p.color])],
 ['Финиши',L.characters.map((p,i)=>['goal-'+i,p.glyph,p.name,p.color])],
 ['Механизмы',[['plate','⊙','Кнопка'],['bridge','≋','Мост'],['lift','↥','Лифт'],['conveyor','»','Конвейер','#d8bb72'],['spikes','♜','Шипы'],['portal-violet','◎','Портал','#c98cff'],['portal-amber','◎','Портал','#edb65b']]],
 ['Объекты',[['crate','⊠','Ящик'],['archer','☠','Лучник'],['shield','◈','Щит'],['sword','⚔','Меч']]]
];
const tools=Object.fromEntries(groups.flatMap(g=>g[1]).map(([id,glyph,label,color])=>[id,{glyph,label,color}]));
Object.assign(tools,{select:{glyph:'↖',label:'Выбор'},erase:{glyph:'⌫',label:'Ластик'},pan:{glyph:'✥',label:'Перемещение вида'},orbit:{glyph:'⟳',label:'Вращение камеры'}});
const names=L.characters.map(p=>p.name),colors=L.characters.map(p=>p.color);
const labels={tiles:'Камень',walls:'Стена',spawns:'Спавн',goals:'Финиш',plates:'Кнопка',bridges:'Мост',lifts:'Лифт',conveyors:'Конвейер',spikes:'Шипы',portals:'Портал',crates:'Ящик',archers:'Скелет-лучник',pickups:'Предмет'};
let tool='floor',selected=null,hover=null,moveObject=null,gesture=null,space=false,view3d=false,expandedIssues=false,toastTimer,gridFrame;
let gridView={zoom:1,x:0,y:0},previewZoom=1,previewAngle=0,previewDirty=true,previewRuntime=null,previewRenderer=null,previewPromise=null,previewLast=0,previewFrame=0;
let pickBounds=null,lastPointer=null;
const previewCamera={x:(model.map.size-1)/2,z:(model.map.size-1)/2,mode:'ortho',pitch:50,fov:45};
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const atlas=new Image();atlas.onload=()=>invalidate();atlas.src='assets/materials/dungeon-stone-atlas.png';
function element(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5000);}
function save(){try{localStorage.setItem(L.DRAFT_KEY,JSON.stringify(model.map));$('save-status').textContent='● Сохранено';$('save-status').className='valid';return true;}catch(error){$('save-status').textContent='Не сохранено';$('save-status').className='invalid';toast('Не удалось сохранить в браузере. Используйте экспорт файла.');return false;}}
function changed(){previewDirty=true;pickBounds=null;save();renderPanels();invalidate();}
function edit(fn){try{if(model.change(fn))changed();else renderPanels();}catch(error){toast(error.message);renderPanels();}}
function selectTool(value){finishGesture();tool=value;moveObject=null;for(const button of document.querySelectorAll('[data-tool]'))button.setAttribute('aria-pressed',String(button.dataset.tool===tool));$('active-tool').textContent=tools[tool]?.label||'Переместить';$('conveyor-brush').hidden=tool!=='conveyor';refreshHover();invalidate();}
for(const [name,items] of groups){const group=element('section',undefined,'tool-group');group.append(element('h2',name.toUpperCase()));const grid=element('div',undefined,'tool-grid');for(const [id,glyph,label,color] of items){const button=element('button',undefined,'tool');button.dataset.tool=id;button.title=label;button.style.setProperty('--tool-color',color||'#a7bba4');button.append(element('span',glyph,'glyph'),element('span',label));grid.append(button);}group.append(grid);$('palette').append(group);}
const panButton=element('button','✥');panButton.dataset.tool='pan';panButton.title='Перемещение вида';panButton.setAttribute('aria-label','Перемещение вида');document.querySelector('.basic-tools').append(panButton);
const orbitButton=element('button','⟳');orbitButton.dataset.tool='orbit';orbitButton.title='Вращение камеры · правая кнопка мыши';orbitButton.setAttribute('aria-label','Вращение камеры');document.querySelector('.basic-tools').append(orbitButton);
document.querySelectorAll('[data-tool]').forEach(button=>button.onclick=()=>selectTool(button.dataset.tool));
const colliderLabel=element('label','Коллайдеры'),colliderToggle=element('input');colliderToggle.type='checkbox';colliderToggle.id='preview-colliders';colliderLabel.prepend(colliderToggle);document.querySelector('.camera-buttons').append(colliderLabel);
const projection=element('select');projection.id='editor-projection';projection.setAttribute('aria-label','Проекция камеры');for(const [value,text] of [['ortho','Изометрия'],['perspective','Перспектива']]){const option=element('option',text);option.value=value;projection.append(option);}projection.onchange=()=>{previewCamera.mode=projection.value;refreshHover();};document.querySelector('.camera-buttons').prepend(projection);
const spatialGridLabel=element('label','Сетка'),spatialGrid=element('input');spatialGrid.type='checkbox';spatialGrid.checked=true;spatialGrid.id='spatial-grid';spatialGridLabel.prepend(spatialGrid);document.querySelector('.camera-buttons').append(spatialGridLabel);
const zoomButtons=element('div',undefined,'zoom-buttons');
for(const [id,text,factor,label] of [['zoom-out','−',.8,'Уменьшить масштаб'],['zoom-in','+',1.25,'Увеличить масштаб']]){
 const button=element('button',text);button.id=id;button.title=label;button.setAttribute('aria-label',label);button.onclick=()=>{
  if(view3d){previewZoom=Math.max(.5,Math.min(3,previewZoom*factor));$('zoom-label').textContent=Math.round(previewZoom*100)+'%';refreshHover();}
  else{const before=gridView.zoom;gridView.zoom=Math.max(.5,Math.min(4,gridView.zoom*factor));const ratio=gridView.zoom/before;gridView.x*=ratio;gridView.y*=ratio;invalidate();}
 };zoomButtons.append(button);
}
document.querySelector('.viewport-toolbar').insertBefore(zoomButtons,$('fit'));
const conveyorBrush=element('div',undefined,'conveyor-brush');conveyorBrush.id='conveyor-brush';conveyorBrush.hidden=true;
const directionLabel=element('label','Лента '),beltDirection=element('select');beltDirection.id='belt-direction';beltDirection.setAttribute('aria-label','Направление конвейера');
for(const [value,text] of [['0,1','↓ Юг'],['0,-1','↑ Север'],['1,0','→ Восток'],['-1,0','← Запад']]){const option=element('option',text);option.value=value;beltDirection.append(option);}directionLabel.append(beltDirection);
const speedLabel=element('label','кл/с '),beltSpeed=element('input');beltSpeed.id='belt-speed';beltSpeed.type='number';beltSpeed.min='.2';beltSpeed.max='2.5';beltSpeed.step='.05';beltSpeed.value='.85';beltSpeed.setAttribute('aria-label','Скорость конвейера');speedLabel.append(beltSpeed);conveyorBrush.append(directionLabel,speedLabel);document.querySelector('.viewport-toolbar').append(conveyorBrush);
function cellObjects(x,z){const result=[];for(const key of ['tiles','walls','spawns','goals','plates','bridges','lifts','conveyors','spikes','portals','crates','archers','pickups'])model.map[key].forEach((p,index)=>{if(p&&p.x===x&&p.z===z)result.push({key,index,p});});return result;}
function field(card,label,value,options,onChange){
 const row=element('label',label),control=element(options?.values?'select':'input');
 if(options?.values)for(const [v,name] of options.values){const option=element('option',name);option.value=v;control.append(option);}
 else{control.type='number';control.min=options?.min??0;control.max=options?.max??3;control.step=options?.step??1;}
 control.value=value;control.setAttribute('aria-label',label);control.onchange=()=>onChange(options?.values?control.value:Number(control.value));row.append(control);card.append(row);return control;
}
function renderProperties(){
 const root=$('properties');root.replaceChildren();$('selected-coords').textContent=selected?`${selected.x} / ${selected.z}`:'—';
 if(!selected){root.append(element('p','Выберите клетку на карте.','empty-state'));return;}
 const items=cellObjects(selected.x,selected.z);
 if(!items.length){root.append(element('p','Пустота','empty-state'));return;}
 for(const {key,index,p} of items){
  const card=element('div',undefined,'object-card'),head=element('div',undefined,'object-head');
  let label=labels[key];if(key==='spawns'||key==='goals')label+=` · ${names[index]}`;if(key==='pickups')label=p.kind==='shield'?'Деревянный щит':'Железный меч';if(key==='walls'&&p.half<.4)label='Факел';
  head.append(element('span',key==='goals'?L.characters[index].glyph:key==='spawns'?'▣':key==='archers'?'☠':key==='pickups'?(p.kind==='shield'?'◈':'⚔'):'◇','marker'),element('span',label));card.append(head);
  const set=(property,value)=>edit(map=>{map[key][index][property]=value;});
  if(key==='tiles')field(card,'Высота пола',p.height,{min:0,max:3},value=>edit(()=>model.paint('floor',p.x,p.z,{height:value})));
  if(key==='walls'){field(card,'Высота стены',p.height,{min:.1,max:6,step:.1},v=>set('height',v));field(card,'Основание',p.base,{min:-.4,max:3,step:.1},v=>set('base',v));}
  if(key==='plates'){field(card,'Цвет',p.color,{values:[['red','Красный'],['blue','Синий'],['amber','Золотой'],['dark','Каменный']]},v=>set('color',v));card.append(element('p',`Канал ${index+1} · мостов: ${model.map.bridges.filter(b=>b.plate===p.id).length}`,'empty-state'));}
  if(key==='bridges')field(card,'Кнопка',p.plate,{values:[['','Не выбрана'],...model.map.plates.map((b,i)=>[b.id,`К${i+1} · ${b.x}, ${b.z}`])]},v=>set('plate',v));
  if(key==='lifts'){field(card,'Нижний уровень',p.base,{min:0,max:3},v=>edit(map=>{map.lifts[index].base=v;model.ensureFloor(p.x,p.z).height=v;}));field(card,'Верхний уровень',p.top,{min:0,max:3},v=>set('top',v));}
  if(key==='spikes')field(card,'Задержка, сек',p.offset,{min:0,max:5.8,step:.1},v=>set('offset',v));
  if(key==='portals')field(card,'Пара',p.color,{values:[['violet','Фиолетовая'],['amber','Янтарная']]},v=>set('color',v));
  if(key==='conveyors'){
   field(card,'Направление ленты',`${p.dx},${p.dz}`,{values:[['0,-1','↑ Север'],['1,0','→ Восток'],['0,1','↓ Юг'],['-1,0','← Запад']]},v=>{beltDirection.value=v;edit(map=>{[map.conveyors[index].dx,map.conveyors[index].dz]=v.split(',').map(Number);});});
   field(card,'Скорость ленты, кл/с',p.speed,{min:.2,max:2.5,step:.05},v=>{beltSpeed.value=v;set('speed',v);});
  }
  if(key==='archers'){
   field(card,'Направление',`${p.dx},${p.dz}`,{values:[['0,-1','↑ Север'],['1,0','→ Восток'],['0,1','↓ Юг'],['-1,0','← Запад']]},v=>edit(map=>{[map.archers[index].dx,map.archers[index].dz]=v.split(',').map(Number);}));
   field(card,'Выстрел каждые, с',p.interval,{min:.6,max:10,step:.1},v=>set('interval',v));field(card,'Первый выстрел, с',p.firstShot,{min:.1,max:10,step:.1},v=>set('firstShot',v));
  }
  const actions=element('div',undefined,'object-actions');
  if(key!=='tiles'){const move=element('button','Перенести');move.onclick=()=>{selectTool('select');moveObject={key,index};$('active-tool').textContent='Выберите новую клетку · Esc — отмена';};actions.append(move);}
  const remove=element('button',key==='tiles'?'Убрать пол':'Удалить','delete');remove.onclick=()=>{if(model.remove(key,index))changed();};actions.append(remove);card.append(actions);root.append(card);
 }
}
function renderIssues(){
 const errors=L.issues(model.map),root=$('issues');root.replaceChildren();$('validate').textContent=errors.length?`⚠ Замечания: ${errors.length}`:'✓ Можно играть';$('validate').className='validation-button '+(errors.length?'invalid':'valid');
 if(!errors.length){root.append(element('span',`Персонажей: ${model.map.spawns.filter(Boolean).length}. У каждого есть финиш. Связи настроены.`,'valid'));return;}
 const list=element('ul');for(const error of errors.slice(0,expandedIssues?100:3))list.append(element('li',error));root.append(list);
 if(errors.length>3&&!expandedIssues){const more=element('button',`Ещё ${errors.length-3}`);more.onclick=()=>{expandedIssues=true;renderIssues();};root.append(more);}
}
function renderPanels(){
 $('level-name').value=model.map.name;$('map-size').value=String(model.map.size);document.querySelector('.small-chip').textContent=`${model.map.size} × ${model.map.size}`;
 $('undo').disabled=!model.undoStack.length;$('redo').disabled=!model.redoStack.length;
 $('stats').replaceChildren(element('span',`${model.map.tiles.length} плиток`),element('span',`${Object.keys(L.limits).filter(k=>k!=='tiles').reduce((n,k)=>n+model.map[k].length,0)} объектов`));
 renderProperties();renderIssues();
}
function metrics(){const rect=$('viewport').getBoundingClientRect(),cell=Math.max(7,Math.min((rect.width-78)/model.map.size,(rect.height-78)/model.map.size))*gridView.zoom;return {rect,cell,x:rect.width/2-cell*model.map.size/2+gridView.x,y:rect.height/2-cell*model.map.size/2+gridView.y};}
function screenFrame(){const r=$('viewport').getBoundingClientRect();return S.frame(previewCamera,previewAngle,r.width,r.height,previewScale());}
function screenRay(event){const r=$('viewport').getBoundingClientRect();return S.ray(screenFrame(),event.clientX-r.left,event.clientY-r.top,r.width,r.height);}
function point(event){
 if(view3d){pickBounds??=S.boxes(model.map);return S.pick(screenRay(event),pickBounds,model.map.size,Number($('brush-height').value),gesture?.planeY??null);}
 const m=metrics();return {x:Math.floor((event.clientX-m.rect.left-m.x)/m.cell),z:Math.floor((event.clientY-m.rect.top-m.y)/m.cell)};
}
function refreshHover(){if(lastPointer&&!gesture?.pan&&!gesture?.orbit)hover=point(lastPointer);$('cell-info').textContent=inside(hover)?`X ${hover.x} / Z ${hover.z}`:'X — / Z —';}
function inside(p){return p&&p.x>=0&&p.z>=0&&p.x<model.map.size&&p.z<model.map.size;}
function invalidate(){if(gridFrame)return;gridFrame=requestAnimationFrame(()=>{gridFrame=0;if(!view3d)drawGrid();});}
function drawGrid(){
 const canvas=$('grid'),m=metrics(),{cell,x:ox,y:oy,rect}=m,ratio=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(rect.width*ratio);canvas.height=Math.round(rect.height*ratio);
 const ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);ctx.clearRect(0,0,rect.width,rect.height);
 ctx.font='9px Arial';ctx.textAlign='center';ctx.textBaseline='middle';
 for(let z=0;z<model.map.size;z++)for(let x=0;x<model.map.size;x++){
  const px=ox+x*cell,py=oy+z*cell,tile=model.at('tiles',x,z),wall=model.at('walls',x,z);
  ctx.fillStyle=tile?['#514e3d','#62634c','#76795a','#8b9267'][Math.floor(tile.height)]||'#62634c':'#101c2080';ctx.fillRect(px+1,py+1,cell-2,cell-2);
  if(tile&&atlas.complete&&atlas.naturalWidth){const id=(x*7+z*13)%16,unit=atlas.naturalWidth/4;ctx.globalAlpha=.42;ctx.drawImage(atlas,id%4*unit,Math.floor(id/4)*unit,unit,unit,px+1,py+1,cell-2,cell-2);ctx.globalAlpha=1;}
  ctx.strokeStyle=tile?'#c9ccaa22':'#a5c0b30c';ctx.strokeRect(px+.5,py+.5,cell-1,cell-1);
  if(tile?.height){ctx.textAlign='right';ctx.font=`${Math.max(7,cell*.18)}px Arial`;ctx.fillStyle='#cbd7ad';ctx.fillText('+'+tile.height,px+cell-4,py+7);ctx.textAlign='center';}
  if(wall){ctx.fillStyle=wall.half<.4?'#a2762e':'#7d8680';ctx.fillRect(px+cell*.13,py+cell*.13,cell*.74,cell*.74);ctx.strokeStyle='#b6c5b151';ctx.strokeRect(px+cell*.13,py+cell*.13,cell*.74,cell*.74);ctx.beginPath();ctx.moveTo(px+cell*.13,py+cell*.5);ctx.lineTo(px+cell*.87,py+cell*.5);ctx.moveTo(px+cell*.5,py+cell*.13);ctx.lineTo(px+cell*.5,py+cell*.5);ctx.stroke();if(wall.half<.4){ctx.fillStyle='#ffd170';ctx.font=`${cell*.6}px Georgia`;ctx.fillText('♨',px+cell*.5,py+cell*.53);}}
 }
 const center=p=>[ox+(p.x+.5)*cell,oy+(p.z+.5)*cell];
 if($('connections').checked){
  ctx.lineWidth=1;ctx.setLineDash([4,5]);
  for(const b of model.map.bridges){const p=model.map.plates.find(p=>p.id===b.plate);if(!p)continue;ctx.strokeStyle='#c2d99988';ctx.beginPath();ctx.moveTo(...center(p));ctx.lineTo(...center(b));ctx.stroke();}
  for(const color of ['violet','amber']){const pair=model.map.portals.filter(p=>p.color===color);if(pair.length===2){ctx.strokeStyle=color==='violet'?'#bd7bea55':'#ecc06555';ctx.beginPath();ctx.moveTo(...center(pair[0]));ctx.lineTo(...center(pair[1]));ctx.stroke();}}
  if(selected){const a=model.at('archers',selected.x,selected.z);if(a){ctx.strokeStyle='#efaa7088';ctx.beginPath();ctx.moveTo(...center(a));const end={x:a.x+a.dx*model.map.size,z:a.z+a.dz*model.map.size};ctx.lineTo(...center({x:Math.max(0,Math.min(model.map.size-1,end.x)),z:Math.max(0,Math.min(model.map.size-1,end.z))}));ctx.stroke();}}
  ctx.setLineDash([]);
 }
 const glyph=(p,text,color='#d1cfad',size=.52)=>{const [x,y]=center(p);ctx.fillStyle=color;ctx.font=`${Math.max(8,cell*size)}px Georgia,serif`;ctx.fillText(text,x,y+1);};
 for(const p of model.map.conveyors){const [x,y]=center(p),a=p.dx>0?-Math.PI/2:p.dx<0?Math.PI/2:p.dz<0?Math.PI:0;ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.fillStyle='#243c34';ctx.fillRect(-cell*.39,-cell*.5,cell*.78,cell);ctx.fillStyle='#849587';for(const s of [-1,1])ctx.fillRect(s*cell*.43-cell*.025,-cell*.5,cell*.05,cell);ctx.restore();glyph(p,p.dx>0?'»':p.dx<0?'«':p.dz<0?'⌃':'⌄','#e7ca82',.65);}
 model.map.goals.forEach((p,i)=>{if(!p)return;const [x,y]=center(p);ctx.fillStyle=colors[i]+'14';ctx.fillRect(x-cell*.4,y-cell*.4,cell*.8,cell*.8);ctx.strokeStyle=colors[i]+'aa';ctx.strokeRect(x-cell*.39,y-cell*.39,cell*.78,cell*.78);glyph(p,L.characters[i].glyph,colors[i],.6);});
 for(const b of model.map.bridges){glyph(b,'≋','#d4cc8d',.7);const [x,y]=center(b);ctx.font=`${Math.max(7,cell*.18)}px Arial`;ctx.fillStyle='#ccdab2';ctx.fillText('К'+(model.map.plates.findIndex(p=>p.id===b.plate)+1||'?'),x,y+cell*.32);}
 model.map.plates.forEach((p,i)=>{glyph(p,'●',{red:'#d66b52',blue:'#528eee',amber:'#d6aa55',dark:'#8c9a92'}[p.color],.7);glyph(p,String(i+1),'#111c1d',.24);});
 for(const p of model.map.lifts)glyph(p,'↥','#e5ca8f',.68);
 for(const p of model.map.spikes)glyph(p,'▴▴','#b4bdba',.4);
 for(const p of model.map.portals)glyph(p,'◎',p.color==='violet'?'#ca8bfd':'#e9ba60',.74);
 for(const p of model.map.crates)glyph(p,'⊠','#d3a56e',.7);
 for(const p of model.map.pickups)glyph(p,p.kind==='shield'?'◈':'⚔',p.kind==='shield'?'#dbb17b':'#d2dde3',.63);
 for(const p of model.map.archers){glyph(p,'☠','#ded9b8',.59);const [x,y]=center(p);ctx.fillStyle='#dbad79';ctx.font=`${Math.max(8,cell*.24)}px Arial`;ctx.fillText(p.dx>0?'→':p.dx<0?'←':p.dz<0?'↑':'↓',x+p.dx*cell*.32,y+p.dz*cell*.32);}
 model.map.spawns.forEach((p,i)=>{if(!p)return;const [x,y]=center(p);ctx.fillStyle=colors[i]+'a6';ctx.beginPath();ctx.roundRect(x-cell*.27,y-cell*.27,cell*.54,cell*.54,cell*.12);ctx.fill();ctx.strokeStyle=colors[i];ctx.stroke();glyph(p,String(i+1),'#14221d',.31);});
 ctx.font='9px Arial';ctx.fillStyle='#6c8376';for(let i=0;i<model.map.size;i++){ctx.fillText(i,ox+(i+.5)*cell,oy-12);ctx.fillText(i,ox-15,oy+(i+.5)*cell);}
 if(inside(hover)){ctx.fillStyle=tool==='erase'?'#e58d6c22':'#b9db8b12';ctx.fillRect(ox+hover.x*cell,oy+hover.z*cell,cell,cell);ctx.strokeStyle=tool==='erase'?'#e3a18a':'#b9db8b99';ctx.lineWidth=1;ctx.strokeRect(ox+hover.x*cell+1,oy+hover.z*cell+1,cell-2,cell-2);}
 if(selected){ctx.strokeStyle='#d1e5aa';ctx.lineWidth=2;ctx.strokeRect(ox+selected.x*cell+1,oy+selected.z*cell+1,cell-2,cell-2);}
 if(gesture?.rectangle&&inside(hover)){const a=gesture.start,b=hover,x=Math.min(a.x,b.x),z=Math.min(a.z,b.z);ctx.fillStyle='#b9db8b1a';ctx.fillRect(ox+x*cell,oy+z*cell,(Math.abs(a.x-b.x)+1)*cell,(Math.abs(a.z-b.z)+1)*cell);ctx.strokeStyle='#badc8d';ctx.setLineDash([5,4]);ctx.strokeRect(ox+x*cell,oy+z*cell,(Math.abs(a.x-b.x)+1)*cell,(Math.abs(a.z-b.z)+1)*cell);ctx.setLineDash([]);}
 $('zoom-label').textContent=Math.round(gridView.zoom*100)+'%';
}
function paintCell(p,activeTool){if(!inside(p))return;try{const [dx,dz]=beltDirection.value.split(',').map(Number),speed=Math.max(.2,Math.min(2.5,Number(beltSpeed.value)||.85));model.paint(activeTool,p.x,p.z,{height:Number($('brush-height').value),dx,dz,speed});previewDirty=true;pickBounds=null;}catch(error){toast(error.message);}selected={x:p.x,z:p.z};}
function finishGesture(){
 if(!gesture)return;
 if(gesture.pan||gesture.orbit){gesture=null;$('viewport').classList.remove('camera-drag');refreshHover();invalidate();return;}
 if(gesture.rectangle&&inside(hover))for(let z=Math.min(gesture.start.z,hover.z);z<=Math.max(gesture.start.z,hover.z);z++)for(let x=Math.min(gesture.start.x,hover.x);x<=Math.max(gesture.start.x,hover.x);x++)paintCell({x,z},gesture.tool);
 const changedMap=model.commit();gesture=null;if(changedMap)changed();else{renderProperties();invalidate();}refreshHover();
}
$('viewport').addEventListener('pointerdown',event=>{
 if(![0,1,2].includes(event.button)||gesture)return;event.preventDefault();$('viewport').focus();lastPointer=event;const p=point(event);hover=p;
 if((view3d&&event.button===2)||(view3d&&tool==='orbit')||space||event.button===1||tool==='pan'){
  const orbit=view3d&&!space&&event.button!==1&&(event.button===2||tool==='orbit');gesture={pan:!orbit,orbit,x:event.clientX,y:event.clientY};$('viewport').classList.add('camera-drag');$('viewport').setPointerCapture(event.pointerId);return;
 }
 if(!inside(p))return;
 selected={x:p.x,z:p.z};
 if(moveObject){try{if(model.move(moveObject.key,moveObject.index,p.x,p.z,Number($('brush-height').value)))changed();moveObject=null;selectTool('select');}catch(error){toast(error.message);}return;}
 const activeTool=event.button===2||event.shiftKey?'erase':tool;if(activeTool==='select'){renderProperties();invalidate();return;}
 model.begin();gesture={start:p,last:p,tool:activeTool,planeY:view3d?(model.at('tiles',p.x,p.z)?.height??Number($('brush-height').value)):null,rectangle:$('brush-shape').value==='rectangle'&&['floor','wall','erase','conveyor'].includes(activeTool)};
 if(!gesture.rectangle)paintCell(p,activeTool);$('viewport').setPointerCapture(event.pointerId);invalidate();
});
$('viewport').addEventListener('pointermove',event=>{
 lastPointer=event;
 if(gesture?.orbit){previewAngle-=(event.clientX-gesture.x)*.008;previewCamera.pitch=Math.max(20,Math.min(85,previewCamera.pitch+(event.clientY-gesture.y)*.25));gesture.x=event.clientX;gesture.y=event.clientY;return;}
 if(gesture?.pan){const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;gesture.x=event.clientX;gesture.y=event.clientY;
  if(view3d){const a=S.plane(screenRay({clientX:event.clientX-dx,clientY:event.clientY-dy}),0),b=S.plane(screenRay(event),0);if(a&&b){previewCamera.x+=a.position[0]-b.position[0];previewCamera.z+=a.position[2]-b.position[2];}}else{gridView.x+=dx;gridView.y+=dy;}invalidate();return;
 }
 refreshHover();
 if(gesture&&!gesture.rectangle&&inside(hover)){const a=gesture.last,b=hover,steps=Math.max(Math.abs(a.x-b.x),Math.abs(a.z-b.z));for(let i=1;i<=steps;i++)paintCell({x:Math.round(a.x+(b.x-a.x)*i/steps),z:Math.round(a.z+(b.z-a.z)*i/steps)},gesture.tool);gesture.last=hover;}
 invalidate();
});
$('viewport').addEventListener('pointerup',finishGesture);$('viewport').addEventListener('pointercancel',finishGesture);$('viewport').addEventListener('lostpointercapture',finishGesture);
$('viewport').addEventListener('contextmenu',event=>event.preventDefault());$('viewport').addEventListener('pointerleave',()=>{if(!gesture){lastPointer=null;hover=null;invalidate();}});
$('viewport').addEventListener('wheel',event=>{event.preventDefault();const factor=Math.exp(-event.deltaY*.001);if(view3d){previewZoom=Math.max(.5,Math.min(3,previewZoom*factor));$('zoom-label').textContent=Math.round(previewZoom*100)+'%';refreshHover();}else{const m=metrics(),px=event.clientX-m.rect.left-m.rect.width/2,py=event.clientY-m.rect.top-m.rect.height/2,newZoom=Math.max(.5,Math.min(4,gridView.zoom*factor)),r=newZoom/gridView.zoom;gridView.x=px-(px-gridView.x)*r;gridView.y=py-(py-gridView.y)*r;gridView.zoom=newZoom;invalidate();}},{passive:false});
function fit(){gridView={zoom:1,x:0,y:0};previewZoom=1;previewCamera.x=previewCamera.z=(model.map.size-1)/2;$('zoom-label').textContent='100%';refreshHover();invalidate();}
function previewScale(){const r=$('viewport').getBoundingClientRect();return Math.min(r.width/(model.map.size*1.65),r.height/(model.map.size*1.3))*previewZoom;}
function drawSpatialOverlay(){
 const canvas=$('spatial-overlay'),r=$('viewport').getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,2),w=Math.round(r.width*ratio),h=Math.round(r.height*ratio);
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
 const ctx=canvas.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,r.width,r.height);
 const frame=screenFrame(),project=p=>JellyGPU.projectPoint(frame,...p,r.width,r.height);
 function path(points,color,fill=null,dashed=false){
  const ps=points.map(project);if(ps.some(p=>!p.visible))return;ctx.beginPath();ps.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.setLineDash(dashed?[5,4]:[]);if(fill){ctx.fillStyle=fill;ctx.fill();}ctx.strokeStyle=color;ctx.stroke();
 }
 function square(p,y,color,fill=null,dashed=false){path([[p.x-.48,y,p.z-.48],[p.x+.48,y,p.z-.48],[p.x+.48,y,p.z+.48],[p.x-.48,y,p.z+.48]],color,fill,dashed);}
 const layer=Number($('brush-height').value),floor=(x,z)=>model.at('tiles',x,z)?.height??layer;
 if(spatialGrid.checked){ctx.lineWidth=.7;for(let z=0;z<model.map.size;z++)for(let x=0;x<model.map.size;x++)if(!model.at('tiles',x,z))square({x,z},layer,'#a7c9b124');}
 if($('connections').checked){
  ctx.lineWidth=1;const line=(a,b,color)=>{const ps=[a,b].map(p=>project([p.x,floor(p.x,p.z)+.15,p.z]));if(ps.some(p=>!p.visible))return;ctx.beginPath();ctx.moveTo(ps[0].x,ps[0].y);ctx.lineTo(ps[1].x,ps[1].y);ctx.strokeStyle=color;ctx.setLineDash([4,5]);ctx.stroke();};
  for(const b of model.map.bridges){const p=model.map.plates.find(p=>p.id===b.plate);if(p)line(p,b,'#d4e9a88a');}
  for(const color of ['violet','amber']){const ps=model.map.portals.filter(p=>p.color===color);if(ps.length===2)line(ps[0],ps[1],color==='violet'?'#cb95ff88':'#edb65b88');}
 }
 ctx.lineWidth=2;
 if(selected)square(selected,floor(selected.x,selected.z)+.04,'#e2edb4','#d6eea714');
 if(gesture?.pan||gesture?.orbit||!inside(hover)||['pan','orbit'].includes(tool))return;
 const active=gesture?.tool||tool,isErase=active==='erase',color=isErase?'#f2a78b':'#ceecaa',fill=isErase?'#ef8c732b':'#cbec9a24';
 if(gesture?.rectangle){for(let z=Math.min(gesture.start.z,hover.z);z<=Math.max(gesture.start.z,hover.z);z++)for(let x=Math.min(gesture.start.x,hover.x);x<=Math.max(gesture.start.x,hover.x);x++)square({x,z},active==='floor'?layer+.04:floor(x,z)+.14,color,fill,true);return;}
 const y=active==='floor'?layer:floor(hover.x,hover.z);square(hover,y+.045,color,fill,active!=='select');
 const height=active==='wall'?1.4:active==='torch'?.56:active==='crate'||active.startsWith('spawn-')?.84:active==='archer'?1.2:active==='floor'?.72:moveObject?.key==='crates'?.84:0;
 if(height){const top=active==='floor'?y+.045:y+height,base=active==='floor'?y-.72:y;for(const dx of [-.46,.46])for(const dz of [-.46,.46])path([[hover.x+dx,base,hover.z+dz],[hover.x+dx,top,hover.z+dz]],color,null,true);square(hover,top,color,null,true);}
}
function rebuildPreview(){
 previewRuntime=L.instantiate(model.map,JellyPhysics,JellySoftBody);previewRuntime.effects=new JellyEffects.System({reducedMotion:true});previewRuntime.won=false;previewRuntime.reducedMotion=true;
 previewRuntime.world.featureTime=1;previewRuntime.bridges.forEach(b=>b.progress=1);
 previewRenderer.bridgeKey=undefined;previewRenderer.decorationKey=undefined;previewRenderer.propGeometryKey=undefined;previewRenderer.goalGlowStrength=[];previewRenderer.goalWinGlow=0;previewDirty=false;
}
function previewTick(t){
 previewFrame=0;if(!view3d||!previewRenderer?.ready)return;const dt=Math.min(.05,(t-previewLast)/1000||.016);previewLast=t;
 if(previewDirty)rebuildPreview();previewRenderer.colliders=$('preview-colliders').checked;previewRenderer.render(previewRuntime,previewRuntime.players,previewCamera,previewAngle,reducedMotion?0:t/1000,previewScale(),dt);drawSpatialOverlay();previewFrame=requestAnimationFrame(previewTick);
}
async function setView(value){
 finishGesture();view3d=value;document.body.classList.toggle('preview-mode',value);document.querySelector('.camera-buttons').hidden=!value;orbitButton.hidden=!value;$('grid').hidden=value;$('preview').hidden=!value;$('spatial-overlay').hidden=!value;$('view-grid').setAttribute('aria-pressed',String(!value));$('view-3d').setAttribute('aria-pressed',String(value));$('view-caption').textContent=value?'3D-РЕДАКТОР':'ВИД СВЕРХУ';$('mouse-hints').textContent=value?'ЛКМ — кисть · Shift+ЛКМ — стереть · ПКМ — вращать · СКМ / Space — сдвиг':'ЛКМ — кисть · ПКМ — стереть · Space — сдвиг · F — вписать';refreshHover();
 if(!value){if(tool==='orbit')selectTool('select');$('gpu-message').hidden=true;invalidate();return;}
 $('gpu-message').hidden=false;$('gpu-message').textContent='Загружаем 3D…';
 try{
  if(!previewPromise){previewRenderer=new JellyGPU.Renderer($('preview'),JellySoftBody);previewRenderer.onFailure=message=>{$('gpu-message').hidden=false;$('gpu-message').textContent=message;};previewPromise=previewRenderer.init();}
  await previewPromise;if(!view3d)return;$('gpu-message').hidden=true;if(!previewFrame)previewFrame=requestAnimationFrame(previewTick);
 }catch(error){if(!view3d)return;setView(false);toast('3D недоступно: '+error.message+'. Открыт редактор с видом сверху.');}
}
function turnCamera(delta){previewAngle+=delta;refreshHover();}
$('view-grid').onclick=()=>setView(false);$('view-3d').onclick=()=>setView(true);$('fit').onclick=fit;$('rotate-left').onclick=()=>turnCamera(-Math.PI/2);$('rotate-right').onclick=()=>turnCamera(Math.PI/2);
$('connections').onchange=invalidate;$('brush-height').onchange=()=>{refreshHover();invalidate();};
$('undo').onclick=()=>{finishGesture();if(model.undo()){moveObject=null;selected=null;changed();}};$('redo').onclick=()=>{if(model.redo()){selected=null;changed();}};
$('level-name').onchange=event=>edit(map=>{map.name=event.target.value.trim()||'Без названия';});
$('map-size').replaceChildren(...Array.from({length:9},(_,i)=>{const option=element('option',`${i+8} × ${i+8}`);option.value=i+8;return option;}));
$('map-size').onchange=event=>{if(model.resize(Number(event.target.value))){selected=null;changed();fit();}};
function replaceMap(map){finishGesture();if(model.load(map)){selected=null;moveObject=null;expandedIssues=false;changed();fit();}}
$('new').onclick=()=>replaceMap(L.blank());$('original').onclick=()=>replaceMap(L.defaultLevel());
$('validate').onclick=()=>{expandedIssues=!expandedIssues;renderIssues();if(!L.issues(model.map).length)toast('Уровень готов к запуску.');};
$('export').onclick=()=>{
 const blob=new Blob([JSON.stringify(model.map,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),link=element('a');link.href=url;link.download=(model.map.name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').trim()||'level')+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('Уровень экспортирован.');
};
$('import').onclick=()=>$('file').click();$('file').onchange=async event=>{
 const file=event.target.files[0];if(!file)return;
 try{if(file.size>1024*1024)throw new Error('Файл слишком большой (максимум 1 МБ).');const imported=L.read(await file.text());replaceMap(imported);toast('Уровень импортирован.');}catch(error){toast('Импорт не выполнен: '+error.message);}event.target.value='';
};
$('play').onclick=()=>{
 finishGesture();const errors=L.issues(model.map);if(errors.length){expandedIssues=true;renderIssues();toast('Перед запуском исправьте замечания в панели уровня.');$('validate').focus();return;}
 try{if(!save())return;localStorage.setItem(L.PLAY_KEY,JSON.stringify(L.read(model.map)));location.href='./?level=editor';}catch(error){toast('Не удалось подготовить запуск: '+error.message);}
};
addEventListener('keydown',event=>{
 if((event.ctrlKey||event.metaKey)&&event.code==='KeyS'){event.preventDefault();if(event.target.closest('input,select,textarea'))event.target.blur();save();return;}
 if(event.target.closest('input,select,textarea'))return;
 if((event.ctrlKey||event.metaKey)&&event.code==='KeyZ'){event.preventDefault();(event.shiftKey?$('redo'):$('undo')).click();return;}
 if((event.ctrlKey||event.metaKey)&&event.code==='KeyY'){event.preventDefault();$('redo').click();return;}
 if(event.ctrlKey||event.metaKey||event.altKey)return;
 if(event.code==='Space'&&event.target.closest('button,a'))return;
 if(event.code==='Space'){event.preventDefault();space=true;}
 if(event.code==='Escape'){moveObject=null;selectTool('select');}
 if(event.code==='KeyF'){event.preventDefault();fit();}
 if(event.code==='KeyV')selectTool('select');if(event.code==='KeyB')selectTool('floor');if(event.code==='KeyX')selectTool('erase');
 if(view3d&&event.code==='KeyQ')turnCamera(-Math.PI/2);if(view3d&&event.code==='KeyE')turnCamera(Math.PI/2);
 if(event.code==='Delete'&&selected){edit(()=>model.erase(selected.x,selected.z));}
});
addEventListener('keyup',event=>{if(event.code==='Space')space=false;});addEventListener('blur',()=>{space=false;finishGesture();});
new ResizeObserver(()=>{refreshHover();invalidate();}).observe($('viewport'));
selectTool('select');renderPanels();fit();setView(true);if(startupError){$('save-status').textContent='Черновик не открыт';toast(startupError);}
