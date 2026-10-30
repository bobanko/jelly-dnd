import { chromium, seedEditorMap } from './browser-harness.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
(async () => {
  fs.mkdirSync('artifacts', { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--enable-unsafe-webgpu', '--use-angle=d3d11'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await seedEditorMap(page); // the original chamber
    // The checks look up Russian editor labels; the editor now defaults to English.
    await page.addInitScript(() => localStorage.setItem('jelly-dnd.language', 'ru'));
    await page.goto('http://localhost:3000/editor.html');
    await page.waitForFunction(() => view3d && previewRenderer?.ready && previewRuntime);
    // A flat 8x8 floor with three existing belts on row z = 5, seen straight on.
    await page.evaluate(() => {
      const m = L.blank();
      m.name = 'Belts';
      for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) m.blocks.push({ x, y: 0, z });
      m.spawns[0] = { x: 0, y: 0, z: 7 };
      m.goals[0] = { x: 7, y: 0, z: 7 };
      for (const x of [1, 2, 3]) m.conveyors.push({ x, y: 0, z: 5, dx: 1, dz: 0, speed: 0.85 });
      replaceMap(m);
      previewAngle = previewTargetAngle = 0;
    });
    await page.waitForFunction(() => !previewDirty && previewRuntime.world.conveyors.length === 3);
    await page.locator('[data-tool=conveyor]').click();
    // Belt direction is a visible radio group now, in the brush and in the inspector.
    await page.locator('input[name="belt-direction"][value="1,0"]').check();
    await page.locator('#belt-speed').fill('1.1');
    await page.selectOption('#brush-shape', 'rectangle');
    const point = async (x, z) =>
      page.evaluate(
        ([x, z]) => {
          const r = document.getElementById('viewport').getBoundingClientRect(),
            q = JellyGPU.projectPoint(screenFrame(), x, 0, z, r.width, r.height);
          return { x: r.left + q.x, y: r.top + q.y };
        },
        [x, z],
      );
    const a = await point(2, 2),
      b = await point(5, 2);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up();
    assert.equal(await page.evaluate(() => model.map.conveyors.length), 7);
    assert.ok(
      await page.evaluate(() =>
        model.map.conveyors
          .filter((p) => p.z === 2)
          .every((p) => p.dx === 1 && p.dz === 0 && p.speed === 1.1),
      ),
    );
    await page.locator('#undo').click();
    assert.equal(await page.evaluate(() => model.map.conveyors.length), 3);
    await page.locator('#redo').click();
    await page.locator('[data-tool=select]').click();
    const p = await point(3, 2);
    await page.mouse.click(p.x, p.y);
    await page.locator('#properties input[name^="direction-"][value="0,-1"]').first().check();
    assert.equal(await page.evaluate(() => model.at('conveyors', 3, 2).dz), -1);
    await page.locator('#properties input[name^="direction-"][value="1,0"]').first().check();
    const speed = page.getByLabel('Скорость ленты, кл/с', { exact: true });
    await speed.fill('1.25');
    await speed.press('Tab');
    assert.equal(await page.evaluate(() => model.at('conveyors', 3, 2).speed), 1.25);
    const data = await page.evaluate(() => model.map);
    await page.reload();
    await page.waitForFunction(() => model.map.conveyors.length === 7);
    assert.deepEqual(await page.evaluate(() => model.map), data);
    await page.waitForFunction(() => previewRenderer?.ready && previewRuntime);
    await page.waitForTimeout(250);
    await page.screenshot({ path: 'artifacts/conveyor-editor-3d.png' });
    assert.ok(
      await page.evaluate(() =>
        previewRuntime.world.conveyorJoined(previewRuntime.world.conveyors[3], 1),
      ),
    );
    assert.deepEqual(await page.evaluate(() => previewRenderer.errors), []);
    // The custom room exercises continuous transport, crates and player input in the actual game.
    await page.evaluate(() => {
      const map = L.blank();
      map.name = 'Conveyor chamber';
      map.size = 8;
      for (let x = 1; x <= 6; x++) for (let z = 1; z <= 6; z++) map.tiles.push({ x, z, height: 0 });
      map.spawns = [
        { x: 1, z: 3 },
        { x: 1, z: 4 },
        { x: 5, z: 6 },
      ];
      map.goals = [
        { x: 2, z: 1 },
        { x: 4, z: 1 },
        { x: 6, z: 1 },
      ];
      map.crates = [{ x: 2, z: 5 }];
      for (const z of [3, 4, 5])
        for (let x = 1; x <= 6; x++) map.conveyors.push({ x, z, dx: 1, dz: 0, speed: 1 });
      replaceMap(map);
    });
    await page.locator('#play').click();
    await page.waitForURL('**/?level=editor');
    await page.waitForFunction(() => sceneRenderer.ready && !loadingActive); // input is ignored while loading
    await page.waitForFunction(
      () => players[0].x > 2.3 && players[1].x > 2.3 && crates[0].x > 3.2,
      null,
      { timeout: 10000 },
    );
    assert.ok(
      await page.evaluate(
        () =>
          players.slice(0, 2).every((p) => p.state === 'alive' && p.vx > 0.75 && p.vx < 1.2) &&
          crates[0].state === 'alive' &&
          Math.abs(players[2].x - 5) < 0.05,
      ),
    );
    const before = await page.evaluate(() => players[0].x);
    await page.keyboard.down('KeyA');
    await page.waitForTimeout(450);
    await page.keyboard.up('KeyA');
    assert.ok(await page.evaluate((x) => players[0].x < x - 0.12, before));
    await page.keyboard.press('KeyZ');
    assert.ok(await page.evaluate((x) => Math.abs(players[0].x - x) < 0.15, before));
    await page.waitForFunction(() => players[0].vx > 0.6);
    await page.evaluate(() => {
      zoom = 1.55;
      resize();
    });
    await page.screenshot({ path: 'artifacts/conveyor-playtest.png' });
    await page.keyboard.press('KeyR');
    await page.waitForFunction(() => restartTransition === null); // restart fades first
    assert.ok(
      await page.evaluate(
        () => players[0].x < 1.1 && crates[0].x < 2.1 && world.conveyors.length === 18,
      ),
    );
    assert.deepEqual(await page.evaluate(() => sceneRenderer.errors), []);
    assert.deepEqual(errors, []);
    await page.keyboard.press('Escape'); // the pause menu links to the editor
    await page.locator('#open-editor').click();
    await page.waitForURL('**/editor.html');
    await page.waitForFunction(() => typeof model !== 'undefined' && previewRuntime);
    assert.equal(await page.evaluate(() => model.map.conveyors.length), 18);
    console.log(
      'PASS: conveyor brush/rectangle, direction and speed, undo/redo and draft roundtrip, connected 3D belt geometry/WGSL, automatic jelly and crate transport, countersteering, movement undo and reset. No browser or GPU errors.',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
