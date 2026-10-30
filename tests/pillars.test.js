import { test } from 'node:test';
import assert from 'node:assert/strict';
import L from '../src/world/levels.js';
import * as P from '../src/world/physics.js';
import * as S from '../src/world/soft-body.js';

// An 8×8 floor with a hidden corridor one storey below it (tiles at y = -2, x = 2..5, z = 3).
function hiddenCorridor() {
  const m = L.blank();
  m.size = 8;
  for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) m.blocks.push({ x, y: 0, z });
  for (let x = 2; x <= 5; x++) m.blocks.push({ x, y: -2, z: 3 });
  m.spawns[0] = { x: 3, y: -2, z: 3 };
  m.goals[0] = { x: 6, y: 0, z: 6 };
  return L.instantiate(L.read(m), P, S);
}
const at = (r, x, z) => r.world.pillars.filter((p) => p.x === x && p.z === z);

test('columns give way to a lower layer and wall it in with solid segments', () => {
  const r = hiddenCorridor();
  assert.equal(at(r, 3, 3).filter((p) => p.y > -2).length, 0, 'no column inside the corridor');
  for (const [x, z] of [
    [3, 4],
    [3, 2],
    [1, 3],
    [6, 3],
    [6, 4],
  ]) {
    const solid = at(r, x, z)
      .filter((p) => p.solid)
      .map((p) => p.y);
    assert.deepEqual(solid.slice(0, 2), [-1, -2], `wall column at ${x},${z}`);
  }
  // Far from the corridor columns stay decorative.
  assert.ok(at(r, 0, 7).every((p) => !p.solid));
  const walls = r.world.collisionBoxes().filter((b) => b.kind === 'block' && b.maxY === -1);
  assert.ok(walls.some((b) => b.x === 3 && b.z === 4));
});

test('a jelly in the hidden corridor is stopped by the column walls', () => {
  for (const input of [
    { x: 0, z: 1 },
    { x: 0, z: -1 },
    { x: 1, z: 0 },
  ]) {
    const r = hiddenCorridor(),
      jelly = r.players[0];
    for (let i = 0; i < 240; i++) r.world.step(r.bodies, [input]);
    assert.equal(jelly.state, 'alive', JSON.stringify(input));
    assert.ok(Math.abs(jelly.y + 2) < 0.1, 'still on the corridor floor');
    assert.ok(Math.abs(jelly.z - 3) < 0.5 && jelly.x < 5.5, 'kept inside the corridor');
  }
});
