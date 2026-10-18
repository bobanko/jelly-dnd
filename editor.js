'use strict';
const L=JellyLevels,M=JellyEditorModel,S=JellyEditorSpace,$=id=>document.getElementById(id);
let startupError='';
let initial=L.defaultLevel();
try{const saved=localStorage.getItem(L.DRAFT_KEY);if(saved)initial=L.read(saved);}catch(error){startupError='Черновик не удалось открыть: '+error.message;}
const model=new M.Model(L.voxelize(initial));
const phaseSymbols=['△','⊙','◇','☼'];
const groups=[
 ['Основание',[['floor','▣','Каменный куб']]],
 ['Декор',[['torch','♨','Настенный факел','#f7ba60']]],
 ['Цветные блоки',L.characters.map((p,i)=>['color-'+i,phaseSymbols[i],p.name,p.color])],
 ['Персонажи',L.characters.map((p,i)=>['spawn-'+i,'▣',p.name,p.color])],
 ['Финиши',L.characters.map((p,i)=>['goal-'+i,p.glyph,p.name,p.color])],
 ['Порталы',L.portalColors.map(p=>['portal-'+p.id,'◎',p.name,p.color])],
 ['Механизмы',[['plate','⊙','Кнопка','#ef5346'],['bridge','≋','Мост','#cba778'],['lift','↥','Лифт','#cba778'],['conveyor','»','Конвейер','#d8bb72'],['spikes','♜','Шипы','#c2ced0']]],
 ['Объекты',[['crate','⊠','Ящик','#cba778'],['archer','☠','Лучник','#ded3b2'],['drone','◈','Кристаллический дрон','#c98cff'],['shield','◈','Щит','#cba778'],['sword','⚔','Меч','#c2ced0']]]
];
const tools=Object.fromEntries(groups.flatMap(g=>g[1]).map(([id,glyph,label,color])=>[id,{glyph,label,color}]));
Object.assign(tools,{select:{glyph:'↖',label:'Выбор'},erase:{glyph:'⌫',label:'Ластик'},pan:{glyph:'✥',label:'Перемещение вида'},orbit:{glyph:'⟳',label:'Вращение камеры'}});
const names=L.characters.map(p=>p.name),colors=L.characters.map(p=>p.color);
const cubeTool=value=>value==='floor'||/^color-[0-3]$/.test(value);
const labels={blocks:'Каменный куб',tiles:'Камень',walls:'Стена',torches:'Настенный факел',drones:'Кристаллический дрон',spawns:'Спавн',goals:'Финиш',plates:'Кнопка',bridges:'Мост',lifts:'Лифт',conveyors:'Конвейер',spikes:'Шипы',portals:'Портал',crates:'Ящик',archers:'Скелет-лучник',pickups:'Предмет'};
let tool='floor',selected=null,hover=null,moveObject=null,gesture=null,space=false,expandedIssues=false,toastTimer;
const view3d=true;
let previewZoom=1,previewAngle=0,previewDirty=true,previewRuntime=null,previewRenderer=null,previewPromise=null,previewLast=0,previewFrame=0;
let pickBounds=null,lastPointer=null,previewFitHeight=0;
const previewCamera={x:(model.map.size-1)/2,z:(model.map.size-1)/2,mode:'ortho',pitch:50,fov:45};
let previewTargetAngle=previewAngle,previewTargetPitch=previewCamera.pitch,cameraLast=0;
const panKeys=new Set(),panCodes=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight']);
const editingField=target=>target?.closest('input,select,textarea,[contenteditable]:not([contenteditable="false"])');
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
function element(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
function toolIcon(id,glyph){
 const icon=element('span',undefined,'glyph');icon.setAttribute('aria-hidden','true');
 const cube='<path d="M16 3 29 10 16 17 3 10Z" fill="currentColor" fill-opacity=".55"/><path d="M3 10v14l13 7V17Z" fill="currentColor" fill-opacity=".3"/><path d="m16 17 13-7v14l-13 7Z" fill="currentColor" fill-opacity=".18"/><path d="m16 3 13 7v14l-13 7-13-7V10Zm0 14v14M3 10l13 7 13-7" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>';
 let drawing='';
 if(id==='floor'||id.startsWith('color-'))drawing=cube+(id==='floor'?'':'<text x="22" y="25" fill="currentColor" font-size="12" text-anchor="middle">'+glyph+'</text>');
 else if(id.startsWith('spawn-'))drawing=cube+'<path d="M8 15c-3-1-4 0-4 3 0 2 1 4 2 5v3l5 3v-3c2 0 3-1 3-3 0-3-2-6-6-8Z" fill="currentColor"/><path d="m6 19 2 1v3l-2-1Zm4 2 2 1v3l-2-1Z" fill="#142023"/>';
 else if(id.startsWith('goal-'))drawing='<path d="m16 9 14 8-14 8-14-8Z" fill="currentColor" fill-opacity=".22" stroke="currentColor" stroke-width="1.4"/><path d="M2 17v5l14 8 14-8v-5M16 25v5" fill="none" stroke="currentColor" stroke-opacity=".6"/><text x="16" y="19" fill="currentColor" font-size="15" text-anchor="middle">'+glyph+'</text>';
 else if(id.startsWith('portal-'))drawing='<ellipse cx="16" cy="23" rx="13" ry="6" fill="currentColor" fill-opacity=".2" stroke="currentColor" stroke-width="1.8"/><ellipse cx="16" cy="17" rx="9" ry="4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-opacity=".65"/><ellipse cx="16" cy="10" rx="6" ry="2.5" fill="none" stroke="currentColor" stroke-opacity=".35"/><path d="M13 23q6-5 10 0t-12 2" fill="none" stroke="currentColor" stroke-width="1.5"/>';
 if(drawing)icon.innerHTML='<svg viewBox="0 0 32 34" focusable="false">'+drawing+'</svg>';else icon.textContent=glyph;
 return icon;
}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5000);}
function save(){try{localStorage.setItem(L.DRAFT_KEY,JSON.stringify(model.map));$('save-status').textContent='● Сохранено';$('save-status').className='valid';return true;}catch(error){$('save-status').textContent='Не сохранено';$('save-status').className='invalid';toast('Не удалось сохранить в браузере. Используйте экспорт файла.');return false;}}
function changed(){previewDirty=true;pickBounds=null;save();renderPanels();invalidate();}
function edit(fn){try{if(model.change(fn))changed();else renderPanels();}catch(error){toast(error.message);renderPanels();}}
function selectTool(value){finishGesture();tool=value;moveObject=null;for(const button of document.querySelectorAll('[data-tool]'))button.setAttribute('aria-pressed',String(button.dataset.tool===tool));$('active-tool').textContent=tools[tool]?.label||'Переместить';$('conveyor-brush').hidden=tool!=='conveyor';$('spike-brush').hidden=tool!=='spikes';$('torch-brush').hidden=tool!=='torch';refreshHover();invalidate();}
for(const [name,items] of groups){const group=element('section',undefined,'tool-group');group.append(element('h2',name.toUpperCase()));const grid=element('div',undefined,'tool-grid');for(const [id,glyph,label,color] of items){const button=element('button',undefined,'tool'),description=name+' · '+label;button.dataset.tool=id;button.title=description;button.setAttribute('aria-label',description);button.style.setProperty('--tool-color',color||'#a7bba4');button.append(toolIcon(id,glyph));grid.append(button);}group.append(grid);$('palette').append(group);}
const panButton=element('button','✥');panButton.dataset.tool='pan';panButton.title='Перемещение вида (M)';panButton.setAttribute('aria-label','Перемещение вида');document.querySelector('.basic-tools').append(panButton);
const orbitButton=element('button','⟳');orbitButton.dataset.tool='orbit';orbitButton.title='Вращение камеры · правая кнопка мыши';orbitButton.setAttribute('aria-label','Вращение камеры');document.querySelector('.basic-tools').append(orbitButton);
document.querySelectorAll('[data-tool]').forEach(button=>button.onclick=()=>selectTool(button.dataset.tool));
const colliderLabel=element('label','Коллайдеры'),colliderToggle=element('input');colliderToggle.type='checkbox';colliderToggle.id='preview-colliders';colliderLabel.prepend(colliderToggle);document.querySelector('.camera-buttons').append(colliderLabel);
const projection=element('select');projection.id='editor-projection';projection.setAttribute('aria-label','Проекция камеры');for(const [value,text] of [['ortho','Изометрия'],['perspective','Перспектива']]){const option=element('option',text);option.value=value;projection.append(option);}projection.onchange=()=>{previewCamera.mode=projection.value;refreshHover();};document.querySelector('.camera-buttons').prepend(projection);
const spatialGridLabel=element('label','Сетка'),spatialGrid=element('input');spatialGrid.type='checkbox';spatialGrid.checked=true;spatialGrid.id='spatial-grid';spatialGridLabel.prepend(spatialGrid);document.querySelector('.camera-buttons').append(spatialGridLabel);
const zoomButtons=element('div',undefined,'zoom-buttons');
for(const [id,text,factor,label] of [['zoom-out','−',.8,'Уменьшить масштаб'],['zoom-in','+',1.25,'Увеличить масштаб']]){
 const button=element('button',text);button.id=id;button.title=label;button.setAttribute('aria-label',label);button.onclick=()=>{
  previewZoom=Math.max(.5,Math.min(3,previewZoom*factor));$('zoom-label').textContent=Math.round(previewZoom*100)+'%';refreshHover();
 };zoomButtons.append(button);
}
document.querySelector('.viewport-toolbar').insertBefore(zoomButtons,$('fit'));
const conveyorBrush=element('div',undefined,'conveyor-brush');conveyorBrush.id='conveyor-brush';conveyorBrush.hidden=true;
const directionLabel=element('label','Лента '),beltDirection=element('select');beltDirection.id='belt-direction';beltDirection.setAttribute('aria-label','Направление конвейера');
for(const [value,text] of [['0,1','↓ Юг'],['0,-1','↑ Север'],['1,0','→ Восток'],['-1,0','← Запад']]){const option=element('option',text);option.value=value;beltDirection.append(option);}directionLabel.append(beltDirection);
const speedLabel=element('label','кл/с '),beltSpeed=element('input');beltSpeed.id='belt-speed';beltSpeed.type='number';beltSpeed.min='.2';beltSpeed.max='2.5';beltSpeed.step='.1';beltSpeed.value='.85';beltSpeed.setAttribute('aria-label','Скорость конвейера');speedLabel.append(beltSpeed);conveyorBrush.append(directionLabel,speedLabel);document.querySelector('.viewport-toolbar').append(conveyorBrush);
const spikeFaces=[['top','Пол · вверх'],['north','Стена · север −Z'],['east','Стена · восток +X'],['south','Стена · юг +Z'],['west','Стена · запад −X']];
const spikeColors=[['','Нейтральный'],...L.characters.map((c,i)=>[String(i),c.name])];
const spikeBrush=element('div',undefined,'conveyor-brush');spikeBrush.id='spike-brush';spikeBrush.hidden=true;
const spikeFace=element('select'),spikeColor=element('select');spikeFace.id='spike-face';spikeColor.id='spike-color';
for(const [control,label,values] of [[spikeFace,'Крепление шипов',[['auto','По грани'],...spikeFaces]],[spikeColor,'Цвет шипов',spikeColors]]){
 control.setAttribute('aria-label',label);for(const [value,text] of values){const option=element('option',text);option.value=value;control.append(option);}const row=element('label',label+' ');row.append(control);spikeBrush.append(row);control.onchange=()=>{refreshHover();invalidate();};
}document.querySelector('.viewport-toolbar').append(spikeBrush);
const torchFaces=spikeFaces.filter(([face])=>face!=='top'),torchBrush=element('div',undefined,'conveyor-brush'),torchFace=element('select');torchBrush.id='torch-brush';torchBrush.hidden=true;torchFace.id='torch-face';torchFace.setAttribute('aria-label','Крепление факела');
for(const [value,text] of [['auto','По боковой грани'],...torchFaces]){const option=element('option',text);option.value=value;torchFace.append(option);}const torchLabel=element('label','Крепление факела ');torchLabel.append(torchFace);torchBrush.append(torchLabel);document.querySelector('.viewport-toolbar').append(torchBrush);torchFace.onchange=()=>{refreshHover();invalidate();};
const placementMode=element('select');placementMode.id='placement-mode';placementMode.setAttribute('aria-label','Способ размещения');for(const [value,text] of [['face','По грани'],['layer','На слое Y']]){const option=element('option',text);option.value=value;placementMode.append(option);}document.querySelector('.height-control').after(placementMode);
$('brush-height').replaceChildren(...Array.from({length:15},(_,i)=>{const option=element('option',`Y ${i-2}`);option.value=i-2;return option;}));$('brush-height').value='0';
const coordinateRoot=element('section',undefined,'coordinate-placement');coordinateRoot.append(element('div','КУБ ПО КООРДИНАТАМ','panel-heading'));
for(const axis of ['x','y','z']){const row=element('label',axis.toUpperCase()),input=element('input');input.type='number';input.id='coordinate-'+axis;input.setAttribute('aria-label','Координата '+axis.toUpperCase());input.min=axis==='y'?-2:0;input.max=axis==='y'?12:model.map.size-1;input.step=1;input.value=0;row.append(input);coordinateRoot.append(row);}
const placeCoordinate=element('button','Поставить куб');placeCoordinate.id='place-coordinate';placeCoordinate.onclick=()=>{const p={x:Number($('coordinate-x').value),y:Number($('coordinate-y').value),z:Number($('coordinate-z').value)};if(!inside(p)||!Number.isInteger(p.x)||!Number.isInteger(p.z)||!Number.isInteger(p.y)||p.y< -2||p.y>12){toast('Проверьте целые координаты X / Y / Z.');return;}edit(()=>paintCell(p,cubeTool(tool)?tool:'floor'));};coordinateRoot.append(placeCoordinate);document.querySelector('.inspector').prepend(coordinateRoot);
function cellObjects(x,z,y){const result=[];for(const key of ['blocks','tiles','walls','torches','drones','spawns','goals','plates','bridges','lifts','conveyors','spikes','portals','crates','archers','pickups'])model.map[key].forEach((p,index)=>{if(p&&p.x===x&&p.z===z&&(y===undefined||Math.abs((p.y??p.base??p.height??L.surfaceY(model.map,x,z)??0)-y)<.01))result.push({key,index,p});});return result;}
function field(card,label,value,options,onChange){
 const row=element('label',label),control=element(options?.values?'select':'input');
 if(options?.values)for(const [v,name] of options.values){const option=element('option',name);option.value=v;control.append(option);}
 else{control.type='number';control.min=options?.min??0;control.max=options?.max??3;control.step=options?.step??1;}
 control.id=`property-${card.dataset.object}-${card.querySelectorAll('input,select').length}`;
 control.value=value;control.setAttribute('aria-label',label);control.onchange=()=>{
  const focused=document.activeElement===control;
  onChange(options?.values?control.value:Number(control.value));
  // Property edits rebuild the inspector. Keep repeated key presses on the new input.
  if(focused)$(control.id)?.focus({preventScroll:true});
 };row.append(control);card.append(row);return control;
}
function renderProperties(){
 const root=$('properties');root.replaceChildren();$('selected-coords').textContent=selected?`${selected.x} / ${selected.y??0} / ${selected.z}`:'—';
 if(!selected){root.append(element('p','Выберите клетку на карте.','empty-state'));return;}
 const items=cellObjects(selected.x,selected.z,selected.y);
 for(const axis of ['x','y','z'])$('coordinate-'+axis).value=selected[axis]??0;
 if(!items.length){root.append(element('p','Пустота','empty-state'));return;}
 for(const {key,index,p} of items){
  const card=element('div',undefined,'object-card'),head=element('div',undefined,'object-head');
  card.dataset.object=`${key}-${index}`;
  let label=labels[key];if(key==='blocks'&&p.color!==undefined)label='Энергетический блок';if(key==='spawns'||key==='goals')label+=` · ${names[index]}`;if(key==='pickups')label=p.kind==='shield'?'Деревянный щит':'Железный меч';if(key==='walls'&&p.half<.4)label='Факел';
  head.append(element('span',key==='goals'?L.characters[index].glyph:key==='spawns'?'▣':key==='archers'?'☠':key==='pickups'?(p.kind==='shield'?'◈':'⚔'):'◇','marker'),element('span',label));card.append(head);
  const set=(property,value)=>edit(map=>{map[key][index][property]=value;});
  if(key==='blocks')for(const axis of ['x','y','z'])field(card,axis.toUpperCase(),p[axis],{min:axis==='y'?-2:0,max:axis==='y'?12:model.map.size-1},value=>{const q={...p,[axis]:value};try{if(model.move('blocks',index,q.x,q.z,q.y)){selected=q;changed();}}catch(error){toast(error.message);renderPanels();}});
  if(key==='blocks'){field(card,'Цвет блока',p.color??'',{values:[['','Обычный камень'],...L.characters.map((c,i)=>[String(i),c.name])]},v=>edit(map=>{if(v==='')delete map.blocks[index].color;else map.blocks[index].color=Number(v);}));if(p.color!==undefined)card.append(element('p',`Проходит только ${names[p.color]}. Ящики не проходят.`,'empty-state'));}
  if(key==='tiles')field(card,'Высота пола',p.height,{min:0,max:3},value=>edit(()=>model.paint('floor',p.x,p.z,{height:value})));
  if(key==='torches'){
   field(card,'Крепление факела',p.face,{values:torchFaces},v=>set('face',v));
   for(const axis of ['x','y','z'])field(card,'Факел · '+axis.toUpperCase(),p[axis],{min:axis==='y'?-2:0,max:axis==='y'?12:model.map.size-1},value=>{const q={...p,[axis]:value};try{if(model.move(key,index,q.x,q.z,q.y)){selected={x:q.x,y:q.y,z:q.z};changed();}}catch(error){toast(error.message);renderPanels();}});
  }
  if(key==='drones'){
   field(card,'Цвет луча',p.color,{values:L.characters.map((c,i)=>[String(i),c.name])},v=>set('color',Number(v)));
   field(card,'Цель дрона',p.target,{values:[['-1','Ближайшая желейка'],...L.characters.map((c,i)=>[String(i),c.name])]},v=>set('target',Number(v)));
   field(card,'Высота полёта',p.hover,{min:.6,max:6,step:.1},v=>set('hover',v));
   for(const axis of ['x','y','z'])field(card,'Дрон · '+axis.toUpperCase(),p[axis],{min:axis==='y'?-2:0,max:axis==='y'?12:model.map.size-1},value=>{const q={...p,[axis]:value};try{if(model.move(key,index,q.x,q.z,q.y)){selected={x:q.x,y:q.y,z:q.z};changed();}}catch(error){toast(error.message);renderPanels();}});
  }
  if(key==='plates'){field(card,'Цвет',p.color,{values:[['red','Красный'],['blue','Синий'],['amber','Золотой'],['dark','Каменный']]},v=>set('color',v));card.append(element('p',`Канал ${index+1} · мостов: ${model.map.bridges.filter(b=>b.plate===p.id).length}`,'empty-state'));}
  if(key==='bridges')field(card,'Кнопка',p.plate,{values:[['','Не выбрана'],...model.map.plates.map((b,i)=>[b.id,`К${i+1} · ${b.x}, ${b.z}`])]},v=>set('plate',v));
  if(key==='lifts'){field(card,'Нижний уровень',p.base,{min:-2,max:12},v=>edit(map=>{map.lifts[index].base=v;map.lifts[index].y=v;model.cube(p.x,v,p.z);}));field(card,'Верхний уровень',p.top,{min:-2,max:12},v=>set('top',v));}
  if(key==='spikes'){
   field(card,'Цвет шипов',p.color??'',{values:spikeColors},v=>edit(map=>{if(v==='')delete map.spikes[index].color;else map.spikes[index].color=Number(v);}));
   field(card,'Крепление шипов',p.face||'top',{values:spikeFaces},v=>edit(map=>{if(v==='top')delete map.spikes[index].face;else map.spikes[index].face=v;}));
   field(card,'Y крепления',p.y??L.surfaceY(model.map,p.x,p.z)??0,{min:-2,max:12},v=>{try{if(model.move('spikes',index,p.x,p.z,v)){selected={x:p.x,y:v,z:p.z};changed();}}catch(error){toast(error.message);renderPanels();}});
   field(card,'Задержка, сек',p.offset,{min:0,max:5.8,step:.1},v=>set('offset',v));
  }
  if(key==='portals'){
   field(card,'Цвет портала',p.color,{values:L.portalColors.map(p=>[p.id,p.name])},v=>set('color',v));
   const chain=model.map.portals.filter(q=>q.color===p.color),order=chain.indexOf(p)+1;
   field(card,'Порядок в цепочке',order,{min:1,max:chain.length},v=>{try{if(model.orderPortal(index,v)){changed();document.querySelector('#properties [data-object^="portals-"] input')?.focus({preventScroll:true});}}catch(error){toast(error.message);renderPanels();}});
   card.append(element('p',chain.length>1?`Переход ${order} → ${order%chain.length+1}`:'Добавьте ещё портал этого цвета.','empty-state'));
  }
  if(key==='conveyors'){
   field(card,'Направление ленты',`${p.dx},${p.dz}`,{values:[['0,-1','↑ Север'],['1,0','→ Восток'],['0,1','↓ Юг'],['-1,0','← Запад']]},v=>{beltDirection.value=v;edit(map=>{[map.conveyors[index].dx,map.conveyors[index].dz]=v.split(',').map(Number);});});
   field(card,'Скорость ленты, кл/с',p.speed,{min:.2,max:2.5,step:.1},v=>{beltSpeed.value=v;set('speed',v);});
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
 $('stats').replaceChildren(element('span',`${model.map.blocks.length} кубов`),element('span',`${Object.keys(L.limits).filter(k=>!['tiles','blocks'].includes(k)).reduce((n,k)=>n+model.map[k].length,0)} объектов`));for(const axis of ['x','z'])$('coordinate-'+axis).max=model.map.size-1;
 renderProperties();renderIssues();
}
function screenFrame(){const r=$('viewport').getBoundingClientRect();return S.frame(previewCamera,previewAngle,r.width,r.height,previewScale());}
function screenRay(event){const r=$('viewport').getBoundingClientRect();return S.ray(screenFrame(),event.clientX-r.left,event.clientY-r.top,r.width,r.height);}
function point(event){
 pickBounds??=S.boxes(model.map);const layer=Number($('brush-height').value),painting=!['select','erase','pan','orbit'].includes(tool)&&!event.shiftKey;
  if(gesture?.tool==='spikes'&&gesture.face&&gesture.face!=='top')return gesture.start;
  if(gesture?.tool==='torch')return gesture.start;
  if(!gesture&&painting&&placementMode.value==='layer'){const hit=S.plane(screenRay(event),layer);return hit?{x:Math.round(hit.position[0]),y:layer,z:Math.round(hit.position[2]),hit}:null;}
  const p=S.pick(screenRay(event),pickBounds,model.map.size,layer,gesture?.planeY??null);if(!p)return null;
  if(gesture){p.y=gesture.blockY;p.x+=gesture.offsetX||0;p.z+=gesture.offsetZ||0;return p;}
  p.y??=layer;
  if(painting&&tool==='spikes'){
   p.face=spikeFace.value==='auto'?(p.key==='spikes'?p.face:p.key==='blocks'&&p.hit.axis!==1?['west','east','north','south'][(p.hit.axis===2?2:0)+(p.hit.sign>0?1:0)]:'top'):spikeFace.value;
  }
  if(painting&&tool==='torch')p.face=torchFace.value==='auto'?(p.key==='torches'?p.face:p.key==='blocks'&&p.hit.axis!==1?['west','east','north','south'][(p.hit.axis===2?2:0)+(p.hit.sign>0?1:0)]:'south'):torchFace.value;
  if(p.key==='blocks'&&(painting&&cubeTool(tool)||moveObject?.key==='blocks')&&placementMode.value==='face'){if(p.hit.axis===0)p.x+=p.hit.sign;if(p.hit.axis===1)p.y+=p.hit.sign;if(p.hit.axis===2)p.z+=p.hit.sign;}
  return p;
}
function refreshHover(){if(lastPointer&&!gesture?.pan&&!gesture?.orbit)hover=point(lastPointer);$('cell-info').textContent=inside(hover)?`X ${hover.x} / Y ${hover.y??0} / Z ${hover.z}`:'X — / Y — / Z —';}
function inside(p){return p&&p.x>=0&&p.z>=0&&p.x<model.map.size&&p.z<model.map.size&&(p.y===undefined||p.y>=-2&&p.y<=12);}
function invalidate(){if(previewRenderer?.ready)drawSpatialOverlay();}
function paintCell(p,activeTool){const y=p.y??gesture?.blockY??Number($('brush-height').value);if(!inside({...p,y}))return;try{const [dx,dz]=beltDirection.value.split(',').map(Number),speed=Math.max(.2,Math.min(2.5,Number(beltSpeed.value)||.85));model.paint(activeTool,p.x,p.z,{height:y,y,voxel:true,dx,dz,speed,...(activeTool==='torch'?{face:gesture?.face||p.face||(torchFace.value==='auto'?'south':torchFace.value)}:{}),...(activeTool==='spikes'?{face:gesture?.face||p.face||(spikeFace.value==='auto'?'top':spikeFace.value),color:spikeColor.value===''?null:Number(spikeColor.value)}:{})});previewDirty=true;pickBounds=null;}catch(error){toast(error.message);}selected={x:p.x,y,z:p.z};}
function finishGesture(){
 if(!gesture)return;
 if(gesture.pan||gesture.orbit){gesture=null;$('viewport').classList.remove('camera-drag');refreshHover();invalidate();return;}
 if(gesture.rectangle&&inside(hover))for(let z=Math.min(gesture.start.z,hover.z);z<=Math.max(gesture.start.z,hover.z);z++)for(let x=Math.min(gesture.start.x,hover.x);x<=Math.max(gesture.start.x,hover.x);x++)paintCell({x,z},gesture.tool);
 const changedMap=model.commit();gesture=null;if(changedMap)changed();else{renderProperties();invalidate();}refreshHover();
}
$('viewport').addEventListener('pointerdown',event=>{
 if(![0,1,2].includes(event.button)||gesture)return;event.preventDefault();$('viewport').focus();lastPointer=event;const p=point(event);hover=p;
 if(event.button===2||tool==='orbit'||space||event.button===1||tool==='pan'){
  const orbit=!space&&event.button!==1&&(event.button===2||tool==='orbit');gesture={pan:!orbit,orbit,x:event.clientX,y:event.clientY};$('viewport').classList.add('camera-drag');$('viewport').setPointerCapture(event.pointerId);return;
 }
 if(!inside(p))return;
 selected={x:p.x,y:p.y,z:p.z};
 if(moveObject){try{if(model.move(moveObject.key,moveObject.index,p.x,p.z,p.y??Number($('brush-height').value)))changed();moveObject=null;selectTool('select');}catch(error){toast(error.message);}return;}
 const activeTool=event.button===2||event.shiftKey?'erase':tool;if(activeTool==='select'){renderProperties();invalidate();return;}
 model.begin();gesture={start:p,last:p,tool:activeTool,face:p.face,blockY:p.y??Number($('brush-height').value),planeY:p.hit?.position[1]??p.y,offsetX:p.hit?p.x-Math.round(p.hit.position[0]):0,offsetZ:p.hit?p.z-Math.round(p.hit.position[2]):0,rectangle:$('brush-shape').value==='rectangle'&&(cubeTool(activeTool)||['erase','conveyor'].includes(activeTool))};
 if(!gesture.rectangle)paintCell(p,activeTool);$('viewport').setPointerCapture(event.pointerId);invalidate();
});
$('viewport').addEventListener('pointermove',event=>{
 lastPointer=event;
 if(gesture?.orbit){previewTargetAngle-=(event.clientX-gesture.x)*.008;previewTargetPitch=Math.max(20,Math.min(85,previewTargetPitch+(event.clientY-gesture.y)*.25));gesture.x=event.clientX;gesture.y=event.clientY;return;}
 if(gesture?.pan){const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;gesture.x=event.clientX;gesture.y=event.clientY;
  panView(dx,dy,event.clientX,event.clientY);invalidate();return;
 }
 refreshHover();
 if(gesture&&!gesture.rectangle&&inside(hover)){const a=gesture.last,b=hover,steps=Math.max(Math.abs(a.x-b.x),Math.abs(a.z-b.z));for(let i=1;i<=steps;i++)paintCell({x:Math.round(a.x+(b.x-a.x)*i/steps),z:Math.round(a.z+(b.z-a.z)*i/steps)},gesture.tool);gesture.last=hover;}
 invalidate();
});
$('viewport').addEventListener('pointerup',finishGesture);$('viewport').addEventListener('pointercancel',finishGesture);$('viewport').addEventListener('lostpointercapture',finishGesture);
$('viewport').addEventListener('contextmenu',event=>event.preventDefault());$('viewport').addEventListener('pointerleave',()=>{if(!gesture){lastPointer=null;hover=null;invalidate();}});
$('viewport').addEventListener('wheel',event=>{event.preventDefault();previewZoom=Math.max(.5,Math.min(3,previewZoom*Math.exp(-event.deltaY*.001)));$('zoom-label').textContent=Math.round(previewZoom*100)+'%';refreshHover();},{passive:false});
function fit(){previewZoom=1;previewCamera.x=previewCamera.z=(model.map.size-1)/2;const ys=model.map.blocks.map(b=>b.y);previewFitHeight=ys.length?Math.max(...ys)-Math.min(...ys)+1:0;previewCamera.targetY=ys.length?(Math.max(...ys)+Math.min(...ys)-1)/2:0;$('zoom-label').textContent='100%';refreshHover();invalidate();}
function previewScale(){const r=$('viewport').getBoundingClientRect();return Math.min(r.width/(model.map.size*1.65),r.height/(model.map.size*1.3+previewFitHeight*.6))*previewZoom;}
function drawSpatialOverlay(){
 const canvas=$('spatial-overlay'),r=$('viewport').getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,2),w=Math.round(r.width*ratio),h=Math.round(r.height*ratio);
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
 const ctx=canvas.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,r.width,r.height);
 const frame=screenFrame(),project=p=>JellyGPU.projectPoint(frame,...p,r.width,r.height);
 function path(points,color,fill=null,dashed=false){
  const ps=points.map(project);if(ps.some(p=>!p.visible))return;ctx.beginPath();ps.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.setLineDash(dashed?[5,4]:[]);if(fill){ctx.fillStyle=fill;ctx.fill();}ctx.strokeStyle=color;ctx.stroke();
 }
 function square(p,y,color,fill=null,dashed=false){path([[p.x-.48,y,p.z-.48],[p.x+.48,y,p.z-.48],[p.x+.48,y,p.z+.48],[p.x-.48,y,p.z+.48]],color,fill,dashed);}
 const layer=Number($('brush-height').value),floor=(x,z)=>previewRuntime?.world.heightAt(x,z)??layer,occupiedLayer=new Set(model.map.blocks.filter(b=>b.y===layer).map(b=>`${b.x},${b.z}`));
 if(spatialGrid.checked){ctx.lineWidth=.7;for(let z=0;z<model.map.size;z++)for(let x=0;x<model.map.size;x++)if(!occupiedLayer.has(`${x},${z}`))square({x,z},layer,'#a7c9b124');}
 if($('connections').checked){
  ctx.lineWidth=1;const line=(a,b,color,arrow=false)=>{const ps=[a,b].map(p=>project([p.x,(p.y??floor(p.x,p.z))+.15,p.z]));if(ps.some(p=>!p.visible))return;ctx.beginPath();ctx.moveTo(ps[0].x,ps[0].y);ctx.lineTo(ps[1].x,ps[1].y);ctx.strokeStyle=color;ctx.setLineDash([4,5]);ctx.stroke();if(arrow){const angle=Math.atan2(ps[1].y-ps[0].y,ps[1].x-ps[0].x),x=ps[0].x+(ps[1].x-ps[0].x)*.65,y=ps[0].y+(ps[1].y-ps[0].y)*.65;ctx.setLineDash([]);ctx.beginPath();for(const side of [-1,1]){ctx.moveTo(x,y);ctx.lineTo(x-Math.cos(angle+side*.5)*8,y-Math.sin(angle+side*.5)*8);}ctx.stroke();}};
  for(const b of model.map.bridges){const p=model.map.plates.find(p=>p.id===b.plate);if(p)line(p,b,'#d4e9a88a');}
  for(const color of L.portalColors){const chain=model.map.portals.filter(p=>p.color===color.id);chain.forEach((p,i)=>{if(chain.length>1)line(p,chain[(i+1)%chain.length],color.color+'88',true);const q=project([p.x,(p.y??floor(p.x,p.z))+.2,p.z]);if(q.visible){ctx.fillStyle=color.color;ctx.font='12px Arial';ctx.fillText(`${i+1}→${chain.length>1?(i+1)%chain.length+1:'—'}`,q.x+8,q.y+14);}});}
 }
 ctx.lineWidth=2;
 if(selected)square(selected,(selected.y??floor(selected.x,selected.z))+.04,'#e2edb4','#d6eea714');
 if(gesture?.pan||gesture?.orbit||!inside(hover)||['pan','orbit'].includes(tool))return;
 const active=gesture?.tool||tool,isErase=active==='erase',color=isErase?'#f2a78b':tools[active]?.color||'#ceecaa',fill=isErase?'#ef8c732b':color+'24';
 if(active==='drone'||moveObject?.key==='drones'){
  const d=moveObject?model.map.drones[moveObject.index]:{hover:1.8,color:3},y=(hover.y??layer)+d.hover,x=hover.x,z=hover.z;
  path([[x,y-.55,z],[x-.22,y,z],[x,y+.55,z],[x+.22,y,z]],colors[d.color],fill,true);path([[x,y,z-.22],[x,y+.55,z],[x,y,z+.22],[x,y-.55,z]],colors[d.color],null,true);return;
 }
 if(active==='torch'||moveObject?.key==='torches'){
  const torch=moveObject?{...model.map.torches[moveObject.index],...hover}:{...hover,face:hover.face||(torchFace.value==='auto'?'south':torchFace.value)},f=L.torchFrame({...torch,y:torch.y??layer});
  const local=(u,y,n)=>f.origin.map((p,k)=>p+f.u[k]*u+(k===1?y:0)+f.n[k]*n);
  path([local(-.1,-.27,.04),local(.1,-.27,.04),local(.1,.17,.04),local(-.1,.17,.04)],color,null,true);path([local(0,-.23,.15),local(0,.1,.25),local(0,.47,.25)],'#efbd72',null,true);return;
 }
 if(active==='spikes'||moveObject?.key==='spikes'){
  const trap=moveObject?{...model.map.spikes[moveObject.index],...hover}:{...hover,face:hover.face||(spikeFace.value==='auto'?'top':spikeFace.value)},f=JellyLevelFeatures.spikeFrame(trap,trap.y??layer);
  const projectLocal=(u,n,v)=>f.origin.map((p,k)=>p+f.u[k]*u+f.n[k]*n+f.v[k]*v),tint=moveObject?(trap.color===undefined?'#d4dbe5':colors[trap.color]):spikeColor.value===''?'#d4dbe5':colors[Number(spikeColor.value)];
  for(const u of [-.21,.21])for(const v of [-.21,.21]){const rim=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z])=>projectLocal(u+x*.132,.012,v+z*.132));path(rim,tint,null,true);for(const sign of [-1,1])path([projectLocal(u+sign*.075,.015,v-.075),projectLocal(u,.255,v),projectLocal(u+sign*.075,.015,v+.075)],tint,null,true);}return;
 }
 if(gesture?.rectangle){for(let z=Math.min(gesture.start.z,hover.z);z<=Math.max(gesture.start.z,hover.z);z++)for(let x=Math.min(gesture.start.x,hover.x);x<=Math.max(gesture.start.x,hover.x);x++)square({x,z},gesture.blockY+.04,color,fill,true);return;}
 const y=hover.y??layer;square(hover,y+.045,color,fill,active!=='select');
 const height=active==='crate'||active.startsWith('spawn-')?.84:active==='archer'?1.2:cubeTool(active)||moveObject?.key==='blocks'?1:moveObject?.key==='crates'?.84:0;
 if(height){const cube=cubeTool(active)||moveObject?.key==='blocks',top=cube?y+.045:y+height,base=cube?y-1:y;for(const dx of [-.46,.46])for(const dz of [-.46,.46])path([[hover.x+dx,base,hover.z+dz],[hover.x+dx,top,hover.z+dz]],color,null,true);square(hover,top,color,null,true);}
}
function rebuildPreview(){
 previewRuntime=L.instantiate(model.map,JellyPhysics,JellySoftBody);previewRuntime.effects=new JellyEffects.System({reducedMotion:true});previewRuntime.won=false;previewRuntime.reducedMotion=true;
 previewRuntime.world.featureTime=1;previewRuntime.bridges.forEach(b=>b.progress=1);
 previewRuntime.world.droneBeams=previewRuntime.world.traceDrones(previewRuntime.bodies,previewRuntime.soft);
 previewRenderer.bridgeKey=undefined;previewRenderer.decorationKey=undefined;previewRenderer.propGeometryKey=undefined;previewRenderer.goalGlowStrength=[];previewRenderer.goalWinGlow=0;previewDirty=false;
}
function previewTick(t){
 previewFrame=0;if(!previewRenderer?.ready)return;const dt=Math.min(.05,(t-previewLast)/1000||.016);previewLast=t;
 if(previewDirty)rebuildPreview();previewRenderer.colliders=$('preview-colliders').checked;previewRenderer.render(previewRuntime,previewRuntime.players,previewCamera,previewAngle,reducedMotion?0:t/1000,previewScale(),dt);drawSpatialOverlay();previewFrame=requestAnimationFrame(previewTick);
}
function panView(dx,dy,clientX,clientY){
  const r=$('viewport').getBoundingClientRect();clientX??=r.left+r.width/2;clientY??=r.top+r.height/2;
  const a=S.plane(screenRay({clientX:clientX-dx,clientY:clientY-dy}),previewCamera.targetY||0),b=S.plane(screenRay({clientX,clientY}),previewCamera.targetY||0);
  if(a&&b){previewCamera.x+=a.position[0]-b.position[0];previewCamera.z+=a.position[2]-b.position[2];}
}
function cameraTick(t){
 const dt=Math.min(.05,(t-cameraLast)/1000||.016);cameraLast=t;
 const angleDelta=previewTargetAngle-previewAngle,pitchDelta=previewTargetPitch-previewCamera.pitch;
 let moved=false;
 if(Math.abs(angleDelta)>1e-6||Math.abs(pitchDelta)>1e-6){
  const blend=reducedMotion?1:1-Math.exp(-dt*11);
  previewAngle=Math.abs(angleDelta)<.0001?previewTargetAngle:previewAngle+angleDelta*blend;
  previewCamera.pitch=Math.abs(pitchDelta)<.0001?previewTargetPitch:previewCamera.pitch+pitchDelta*blend;moved=true;
 }
 if(panKeys.size&&!editingField(document.activeElement)&&(!gesture||gesture.pan||gesture.orbit)){
  const x=Number(panKeys.has('KeyD')||panKeys.has('ArrowRight'))-Number(panKeys.has('KeyA')||panKeys.has('ArrowLeft'));
  const y=Number(panKeys.has('KeyS')||panKeys.has('ArrowDown'))-Number(panKeys.has('KeyW')||panKeys.has('ArrowUp'));
  const length=Math.hypot(x,y);if(length){panView(-x/length*320*dt,-y/length*320*dt);moved=true;}
 }
 if(moved){refreshHover();invalidate();}
 requestAnimationFrame(cameraTick);
}
async function initPreview(){
 $('gpu-message').hidden=false;$('gpu-message').textContent='Загружаем 3D…';
 try{
  previewRenderer=new JellyGPU.Renderer($('preview'),JellySoftBody);previewRenderer.onFailure=message=>{$('gpu-message').hidden=false;$('gpu-message').textContent=message;};
  previewPromise=previewRenderer.init();await previewPromise;$('gpu-message').hidden=true;if(!previewFrame)previewFrame=requestAnimationFrame(previewTick);
 }catch(error){$('gpu-message').hidden=false;$('gpu-message').textContent=error.message;}
}
function turnCamera(delta){previewTargetAngle+=delta;}
$('fit').onclick=fit;$('rotate-left').onclick=()=>turnCamera(-Math.PI/2);$('rotate-right').onclick=()=>turnCamera(Math.PI/2);
$('connections').onchange=invalidate;$('brush-height').onchange=()=>{refreshHover();invalidate();};
$('undo').onclick=()=>{finishGesture();if(model.undo()){moveObject=null;selected=null;changed();}};$('redo').onclick=()=>{if(model.redo()){selected=null;changed();}};
$('level-name').onchange=event=>edit(map=>{map.name=event.target.value.trim()||'Без названия';});
$('map-size').replaceChildren(...Array.from({length:9},(_,i)=>{const option=element('option',`${i+8} × ${i+8}`);option.value=i+8;return option;}));
$('map-size').onchange=event=>{if(model.resize(Number(event.target.value))){selected=null;changed();fit();}};
function replaceMap(map){finishGesture();if(model.load(L.voxelize(map))){selected=null;moveObject=null;expandedIssues=false;changed();fit();}}
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
 if(event.target.matches('input[type="number"]')&&['ArrowUp','ArrowDown'].includes(event.code)&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
  event.preventDefault();const input=event.target,step=Number.isInteger(Number(input.step||1))?1:.1;
  const value=Math.round(((Number(input.value)||0)+(event.code==='ArrowUp'?step:-step))*1e10)/1e10;
  const next=Math.max(input.min===''?-Infinity:Number(input.min),Math.min(input.max===''?Infinity:Number(input.max),value));
  if(next!==Number(input.value)||input.value===''){input.value=next;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}return;
 }
 if(editingField(event.target))return;
 if((event.ctrlKey||event.metaKey)&&event.code==='KeyZ'){event.preventDefault();(event.shiftKey?$('redo'):$('undo')).click();return;}
 if((event.ctrlKey||event.metaKey)&&event.code==='KeyY'){event.preventDefault();$('redo').click();return;}
 if(event.ctrlKey||event.metaKey||event.altKey)return;
 if(panCodes.has(event.code)){event.preventDefault();panKeys.add(event.code);return;}
 if(event.code==='Space'&&event.target.closest('button,a'))return;
 if(event.code==='Space'){event.preventDefault();space=true;}
 if(event.code==='Escape'){moveObject=null;selectTool('select');}
 if(event.code==='KeyF'){event.preventDefault();fit();}
 if(event.code==='KeyV')selectTool('select');if(event.code==='KeyB')selectTool('floor');if(event.code==='KeyX')selectTool('erase');if(event.code==='KeyM')selectTool('pan');
 if(!event.repeat&&event.code==='KeyQ')turnCamera(-Math.PI/2);if(!event.repeat&&event.code==='KeyE')turnCamera(Math.PI/2);
 if(event.code==='Delete'&&selected){edit(()=>model.erase(selected.x,selected.z,selected.y));}
});
addEventListener('keyup',event=>{panKeys.delete(event.code);if(event.code==='Space')space=false;});
addEventListener('focusin',event=>{if(editingField(event.target)){panKeys.clear();space=false;}});
function releaseCameraKeys(){panKeys.clear();space=false;finishGesture();}
addEventListener('blur',releaseCameraKeys);document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseCameraKeys();});
new ResizeObserver(()=>{refreshHover();invalidate();}).observe($('viewport'));
selectTool('select');renderPanels();fit();requestAnimationFrame(cameraTick);initPreview();if(startupError){$('save-status').textContent='Черновик не открыт';toast(startupError);}
