import { chromium } from './browser-harness.js';
import assert from 'node:assert/strict';
import L from '../src/world/levels.js';
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--enable-unsafe-webgpu', '--use-angle=d3d11'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto('http://localhost:3000/editor.html');
    await page.waitForFunction(
      () => typeof previewRenderer !== 'undefined' && previewRenderer?.ready,
    );
    const map = L.blank();
    map.name = 'Five colours';
    for (let x = 0; x <= 10; x++) for (let z = 0; z <= 6; z++) map.blocks.push({ x, y: 0, z });
    for (let i = 0; i < 5; i++) {
      map.spawns[i] = { x: i * 2 + 1, y: 0, z: 2 };
      map.goals[i] = { x: i * 2 + 1, y: 0, z: 5 };
    }
    map.blocks.push({ x: 9, y: 1, z: 3, color: 4 });
    map.spikes = [{ x: 9, y: 0, z: 4, color: 4, cycle: 0 }];
    map.drones = [{ x: 9, y: 0, z: 0, color: 4, target: 4, hover: 0 }];
    await page.evaluate((map) => {
      replaceMap(map, 'five-colours.json');
      selected = { x: 9, y: 1, z: 3 };
      renderProperties();
    }, map);
    assert.equal(await page.locator('[data-tool="spawn-4"]').count(), 1);
    assert.equal(await page.locator('[data-tool="goal-4"]').count(), 1);
    assert.ok(await page.locator('[data-object="blocks-77"] input[value="4"]').isChecked());
    await page.waitForFunction(() => !previewDirty && previewRuntime.players.length === 5);
    await page.screenshot({ path: 'artifacts/editor-yellow.png' });
    await page.locator('#play').click();
    await page.waitForURL('**/?level=editor');
    await page.waitForFunction(
      () => typeof sceneRenderer !== 'undefined' && sceneRenderer.ready && !loadingActive,
    );
    await page.evaluate(() => setMenu(false));
    assert.equal(await page.evaluate(() => players.length), 5);
    assert.equal(await page.evaluate(() => movementKeys.Numpad6[0]), 4);
    const x = await page.evaluate(() => players[4].x);
    await page.keyboard.down('Numpad6');
    await page.waitForFunction((x) => players[4].x > x + 0.1, x);
    await page.keyboard.up('Numpad6');
    assert.equal(await page.evaluate(() => sceneRenderer.exits.length), 5);
    await page.screenshot({ path: 'artifacts/game-yellow.png' });
    await page.evaluate(() => {
      players.forEach((p) =>
        Object.assign(
          p,
          goals.find((g) => g.slot === p.slot),
          { vx: 0, vz: 0 },
        ),
      );
      soft.reset();
      finishHold = WIN_HOLD_SECONDS - 0.01;
      simulate(0.05);
    });
    assert.ok(await page.locator('#win').isVisible());
    await page.evaluate(() => {
      const map = JellyLevels.copy(definition);
      map.spawns = map.spawns.map((p, i) => (i === 4 ? p : null));
      map.goals = map.goals.map((p, i) => (i === 4 ? p : null));
      localStorage.setItem(JellyLevels.PLAY_KEY, JSON.stringify(map));
    });
    await page.goto('http://localhost:3000/?level=editor&play=1');
    await page.waitForFunction(
      () => typeof sceneRenderer !== 'undefined' && sceneRenderer.ready && !loadingActive,
    );
    assert.equal(await page.evaluate(() => players[0].slot), 4);
    assert.equal(await page.evaluate(() => movementKeys.KeyD[0]), 0);
    const soloX = await page.evaluate(() => players[0].x);
    await page.keyboard.down('d');
    await page.waitForFunction((x) => players[0].x > x + 0.1, soloX);
    await page.keyboard.up('d');
    assert.deepEqual(errors, []);
    console.log(
      'PASS yellow editor palette, five-player GPU rendering/victory, numpad controls and solo yellow with WASD',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
