/* Translate editor presentation only. Map data and editable input values stay untouched. */
import {i18n as JellyI18n} from './i18n.js';

export let editorI18n=null;

export function initEditorI18n(){
 const entries=`
Редактор|Editor
МАСТЕРСКАЯ|WORKSHOP
Название уровня|Level name
Сохранено|Saved
Не сохранено|Not saved
Отменить|Undo
Повторить|Redo
Импорт|Import
Экспорт|Export
Играть|Play
ПАЛИТРА|PALETTE
Выбрать|Select
Ластик|Eraser
Высота кисти|Brush height
Форма кисти|Brush shape
Кисть|Brush
Прямоугольник|Rectangle
Вписать карту|Fit map
Вписать|Fit
Повернуть влево|Rotate left
Повернуть вправо|Rotate right
Связи|Connections
Рабочая область редактора|Editor workspace
Трёхмерный редактор уровня|3D level editor
РЕДАКТОР|EDITOR
Выбор|Selection
ЛКМ|LMB
ПКМ|RMB
кисть|paint
стереть|erase
вращать|rotate
сдвиг|pan
вид|view
КЛЕТКА|CELL
Выберите клетку на карте.|Select a cell on the map.
УРОВЕНЬ|LEVEL
Новая карта|New map
Проверить уровень|Validate level
Спавны|Spawns
Финиши|Goals
Блоки|Blocks
Декор|Decor
Порталы|Portals
Механизмы|Mechanisms
Объекты|Objects
Каменный куб|Stone cube
Настенный факел|Wall torch
Кристаллический дрон|Crystal drone
Кнопка|Pressure plate
Мост|Bridge
Лифт|Lift
Конвейер|Conveyor
Шипы|Spikes
Ящик|Crate
Лучник|Archer
Щит|Shield
Меч|Sword
Перемещение вида|Pan view
Вращение камеры|Orbit camera
правая кнопка мыши|right mouse button
Переместить|Move
Янтарь|Amber
Мох|Moss
Иней|Frost
Уголёк|Ember
Аметист|Amethyst
Зелёная|Green
Синяя|Blue
Красная|Red
Фиолетовая|Violet
Золотая|Gold
Каменная|Stone
Зелёный|Green
Синий|Blue
Красный|Red
Фиолетовый|Violet
Золотой|Gold
Каменный|Stone
Камень|Stone
Стена|Wall
Спавн|Spawn
Финиш|Goal
Портал|Portal
Скелет-лучник|Skeleton archer
Предмет|Item
Коллайдеры|Colliders
Проекция камеры|Camera projection
Изометрия|Isometric
Перспектива|Perspective
Сетка|Grid
Уменьшить масштаб|Zoom out
Увеличить масштаб|Zoom in
Лента|Belt
кл/с|cells/s
Скорость конвейера|Conveyor speed
Нейтральный|Neutral
Крепление шипов|Spike attachment
Цвет шипов|Spike color
Крепление факела|Torch attachment
Способ размещения|Placement mode
По грани автоматически|Automatic face
По грани|On face
На слое|On layer
Координата|Coordinate
Пол · вверх|Floor · up
Север|North
Восток|East
Юг|South
Запад|West
Пустота|Empty
Энергетический блок|Energy block
Деревянный щит|Wooden shield
Железный меч|Iron sword
Факел|Torch
Цвет|Color
Цвет блока|Block color
Янтарный|Amber
Обычный камень|Plain stone
Проходит только|Only passes
Ящики не проходят.|Crates cannot pass.
Высота пола|Floor height
Цвет луча|Beam color
Цель дрона|Drone target
Ближайшая желейка|Nearest jelly
Высота полёта|Hover height
Дрон|Drone
Группа:|Group:
триггеров:|triggers:
Группа кнопок|Pressure plate group
Не выбрана|None
Нижний уровень|Lower level
Верхний уровень|Upper level
крепления|attachment
Без кнопки|No pressure plate
Кнопка удалена|Pressure plate removed
Цикл, сек (0 — постоянно)|Cycle, s (0 — constant)
Включены|Enabled
Сдвиг цикла, сек|Cycle offset, s
Нажата кнопка — шипы выдвинуты.|Spikes extend while the plate is pressed.
Постоянное состояние задаётся флажком.|The checkbox sets the constant state.
Флажок задаёт начальное состояние цикла.|The checkbox sets the initial cycle state.
Цвет портала|Portal color
Порядок в цепочке|Chain order
Переход|Transition
Добавьте ещё портал этого цвета.|Add another portal of this color.
Направление ленты|Belt direction
Скорость ленты, кл/с|Belt speed, cells/s
Направление|Direction
Выстрел каждые, с|Shot interval, s
Первый выстрел, с|First shot, s
Перенести|Move
Выберите новую клетку|Select a new cell
отмена|cancel
Убрать пол|Remove floor
Удалить|Delete
Замечания:|Issues:
Можно играть|Ready to play
Персонажей:|Characters:
У каждого есть финиш. Связи настроены.|Each has a goal. Connections are configured.
Ещё|More
кубов|cubes
объектов|objects
Загружаем|Loading
Черновик не открыт|Draft not loaded
Черновик не удалось открыть:|Could not open draft:
Не удалось сохранить в браузере. Используйте экспорт файла.|Could not save in this browser. Export the file instead.
Карта кампании|Campaign map
Открыть карту|Open map
Уровень готов к запуску.|The level is ready to play.
Уровень экспортирован.|Level exported.
Уровень импортирован.|Level imported.
Файл слишком большой (максимум 1 МБ).|File is too large (maximum 1 MB).
Импорт не выполнен:|Import failed:
Перед запуском исправьте замечания в панели уровня.|Fix the issues in the level panel before playing.
Не удалось подготовить запуск:|Could not prepare level test:
Слой Y должен быть целым от −2 до 12.|Y layer must be an integer from −2 to 12.
Достигнут лимит каменных кубов.|Stone cube limit reached.
На карте уже восемь дронов.|The map already has eight drones.
Факел крепится к боковой грани.|Attach the torch to a side face.
На карте уже восемь факелов.|The map already has eight torches.
Факелу нужен обычный каменный блок.|A torch needs a plain stone block.
Достигнут лимит объектов.|Object limit reached.
Достигнут лимит объектов|Object limit reached
Проверьте номер портала в цепочке.|Check the portal number in the chain.
В этой клетке уже есть такой объект.|This cell already contains an object of this type.
должен быть целым.|must be an integer.
Нужен файл уровня Jelly & Bones версии 1.|A Jelly & Bones version 1 level file is required.
Недопустимый размер карты.|Invalid map size.
Недопустимое числовое свойство объекта.|Invalid numeric object property.
Неверный идентификатор объекта.|Invalid object ID.
Координаты X и Z должны быть целыми.|X and Z coordinates must be integers.
Слишком много объектов:|Too many objects:
Два объекта одного типа в одной клетке:|Two objects of the same type in one cell:
Координата Y куба должна быть целой.|The cube Y coordinate must be an integer.
Цвет куба должен соответствовать одному из персонажей.|Cube color must match a character.
Для факела укажите целый Y блока крепления.|Set an integer attachment block Y coordinate for the torch.
Выберите боковую грань крепления факела.|Select a side face for the torch.
На карте может быть не более восьми факелов.|A map can contain at most eight torches.
Допустимо от одного до пяти слотов персонажей.|One to five character slots are allowed.
Идентификаторы кнопок должны быть уникальными.|Pressure plate IDs must be unique.
Неизвестная сторона крепления шипов.|Unknown spike attachment face.
Неизвестный цвет шипов.|Unknown spike color.
Для настенных шипов укажите целый Y блока крепления.|Set an integer attachment block Y coordinate for wall spikes.
Состояние шипов должно быть вкл/выкл.|Spike state must be on or off.
Неверная кнопка шипов.|Invalid spike pressure plate.
Неизвестный цвет портала.|Unknown portal color.
Неизвестный цвет луча дрона.|Unknown drone beam color.
Неизвестная цель дрона.|Unknown drone target.
Конвейер должен двигаться вдоль сетки.|The conveyor must move along the grid.
Лучник должен смотреть вдоль сетки.|The archer must face along the grid.
Неизвестный предмет.|Unknown item.
Идентификаторы предметов должны быть уникальными.|Item IDs must be unique.
Добавьте хотя бы одного персонажа.|Add at least one character.
не установлен.|is missing.
должен стоять на постоянной площадке.|must stand on permanent ground.
куб провалится сквозь площадку своего цвета.|the cube will fall through ground of its own color.
перекрыт другим объектом.|is blocked by another object.
не должен находиться на конвейере.|must not be on a conveyor.
недостаточно места над кубом.|not enough space above the cube.
Спавны персонажей должны находиться в разных клетках.|Character spawns must occupy different cells.
Финиши должны находиться в разных клетках.|Goals must occupy different cells.
портал: нужно минимум два одного цвета.|portal: at least two of the same color are required.
не привязан к кнопке.|is not linked to a pressure plate.
связанная кнопка не найдена.|linked pressure plate not found.
Верх лифта|Lift top
должен быть выше основания.|must be above its base.
Настенным шипам|Wall spikes at
нужен блок крепления.|need an attachment block.
Нет пола под объектом|No floor beneath object at
Объект|Object
перекрыт стеной.|is blocked by a wall.
стоит на мосту.|stands on a bridge.
перекрыт другим механизмом.|is blocked by another mechanism.
Факелу|Torch at
нужен каменный блок крепления.|needs a stone attachment block.
выбранная цель не участвует в уровне.|the selected target is not in the level.
находится внутри камня.|is inside stone.
`;
 const pairs=entries.trim().split('\n').map(line=>line.split('|'));
 // Headings are generated in uppercase by the palette.
 for(const [ru,en] of [...pairs])pairs.push([ru.toUpperCase(),en.toUpperCase()]);
 const dictionary=new Map(pairs),keys=[...dictionary.keys()].sort((a,b)=>b.length-a.length);
 const pattern=new RegExp(keys.map(key=>key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g');
 function translate(text){return JellyI18n.language==='ru'?text:text.replace(pattern,key=>dictionary.get(key));}
 const textRecords=new WeakMap(),attributeRecords=new WeakMap();
 function localizeValue(node,attribute){
  const value=attribute?node.getAttribute(attribute):node.textContent;if(value===null)return;
  let records=attribute?attributeRecords.get(node):textRecords.get(node);
  if(!records){records={};(attribute?attributeRecords:textRecords).set(node,records);}
  const key=attribute||'text',previous=records[key];
  const source=previous&&value===previous.result?previous.source:value,result=translate(source);
  records[key]={source,result};
  if(value!==result){if(attribute)node.setAttribute(attribute,result);else node.textContent=result;}
 }
 function apply(root=document.documentElement){
  if(!JellyI18n)return;
  if(root.nodeType===Node.TEXT_NODE){if(!root.parentElement?.closest('script,style,textarea,[data-level-name]'))localizeValue(root);return;}
  if(root.nodeType!==Node.ELEMENT_NODE||root.closest('script,style,textarea,[data-level-name]'))return;
  for(const attr of ['title','aria-label','placeholder'])localizeValue(root,attr);
  for(const child of root.childNodes)apply(child);
 }
 const switcher=document.createElement('div');switcher.className='editor-languages';switcher.setAttribute('role','group');switcher.setAttribute('aria-label','Language');
 for(const [code,name] of [['en','English'],['ru','Русский']]){const button=document.createElement('button');button.type='button';button.dataset.language=code;button.textContent=code.toUpperCase();button.setAttribute('aria-label',name);switcher.append(button);}
 document.querySelector('.actions').prepend(switcher);
 addEventListener('languagechange',()=>apply());
 const observer=new MutationObserver(changes=>{
  observer.disconnect();
  for(const change of changes){if(change.type==='childList')change.addedNodes.forEach(node=>apply(node));else apply(change.target);}
  observe();
 });
 function observe(){observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['title','aria-label','placeholder']});}
 observe();document.addEventListener('DOMContentLoaded',()=>apply(),{once:true});
 return editorI18n={apply,translate,source:(node,attribute)=>attributeRecords.get(node)?.[attribute]?.source??node.getAttribute(attribute)};
}
