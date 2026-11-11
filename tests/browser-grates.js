import { chromium, seedEditorMap } from './browser-harness.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';

fs.mkdirSync('artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-webgpu'] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seedEditorMap(page);
  await page.goto('http://localhost:3000/editor.html');
  await page.waitForFunction(() => previewRenderer?.ready && previewRuntime);
  await page.evaluate(() => {
    const m = L.blank();
    m.size = 8;
    for (let x = 0; x < 8; x++) for (let z = 0; z < 6; z++) m.blocks.push({ x, y: 0, z });
    m.spawns[0] = { x: 2, y: 0, z: 1 };
    m.goals[0] = { x: 6, y: 0, z: 4 };
    m.crates = [{ x: 4, y: 0, z: 1 }];
    replaceMap(m);
  });
  await page.locator('[data-tool=grate]').click();
  assert.equal(await page.locator('#grate-brush').isVisible(), true);
  await page.locator('input[name=grate-axis-brush][value=x]').check();
  const screen = (x, y, z) =>
    page.evaluate(
      (p) => {
        const r = document.getElementById('viewport').getBoundingClientRect(),
          point = JellyGPU.projectPoint(screenFrame(), ...p, r.width, r.height);
        return { x: r.left + point.x, y: r.top + point.y };
      },
      [x, y, z],
    );
  // Top-face placement adds a grate above the floor, without adding stone.
  await page.selectOption('#placement-mode', 'face');
  const facePoint = await screen(1, 0, 2);
  await page.mouse.click(facePoint.x, facePoint.y);
  assert.equal(await page.evaluate(() => model.at('grates', 1, 2, 1).axis), 'x');
  await page.selectOption('#placement-mode', 'layer');
  await page.selectOption('#brush-height', '1');
  // Actual pointer placement on a layer uses the same voxel height.
  for (const x of [2, 3, 4, 5, 6]) {
    const p = await screen(x, 1, 2);
    await page.mouse.click(p.x, p.y);
  }
  await page.waitForFunction(
    () => model.map.grates.length === 6 && previewRuntime.world.grates.length === 6,
  );
  assert.ok(await page.evaluate(() => !model.map.blocks.some((p) => p.y === 1)));
  await page.locator('[data-tool=select]').click();
  const p = await screen(3, 0.5, 2);
  await page.mouse.click(p.x, p.y);
  await page.locator('#properties input[name^=grate-axis-][value=z]').check();
  assert.equal(await page.evaluate(() => model.at('grates', 3, 2, 1).axis), 'z');
  assert.equal(
    await page.locator('input[name=grate-axis-brush][value=x]').isChecked(),
    true,
    'property and brush radio groups stay independent',
  );
  await page.locator('#undo').click();
  assert.equal(await page.evaluate(() => model.at('grates', 3, 2, 1).axis), 'x');
  await page.waitForFunction(() => previewRuntime.world.grates.every((p) => p.axis === 'x'));
  // Boundaries and plane controls are independent of brush shape and selected properties.
  assert.equal(await page.locator('#brush-shape select').count(), 0);
  await page.locator('#brush-shape input[value=rectangle]').check();
  assert.equal(await page.locator('#brush-shape input[value=brush]').isChecked(), false);
  await page.locator('[data-tool=grate]').click();
  await page.locator('input[name=grate-axis-brush][value=z]').check();
  await page.locator('input[name=grate-offset-brush][value="0.5"]').check();
  const a = await screen(1, 1, 4),
    b = await screen(2, 1, 4);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  assert.equal(
    await page.evaluate(
      () => model.map.grates.filter((g) => g.z === 4 && g.axis === 'z' && g.offset === 0.5).length,
    ),
    2,
  );
  await page.locator('#brush-shape input[value=brush]').check();
  await page.locator('input[name=grate-axis-brush][value=x]').check();
  await page.locator('input[name=grate-offset-brush][value="-0.5"]').check();
  const corner = await screen(2, 1, 4);
  await page.mouse.click(corner.x, corner.y);
  assert.equal(
    await page.evaluate(
      () => model.map.grates.filter((g) => g.x === 2 && g.y === 1 && g.z === 4).length,
    ),
    2,
    'two boundary faces coexist in one cell',
  );
  // A horizontal section spans the opening; its collider and mesh share the same transform.
  await page.evaluate(() =>
    edit((m) => {
      m.blocks.find((p) => p.x === 5 && p.z === 4).y = -2;
    }),
  );
  await page.locator('input[name=grate-plane-brush][value=horizontal]').check();
  await page.locator('input[name=grate-offset-brush][value="0.5"]').check();
  await page.selectOption('#brush-height', '0');
  const flat = await screen(5, 0, 4);
  await page.mouse.click(flat.x, flat.y);
  assert.ok(
    await page.evaluate(() =>
      model.map.grates.some(
        (p) => p.x === 5 && p.z === 4 && p.plane === 'horizontal' && p.offset === 0.5,
      ),
    ),
  );
  await page.locator('[data-tool=select]').click();
  const flatPick = await screen(5, 0, 4);
  await page.mouse.click(flatPick.x, flatPick.y);
  await page.locator('#properties input[name^=grate-offset-][value="0"]').check();
  assert.equal(await page.evaluate(() => model.at('grates', 5, 4, 0).offset ?? 0), 0);
  await page.locator('#undo').click();
  assert.equal(await page.evaluate(() => model.at('grates', 5, 4, 0).offset), 0.5);
  await page.locator('[data-tool=grate]').click();
  await page.locator('#spatial-grid').uncheck();
  await page.mouse.move(0, 0);
  await page.screenshot({ path: 'artifacts/grates-editor.png' });
  const draft = await page.evaluate(() => JSON.stringify(model.map));
  await page.reload();
  await page.waitForFunction(() => previewRenderer?.ready && previewRuntime);
  assert.deepEqual(await page.evaluate(() => model.map), JSON.parse(draft));
  await page.locator('#play').click();
  await page.waitForURL('**/?level=editor');
  await page.waitForFunction(() => sceneRenderer.ready && !loadingActive);
  await page.keyboard.down('KeyS');
  await page.waitForFunction(() => players[0].z > 3.2);
  await page.keyboard.up('KeyS');
  assert.equal(await page.evaluate(() => players[0].state), 'alive');
  await page.screenshot({ path: 'artifacts/grates-game.png' });
  assert.deepEqual(errors, []);
  console.log(
    'Grate editor placement, direction, undo, persistence, rendering and slime passage OK',
  );
} finally {
  await browser.close();
}
