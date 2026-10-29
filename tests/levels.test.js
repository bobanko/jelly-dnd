import * as importedCatalog from '../levels/catalog.js';
import sunkenSanctum from '../levels/05-sunken-sanctum.json' with { type: 'json' };
import * as EditorSpace from '../editor-space.js';
import { readLevelFile } from './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import L from '../levels.js';
import { Model } from '../editor-model.js';
import * as Physics from '../physics.js';
import * as Soft from '../soft-body.js';

test('starting camera survives level roundtrip, voxel conversion, editor history and reset', () => {
  // The legacy Sunken Sanctum predates start cameras; campaign maps store authored views.
  const original = L.copy(sunkenSanctum),
    model = new Model(original);
  assert.equal(model.map.camera, undefined, 'old files retain their default view');
  const authored = L.standardLevel(1);
  assert.deepEqual(
    new Model(authored).map.camera,
    authored.camera,
    'authored start views load unchanged',
  );
  model.change((map) => {
    map.camera = { yaw: 135.5, pitch: 37 };
  });
  const saved = L.read(JSON.stringify(model.map));
  assert.deepEqual(saved.camera, { yaw: 135.5, pitch: 37 });
  assert.deepEqual(L.voxelize(saved).camera, saved.camera);
  model.undo();
  assert.equal(model.map.camera, undefined);
  model.redo();
  assert.deepEqual(model.map.camera, saved.camera);
  model.change((map) => {
    delete map.camera;
  });
  assert.equal(model.map.camera, undefined);
  model.undo();
  assert.deepEqual(model.map.camera, saved.camera);
  assert.equal(L.read({ ...original, camera: { yaw: 360, pitch: 55 } }).camera.yaw, 0);
  for (const camera of [
    null,
    [],
    false,
    'view',
    { yaw: -1 },
    { yaw: 361 },
    { yaw: NaN },
    { yaw: Infinity },
    { yaw: '90' },
    { pitch: 19 },
    { pitch: 86 },
    { pitch: Infinity },
  ])
    assert.throws(() => L.read({ ...original, camera }));
});
test('color group bindings roundtrip and survive removing one of the same-color plates', () => {
  const map = L.blank();
  map.tiles = [
    { x: 2, z: 2, height: 0 },
    { x: 3, z: 2, height: 0 },
  ];
  map.plates = [
    { id: 'a', color: 'red', x: 2, z: 2, y: 0 },
    { id: 'b', color: 'red', x: 3, z: 2, y: 0 },
  ];
  map.bridges = [{ x: 4, z: 2, y: 0, plate: 'red' }];
  map.spikes = [{ x: 5, z: 2, y: 0, plate: 'red' }];
  map.plates.shift();
  const saved = L.read(JSON.stringify(map)),
    { world } = L.instantiate(saved, Physics, Soft);
  assert.equal(saved.bridges[0].plate, 'red');
  assert.equal(saved.spikes[0].plate, 'red');
  assert.ok(
    !L.issues(saved).some(
      (message) => message.includes('не привязан') || message.includes('связанная кнопка'),
    ),
  );
  world.refresh([{ x: 3, z: 2, y: 0 }]);
  assert.equal(world.held.has(0), true);
  assert.equal(world.spikeState(world.spikes[0]).dangerous, false);
  world.beforeFeatures(world.bodies, world.soft, 0.3);
  assert.equal(world.spikeState(world.spikes[0]).dangerous, true);
});

test('spike control settings roundtrip, survive repaint and reject malformed values', () => {
  const model = new Model(L.blank());
  model.change(() => model.paint('spikes', 2, 2, { voxel: true, y: 0 }));
  model.change((map) =>
    Object.assign(map.spikes[0], { cycle: 0, enabled: false, plate: 'switch', offset: 20 }),
  );
  model.change(() => model.paint('spikes', 2, 2, { voxel: true, y: 0, color: 1 }));
  const spike = L.read(JSON.stringify(model.map)).spikes[0];
  assert.equal(spike.cycle, 0);
  assert.equal(spike.enabled, false);
  assert.equal(spike.plate, 'switch');
  assert.equal(spike.offset, 20);
  assert.ok(L.issues(model.map).some((issue) => issue.includes('связанная кнопка')));
  for (const bad of [{ cycle: -1 }, { cycle: Infinity }, { enabled: 'false' }, { plate: 2 }]) {
    const map = L.copy(model.map);
    Object.assign(map.spikes[0], bad);
    assert.throws(() => L.read(map));
  }
});

test('editor expands beyond legacy borders in every direction and roundtrips coordinates', () => {
  const model = new Model(L.blank());
  model.change(() => {
    for (const [x, z] of [
      [-4, -7],
      [24, 32],
    ])
      model.paint('floor', x, z, { voxel: true, y: 0 });
  });
  assert.deepEqual(
    model.map.blocks.map((p) => [p.x, p.z]),
    [
      [-4, -7],
      [24, 32],
    ],
  );
  assert.ok(model.map.size >= 33);
  assert.deepEqual(L.read(JSON.stringify(model.map)), model.map);
  const runtime = L.instantiate(model.map, Physics, Soft);
  assert.equal(runtime.world.heightAt(-4, -7), 0);
  model.undo();
  assert.equal(model.map.blocks.length, 0);
  model.redo();
  assert.equal(model.map.blocks.length, 2);
});

test('targeted erasing removes one attachment and keeps its host, neighbours and undo history', () => {
  const map = L.blank();
  map.blocks = [{ x: 2, y: 1, z: 2 }];
  map.torches = [
    { x: 2, y: 1, z: 2, face: 'south' },
    { x: 2, y: 1, z: 2, face: 'east' },
  ];
  map.spikes = [{ x: 2, y: 1, z: 2, offset: 0 }];
  const model = new Model(map);
  model.begin();
  assert.equal(model.eraseObject('torches', 1), true);
  assert.equal(model.commit(), true);
  assert.equal(model.map.blocks.length, 1);
  assert.equal(model.map.spikes.length, 1);
  assert.equal(model.map.torches[0].face, 'south');
  assert.equal(model.map.torches.length, 1);
  model.undo();
  assert.equal(model.map.torches.length, 2);
  model.redo();
  assert.equal(model.map.torches.length, 1);
  assert.equal(model.eraseObject('torches', 9), false);
});

test('every catalog entry loads an independent valid JSON map and routes to the same level', () => {
  const catalog = importedCatalog;
  assert.ok(catalog.standard.length > 0);
  assert.ok(Array.isArray(catalog.extra));
  for (const [index, file] of catalog.standard.entries()) {
    const map = L.standardLevel(index + 1);
    assert.equal(map.name, readLevelFile(file).name);
    assert.deepEqual(L.issues(L.read(map)), []);
    assert.deepEqual(L.forGame(undefined, '?level=' + (index + 1)), L.read(map));
    map.name = 'Changed';
    assert.notEqual(L.standardLevel(index + 1).name, 'Changed');
    assert.ok(L.displayName(map, 'ru'));
  }
});

test('ordinary game starts with the first catalog map and follows reordering', () => {
  const catalog = importedCatalog;
  assert.equal('defaultLevel' in catalog, false);
  assert.deepEqual(L.forGame(), L.read(L.standardLevel(1)));
  catalog.standard.reverse();
  try {
    assert.deepEqual(L.forGame(), L.read(L.standardLevel(1)));
  } finally {
    catalog.standard.reverse();
  }
});
test('level title translations roundtrip through editor data and fall back to the primary name', () => {
  const map = L.standardLevel(1);
  map.name = 'A new title';
  map.names = { ru: 'Russian title', de: 'German title' };
  const restored = L.read(JSON.parse(JSON.stringify(new Model(map).map)));
  assert.equal(L.displayName(restored, 'en'), 'A new title');
  assert.equal(L.displayName(restored, 'ru'), 'Russian title');
  assert.equal(L.displayName(restored, 'de'), 'German title');
  assert.equal(L.displayName(restored, 'fr'), 'A new title');
});

test('original map roundtrips without live state and produces the existing scene', () => {
  const map = L.read(JSON.stringify(L.copy(sunkenSanctum)));
  assert.deepEqual(L.issues(map), []);
  assert.deepEqual(L.read(JSON.stringify(map)), map);
  const runtime = L.instantiate(map, Physics, Soft);
  assert.equal(runtime.floor.size, 78);
  assert.equal(runtime.players.length, 3);
  assert.equal(runtime.crates[0].y, 1);
  assert.equal(runtime.world.portals.length, 4);
  assert.equal(runtime.world.archers.length, 1);
  assert.equal(runtime.world.heightAt(6, 9), 1);
  assert.equal(runtime.world.heightAt(5, 7), 0);
  runtime.players[0].shield = 'test';
  runtime.world.archers[0].state = 'dead';
  assert.equal(map.spawns[0].shield, undefined);
  assert.equal(map.archers[0].state, undefined);
});

test('schema rejects malformed coordinates, unsafe quantities, duplicate ids and invalid directions', () => {
  for (const modify of [
    (m) => (m.version = 2),
    (m) => (m.size = 1.5),
    (m) => (m.tiles[0].x = 1.5),
    (m) => (m.tiles[0].height = Infinity),
    (m) => (m.spawns = []),
    (m) => m.tiles.push({ ...m.tiles[0] }),
    (m) => (m.archers[0].dx = 1),
    (m) => (m.portals[0].color = 'unknown'),
    (m) => (m.pickups[0].kind = 'staff'),
    (m) => (m.plates[1].id = m.plates[0].id),
    (m) => (m.crates = Array.from({ length: 5 }, (_, x) => ({ x, z: 3 }))),
  ]) {
    const map = L.copy(sunkenSanctum);
    modify(map);
    assert.throws(() => L.read(map));
  }
  const map = L.copy(sunkenSanctum);
  map.arbitrary = '<script>';
  map.archers[0].state = 'dead';
  map.tiles[0].extra = true;
  const clean = L.read(map);
  assert.equal(clean.arbitrary, undefined);
  assert.equal(clean.archers[0].state, undefined);
  assert.equal(clean.tiles[0].extra, undefined);
});

test('draft validation finds missing spawns, unpaired portals, unsafe markers and broken bridge links', () => {
  assert.equal(L.issues(L.blank()).length, 1);
  const map = L.read(L.copy(sunkenSanctum));
  map.portals.pop();
  map.plates.pop();
  map.spawns[0] = { x: 5, z: 5 };
  map.goals[1] = { ...map.goals[2] };
  const errors = L.issues(map);
  assert.ok(errors.some((e) => e.includes('минимум два')));
  assert.ok(errors.some((e) => e.includes('не привязан')));
  assert.ok(errors.some((e) => e.includes('постоянной площадке')));
  assert.ok(errors.some((e) => e.includes('Финиши должны')));
  assert.throws(() => L.forGame({ getItem: () => JSON.stringify(map) }, '?level=editor'));
  assert.throws(() => L.forGame({ getItem: () => null }, '?level=editor'));
  assert.deepEqual(
    L.issues(L.forGame({ getItem: () => '{bad' }, '')),
    [],
    'default game never reads the draft',
  );
});

test('one painted gesture undoes as one operation; redo and invalid changes preserve the map', () => {
  const m = new Model(L.blank());
  m.begin();
  for (let x = 1; x <= 4; x++) m.paint('floor', x, 2, { height: 1 });
  assert.equal(m.commit(), true);
  assert.equal(m.undoStack.length, 1);
  assert.equal(m.map.tiles.length, 4);
  m.undo();
  assert.equal(m.map.tiles.length, 0);
  m.redo();
  assert.equal(m.map.tiles.length, 4);
  const before = L.copy(m.map);
  assert.throws(() => m.change((map) => (map.tiles[0].x = 1.5)));
  assert.deepEqual(m.map, before);
  m.undo();
  m.change(() => m.paint('floor', 8, 8));
  assert.equal(m.redoStack.length, 0);
});

test('editor places the full arsenal, preserves floor height and relinks buttons by stable id', () => {
  const m = new Model(L.blank());
  const catalog = [
    'floor',
    'wall',
    'torch',
    'spawn-0',
    'spawn-1',
    'spawn-2',
    'spawn-3',
    'spawn-4',
    'goal-0',
    'goal-1',
    'goal-2',
    'goal-3',
    'goal-4',
    'plate',
    'bridge',
    'lift',
    'spikes',
    'portal-violet',
    'portal-amber',
    'crate',
    'archer',
    'shield',
    'sword',
  ];
  catalog.forEach((tool, i) =>
    m.change(() => m.paint(tool, i % 8, Math.floor(i / 8), { height: 1 })),
  );
  assert.equal(m.map.archers.length, 1);
  assert.equal(m.map.pickups.length, 2);
  assert.equal(m.map.walls.length, 1);
  assert.equal(m.map.torches.length, 1);
  assert.ok(m.map.spawns.every(Boolean));
  const plate = m.map.plates[0],
    bridge = m.map.bridges[0];
  assert.equal(bridge.plate, plate.id);
  assert.equal(bridge.y, 1);
  m.move('plates', 0, 12, 12);
  assert.equal(m.map.bridges[0].plate, plate.id);
  m.change(() => m.paint('plate', 11, 12));
  m.change((map) => map.plates.reverse());
  const runtime = L.instantiate(m.map, Physics, Soft);
  assert.equal(runtime.bridges[0].plate, 1);
  const original = { ...m.map.spawns[0] };
  m.change(() => m.paint('spawn-0', 13, 13));
  assert.deepEqual(m.map.spawns[0], { x: 13, z: 13 });
  m.undo();
  assert.deepEqual(m.map.spawns[0], original);
});

test('eraser, resize, entity move and map replacement are reversible and enforce limits', () => {
  const m = new Model(L.copy(sunkenSanctum)),
    initial = L.copy(m.map);
  m.change(() => m.erase(9, 7));
  assert.equal(m.map.spawns[2], null);
  m.undo();
  assert.deepEqual(m.map, initial);
  m.resize(8);
  assert.equal(m.map.spawns[1], null);
  assert.ok(m.map.tiles.every((p) => p.x < 8 && p.z < 8));
  m.undo();
  assert.deepEqual(m.map, initial);
  m.move('pickups', 0, 12, 12);
  assert.equal(m.map.pickups[0].x, 12);
  m.undo();
  assert.deepEqual(m.map, initial);
  m.load(L.blank());
  assert.equal(m.map.tiles.length, 0);
  m.undo();
  assert.deepEqual(m.map, initial);
  m.change(() => m.paint('portal-violet', 12, 12));
  assert.equal(m.map.portals.filter((p) => p.color === 'violet').length, 3);
  m.undo();
  assert.deepEqual(m.map, initial);
});

test('raised spawns, ground crates, elevated bridges and lifts use the same heights as the editor', () => {
  const map = L.read(L.copy(sunkenSanctum));
  map.spawns[0] = { x: 5, z: 9 };
  map.crates = [{ x: 6, z: 7 }];
  map.bridges[0].y = 1;
  const r = L.instantiate(map, Physics, Soft);
  assert.equal(r.start[0].y, 1);
  assert.equal(r.players[0].y, 1);
  assert.equal(r.crates[0].spawn.y, 0);
  r.bridges[0].progress = 1;
  assert.equal(r.world.heightAt(8, 4), 1);
  assert.equal(r.world.bridgeBounds(0).maxY, 1);
  r.world.lifts[0].base = 1;
  r.world.lifts[0].top = 2;
  r.world.resetFeatures();
  assert.equal(r.world.heightAt(5, 7), 1);
});

test('wall torch limits and moving a mounted light preserve its face and real light height without colliders', () => {
  const m = new Model(L.blank());
  for (let x = 0; x < 8; x++) m.change(() => m.paint('torch', x, 1));
  assert.throws(() => m.change(() => m.paint('torch', 9, 1)));
  assert.equal(m.map.torches.length, 8);
  m.move('torches', 0, 9, 2, 3);
  assert.equal(m.map.torches[0].y, 3);
  assert.equal(m.map.torches[0].face, 'south');
  const runtime = L.instantiate(m.map, Physics, Soft);
  assert.equal(runtime.world.obstacles.length, 0);
  assert.equal(L.torchFrame(runtime.world.torches[0]).light[1], 2.82);
  assert.ok(
    runtime.world.debugBoxes().every((b) => b.kind === 'block'),
    'only supporting masonry has colliders',
  );
  const imported = L.copy(m.map);
  imported.torches.push({ x: 10, y: 1, z: 1, face: 'east' });
  assert.throws(() => L.read(imported));
});

test('torches on four wall faces coexist with mechanisms, roundtrip and remain selectable outside their host', () => {
  const S = EditorSpace,
    m = new Model(L.blank());
  for (const face of ['north', 'east', 'south', 'west'])
    m.change(() => m.paint('torch', 3, 3, { voxel: true, y: 2, face }));
  m.change(() => m.paint('plate', 3, 3, { voxel: true, y: 2 }));
  assert.equal(m.map.torches.length, 4);
  assert.equal(m.map.plates.length, 1);
  assert.deepEqual(L.read(JSON.stringify(m.map)), m.map);
  const runtime = L.instantiate(m.map, Physics, Soft);
  assert.equal(runtime.world.torches.length, 4);
  assert.equal(runtime.world.collisionBoxes().length, 1);
  const bounds = S.boxes(m.map).filter((b) => b.key === 'torches');
  assert.equal(bounds.length, 4);
  for (const p of m.map.torches) {
    const f = L.torchFrame(p),
      box = bounds.find((b) => b.face === p.face);
    assert.ok(f.light.every((v, k) => v >= box.min[k] && v <= box.max[k]));
    const ray = { origin: f.origin.map((v, k) => v + f.n[k] * 2), direction: f.n.map((v) => -v) },
      hit = S.pick(ray, S.boxes(m.map), 16);
    assert.equal(hit.key, 'torches');
    assert.equal(hit.face, p.face);
  }
  assert.throws(
    () => m.change((map) => (map.torches[0].face = 'east')),
    'duplicate mount should reject',
  );
  assert.equal(m.map.torches[0].face, 'north');
});

test('legacy narrow torch obstacles migrate to masonry mounts once and missing hosts are reported', () => {
  const map = L.copy(sunkenSanctum);
  map.torches = [];
  map.walls.push({ x: 1, z: 2, half: 0.17, base: 0, height: 0.56 });
  const migrated = L.read(map);
  assert.equal(migrated.torches.length, 1);
  assert.ok(migrated.walls.every((w) => w.half >= 0.4));
  assert.deepEqual(migrated.torches[0], { x: 0, y: 1, z: 2, face: 'east' });
  assert.deepEqual(L.read(migrated), migrated);
  assert.deepEqual(L.issues(migrated), []);
  assert.deepEqual(L.voxelize(migrated).torches, migrated.torches);
  const missing = L.blank();
  missing.torches = [{ x: 2, y: 1, z: 2, face: 'north' }];
  assert.ok(L.issues(L.read(missing)).some((s) => s.includes('блок крепления')));
  for (const p of [
    { x: 2, y: 1, z: 2, face: 'top' },
    { x: 2, y: 1.5, z: 2, face: 'east' },
    { x: 2, y: 1, z: 2, face: '__proto__' },
  ]) {
    missing.torches = [p];
    assert.throws(() => L.read(missing));
  }
});

test('any one to five colours form a valid party, and only their matching markers are required', () => {
  for (const slots of [
    [0],
    [1],
    [2],
    [3],
    [4],
    [0, 1],
    [1, 3],
    [3, 4],
    [0, 1, 2],
    [0, 1, 2, 3],
    [0, 1, 2, 3, 4],
  ]) {
    const m = new Model(L.blank());
    for (const slot of slots) {
      m.change(() => m.paint('spawn-' + slot, slot * 2 + 1, 2));
      m.change(() => m.paint('goal-' + slot, slot * 2 + 1, 4));
    }
    assert.deepEqual(L.issues(m.map), []);
    const r = L.instantiate(m.map, Physics, Soft);
    assert.deepEqual(
      r.players.map((p) => p.slot),
      slots,
    );
    assert.equal(r.bodies.length, slots.length);
    assert.equal(r.goals.length, slots.length);
    r.world.step(r.bodies, []);
    assert.ok(r.players.every((p) => p.state === 'alive'));
    const original = L.copy(m.map);
    m.remove('spawns', slots[0]);
    assert.equal(L.issues(m.map).length, slots.length === 1 ? 1 : 0);
    m.undo();
    assert.deepEqual(m.map, original);
    m.remove('goals', slots[0]);
    assert.ok(L.issues(m.map).some((e) => e.includes('Финиш')));
  }
  const old = L.copy(sunkenSanctum);
  old.spawns.pop();
  old.goals.pop();
  const migrated = L.read(old);
  assert.equal(migrated.spawns.length, 5);
  assert.equal(migrated.spawns[3], null);
  assert.equal(migrated.spawns[4], null);
  assert.deepEqual(L.issues(migrated), []);
  const short = L.blank();
  short.tiles = [
    { x: 1, z: 1, height: 0 },
    { x: 2, z: 1, height: 0 },
  ];
  short.spawns = [{ x: 1, z: 1 }];
  short.goals = [{ x: 2, z: 1 }];
  assert.deepEqual(L.issues(L.read(short)), []);
  short.spawns = Array(6).fill(null);
  assert.throws(() => L.read(short));
  assert.equal(
    L.instantiate(L.blank(), Physics, Soft).players.length,
    0,
    'empty editor previews have no hidden respawning bodies',
  );
  const reduced = L.copy(sunkenSanctum);
  reduced.spawns[1] = reduced.spawns[2] = null;
  assert.deepEqual(L.issues(reduced), [], 'unused finish tiles do not require absent characters');
});
