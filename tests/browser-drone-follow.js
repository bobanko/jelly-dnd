import { chromium, seedEditorMap } from './browser-harness.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';

fs.mkdirSync('artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-webgpu'] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
    errors = [];
  page.setDefaultTimeout(30000);
  page.on('pageerror', (e) => errors.push(e.message));
  await seedEditorMap(page);
  await page.goto('http://localhost:3000/editor.html');
  await page.waitForFunction(() => previewRenderer?.ready && previewRuntime);
  await page.evaluate(() => {
    const m = L.blank();
    m.size = 8;
    for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) m.blocks.push({ x, y: 0, z });
    m.spawns[1] = { x: 4, y: 0, z: 4 };
    m.goals[1] = { x: 7, y: 0, z: 7 };
    m.drones = [{ x: 1, y: 0, z: 1, color: 1, target: 1, hover: 2 }];
    replaceMap(m);
    selected = { x: 1, y: 0, z: 1 };
    renderProperties();
  });
  const axis = (name) => page.locator(`#properties input[name="follow-drones-0"][value="${name}"]`);
  for (const name of ['x', 'y', 'z']) assert.equal(await axis(name).isChecked(), false);
  await axis('x').check();
  await axis('z').check();
  assert.deepEqual(await page.evaluate(() => model.map.drones[0].follow), ['x', 'z']);
  assert.equal(await axis('x').isChecked(), true);
  assert.equal(await axis('y').isChecked(), false);
  assert.equal(
    await page.locator('#properties input[name=color-drones-0]:checked').inputValue(),
    '1',
  );
  assert.equal(
    await page.locator('#properties input[name=target-drones-0]:checked').inputValue(),
    '1',
  );
  await page.waitForFunction(
    () =>
      !previewDirty &&
      previewRuntime.world.droneBeams[0]?.from[0] === 4 &&
      previewRuntime.world.droneBeams[0]?.from[2] === 4,
  );
  // Clicking the moved preview still opens the authored drone's properties.
  await page.locator('[data-tool=select]').click();
  const point = await page.evaluate(() => {
    const origin = previewRuntime.world.droneOrigin(previewRuntime.world.drones[0]),
      r = $('viewport').getBoundingClientRect(),
      p = JellyGPU.projectPoint(screenFrame(), ...origin, r.width, r.height);
    return { x: r.left + p.x, y: r.top + p.y };
  });
  await page.mouse.click(point.x, point.y);
  assert.equal(await page.locator('[data-object=drones-0]').count(), 1);
  await axis('y').check();
  await page.locator('#undo').click();
  assert.equal(await page.evaluate(() => model.map.drones[0].follow.includes('y')), false);
  await page.locator('#redo').click();
  assert.equal(await page.evaluate(() => model.map.drones[0].follow.includes('y')), true);
  await page.waitForFunction(() => !previewDirty);
  await page.mouse.click(point.x, point.y);
  assert.equal(await axis('y').isChecked(), true);
  await page.evaluate(() => {
    edit((map) => {
      map.plates.push({ x: 2, y: 0, z: 2, id: 'laser-switch', color: 'red' });
      map.plates.push({ x: 2, y: 0, z: 3, id: 'other-switch', color: 'blue' });
    });
  });
  const beamMode = (value) =>
      page.locator(`#properties input[name="beam-mode-drones-0"][value="${value}"]`),
    beamGroup = (value) =>
      page.locator(`#properties input[name="beam-trigger-drones-0"][value="${value}"]`);
  await beamMode('off').check();
  await page.waitForFunction(() => !previewDirty && previewRenderer.beamCount === 0);
  await beamMode('trigger-on').check();
  await beamGroup('blue').check();
  assert.equal(await beamMode('trigger-on').isChecked(), true);
  assert.equal(
    await page.locator('#properties input[name=color-drones-0]:checked').inputValue(),
    '1',
  );
  assert.equal(
    await page.locator('#properties input[name=target-drones-0]:checked').inputValue(),
    '1',
  );
  assert.equal(await axis('y').isChecked(), true);
  await beamGroup('red').check();
  await page.waitForFunction(() => !previewDirty && previewRenderer.beamCount === 0);
  await page.evaluate(() => {
    const p = previewRuntime.players[0];
    previewRuntime.soft.translate(p, 2 - p.x, -p.y, 2 - p.z);
  });
  await page.waitForFunction(() => previewRenderer.beamCount === 1);
  await beamMode('trigger-off').check();
  // Changing properties restores authored spawn positions, where the button is unpressed.
  await page.waitForFunction(() => !previewDirty && previewRenderer.beamCount === 1);
  await page.evaluate(() => {
    const p = previewRuntime.players[0];
    previewRuntime.soft.translate(p, 2 - p.x, -p.y, 2 - p.z);
  });
  await page.waitForFunction(
    () =>
      previewRenderer.beamCount === 0 &&
      previewRuntime.world.droneOrigin(previewRuntime.world.drones[0])[0] === 2,
  );
  await page.locator('#undo').click();
  await page.evaluate(() => {
    const d = model.map.drones[0];
    selected = { x: d.x, y: d.y, z: d.z };
    renderProperties();
  });
  assert.equal(await beamMode('trigger-on').isChecked(), true);
  await page.locator('#redo').click();
  await page.evaluate(() => {
    const d = model.map.drones[0];
    selected = { x: d.x, y: d.y, z: d.z };
    renderProperties();
  });
  assert.equal(await beamMode('trigger-off').isChecked(), true);
  await page.waitForFunction(() => !previewDirty);
  await page.screenshot({ path: 'artifacts/drone-follow-editor.png' });
  const draft = await page.evaluate(() => JSON.stringify(model.map));
  await page.reload();
  await page.waitForFunction(() => previewRenderer?.ready && previewRuntime);
  assert.deepEqual(await page.evaluate(() => model.map), JSON.parse(draft));
  await page.locator('#play').click();
  await page.waitForURL('**/?level=editor');
  await page.waitForFunction(() => sceneRenderer.ready && !loadingActive && !level.assembly);
  assert.deepEqual(await page.evaluate(() => [world.drones[0].beamMode, world.drones[0].plate]), [
    'trigger-off',
    'red',
  ]);
  const aligned = () =>
    page.evaluate(() => {
      const p = players[0],
        d = world.drones[0],
        beam = world.droneBeams[0];
      return (
        beam &&
        Math.abs(beam.from[0] - p.x) < 1e-9 &&
        Math.abs(beam.from[2] - p.z) < 1e-9 &&
        Math.abs(beam.from[1] - p.y - 0.64 - d.hover) < 1e-9 &&
        sceneRenderer.crystalPieces[0].center.every((v, i) => Math.abs(v - beam.from[i]) < 1e-6)
      );
    });
  assert.ok(await aligned());
  await page.evaluate(() => {
    world.drones[0].beamMode = 'off';
  });
  await page.waitForFunction(() => world.droneBeams.length === 0 && sceneRenderer.beamCount === 0);
  const start = await page.evaluate(() => ({ x: players[0].x, z: players[0].z }));
  await page.keyboard.down('KeyD');
  await page.waitForFunction(
    (start) => Math.hypot(players[0].x - start.x, players[0].z - start.z) > 0.7,
    start,
  );
  await page.keyboard.up('KeyD');
  assert.ok(
    await page.evaluate(() => {
      const p = players[0],
        d = world.drones[0],
        origin = world.droneOrigin(d);
      return (
        world.droneBeams.length === 0 &&
        Math.abs(origin[0] - p.x) < 1e-9 &&
        sceneRenderer.crystalPieces[0].center.every((v, i) => Math.abs(v - origin[i]) < 1e-6)
      );
    }),
    'the visible drone follows the player with its laser switched off',
  );
  await page.evaluate(() => {
    world.drones[0].beamMode = 'trigger-off';
  });
  await page.waitForFunction(() => world.droneBeams.length === 1);
  assert.ok(await aligned());
  await page.evaluate(() => {
    const p = players[0];
    soft.translate(p, 0, 1.5, 0, true);
    p.state = 'falling';
    p.vy = 0;
  });
  await page.waitForFunction(() => players[0].y > 0.5 && world.droneBeams[0]?.from[1] > 3.2);
  assert.ok(await aligned(), 'Y follows vertical player motion, retaining hover clearance');
  await page.waitForFunction(() => players[0].state === 'alive');
  await page.keyboard.press('KeyZ');
  await page.waitForFunction(() => world.droneBeams.length === 1);
  assert.ok(await aligned(), 'undo recomputes following from restored bodies');
  await page.screenshot({ path: 'artifacts/drone-follow-game.png' });
  await page.keyboard.press('KeyR');
  await page.waitForFunction(() => restartTransition === null && !level.assembly);
  assert.ok(await aligned());
  assert.deepEqual(await page.evaluate(() => sceneRenderer.errors), []);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: independent beam modes and trigger groups, live preview, tracking with laser off, persistence, follow axes, picking, undo/redo and reset.',
  );
} finally {
  await browser.close();
}
