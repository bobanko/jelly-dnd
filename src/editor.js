import JellyLevels from './world/levels.js';
import { i18n as JellyI18n } from './i18n/i18n.js';
import * as JellyGPU from './renderer/index.js';
import * as JellySoftBody from './world/soft-body.js';
import * as JellyPhysics from './world/physics.js';
import * as JellyEffects from './game/game-effects.js';
import * as JellyEditorModel from './editor/editor-model.js';
import * as JellyEditorSpace from './editor/editor-space.js';
import * as JellyLevelFeatures from './world/level-features.js';
import * as JellyLevelCatalog from '../levels/catalog.js';
import * as LevelCamera from './camera/level-camera.js';
import * as SharedCamera from './camera/shared-camera.js';
import { editorI18n as JellyEditorI18n } from './editor/editor-i18n.js';

const L = JellyLevels,
  M = JellyEditorModel,
  S = JellyEditorSpace,
  $ = (id) => document.getElementById(id);
let startupError = '';
const filenameKey = 'jelly-dnd.editor.filename';
let sourceFilename = JellyLevelCatalog?.standard[0] || null;
let initial = L.standardLevel(1);
try {
  const saved = localStorage.getItem(L.DRAFT_KEY);
  if (saved) {
    initial = L.read(saved);
    sourceFilename = localStorage.getItem(filenameKey) || null;
  }
} catch (error) {
  startupError = 'Черновик не удалось открыть: ' + error.message;
}
const model = new M.Model(L.voxelize(initial));
const phaseSymbols = ['△', '⊙', '◇', '☼', 'ᛞ'];
const groups = [
  ['Спавны', L.characters.map((p, i) => ['spawn-' + i, '▣', p.name, p.color])],
  ['Финиши', L.characters.map((p, i) => ['goal-' + i, p.glyph, p.name, p.color])],
  [
    'Блоки',
    [
      ['floor', '▣', 'Каменный куб'],
      ...L.characters.map((p, i) => ['color-' + i, phaseSymbols[i], p.name, p.color]),
      ['lava', '≋', 'Лава', '#ff6a1a'],
    ],
  ],
  ['Декор', [['torch', '♨', 'Настенный факел', '#f7ba60']]],
  ['Порталы', L.portalColors.map((p) => ['portal-' + p.id, '◎', p.name, p.color])],
  [
    'Механизмы',
    [
      ['plate', '⊙', 'Кнопка', '#ef5346'],
      ['bridge', '≋', 'Мост', '#cba778'],
      ['lift', '↥', 'Лифт', '#cba778'],
      ['conveyor', '»', 'Конвейер', '#d8bb72'],
      ['spikes', '▲', 'Шипы', '#c2ced0'],
    ],
  ],
  [
    'Объекты',
    [
      ['crate', '⊠', 'Малый ящик', '#cba778'],
      ['crate-large', '⧈', 'Большой ящик', '#a98552'],
      ['archer', '☠', 'Лучник', '#ded3b2'],
      ['drone', '♜', 'Кристаллический дрон', '#c98cff'],
      ['shield', '◈', 'Щит', '#cba778'],
      ['sword', '⚔', 'Меч', '#c2ced0'],
    ],
  ],
];
const tools = Object.fromEntries(
  groups.flatMap((g) => g[1]).map(([id, glyph, label, color]) => [id, { glyph, label, color }]),
);
Object.assign(tools, {
  select: { glyph: '↖', label: 'Выбор' },
  erase: { glyph: '⌫', label: 'Ластик' },
  pan: { glyph: '✥', label: 'Перемещение вида' },
  orbit: { glyph: '⟳', label: 'Вращение камеры' },
});
const names = L.characters.map((p) => p.name),
  colors = L.characters.map((p) => p.color);
const plateGroupNames = {
  green: 'Зелёная',
  blue: 'Синяя',
  red: 'Красная',
  violet: 'Фиолетовая',
  amber: 'Золотая',
  dark: 'Каменная',
};
const plateGroup = (value) => model.map.plates.find((p) => p.id === value)?.color || value;
const plateGroupValue = plateGroup;
const plateGroupOptions = () =>
  model.map.plates
    .filter((p, i, all) => all.findIndex((q) => q.color === p.color) === i)
    .map((p) => [p.color, plateGroupNames[p.color] || p.color]);
const cubeTool = (value) => value === 'floor' || value === 'lava' || /^color-[0-4]$/.test(value);
const labels = {
  blocks: 'Каменный куб',
  tiles: 'Камень',
  walls: 'Стена',
  torches: 'Настенный факел',
  drones: 'Кристаллический дрон',
  spawns: 'Спавн',
  goals: 'Финиш',
  plates: 'Кнопка',
  bridges: 'Мост',
  lifts: 'Лифт',
  conveyors: 'Конвейер',
  spikes: 'Шипы',
  portals: 'Портал',
  crates: 'Малый ящик',
  archers: 'Скелет-лучник',
  pickups: 'Предмет',
};
let tool = 'floor',
  selected = null,
  hover = null,
  moveObject = null,
  gesture = null,
  space = false,
  expandedIssues = false,
  toastTimer;
const view3d = true;
let previewZoom = 1,
  previewAngle = model.map.camera ? LevelCamera.angle(model.map) : 0,
  previewDirty = true,
  previewRuntime = null,
  previewRenderer = null,
  previewPromise = null,
  previewLast = 0,
  previewFrame = 0;
let pickBounds = null,
  lastPointer = null,
  spatialCells = null;
const previewCamera = {
  x: (model.map.size - 1) / 2,
  z: (model.map.size - 1) / 2,
  mode: 'perspective',
  pitch: model.map.camera?.pitch ?? 50,
  fov: 45,
};
let previewTargetAngle = previewAngle,
  previewTargetPitch = previewCamera.pitch,
  cameraLast = 0;
let startViewPreview = null;
let fpsLast = 0,
  fpsElapsed = 0,
  fpsFrames = 0;
const panKeys = new Set(),
  panCodes = new Set([
    'KeyW',
    'KeyA',
    'KeyS',
    'KeyD',
    'ArrowUp',
    'ArrowLeft',
    'ArrowDown',
    'ArrowRight',
  ]);
const editingField = (target) =>
  target?.closest('input,select,textarea,[contenteditable]:not([contenteditable="false"])');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function toolIcon(id, glyph) {
  const icon = element('span', undefined, 'glyph');
  icon.setAttribute('aria-hidden', 'true');
  const cube =
    '<path d="M16 3 29 10 16 17 3 10Z" fill="currentColor" fill-opacity=".55"/><path d="M3 10v14l13 7V17Z" fill="currentColor" fill-opacity=".3"/><path d="m16 17 13-7v14l-13 7Z" fill="currentColor" fill-opacity=".18"/><path d="m16 3 13 7v14l-13 7-13-7V10Zm0 14v14M3 10l13 7 13-7" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>';
  let drawing = '';
  if (id === 'spikes')
    drawing =
      '<path d="M3 27 7 9l4 18 5-23 5 23 4-18 4 18Z" fill="currentColor" fill-opacity=".8" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M3 28h26v4H3Z" fill="currentColor" fill-opacity=".4" stroke="currentColor" stroke-width="1.3"/>';
  if (id === 'floor' || id === 'lava' || id.startsWith('color-'))
    drawing =
      cube +
      (id === 'floor'
        ? ''
        : '<text x="22" y="25" fill="currentColor" font-size="12" text-anchor="middle">' +
          glyph +
          '</text>');
  else if (id === 'crate-large')
    // Heavy crate: a full cube with braced boards and iron corner caps.
    drawing =
      cube +
      '<path d="M3 11 16 30M16 18 3 23M16 30 29 11M16 18l13 5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-opacity=".75"/>' +
      [
        [16, 3],
        [3, 10],
        [29, 10],
        [16, 17],
        [3, 24],
        [29, 24],
        [16, 31],
      ]
        .map(
          ([x, y]) => `<rect x="${x - 2}" y="${y - 2}" width="4" height="4" fill="currentColor"/>`,
        )
        .join('');
  else if (id.startsWith('spawn-'))
    drawing =
      cube +
      '<path d="M8 15c-3-1-4 0-4 3 0 2 1 4 2 5v3l5 3v-3c2 0 3-1 3-3 0-3-2-6-6-8Z" fill="currentColor"/><path d="m6 19 2 1v3l-2-1Zm4 2 2 1v3l-2-1Z" fill="#142023"/>';
  else if (id.startsWith('goal-'))
    drawing =
      '<path d="m16 9 14 8-14 8-14-8Z" fill="currentColor" fill-opacity=".22" stroke="currentColor" stroke-width="1.4"/><path d="M2 17v5l14 8 14-8v-5M16 25v5" fill="none" stroke="currentColor" stroke-opacity=".6"/><text x="16" y="19" fill="currentColor" font-size="15" text-anchor="middle">' +
      glyph +
      '</text>';
  else if (id.startsWith('portal-'))
    drawing =
      '<ellipse cx="16" cy="23" rx="13" ry="6" fill="currentColor" fill-opacity=".2" stroke="currentColor" stroke-width="1.8"/><ellipse cx="16" cy="17" rx="9" ry="4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-opacity=".65"/><ellipse cx="16" cy="10" rx="6" ry="2.5" fill="none" stroke="currentColor" stroke-opacity=".35"/><path d="M13 23q6-5 10 0t-12 2" fill="none" stroke="currentColor" stroke-width="1.5"/>';
  if (drawing) icon.innerHTML = '<svg viewBox="0 0 32 34" focusable="false">' + drawing + '</svg>';
  else icon.textContent = glyph;
  return icon;
}
function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('toast').hidden = true), 5000);
}
function save() {
  try {
    localStorage.setItem(L.DRAFT_KEY, JSON.stringify(model.map));
    if (sourceFilename) localStorage.setItem(filenameKey, sourceFilename);
    else localStorage.removeItem(filenameKey);
    $('save-status').textContent = '● Сохранено';
    $('save-status').className = 'valid';
    return true;
  } catch (error) {
    $('save-status').textContent = 'Не сохранено';
    $('save-status').className = 'invalid';
    toast('Не удалось сохранить в браузере. Используйте экспорт файла.');
    return false;
  }
}
function changed() {
  stopStartViewPreview();
  previewDirty = true;
  pickBounds = null;
  spatialCells = null;
  save();
  renderPanels();
  invalidate();
}
function edit(fn) {
  try {
    if (model.change(fn)) changed();
    else renderPanels();
  } catch (error) {
    toast(error.message);
    renderPanels();
  }
}
function selectTool(value) {
  stopStartViewPreview();
  finishGesture();
  tool = value;
  moveObject = null;
  for (const button of document.querySelectorAll('[data-tool]'))
    button.setAttribute('aria-pressed', String(button.dataset.tool === tool));
  $('active-tool').textContent = tools[tool]?.label || 'Переместить';
  $('conveyor-brush').hidden = tool !== 'conveyor';
  $('bridge-brush').hidden = tool !== 'bridge';
  $('spike-brush').hidden = tool !== 'spikes';
  $('torch-brush').hidden = tool !== 'torch';
  refreshHover();
  invalidate();
}
for (const [name, items] of groups) {
  const group = element('section', undefined, 'tool-group');
  group.append(element('h2', name.toUpperCase()));
  const grid = element('div', undefined, 'tool-grid');
  for (const [id, glyph, label, color] of items) {
    const button = element('button', undefined, 'tool'),
      description = name + ' · ' + label;
    button.dataset.tool = id;
    button.title = description;
    button.setAttribute('aria-label', description);
    button.style.setProperty('--tool-color', color || '#a7bba4');
    button.append(toolIcon(id, glyph));
    grid.append(button);
  }
  group.append(grid);
  $('palette').append(group);
}
const panButton = element('button', '✥');
panButton.dataset.tool = 'pan';
panButton.title = 'Перемещение вида (M)';
panButton.setAttribute('aria-label', 'Перемещение вида');
document.querySelector('.basic-tools').append(panButton);
const orbitButton = element('button', '⟳');
orbitButton.dataset.tool = 'orbit';
orbitButton.title = 'Вращение камеры · правая кнопка мыши';
orbitButton.setAttribute('aria-label', 'Вращение камеры');
document.querySelector('.basic-tools').append(orbitButton);
// Native title tooltips cannot render keyboard keycaps.
for (const [i, button] of [...document.querySelectorAll('button[title]')].entries()) {
  const match = /^(.*?) \((Ctrl\+[ZY]|[VXFM])\)$/.exec(JellyEditorI18n.source(button, 'title'));
  if (!match) continue;
  const tooltip = element('span', undefined, 'shortcut-tooltip');
  tooltip.id = 'shortcut-tip-' + i;
  tooltip.setAttribute('role', 'tooltip');
  tooltip.append(document.createTextNode(match[1] + ' '));
  match[2].split('+').forEach((key, index) => {
    if (index) tooltip.append('+');
    tooltip.append(element('kbd', key));
  });
  button.removeAttribute('title');
  button.classList.add('has-shortcut');
  button.setAttribute('aria-describedby', tooltip.id);
  button.append(tooltip);
}

document
  .querySelectorAll('[data-tool]')
  .forEach((button) => (button.onclick = () => selectTool(button.dataset.tool)));
const colliderLabel = element('label', 'Коллайдеры'),
  colliderToggle = element('input');
colliderToggle.type = 'checkbox';
colliderToggle.id = 'preview-colliders';
colliderLabel.prepend(colliderToggle);
document.querySelector('.camera-buttons').append(colliderLabel);
const projection = element('fieldset', undefined, 'projection-options');
projection.id = 'editor-projection';
projection.append(element('legend', 'Проекция камеры', 'visually-hidden'));
for (const [value, text] of [
  ['ortho', 'Изометрия'],
  ['perspective', 'Перспектива'],
]) {
  const label = element('label'),
    input = element('input');
  input.type = 'radio';
  input.name = 'camera-projection';
  input.value = value;
  input.checked = previewCamera.mode === value;
  input.onchange = () => {
    stopStartViewPreview();
    previewCamera.mode = input.value;
    refreshHover();
    invalidate();
  };
  label.append(input, element('span', text));
  projection.append(label);
}
document.querySelector('.camera-buttons').prepend(projection);
const spatialGridLabel = element('label', 'Сетка'),
  spatialGrid = element('input');
spatialGrid.type = 'checkbox';
spatialGrid.checked = true;
spatialGrid.id = 'spatial-grid';
spatialGridLabel.prepend(spatialGrid);
document.querySelector('.camera-buttons').append(spatialGridLabel);
const zoomButtons = element('div', undefined, 'zoom-buttons');
for (const [id, text, factor, label] of [
  ['zoom-out', '−', 0.8, 'Уменьшить масштаб'],
  ['zoom-in', '+', 1.25, 'Увеличить масштаб'],
]) {
  const button = element('button', text);
  button.id = id;
  button.title = label;
  button.setAttribute('aria-label', label);
  button.onclick = () => {
    stopStartViewPreview();
    previewZoom = Math.max(0.5, Math.min(3, previewZoom * factor));
    $('zoom-label').textContent = Math.round(previewZoom * 100) + '%';
    refreshHover();
  };
  zoomButtons.append(button);
  if (id === 'zoom-out') {
    const zoomLabel = element('span', '100%');
    zoomLabel.id = 'zoom-label';
    zoomButtons.append(zoomLabel);
  }
}
document.querySelector('.viewport-toolbar').insertBefore(zoomButtons, $('fit'));
const conveyorBrush = element('div', undefined, 'conveyor-brush');
conveyorBrush.id = 'conveyor-brush';
conveyorBrush.hidden = true;
const beltDirection = { value: '0,1' };
directionRadios(conveyorBrush, 'Лента', beltDirection.value, 'belt-direction', (v) => {
  beltDirection.value = v;
  refreshHover();
  invalidate();
});
const speedLabel = element('label', 'кл/с '),
  beltSpeed = element('input');
beltSpeed.id = 'belt-speed';
beltSpeed.type = 'number';
beltSpeed.min = '.2';
beltSpeed.max = '2.5';
beltSpeed.step = '.1';
beltSpeed.value = '.85';
beltSpeed.setAttribute('aria-label', 'Скорость конвейера');
speedLabel.append(beltSpeed);
conveyorBrush.append(speedLabel);
document.querySelector('.viewport-toolbar').append(conveyorBrush);
const bridgeBrush = element('div', undefined, 'conveyor-brush');
bridgeBrush.id = 'bridge-brush';
bridgeBrush.hidden = true;
bridgeBrush.dataset.object = 'bridge-brush';
const bridgeColor = { value: '' },
  bridgeColors = [
    ['', 'Обычный деревянный', '#cba778'],
    ...L.characters.map((c, i) => [String(i), c.name, c.color]),
  ];
colorRadios(
  bridgeBrush,
  'Материал моста',
  bridgeColor.value,
  bridgeColors,
  (v) => {
    bridgeColor.value = v;
    refreshHover();
    invalidate();
  },
  'bridge-color-brush',
);
document.querySelector('.viewport-toolbar').append(bridgeBrush);
const spikeColors = [
  ['', 'Нейтральный', '#d4dbe5'],
  ...L.characters.map((c, i) => [String(i), c.name, c.color]),
];
const spikeBrush = element('div', undefined, 'conveyor-brush');
spikeBrush.id = 'spike-brush';
spikeBrush.hidden = true;
const spikeFace = { value: 'auto' },
  spikeColor = { value: '' };
faceRadios(
  spikeBrush,
  'Крепление шипов',
  spikeFace.value,
  'spike-face',
  (v) => {
    spikeFace.value = v;
    refreshHover();
    invalidate();
  },
  true,
  true,
);
document.querySelector('.viewport-toolbar').append(spikeBrush);
spikeBrush.dataset.object = 'spike-brush';
colorRadios(spikeBrush, 'Цвет шипов', spikeColor.value, spikeColors, (v) => {
  spikeColor.value = v;
  refreshHover();
  invalidate();
});
const torchBrush = element('div', undefined, 'conveyor-brush'),
  torchFace = { value: 'auto' };
torchBrush.id = 'torch-brush';
torchBrush.hidden = true;
faceRadios(
  torchBrush,
  'Крепление факела',
  torchFace.value,
  'torch-face',
  (v) => {
    torchFace.value = v;
    refreshHover();
    invalidate();
  },
  false,
  true,
);
document.querySelector('.viewport-toolbar').append(torchBrush);
const placementMode = element('select');
placementMode.id = 'placement-mode';
placementMode.setAttribute('aria-label', 'Способ размещения');
for (const [value, text] of [
  ['face', 'По грани'],
  ['layer', 'На слое Y'],
]) {
  const option = element('option', text);
  option.value = value;
  placementMode.append(option);
}
document.querySelector('.height-control').after(placementMode);
$('brush-height').replaceChildren(
  ...Array.from({ length: 15 }, (_, i) => {
    const option = element('option', `Y ${i - 2}`);
    option.value = i - 2;
    return option;
  }),
);
$('brush-height').value = '0';
// Palette tool id for a placed object, to reuse its icon and colour.
function objectTool(key, index, p) {
  if (key === 'blocks')
    return p.lava ? 'lava' : p.color !== undefined ? 'color-' + p.color : 'floor';
  if (key === 'tiles') return 'floor';
  if (key === 'walls') return p.half < 0.4 ? 'torch' : 'floor';
  if (key === 'spawns') return 'spawn-' + index;
  if (key === 'goals') return 'goal-' + index;
  if (key === 'portals') return 'portal-' + p.color;
  if (key === 'crates') return p.large ? 'crate-large' : 'crate';
  if (key === 'pickups') return p.kind;
  return {
    torches: 'torch',
    drones: 'drone',
    plates: 'plate',
    bridges: 'bridge',
    lifts: 'lift',
    conveyors: 'conveyor',
    spikes: 'spikes',
    archers: 'archer',
  }[key];
}
function cellObjects(x, z, y) {
  const result = [];
  for (const key of [
    'blocks',
    'tiles',
    'walls',
    'torches',
    'drones',
    'spawns',
    'goals',
    'plates',
    'bridges',
    'lifts',
    'conveyors',
    'spikes',
    'portals',
    'crates',
    'archers',
    'pickups',
  ])
    model.map[key].forEach((p, index) => {
      if (
        p &&
        p.x === x &&
        p.z === z &&
        (y === undefined ||
          Math.abs((p.y ?? p.base ?? p.height ?? L.surfaceY(model.map, x, z) ?? 0) - y) < 0.01)
      )
        result.push({ key, index, p });
    });
  return result;
}
function field(card, label, value, options, onChange) {
  const row = element('label', label),
    control = element(options?.values ? 'select' : 'input');
  if (/(?:^| · )[XYZ]$/.test(label)) {
    row.className = 'coordinate-field';
    row.textContent = label.slice(-1);
  }
  if (options?.values)
    for (const [v, name] of options.values) {
      const option = element('option', name);
      option.value = v;
      control.append(option);
    }
  else {
    control.type = 'number';
    control.min = options?.min ?? 0;
    control.max = options?.max ?? 3;
    control.step = options?.step ?? 1;
  }
  control.id = `property-${card.dataset.object}-${card.querySelectorAll('input,select').length}`;
  control.value = value;
  control.setAttribute('aria-label', label);
  control.onchange = () => {
    const focused = document.activeElement === control;
    onChange(options?.values ? control.value : Number(control.value));
    // Property edits rebuild the inspector. Keep repeated key presses on the new input.
    if (focused) $(control.id)?.focus({ preventScroll: true });
  };
  row.append(control);
  card.append(row);
  return control;
}
function faceRadios(card, title, value, name, onChange, top = false, auto = false) {
  const choices = [
    ...(auto ? [['auto', 'A', 'По грани автоматически']] : []),
    ...(top ? [['top', '⊥', 'Пол · вверх']] : []),
    ['north', '↑', 'Север −Z'],
    ['east', '→', 'Восток +X'],
    ['south', '↓', 'Юг +Z'],
    ['west', '←', 'Запад −X'],
  ];
  directionRadios(card, title, value, name, onChange, choices);
}
function directionRadios(
  card,
  title,
  value,
  name,
  onChange,
  choices = [
    ['0,-1', '↑', 'Север'],
    ['1,0', '→', 'Восток'],
    ['0,1', '↓', 'Юг'],
    ['-1,0', '←', 'Запад'],
  ],
) {
  const group = element('fieldset', undefined, 'block-colors direction-radios'),
    options = element('div', undefined, 'direction-options');
  group.append(element('legend', title));
  for (const [v, arrow, label] of choices) {
    const row = element('label'),
      input = element('input');
    input.type = 'radio';
    input.name = name;
    input.value = v;
    input.checked = v === value;
    input.setAttribute('aria-label', label);
    row.title = label;
    input.onchange = () => {
      const focused = document.activeElement === input;
      onChange(v);
      if (focused)
        document
          .querySelector('input[name="' + name + '"][value="' + v + '"]')
          ?.focus({ preventScroll: true });
    };
    row.append(input, element('span', arrow));
    options.append(row);
  }
  group.append(options);
  card.append(group);
}
function colorRadios(
  card,
  title,
  value,
  choices,
  onChange,
  groupName = 'color-' + card.dataset.object,
) {
  const group = element('fieldset', undefined, 'block-colors'),
    options = element('div', undefined, 'color-options');
  group.append(element('legend', title));
  for (const [v, name, color] of choices) {
    const label = element('label', undefined, 'color-swatch'),
      input = element('input');
    label.style.setProperty('--swatch', color);
    label.title = name;
    input.type = 'radio';
    input.name = groupName;
    input.value = String(v);
    input.checked = String(v) === String(value);
    input.setAttribute('aria-label', name);
    input.onchange = () => {
      const focused = document.activeElement === input;
      const nextName = onChange(v) || input.name;
      if (focused)
        document
          .querySelector('input[name="' + nextName + '"][value="' + v + '"]')
          ?.focus({ preventScroll: true });
    };
    label.append(input);
    options.append(label);
  }
  group.append(options);
  card.append(group);
}
function renderProperties() {
  const root = $('properties');
  root.replaceChildren();
  $('selected-coords').textContent = selected
    ? `${selected.x} / ${selected.y ?? 0} / ${selected.z}`
    : '—';
  if (!selected) {
    root.append(element('p', 'Выберите клетку на карте.', 'empty-state'));
    return;
  }
  const items = cellObjects(selected.x, selected.z, selected.y);
  if (!items.length) {
    root.append(element('p', 'Пустота', 'empty-state'));
    return;
  }
  for (const { key, index, p } of items) {
    const card = element('div', undefined, 'object-card'),
      head = element('div', undefined, 'object-head');
    card.dataset.object = `${key}-${index}`;
    let label = labels[key];
    if (key === 'blocks' && p.color !== undefined) label = 'Энергетический блок';
    if (key === 'blocks' && p.lava) label = 'Лава';
    if (key === 'spawns' || key === 'goals') label += ` · ${names[index]}`;
    if (key === 'pickups') label = p.kind === 'shield' ? 'Деревянный щит' : 'Железный меч';
    if (key === 'walls' && p.half < 0.4) label = 'Факел';
    if (key === 'crates' && p.large) label = 'Большой ящик';
    // The same icon and colour as the palette tool that places this object.
    const tool = tools[objectTool(key, index, p)],
      marker = tool ? toolIcon(objectTool(key, index, p), tool.glyph) : element('span', '◇');
    marker.classList.add('marker');
    head.style.setProperty('--tool-color', tool?.color || '#a7bba4');
    head.append(marker, element('span', label));
    card.append(head);
    const set = (property, value) =>
      edit((map) => {
        map[key][index][property] = value;
      });
    if (key === 'spawns' || key === 'goals')
      colorRadios(
        card,
        'Цвет',
        index,
        L.characters.map((c, i) => [i, c.name, c.color]),
        (v) => {
          edit((map) => {
            const target = Number(v);
            [map[key][index], map[key][target]] = [map[key][target], map[key][index]];
          });
          return 'color-' + key + '-' + v;
        },
      );
    if (key === 'blocks')
      for (const axis of ['x', 'y', 'z'])
        field(
          card,
          axis.toUpperCase(),
          p[axis],
          {
            min: axis === 'y' ? -2 : -Number.MAX_SAFE_INTEGER,
            max: axis === 'y' ? 12 : Number.MAX_SAFE_INTEGER,
          },
          (value) => {
            const q = { ...p, [axis]: value };
            try {
              if (model.move('blocks', index, q.x, q.z, q.y)) {
                selected = q;
                changed();
              }
            } catch (error) {
              toast(error.message);
              renderPanels();
            }
          },
        );
    if (key === 'blocks') {
      const palette = element('fieldset', undefined, 'block-colors');
      palette.append(element('legend', 'Цвет блока'));
      const options = element('div', undefined, 'color-options');
      for (const [value, name, color] of [
        ['', 'Обычный камень', '#918878'],
        ...L.characters.map((c, i) => [String(i), c.name, c.color]),
        ['lava', 'Лава', '#ff6a1a'],
      ]) {
        const label = element('label', undefined, 'color-swatch'),
          radio = element('input');
        label.style.setProperty('--swatch', color);
        label.title = name;
        radio.type = 'radio';
        radio.name = 'block-color-' + index;
        radio.id = 'block-color-' + index + '-' + (value || 'stone');
        radio.value = value;
        radio.checked = (p.lava ? 'lava' : String(p.color ?? '')) === value;
        radio.setAttribute('aria-label', name);
        radio.onchange = () => {
          const focused = document.activeElement === radio;
          edit((map) => {
            const block = map.blocks[index];
            delete block.color;
            delete block.lava;
            if (value === 'lava') block.lava = true;
            else if (value !== '') block.color = Number(value);
          });
          if (focused) $(radio.id)?.focus({ preventScroll: true });
        };
        label.append(radio);
        options.append(label);
      }
      palette.append(options);
      card.append(palette);
      if (p.color !== undefined)
        card.append(
          element('p', `Проходит только ${names[p.color]}. Ящики не проходят.`, 'empty-state'),
        );
      if (p.lava) card.append(element('p', 'Желейки сгорают, ящики проезжают.', 'empty-state'));
    }
    if (key === 'tiles')
      field(card, 'Высота пола', p.height, { min: 0, max: 3 }, (value) =>
        edit(() => model.paint('floor', p.x, p.z, { height: value })),
      );
    if (key === 'torches') {
      faceRadios(card, 'Крепление факела', p.face, 'face-' + card.dataset.object, (v) =>
        set('face', v),
      );
      for (const axis of ['x', 'y', 'z'])
        field(
          card,
          'Факел · ' + axis.toUpperCase(),
          p[axis],
          {
            min: axis === 'y' ? -2 : -Number.MAX_SAFE_INTEGER,
            max: axis === 'y' ? 12 : Number.MAX_SAFE_INTEGER,
          },
          (value) => {
            const q = { ...p, [axis]: value };
            try {
              if (model.move(key, index, q.x, q.z, q.y)) {
                selected = { x: q.x, y: q.y, z: q.z };
                changed();
              }
            } catch (error) {
              toast(error.message);
              renderPanels();
            }
          },
        );
    }
    if (key === 'drones') {
      colorRadios(
        card,
        'Цвет луча',
        p.color,
        L.characters.map((c, i) => [i, c.name, c.color]),
        (v) => set('color', Number(v)),
      );
      colorRadios(
        card,
        'Цель дрона',
        p.target,
        [[-1, 'Ближайшая желейка', '#a5adb3'], ...L.characters.map((c, i) => [i, c.name, c.color])],
        (v) => set('target', Number(v)),
        'target-' + card.dataset.object,
      );
      field(card, 'Высота полёта', p.hover, { min: 0, max: 6, step: 0.1 }, (v) => set('hover', v));
      for (const axis of ['x', 'y', 'z'])
        field(
          card,
          'Дрон · ' + axis.toUpperCase(),
          p[axis],
          {
            min: axis === 'y' ? -2 : -Number.MAX_SAFE_INTEGER,
            max: axis === 'y' ? 12 : Number.MAX_SAFE_INTEGER,
          },
          (value) => {
            const q = { ...p, [axis]: value };
            try {
              if (model.move(key, index, q.x, q.z, q.y)) {
                selected = { x: q.x, y: q.y, z: q.z };
                changed();
              }
            } catch (error) {
              toast(error.message);
              renderPanels();
            }
          },
        );
    }
    if (key === 'plates') {
      colorRadios(
        card,
        'Цвет',
        p.color,
        [
          ['green', 'Зелёный', colors[0]],
          ['blue', 'Синий', colors[1]],
          ['red', 'Красный', colors[2]],
          ['violet', 'Фиолетовый', colors[3]],
          ['amber', 'Золотой', '#edb65b'],
          ['dark', 'Каменный', '#777e78'],
        ],
        (v) => set('color', v),
      );
      card.append(
        element(
          'p',
          `Группа: ${plateGroupNames[p.color]} · триггеров: ${[...model.map.bridges, ...model.map.spikes].filter((b) => b.plate && plateGroup(b.plate) === p.color).length}`,
          'empty-state',
        ),
      );
    }
    if (key === 'bridges') {
      colorRadios(
        card,
        'Материал моста',
        p.color ?? '',
        bridgeColors,
        (v) =>
          edit((map) => {
            if (v === '') delete map.bridges[index].color;
            else map.bridges[index].color = Number(v);
          }),
        'bridge-color-' + card.dataset.object,
      );
      field(
        card,
        'Группа кнопок',
        plateGroupValue(p.plate),
        { values: [['', 'Не выбрана'], ...plateGroupOptions()] },
        (v) => set('plate', v),
      );
    }
    if (key === 'lifts') {
      field(card, 'Нижний уровень', p.base, { min: -2, max: 12 }, (v) =>
        edit((map) => {
          map.lifts[index].base = v;
          map.lifts[index].y = v;
          model.cube(p.x, v, p.z);
        }),
      );
      field(card, 'Верхний уровень', p.top, { min: -2, max: 12 }, (v) => set('top', v));
    }
    if (key === 'spikes') {
      colorRadios(card, 'Цвет шипов', p.color ?? '', spikeColors, (v) =>
        edit((map) => {
          if (v === '') delete map.spikes[index].color;
          else map.spikes[index].color = Number(v);
        }),
      );
      faceRadios(
        card,
        'Крепление шипов',
        p.face || 'top',
        'face-' + card.dataset.object,
        (v) =>
          edit((map) => {
            if (v === 'top') delete map.spikes[index].face;
            else map.spikes[index].face = v;
          }),
        true,
      );
      field(
        card,
        'Y крепления',
        p.y ?? L.surfaceY(model.map, p.x, p.z) ?? 0,
        { min: -2, max: 12 },
        (v) => {
          try {
            if (model.move('spikes', index, p.x, p.z, v)) {
              selected = { x: p.x, y: v, z: p.z };
              changed();
            }
          } catch (error) {
            toast(error.message);
            renderPanels();
          }
        },
      );
      const triggerColors = {
        green: colors[0],
        blue: colors[1],
        red: colors[2],
        violet: colors[3],
        amber: '#edb65b',
        dark: '#777e78',
      };
      colorRadios(
        card,
        'Группа кнопок',
        plateGroupValue(p.plate) || '',
        [
          ['', 'Без кнопки', '#d4dbe5'],
          ...plateGroupOptions().map(([value, name]) => [value, name, triggerColors[value]]),
          ...(p.plate && !model.map.plates.some((b) => b.id === p.plate || b.color === p.plate)
            ? [[p.plate, 'Кнопка удалена', '#777e78']]
            : []),
        ],
        (v) =>
          edit((map) => {
            if (v) map.spikes[index].plate = v;
            else delete map.spikes[index].plate;
          }),
        'trigger-' + card.dataset.object,
      );
      field(
        card,
        'Цикл, сек (0 — постоянно)',
        p.cycle ?? 5.8,
        { min: 0, max: 3600, step: 0.1 },
        (v) => set('cycle', v),
      ).disabled = !!p.plate;
      const enabledRow = element('label', 'Включены'),
        enabled = element('input');
      enabled.type = 'checkbox';
      enabled.checked = p.enabled !== false;
      enabled.setAttribute('aria-label', 'Включены');
      enabled.disabled = !!p.plate;
      enabled.onchange = () => {
        const focused = document.activeElement === enabled;
        set('enabled', enabled.checked);
        if (focused)
          document
            .querySelector('[data-object="spikes-' + index + '"] input[type="checkbox"]')
            ?.focus({ preventScroll: true });
      };
      enabledRow.append(enabled);
      card.append(enabledRow);
      field(card, 'Сдвиг цикла, сек', p.offset, { min: 0, max: 3600, step: 0.1 }, (v) =>
        set('offset', v),
      ).disabled = !!p.plate || p.cycle === 0;
      card.append(
        element(
          'p',
          p.plate
            ? 'Нажата кнопка — шипы выдвинуты.'
            : p.cycle === 0
              ? 'Постоянное состояние задаётся флажком.'
              : 'Флажок задаёт начальное состояние цикла.',
          'empty-state',
        ),
      );
    }
    if (key === 'portals') {
      colorRadios(
        card,
        'Цвет портала',
        p.color,
        L.portalColors.map((p) => [p.id, p.name, p.color]),
        (v) => set('color', v),
      );
      const chain = model.map.portals.filter((q) => q.color === p.color),
        order = chain.indexOf(p) + 1;
      field(card, 'Порядок в цепочке', order, { min: 1, max: chain.length }, (v) => {
        try {
          if (model.orderPortal(index, v)) {
            changed();
            document
              .querySelector('#properties [data-object^="portals-"] input')
              ?.focus({ preventScroll: true });
          }
        } catch (error) {
          toast(error.message);
          renderPanels();
        }
      });
      card.append(
        element(
          'p',
          chain.length > 1
            ? `Переход ${order} → ${(order % chain.length) + 1}`
            : 'Добавьте ещё портал этого цвета.',
          'empty-state',
        ),
      );
    }
    if (key === 'conveyors') {
      directionRadios(
        card,
        'Направление ленты',
        `${p.dx},${p.dz}`,
        'direction-' + card.dataset.object,
        (v) => {
          beltDirection.value = v;
          document
            .querySelectorAll('input[name="belt-direction"]')
            .forEach((input) => (input.checked = input.value === v));
          edit((map) => {
            [map.conveyors[index].dx, map.conveyors[index].dz] = v.split(',').map(Number);
          });
        },
      );
      field(card, 'Скорость ленты, кл/с', p.speed, { min: 0.2, max: 2.5, step: 0.1 }, (v) => {
        beltSpeed.value = v;
        set('speed', v);
      });
    }
    if (key === 'archers') {
      directionRadios(
        card,
        'Направление',
        `${p.dx},${p.dz}`,
        'direction-' + card.dataset.object,
        (v) =>
          edit((map) => {
            [map.archers[index].dx, map.archers[index].dz] = v.split(',').map(Number);
          }),
      );
      field(card, 'Выстрел каждые, с', p.interval, { min: 0.6, max: 10, step: 0.1 }, (v) =>
        set('interval', v),
      );
      field(card, 'Первый выстрел, с', p.firstShot, { min: 0.1, max: 10, step: 0.1 }, (v) =>
        set('firstShot', v),
      );
    }
    const actions = element('div', undefined, 'object-actions');
    if (key !== 'tiles') {
      const move = element('button', 'Перенести');
      move.onclick = () => {
        selectTool('select');
        moveObject = { key, index };
        $('active-tool').replaceChildren(
          document.createTextNode('Выберите новую клетку · '),
          element('kbd', 'Esc'),
          document.createTextNode(' — отмена'),
        );
      };
      actions.append(move);
    }
    const remove = element('button', key === 'tiles' ? 'Убрать пол' : 'Удалить', 'delete');
    remove.onclick = () => {
      if (model.remove(key, index)) changed();
    };
    actions.append(remove);
    card.append(actions);
    root.append(card);
  }
}
function renderIssues() {
  const errors = L.issues(model.map),
    root = $('issues');
  root.replaceChildren();
  $('validate').textContent = errors.length ? `⚠ Замечания: ${errors.length}` : '✓ Можно играть';
  $('validate').className = 'validation-button ' + (errors.length ? 'invalid' : 'valid');
  const checklist = element('ul', undefined, 'readiness-checklist');
  const checks = [
    [model.map.spawns.some(Boolean), 'Добавлен хотя бы один персонаж'],
    [
      model.map.spawns.some(Boolean) && model.map.spawns.every((p, i) => !p || model.map.goals[i]),
      'У каждого персонажа есть финиш',
    ],
    [!errors.length, 'Размещение объектов и связи корректны'],
  ];
  for (const [passed, label] of checks) {
    const item = element('li', undefined, passed ? 'valid' : 'invalid'),
      mark = element('span', passed ? '☑' : '☐', 'checklist-mark');
    mark.setAttribute('aria-hidden', 'true');
    item.append(mark, element('span', label));
    item.setAttribute('aria-label', label + ' · ' + (passed ? 'Выполнено' : 'Не выполнено'));
    checklist.append(item);
  }
  root.append(checklist);
  if (!errors.length) return;
  const list = element('ul');
  for (const error of errors.slice(0, expandedIssues ? 100 : 3)) list.append(element('li', error));
  root.append(list);
  if (errors.length > 3 && !expandedIssues) {
    const more = element('button', `Ещё ${errors.length - 3}`);
    more.onclick = () => {
      expandedIssues = true;
      renderIssues();
    };
    root.append(more);
  }
}
function renderPanels() {
  $('level-name').value = model.map.name;
  $('undo').disabled = !model.undoStack.length;
  $('redo').disabled = !model.redoStack.length;
  $('stats').replaceChildren(
    element('span', `${model.map.blocks.length} кубов`),
    element(
      'span',
      `${Object.keys(L.limits)
        .filter((k) => !['tiles', 'blocks'].includes(k))
        .reduce((n, k) => n + model.map[k].length, 0)} объектов`,
    ),
  );
  renderStartCamera();
  renderProperties();
  renderIssues();
}
function renderStartCamera() {
  const view = LevelCamera.settings(model.map);
  $('start-camera-yaw').value = view.yaw + '°';
  $('start-camera-pitch').value = view.pitch + '°';
  $('save-start-camera').disabled = !!startViewPreview;
  $('reset-start-camera').disabled = !!startViewPreview || !model.map.camera;
  const button = $('preview-start-camera');
  button.textContent = startViewPreview ? 'Вернуться к редактированию' : 'Предпросмотр';
  button.setAttribute('aria-pressed', String(!!startViewPreview));
}
function stopStartViewPreview() {
  if (!startViewPreview) return;
  const saved = startViewPreview.saved;
  startViewPreview = null;
  for (const key of Object.keys(previewCamera))
    if (!(key in saved.camera)) delete previewCamera[key];
  Object.assign(previewCamera, saved.camera);
  previewAngle = saved.angle;
  previewTargetAngle = saved.targetAngle;
  previewTargetPitch = saved.targetPitch;
  previewZoom = saved.zoom;
  document
    .querySelectorAll('#editor-projection input')
    .forEach((input) => (input.checked = input.value === previewCamera.mode));
  renderStartCamera();
  refreshHover();
  invalidate();
}
function startCameraPreview() {
  if (startViewPreview) {
    stopStartViewPreview();
    return;
  }
  if (!model.map.spawns.some(Boolean)) {
    toast('Добавьте персонажа для предпросмотра.');
    return;
  }
  if (!previewRenderer?.ready) return;
  finishGesture();
  panKeys.clear();
  if (previewDirty || !previewRuntime) rebuildPreview();
  startViewPreview = {
    definition: L.copy(model.map),
    elapsed: 0,
    scale: 1,
    zoom: null,
    saved: {
      camera: { ...previewCamera },
      angle: previewAngle,
      targetAngle: previewTargetAngle,
      targetPitch: previewTargetPitch,
      zoom: previewZoom,
    },
  };
  previewCamera.mode = 'perspective';
  previewCamera.fov = 45;
  document
    .querySelectorAll('#editor-projection input')
    .forEach((input) => (input.checked = input.value === previewCamera.mode));
  updateStartViewPreview(0);
  renderStartCamera();
  invalidate();
}
function updateStartViewPreview(dt) {
  if (!startViewPreview) return;
  if (!document.hidden) startViewPreview.elapsed += dt;
  const pose = LevelCamera.intro(
      startViewPreview.definition,
      startViewPreview.elapsed,
      reducedMotion,
    ),
    r = $('viewport').getBoundingClientRect();
  previewAngle = previewTargetAngle = pose.angle;
  previewCamera.pitch = previewTargetPitch = pose.pitch;
  const target = SharedCamera.target(
    previewRuntime.players,
    startViewPreview.definition,
    previewCamera,
    pose.angle,
    r.width,
    r.height,
    pose.overview,
  );
  const snap = startViewPreview.zoom === null || reducedMotion,
    tracking = snap ? 1 : 1 - Math.exp(-dt * 3);
  for (const key of ['x', 'z', 'targetY', 'focusHeight', 'frameY'])
    previewCamera[key] =
      (previewCamera[key] ?? target[key]) +
      (target[key] - (previewCamera[key] ?? target[key])) * tracking;
  const zoomRate = target.zoom < startViewPreview.zoom ? 6 : 1.8;
  startViewPreview.zoom = snap
    ? target.zoom
    : startViewPreview.zoom +
      (target.zoom - startViewPreview.zoom) * (1 - Math.exp(-dt * zoomRate));
  startViewPreview.scale = Math.min(r.width / 16, r.height / 12) * startViewPreview.zoom;
}
$('save-start-camera').onclick = () => {
  finishGesture();
  const yaw = ((((previewAngle * 180) / Math.PI + 45) % 360) + 360) % 360;
  edit((map) => {
    map.camera = {
      yaw: (Math.round(yaw * 100) / 100) % 360,
      pitch: Math.round(previewCamera.pitch * 100) / 100,
    };
  });
  toast('Стартовый ракурс сохранён.');
};
$('reset-start-camera').onclick = () => {
  edit((map) => {
    delete map.camera;
  });
  toast('Стартовый ракурс сброшен.');
};
$('preview-start-camera').onclick = startCameraPreview;
function screenFrame() {
  const r = $('viewport').getBoundingClientRect();
  return S.frame(previewCamera, previewAngle, r.width, r.height, previewScale());
}
function screenRay(event) {
  const r = $('viewport').getBoundingClientRect();
  return S.ray(screenFrame(), event.clientX - r.left, event.clientY - r.top, r.width, r.height);
}
function point(event) {
  pickBounds ??= S.boxes(model.map);
  const layer = Number($('brush-height').value),
    painting = !['select', 'erase', 'pan', 'orbit'].includes(tool) && !event.shiftKey;
  if (gesture?.tool === 'spikes' && gesture.face && gesture.face !== 'top') return gesture.start;
  if (gesture?.tool === 'torch') return gesture.start;
  if (!gesture && painting && placementMode.value === 'layer') {
    const hit = S.plane(screenRay(event), layer);
    return hit
      ? { x: Math.round(hit.position[0]), y: layer, z: Math.round(hit.position[2]), hit }
      : null;
  }
  const p = S.pick(
    screenRay(event),
    pickBounds,
    null,
    layer,
    gesture?.tool === 'erase' ? null : (gesture?.planeY ?? null),
  );
  if (!p) return null;
  if (gesture?.tool === 'erase') return p;
  if (gesture) {
    p.y = gesture.blockY;
    p.x += gesture.offsetX || 0;
    p.z += gesture.offsetZ || 0;
    return p;
  }
  p.y ??= layer;
  if (painting && tool === 'spikes') {
    p.face =
      spikeFace.value === 'auto'
        ? p.key === 'spikes'
          ? p.face
          : p.key === 'blocks' && p.hit.axis !== 1
            ? ['west', 'east', 'north', 'south'][
                (p.hit.axis === 2 ? 2 : 0) + (p.hit.sign > 0 ? 1 : 0)
              ]
            : 'top'
        : spikeFace.value;
  }
  if (painting && tool === 'torch')
    p.face =
      torchFace.value === 'auto'
        ? p.key === 'torches'
          ? p.face
          : p.key === 'blocks' && p.hit.axis !== 1
            ? ['west', 'east', 'north', 'south'][
                (p.hit.axis === 2 ? 2 : 0) + (p.hit.sign > 0 ? 1 : 0)
              ]
            : 'south'
        : torchFace.value;
  if (
    p.key === 'blocks' &&
    ((painting && cubeTool(tool)) || moveObject?.key === 'blocks') &&
    placementMode.value === 'face'
  ) {
    if (p.hit.axis === 0) p.x += p.hit.sign;
    if (p.hit.axis === 1) p.y += p.hit.sign;
    if (p.hit.axis === 2) p.z += p.hit.sign;
  }
  return p;
}
function refreshHover() {
  if (lastPointer && !gesture?.pan && !gesture?.orbit) hover = point(lastPointer);
  $('cell-info').textContent = inside(hover)
    ? `X ${hover.x} / Y ${hover.y ?? 0} / Z ${hover.z}`
    : 'X — / Y — / Z —';
}
function inside(p) {
  return (
    p &&
    Number.isSafeInteger(p.x) &&
    Number.isSafeInteger(p.z) &&
    (p.y === undefined || (p.y >= -2 && p.y <= 12))
  );
}
function invalidate() {
  if (previewRenderer?.ready) drawSpatialOverlay();
}
function paintCell(p, activeTool) {
  if (activeTool === 'erase') {
    if (
      p.key &&
      Number.isInteger(p.index) &&
      (!gesture?.eraseKey || p.key === gesture.eraseKey) &&
      model.eraseObject(p.key, p.index)
    ) {
      previewDirty = true;
      pickBounds = null;
      spatialCells = null;
    }
    selected = { x: p.x, y: p.y ?? 0, z: p.z };
    return;
  }
  const y = p.y ?? gesture?.blockY ?? Number($('brush-height').value);
  if (!inside({ ...p, y })) return;
  try {
    const [dx, dz] = beltDirection.value.split(',').map(Number),
      speed = Math.max(0.2, Math.min(2.5, Number(beltSpeed.value) || 0.85));
    model.paint(activeTool, p.x, p.z, {
      height: y,
      y,
      voxel: true,
      dx,
      dz,
      speed,
      ...(activeTool === 'torch'
        ? {
            face:
              gesture?.face || p.face || (torchFace.value === 'auto' ? 'south' : torchFace.value),
          }
        : {}),
      ...(activeTool === 'spikes'
        ? {
            face: gesture?.face || p.face || (spikeFace.value === 'auto' ? 'top' : spikeFace.value),
            color: spikeColor.value === '' ? null : Number(spikeColor.value),
          }
        : {}),
      ...(activeTool === 'bridge'
        ? { color: bridgeColor.value === '' ? null : Number(bridgeColor.value) }
        : {}),
    });
    previewDirty = true;
    pickBounds = null;
    spatialCells = null;
  } catch (error) {
    toast(error.message);
  }
  selected = { x: p.x, y, z: p.z };
}
function finishGesture() {
  if (!gesture) return;
  if (gesture.pan || gesture.orbit) {
    gesture = null;
    $('viewport').classList.remove('camera-drag');
    refreshHover();
    invalidate();
    return;
  }
  if (gesture.rectangle && inside(hover))
    for (let z = Math.min(gesture.start.z, hover.z); z <= Math.max(gesture.start.z, hover.z); z++)
      for (let x = Math.min(gesture.start.x, hover.x); x <= Math.max(gesture.start.x, hover.x); x++)
        paintCell({ x, z }, gesture.tool);
  const changedMap = model.commit();
  gesture = null;
  if (changedMap) changed();
  else {
    renderProperties();
    invalidate();
  }
  refreshHover();
}
$('viewport').addEventListener('pointerdown', (event) => {
  if (startViewPreview) {
    stopStartViewPreview();
    event.preventDefault();
    return;
  }
  if (![0, 1, 2].includes(event.button) || gesture) return;
  event.preventDefault();
  $('viewport').focus();
  lastPointer = event;
  const p = point(event);
  hover = p;
  if (event.button === 2 || tool === 'orbit' || space || event.button === 1 || tool === 'pan') {
    const orbit = !space && event.button !== 1 && (event.button === 2 || tool === 'orbit');
    gesture = { pan: !orbit, orbit, x: event.clientX, y: event.clientY };
    $('viewport').classList.add('camera-drag');
    $('viewport').setPointerCapture(event.pointerId);
    return;
  }
  if (!inside(p)) return;
  selected = { x: p.x, y: p.y, z: p.z };
  if (moveObject) {
    try {
      if (
        model.move(
          moveObject.key,
          moveObject.index,
          p.x,
          p.z,
          p.y ?? Number($('brush-height').value),
        )
      )
        changed();
      moveObject = null;
      selectTool('select');
    } catch (error) {
      toast(error.message);
    }
    return;
  }
  const activeTool = event.button === 2 || event.shiftKey ? 'erase' : tool;
  if (activeTool === 'select') {
    renderProperties();
    invalidate();
    return;
  }
  model.begin();
  gesture = {
    start: p,
    last: p,
    tool: activeTool,
    eraseKey: activeTool === 'erase' ? p.key : null,
    face: p.face,
    blockY: p.y ?? Number($('brush-height').value),
    planeY: p.hit?.position[1] ?? p.y,
    offsetX: p.hit ? p.x - Math.round(p.hit.position[0]) : 0,
    offsetZ: p.hit ? p.z - Math.round(p.hit.position[2]) : 0,
    rectangle:
      $('brush-shape').value === 'rectangle' &&
      (cubeTool(activeTool) || ['conveyor'].includes(activeTool)),
  };
  if (!gesture.rectangle) paintCell(p, activeTool);
  $('viewport').setPointerCapture(event.pointerId);
  invalidate();
});
$('viewport').addEventListener('pointermove', (event) => {
  lastPointer = event;
  if (gesture?.orbit) {
    previewTargetAngle -= (event.clientX - gesture.x) * 0.008;
    previewTargetPitch = Math.max(
      20,
      Math.min(85, previewTargetPitch + (event.clientY - gesture.y) * 0.25),
    );
    gesture.x = event.clientX;
    gesture.y = event.clientY;
    return;
  }
  if (gesture?.pan) {
    const dx = event.clientX - gesture.x,
      dy = event.clientY - gesture.y;
    gesture.x = event.clientX;
    gesture.y = event.clientY;
    panView(dx, dy, event.clientX, event.clientY);
    invalidate();
    return;
  }
  refreshHover();
  if (gesture?.tool === 'erase') {
    if (inside(hover)) paintCell(hover, 'erase');
    gesture.last = hover;
    invalidate();
    return;
  }
  if (gesture && !gesture.rectangle && inside(hover)) {
    const a = gesture.last,
      b = hover,
      steps = Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
    for (let i = 1; i <= steps; i++)
      paintCell(
        {
          x: Math.round(a.x + ((b.x - a.x) * i) / steps),
          z: Math.round(a.z + ((b.z - a.z) * i) / steps),
        },
        gesture.tool,
      );
    gesture.last = hover;
  }
  invalidate();
});
$('viewport').addEventListener('pointerup', finishGesture);
$('viewport').addEventListener('pointercancel', finishGesture);
$('viewport').addEventListener('lostpointercapture', finishGesture);
$('viewport').addEventListener('contextmenu', (event) => event.preventDefault());
$('viewport').addEventListener('pointerleave', () => {
  if (!gesture) {
    lastPointer = null;
    hover = null;
    invalidate();
  }
});
$('viewport').addEventListener(
  'wheel',
  (event) => {
    event.preventDefault();
    stopStartViewPreview();
    previewZoom = Math.max(0.5, Math.min(3, previewZoom * Math.exp(-event.deltaY * 0.001)));
    $('zoom-label').textContent = Math.round(previewZoom * 100) + '%';
    refreshHover();
  },
  { passive: false },
);
function areaPoints() {
  return Object.keys(L.limits)
    .concat(['spawns', 'goals'])
    .flatMap((key) => model.map[key].filter(Boolean));
}
function gridCells() {
  if (spatialCells) return spatialCells;
  const cells = new Set(),
    points = areaPoints();
  if (!points.length) points.push({ x: 0, z: 0 });
  for (const p of points)
    for (let dz = -3; dz <= 3; dz++)
      for (let dx = -3; dx <= 3; dx++) cells.add(`${p.x + dx},${p.z + dz}`);
  return (spatialCells = Array.from(cells, (cell) => {
    const [x, z] = cell.split(',').map(Number);
    return { x, z, cell };
  }));
}
function areaBounds() {
  const points = areaPoints();
  if (!points.length) return { minX: -3, maxX: 3, minZ: -3, maxZ: 3 };
  return {
    minX: Math.min(...points.map((p) => p.x)) - 3,
    maxX: Math.max(...points.map((p) => p.x)) + 3,
    minZ: Math.min(...points.map((p) => p.z)) - 3,
    maxZ: Math.max(...points.map((p) => p.z)) + 3,
  };
}
// The level's bounding box. fit() frames it; the camera stays put while the map is edited.
let previewFitCorners = null,
  previewFit = null;
function levelCorners() {
  const points = areaPoints();
  if (!points.length) points.push({ x: -3, z: -3 }, { x: 3, z: 3 });
  const xs = points.map((p) => p.x),
    zs = points.map((p) => p.z),
    ys = points.map((p) => p.y ?? p.height ?? p.base ?? 0),
    x = [Math.min(...xs) - 0.5, Math.max(...xs) + 0.5],
    y = [Math.min(...ys) - 1, Math.max(...ys) + 1.2],
    z = [Math.min(...zs) - 0.5, Math.max(...zs) + 0.5];
  return x.flatMap((px) => y.flatMap((py) => z.map((pz) => [px, py, pz])));
}
function fit() {
  stopStartViewPreview();
  previewZoom = 1;
  previewFitCorners = levelCorners();
  previewFit = null;
  const [x0, y0, z0] = previewFitCorners[0],
    [x1, y1, z1] = previewFitCorners[7];
  previewCamera.x = (x0 + x1) / 2;
  previewCamera.z = (z0 + z1) / 2;
  previewCamera.targetY = (y0 + y1) / 2;
  $('zoom-label').textContent = '100%';
  refreshHover();
  invalidate();
}
// Largest scale at which the whole level box projects inside the viewport with a margin,
// centred vertically through frameY (as in the game camera). Works for both projections.
function fitView(width, height) {
  const margin = 0.05,
    camera = { ...previewCamera, frameY: 0.5 };
  let frameY = 0.5;
  const fits = (scale) => {
    const frame = S.frame(camera, previewAngle, width, height, scale),
      points = previewFitCorners.map((corner) =>
        JellyGPU.projectPoint(frame, ...corner, width, height),
      ),
      top = Math.min(...points.map((p) => p.y)),
      bottom = Math.max(...points.map((p) => p.y));
    frameY = 0.5 + (height * 0.5 - (top + bottom) / 2) / height;
    return (
      points.every((p) => p.visible && p.x >= width * margin && p.x <= width * (1 - margin)) &&
      bottom - top <= height * (1 - 2 * margin)
    );
  };
  let lower = 1,
    upper = 1000;
  if (!fits(upper)) {
    for (let i = 0; i < 24; i++) {
      const middle = Math.sqrt(lower * upper);
      if (fits(middle)) lower = middle;
      else upper = middle;
    }
    upper = lower;
    fits(lower);
  }
  return { scale: upper, frameY };
}
function previewScale() {
  if (startViewPreview) return startViewPreview.scale;
  const r = $('viewport').getBoundingClientRect(),
    width = Math.max(1, r.width),
    height = Math.max(1, r.height),
    key = [width, height, previewCamera.mode, previewCamera.fov].join(':');
  previewFitCorners ??= levelCorners();
  if (previewFit?.key !== key) {
    previewFit = { key, ...fitView(width, height) };
    previewCamera.frameY = previewFit.frameY;
  }
  return previewFit.scale * previewZoom;
}
function drawSpatialOverlay() {
  const canvas = $('spatial-overlay'),
    r = $('viewport').getBoundingClientRect(),
    ratio = Math.min(devicePixelRatio || 1, 2),
    w = Math.round(r.width * ratio),
    h = Math.round(r.height * ratio);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, r.width, r.height);
  if (startViewPreview) return;
  const frame = screenFrame(),
    project = (p) => JellyGPU.projectPoint(frame, ...p, r.width, r.height);
  function path(points, color, fill = null, dashed = false) {
    const ps = points.map(project);
    if (ps.some((p) => !p.visible)) return;
    ctx.beginPath();
    ps.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.setLineDash(dashed ? [5, 4] : []);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  function square(p, y, color, fill = null, dashed = false) {
    path(
      [
        [p.x - 0.48, y, p.z - 0.48],
        [p.x + 0.48, y, p.z - 0.48],
        [p.x + 0.48, y, p.z + 0.48],
        [p.x - 0.48, y, p.z + 0.48],
      ],
      color,
      fill,
      dashed,
    );
  }
  const layer = Number($('brush-height').value),
    floor = (x, z) => previewRuntime?.world.heightAt(x, z) ?? layer,
    occupiedLayer = new Set(
      model.map.blocks.filter((b) => b.y === layer).map((b) => `${b.x},${b.z}`),
    );
  if (spatialGrid.checked) {
    ctx.lineWidth = 0.7;
    for (const p of gridCells()) if (!occupiedLayer.has(p.cell)) square(p, layer, '#a7c9b124');
  }
  if ($('connections').checked) {
    ctx.lineWidth = 1;
    const line = (a, b, color, arrow = false) => {
      const ps = [a, b].map((p) => project([p.x, (p.y ?? floor(p.x, p.z)) + 0.15, p.z]));
      if (ps.some((p) => !p.visible)) return;
      ctx.beginPath();
      ctx.moveTo(ps[0].x, ps[0].y);
      ctx.lineTo(ps[1].x, ps[1].y);
      ctx.strokeStyle = color;
      ctx.setLineDash([4, 5]);
      ctx.stroke();
      if (arrow) {
        const angle = Math.atan2(ps[1].y - ps[0].y, ps[1].x - ps[0].x),
          x = ps[0].x + (ps[1].x - ps[0].x) * 0.65,
          y = ps[0].y + (ps[1].y - ps[0].y) * 0.65;
        ctx.setLineDash([]);
        ctx.beginPath();
        for (const side of [-1, 1]) {
          ctx.moveTo(x, y);
          ctx.lineTo(x - Math.cos(angle + side * 0.5) * 8, y - Math.sin(angle + side * 0.5) * 8);
        }
        ctx.stroke();
      }
    };
    for (const b of [...model.map.bridges, ...model.map.spikes])
      for (const p of model.map.plates.filter((p) => b.plate && p.color === plateGroup(b.plate)))
        line(p, b, '#d4e9a88a');
    for (const color of L.portalColors) {
      const chain = model.map.portals.filter((p) => p.color === color.id);
      chain.forEach((p, i) => {
        if (chain.length > 1) line(p, chain[(i + 1) % chain.length], color.color + '88', true);
        const q = project([p.x, (p.y ?? floor(p.x, p.z)) + 0.2, p.z]);
        if (q.visible) {
          ctx.fillStyle = color.color;
          ctx.font = '12px Arial';
          ctx.fillText(
            `${i + 1}→${chain.length > 1 ? ((i + 1) % chain.length) + 1 : '—'}`,
            q.x + 8,
            q.y + 14,
          );
        }
      });
    }
  }
  ctx.lineWidth = 2;
  if (selected)
    square(selected, (selected.y ?? floor(selected.x, selected.z)) + 0.04, '#e2edb4', '#d6eea714');
  if (gesture?.pan || gesture?.orbit || !inside(hover) || ['pan', 'orbit'].includes(tool)) return;
  const active = gesture?.tool || tool,
    isErase = active === 'erase',
    color = isErase ? '#f2a78b' : tools[active]?.color || '#ceecaa',
    fill = isErase ? '#ef8c732b' : color + '24';
  if (isErase && hover.key) {
    for (const box of S.boxes(model.map).filter(
      (b) => b.key === hover.key && b.index === hover.index,
    )) {
      const [x, y, z] = box.min,
        [X, Y, Z] = box.max;
      for (const h of [y, Y])
        path(
          [
            [x, h, z],
            [X, h, z],
            [X, h, Z],
            [x, h, Z],
          ],
          color,
          null,
          true,
        );
      for (const [a, b] of [
        [x, z],
        [x, Z],
        [X, z],
        [X, Z],
      ])
        path(
          [
            [a, y, b],
            [a, Y, b],
          ],
          color,
          null,
          true,
        );
    }
    return;
  }
  if (active === 'drone' || moveObject?.key === 'drones') {
    const d = moveObject ? model.map.drones[moveObject.index] : { hover: 0, color: 3 },
      y = L.droneOrigin({ ...d, x: hover.x, y: hover.y ?? layer, z: hover.z })[1],
      x = hover.x,
      z = hover.z;
    path(
      [
        [x, y - 0.56, z],
        [x - 0.22, y, z],
        [x, y + 0.56, z],
        [x + 0.22, y, z],
      ],
      colors[d.color],
      fill,
      true,
    );
    path(
      [
        [x, y, z - 0.22],
        [x, y + 0.56, z],
        [x, y, z + 0.22],
        [x, y - 0.56, z],
      ],
      colors[d.color],
      null,
      true,
    );
    return;
  }
  if (active === 'torch' || moveObject?.key === 'torches') {
    const torch = moveObject
        ? { ...model.map.torches[moveObject.index], ...hover }
        : {
            ...hover,
            face: hover.face || (torchFace.value === 'auto' ? 'south' : torchFace.value),
          },
      f = L.torchFrame({ ...torch, y: torch.y ?? layer });
    const local = (u, y, n) =>
      f.origin.map((p, k) => p + f.u[k] * u + (k === 1 ? y : 0) + f.n[k] * n);
    path(
      [
        local(-0.1, -0.27, 0.04),
        local(0.1, -0.27, 0.04),
        local(0.1, 0.17, 0.04),
        local(-0.1, 0.17, 0.04),
      ],
      color,
      null,
      true,
    );
    path([local(0, -0.23, 0.15), local(0, 0.1, 0.25), local(0, 0.47, 0.25)], '#efbd72', null, true);
    return;
  }
  if (active === 'spikes' || moveObject?.key === 'spikes') {
    const trap = moveObject
        ? { ...model.map.spikes[moveObject.index], ...hover }
        : { ...hover, face: hover.face || (spikeFace.value === 'auto' ? 'top' : spikeFace.value) },
      f = JellyLevelFeatures.spikeFrame(trap, trap.y ?? layer);
    const projectLocal = (u, n, v) =>
        f.origin.map((p, k) => p + f.u[k] * u + f.n[k] * n + f.v[k] * v),
      tint = moveObject
        ? trap.color === undefined
          ? '#d4dbe5'
          : colors[trap.color]
        : spikeColor.value === ''
          ? '#d4dbe5'
          : colors[Number(spikeColor.value)];
    for (const u of [-0.21, 0.21])
      for (const v of [-0.21, 0.21]) {
        const rim = [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ].map(([x, z]) => projectLocal(u + x * 0.132, 0.012, v + z * 0.132));
        path(rim, tint, null, true);
        for (const sign of [-1, 1])
          path(
            [
              projectLocal(u + sign * 0.075, 0.015, v - 0.075),
              projectLocal(u, 0.255, v),
              projectLocal(u + sign * 0.075, 0.015, v + 0.075),
            ],
            tint,
            null,
            true,
          );
      }
    return;
  }
  if (gesture?.rectangle) {
    for (let z = Math.min(gesture.start.z, hover.z); z <= Math.max(gesture.start.z, hover.z); z++)
      for (let x = Math.min(gesture.start.x, hover.x); x <= Math.max(gesture.start.x, hover.x); x++)
        square({ x, z }, gesture.blockY + 0.04, color, fill, true);
    return;
  }
  const y = hover.y ?? layer;
  square(hover, y + 0.045, color, fill, active !== 'select');
  const height =
    active === 'crate-large'
      ? 0.98
      : active === 'crate' || active.startsWith('spawn-')
        ? 0.84
        : active === 'archer'
          ? 1.2
          : cubeTool(active) || moveObject?.key === 'blocks'
            ? 1
            : moveObject?.key === 'crates'
              ? 0.84
              : 0;
  if (height) {
    const cube = cubeTool(active) || moveObject?.key === 'blocks',
      top = cube ? y + 0.045 : y + height,
      base = cube ? y - 1 : y;
    for (const dx of [-0.46, 0.46])
      for (const dz of [-0.46, 0.46])
        path(
          [
            [hover.x + dx, base, hover.z + dz],
            [hover.x + dx, top, hover.z + dz],
          ],
          color,
          null,
          true,
        );
    square(hover, top, color, null, true);
  }
}
function rebuildPreview() {
  const featureTime = previewRuntime?.world.featureTime ?? 0;
  previewRuntime = L.instantiate(model.map, JellyPhysics, JellySoftBody);
  previewRuntime.effects = new JellyEffects.System({ reducedMotion: true });
  previewRuntime.won = false;
  previewRuntime.reducedMotion = true;
  previewRuntime.world.featureTime = featureTime;
  previewRuntime.bridges.forEach((b) => (b.progress = 1));
  previewRuntime.world.droneBeams = previewRuntime.world.traceDrones(
    previewRuntime.bodies,
    previewRuntime.soft,
  );
  previewRenderer.bridgeKey = undefined;
  previewRenderer.decorationKey = undefined;
  previewRenderer.propGeometryKey = undefined;
  previewRenderer.goalGlowStrength = [];
  previewRenderer.goalWinGlow = 0;
  previewDirty = false;
}
function previewTick(t) {
  previewFrame = 0;
  if (!previewRenderer?.ready) return;
  const dt = Math.min(0.05, (t - previewLast) / 1000 || 0.016);
  previewLast = t;
  if (fpsLast) {
    fpsElapsed += (t - fpsLast) / 1000;
    fpsFrames++;
    if (fpsElapsed >= 0.5) {
      $('editor-fps').textContent = Math.round(fpsFrames / fpsElapsed) + ' FPS';
      fpsElapsed = 0;
      fpsFrames = 0;
    }
  }
  fpsLast = t;
  if (previewDirty) rebuildPreview();
  previewRuntime.world.featureTime += dt;
  previewRuntime.world.stepSpikes(previewRuntime.bodies, dt);
  previewRenderer.colliders = $('preview-colliders').checked;
  previewRenderer.render(
    previewRuntime,
    previewRuntime.players,
    previewCamera,
    previewAngle,
    reducedMotion ? 0 : t / 1000,
    previewScale(),
    dt,
  );
  drawSpatialOverlay();
  previewFrame = requestAnimationFrame(previewTick);
}
function panView(dx, dy, clientX, clientY) {
  const r = $('viewport').getBoundingClientRect();
  clientX ??= r.left + r.width / 2;
  clientY ??= r.top + r.height / 2;
  const a = S.plane(
      screenRay({ clientX: clientX - dx, clientY: clientY - dy }),
      previewCamera.targetY || 0,
    ),
    b = S.plane(screenRay({ clientX, clientY }), previewCamera.targetY || 0);
  if (a && b) {
    previewCamera.x += a.position[0] - b.position[0];
    previewCamera.z += a.position[2] - b.position[2];
  }
}
function cameraTick(t) {
  const dt = Math.min(0.05, (t - cameraLast) / 1000 || 0.016);
  cameraLast = t;
  if (startViewPreview) {
    updateStartViewPreview(dt);
    requestAnimationFrame(cameraTick);
    return;
  }
  const angleDelta = previewTargetAngle - previewAngle,
    pitchDelta = previewTargetPitch - previewCamera.pitch;
  let moved = false;
  if (Math.abs(angleDelta) > 1e-6 || Math.abs(pitchDelta) > 1e-6) {
    const blend = reducedMotion ? 1 : 1 - Math.exp(-dt * 11);
    previewAngle =
      Math.abs(angleDelta) < 0.0001 ? previewTargetAngle : previewAngle + angleDelta * blend;
    previewCamera.pitch =
      Math.abs(pitchDelta) < 0.0001 ? previewTargetPitch : previewCamera.pitch + pitchDelta * blend;
    moved = true;
  }
  if (
    panKeys.size &&
    !editingField(document.activeElement) &&
    (!gesture || gesture.pan || gesture.orbit)
  ) {
    const x =
      Number(panKeys.has('KeyD') || panKeys.has('ArrowRight')) -
      Number(panKeys.has('KeyA') || panKeys.has('ArrowLeft'));
    const y =
      Number(panKeys.has('KeyS') || panKeys.has('ArrowDown')) -
      Number(panKeys.has('KeyW') || panKeys.has('ArrowUp'));
    const length = Math.hypot(x, y);
    if (length) {
      panView((-x / length) * 320 * dt, (-y / length) * 320 * dt);
      moved = true;
    }
  }
  if (moved) {
    refreshHover();
    invalidate();
  }
  requestAnimationFrame(cameraTick);
}
async function initPreview() {
  $('gpu-message').hidden = false;
  $('gpu-message').textContent = 'Загружаем 3D…';
  try {
    previewRenderer = new JellyGPU.Renderer($('preview'), JellySoftBody);
    previewRenderer.onFailure = (message) => {
      $('gpu-message').hidden = false;
      $('gpu-message').textContent = message;
    };
    previewPromise = previewRenderer.init();
    await previewPromise;
    $('gpu-message').hidden = true;
    if (!previewFrame) previewFrame = requestAnimationFrame(previewTick);
  } catch (error) {
    $('gpu-message').hidden = false;
    $('gpu-message').textContent = error.message;
  }
}
function turnCamera(delta) {
  stopStartViewPreview();
  previewTargetAngle += delta;
}
$('fit').onclick = fit;
$('rotate-left').onclick = () => turnCamera(-Math.PI / 4);
$('rotate-right').onclick = () => turnCamera(Math.PI / 4);
$('connections').onchange = invalidate;
$('brush-height').onchange = () => {
  refreshHover();
  invalidate();
};
$('undo').onclick = () => {
  finishGesture();
  if (model.undo()) {
    moveObject = null;
    selected = null;
    changed();
  }
};
$('redo').onclick = () => {
  if (model.redo()) {
    selected = null;
    changed();
  }
};
$('level-name').onchange = (event) =>
  edit((map) => {
    map.name = event.target.value.trim() || 'Без названия';
  });
function replaceMap(map, filename = sourceFilename) {
  finishGesture();
  const changedMap = model.load(L.voxelize(map));
  sourceFilename = filename;
  if (changedMap) {
    selected = null;
    moveObject = null;
    expandedIssues = false;
    changed();
    if (model.map.camera) {
      previewAngle = previewTargetAngle = LevelCamera.angle(model.map);
      previewCamera.pitch = previewTargetPitch = model.map.camera.pitch;
    }
    fit();
  } else save();
}
$('new').onclick = () => replaceMap(L.blank(), null);
const catalogPicker = element('label', undefined, 'catalog-picker'),
  catalogSelect = element('select');
catalogSelect.id = 'catalog-map';
catalogSelect.setAttribute('aria-label', 'Карта кампании');
for (const [index, file] of JellyLevelCatalog.standard.entries()) {
  const option = element(
    'option',
    `${index + 1}. ${L.displayName(L.standardLevel(index + 1), JellyI18n.language)}`,
  );
  option.dataset.levelName = String(index + 1);
  option.value = file;
  catalogSelect.append(option);
}
catalogSelect.value = JellyLevelCatalog.standard.includes(sourceFilename)
  ? sourceFilename
  : JellyLevelCatalog.standard[0];
catalogPicker.append(catalogSelect);
addEventListener('languagechange', () => {
  for (const option of catalogSelect.options) {
    // Campaign maps only; "Other maps" keep their file names.
    if (!option.dataset.levelName) continue;
    const index = Number(option.dataset.levelName);
    option.textContent = `${index}. ${L.displayName(L.standardLevel(index), JellyI18n.language)}`;
  }
});
// Maps in levels/ outside the campaign, listed by the dev server or the build's index.
const otherMaps = element('optgroup');
otherMaps.label = 'Другие карты';
fetch('levels/index.json', { cache: 'no-store' })
  .then((response) => (response.ok ? response.json() : { levels: [] }))
  .then(({ levels = [] }) => {
    for (const file of levels.filter((file) => !JellyLevelCatalog.standard.includes(file))) {
      const option = element('option', file.replace(/\.json$/i, ''));
      option.value = file;
      otherMaps.append(option);
    }
    if (otherMaps.children.length) catalogSelect.append(otherMaps);
    if ([...otherMaps.children].some((option) => option.value === sourceFilename))
      catalogSelect.value = sourceFilename;
  })
  .catch(() => {});
const openCatalogMap = element('button', 'Открыть карту');
openCatalogMap.id = 'open-catalog-map';
openCatalogMap.onclick = async () => {
  const file = catalogSelect.value,
    index = JellyLevelCatalog.standard.indexOf(file);
  if (index >= 0) return replaceMap(L.standardLevel(index + 1), file);
  try {
    const response = await fetch('levels/' + file, { cache: 'no-store' });
    if (!response.ok) throw Error(response.status + ' ' + response.statusText);
    replaceMap(L.read(await response.json()), file);
  } catch (error) {
    toast('Карту не удалось открыть: ' + error.message);
  }
};
const mapActions = element('div', undefined, 'header-map-actions');
mapActions.append(catalogPicker, openCatalogMap, $('new'));
$('import').before(mapActions);
$('validate').onclick = () => {
  expandedIssues = !expandedIssues;
  renderIssues();
  if (!L.issues(model.map).length) toast('Уровень готов к запуску.');
};
$('export').onclick = () => {
  const blob = new Blob([JSON.stringify(model.map, null, 2) + '\n'], { type: 'application/json' }),
    url = URL.createObjectURL(blob),
    link = element('a');
  link.href = url;
  link.download =
    sourceFilename ||
    (model.map.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').trim() || 'level') + '.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Уровень экспортирован.');
};
$('import').onclick = () => $('file').click();
$('file').onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 1024 * 1024) throw new Error('Файл слишком большой (максимум 1 МБ).');
    const imported = L.read(await file.text());
    replaceMap(imported, file.name);
    toast('Уровень импортирован.');
  } catch (error) {
    toast('Импорт не выполнен: ' + error.message);
  }
  event.target.value = '';
};
$('play').onclick = () => {
  finishGesture();
  const errors = L.issues(model.map);
  if (errors.length) {
    expandedIssues = true;
    renderIssues();
    toast('Перед запуском исправьте замечания в панели уровня.');
    $('validate').focus();
    return;
  }
  try {
    if (!save()) return;
    localStorage.setItem(L.PLAY_KEY, JSON.stringify(L.read(model.map)));
    location.href = './?level=editor';
  } catch (error) {
    toast('Не удалось подготовить запуск: ' + error.message);
  }
};
addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.code === 'KeyS') {
    event.preventDefault();
    if (event.target.closest('input,select,textarea')) event.target.blur();
    save();
    return;
  }
  if (
    event.target.matches('input[type="number"]') &&
    ['ArrowUp', 'ArrowDown'].includes(event.code) &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    event.preventDefault();
    const input = event.target,
      step = Number.isInteger(Number(input.step || 1)) ? 1 : 0.1;
    const value =
      Math.round(((Number(input.value) || 0) + (event.code === 'ArrowUp' ? step : -step)) * 1e10) /
      1e10;
    const next = Math.max(
      input.min === '' ? -Infinity : Number(input.min),
      Math.min(input.max === '' ? Infinity : Number(input.max), value),
    );
    if (next !== Number(input.value) || input.value === '') {
      input.value = next;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return;
  }
  if (editingField(event.target)) return;
  if (startViewPreview) {
    stopStartViewPreview();
    if (event.code === 'Escape') {
      event.preventDefault();
      return;
    }
  }
  if ((event.ctrlKey || event.metaKey) && event.code === 'KeyZ') {
    event.preventDefault();
    (event.shiftKey ? $('redo') : $('undo')).click();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.code === 'KeyY') {
    event.preventDefault();
    $('redo').click();
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (panCodes.has(event.code)) {
    event.preventDefault();
    panKeys.add(event.code);
    return;
  }
  if (event.code === 'Space' && event.target.closest('button,a')) return;
  if (event.code === 'Space') {
    event.preventDefault();
    space = true;
  }
  if (event.code === 'Escape') {
    moveObject = null;
    selectTool('select');
  }
  if (event.code === 'KeyF') {
    event.preventDefault();
    fit();
  }
  if (event.code === 'KeyV') selectTool('select');
  if (event.code === 'KeyB') selectTool('floor');
  if (event.code === 'KeyX') selectTool('erase');
  if (event.code === 'KeyM') selectTool('pan');
  if (!event.repeat && event.code === 'KeyQ') turnCamera(-Math.PI / 4);
  if (!event.repeat && event.code === 'KeyE') turnCamera(Math.PI / 4);
  if (event.code === 'Delete' && selected) {
    edit(() => model.erase(selected.x, selected.z, selected.y));
  }
});
addEventListener('keyup', (event) => {
  panKeys.delete(event.code);
  if (event.code === 'Space') space = false;
});
addEventListener('focusin', (event) => {
  if (editingField(event.target)) {
    panKeys.clear();
    space = false;
  }
});
function releaseCameraKeys() {
  panKeys.clear();
  space = false;
  finishGesture();
}
addEventListener('blur', releaseCameraKeys);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) releaseCameraKeys();
});
new ResizeObserver(() => {
  refreshHover();
  invalidate();
}).observe($('viewport'));
selectTool('select');
renderPanels();
fit();
requestAnimationFrame(cameraTick);
initPreview();
if (startupError) {
  $('save-status').textContent = 'Черновик не открыт';
  toast(startupError);
}
