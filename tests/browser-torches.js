import { chromium } from './browser-harness.js';
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
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } }),
      errors = [];
    await page.addInitScript(() => {
      if (!localStorage.getItem('jelly-dnd.editor.v1'))
        localStorage.setItem(
          'jelly-dnd.editor.v1',
          JSON.stringify({
            version: 1,
            size: 8,
            name: 'Wall torch test',
            blocks: [
              { x: 1, y: 0, z: 1 },
              { x: 1, y: 0, z: 5 },
            ],
            spawns: [{ x: 1, y: 0, z: 1 }],
            goals: [{ x: 1, y: 0, z: 5 }],
          }),
        );
    });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto('http://localhost:3000/editor.html');
    await page.waitForFunction(() => view3d && previewRenderer?.ready && previewRuntime);
    await page.evaluate(() => {
      const m = L.blank();
      m.size = 8;
      m.name = 'Wall torch test';
      for (let x = 1; x < 7; x++) for (let z = 1; z < 7; z++) m.blocks.push({ x, y: 0, z });
      m.blocks.push({ x: 3, y: 1, z: 3 }, { x: 3, y: 2, z: 3 });
      m.spawns[0] = { x: 1, y: 0, z: 1 };
      m.goals[0] = { x: 1, y: 0, z: 5 };
      replaceMap(m);
      Object.assign(previewCamera, { x: 3.5, z: 3.5, targetY: 0.5 });
      previewZoom = 1.5;
    });
    const click = async (x, y, z) => {
      const p = await page.evaluate(
        (p) => {
          const r = $('viewport').getBoundingClientRect(),
            s = JellyGPU.projectPoint(screenFrame(), ...p, r.width, r.height);
          return { x: r.left + s.x, y: r.top + s.y };
        },
        [x, y, z],
      );
      await page.mouse.click(p.x, p.y);
    };
    const turn = async (angle) => {
      await page.evaluate((a) => (previewAngle = previewTargetAngle = a), angle);
      await page.waitForFunction(
        (f) => previewRenderer.frames > f + 1,
        await page.evaluate(() => previewRenderer.frames),
      );
    };
    await page.locator('[data-tool=torch]').click();
    assert.ok(await page.locator('#torch-brush').isVisible());
    for (const [x, y, z, face] of [
      [3.5, 0.5, 3, 'east'],
      [3, 0.5, 3.5, 'south'],
    ]) {
      await click(x, y, z);
      assert.ok(
        await page.evaluate(
          (face) => model.map.torches.some((p) => p.face === face && p.y === 1),
          face,
        ),
      );
    }
    await turn(Math.PI);
    for (const [x, y, z, face] of [
      [2.5, 0.5, 3, 'west'],
      [3, 0.5, 2.5, 'north'],
    ]) {
      await click(x, y, z);
      assert.ok(
        await page.evaluate(
          (face) => model.map.torches.some((p) => p.face === face && p.y === 1),
          face,
        ),
      );
    }
    assert.equal(await page.evaluate(() => model.map.torches.length), 4);
    assert.deepEqual(await page.evaluate(() => L.issues(model.map)), []);
    const torchCard = page.locator('[data-object="torches-0"]');
    await torchCard.getByLabel(/Y$/).fill('2');
    await torchCard.getByLabel(/Y$/).press('Tab');
    assert.equal(await page.evaluate(() => model.map.torches[0].y), 2);
    await page.locator('#undo').click();
    assert.equal(await page.evaluate(() => model.map.torches[0].y), 1);
    await page.evaluate(() => {
      selected = { x: 3, y: 1, z: 3 };
      renderProperties();
    });
    await torchCard.locator('.delete').click();
    assert.equal(await page.evaluate(() => model.map.torches.length), 3);
    await page.locator('#undo').click();
    assert.equal(await page.evaluate(() => model.map.torches.length), 4);
    await turn(0);
    await page.locator('[data-tool=select]').click();
    await page.waitForFunction(() => !previewDirty && previewRuntime.world.torches.length === 4);
    assert.ok(
      await page.evaluate(
        () =>
          previewRuntime.world.obstacles.length === 0 &&
          previewRuntime.world.debugBoxes().every((b) => b.kind === 'block'),
      ),
    );
    await page.screenshot({ path: 'artifacts/wall-torches-editor.png' });
    await page.locator('#preview-colliders').check();
    await page.screenshot({ path: 'artifacts/wall-torches-colliders.png' });
    const draft = await page.evaluate(() => JSON.stringify(model.map));
    await page.reload();
    await page.waitForFunction(() => previewRenderer?.ready && previewRuntime);
    assert.deepEqual(await page.evaluate(() => model.map), JSON.parse(draft));
    await page.locator('#play').click();
    await page.waitForURL('**/?level=editor');
    await page.waitForFunction(() => sceneRenderer.ready && sceneRenderer.frames > 6);
    assert.equal(await page.evaluate(() => world.torches.length), 4);
    assert.equal(await page.evaluate(() => world.obstacles.length), 0);
    // A tangential arrow crosses the torch's bracket/flame volume, while masonry stops a direct shot.
    await page.evaluate(() => {
      world.arrows = [{ x: 3.74, y: 0.5, z: 1, dx: 0, dz: 1, speed: 5.5, life: 4 }];
      world.afterCombat(bodies, soft, 0.5);
    });
    assert.ok(await page.evaluate(() => world.arrows.length === 1 && world.arrows[0].z > 3.6));
    await page.evaluate(() => {
      world.arrows = [{ x: 3, y: 0.5, z: 1, dx: 0, dz: 1, speed: 5.5, life: 4 }];
      world.afterCombat(bodies, soft, 0.5);
    });
    assert.equal(await page.evaluate(() => world.arrows.length), 0);
    await page.evaluate(() => {
      Object.assign(camera, { x: 3, z: 3, targetY: 0.4 });
      zoom = 1.5;
      resize();
    });
    await page.screenshot({ path: 'artifacts/wall-torches-game.png' });
    // The original chamber left the campaign ('/' is now the menu diorama): play its JSON as a test level. Its four lights stay explicit side-wall mounts on full masonry, without narrow legacy torch colliders.
    await page.addInitScript(
      (map) => localStorage.setItem('jelly-dnd.play.v1', map),
      fs.readFileSync('levels/05-sunken-sanctum.json', 'utf8'),
    );
    await page.goto('http://localhost:3000/?level=editor');
    await page.waitForFunction(
      () =>
        sceneRenderer.ready && sceneRenderer.frames > 6 && !loadingActive && cameraIntro === null,
    );
    assert.deepEqual(
      await page.evaluate(() => ({
        name: definition.name,
        torches: world.torches.map((p) => [p.x, p.y, p.z, p.face].join()).sort(),
        narrow: world.obstacles.filter((p) => p.half < 0.4).length,
        hosted: world.torches.every((p) =>
          world.obstacles.some((o) => o.x === p.x && o.z === p.z && o.half >= 0.4),
        ),
      })),
      {
        name: 'The Sunken Sanctum',
        torches: ['0,1,2,east', '0,1,9,east', '11,1,2,west', '11,1,9,west'],
        narrow: 0,
        hosted: true,
      },
    );
    await page.screenshot({ path: 'artifacts/wall-torches-chamber.png' });
    assert.deepEqual(await page.evaluate(() => sceneRenderer.errors), []);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: four wall-face clicks, mount height editing, independent deletion/undo, JSON persistence, shared editor/game meshes, no torch colliders, arrows cross torch volumes but hit masonry, the Sunken Sanctum's four explicit side-wall mounts on full masonry without narrow torch colliders, and no browser/GPU errors.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
