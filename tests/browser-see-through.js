import { chromium, playMap } from './browser-harness.js';
import assert from 'node:assert/strict';

// Jellies hidden behind masonry: green in a corridor under the floor, blue behind a two-storey
// wall, red in the open. Halo opens the stone only for the hidden two; silhouette and halo
// both change the picture compared with no see-through.
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--enable-unsafe-webgpu', '--use-angle=d3d11'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await playMap(page, '05-sunken-sanctum.json', (m) => {
    const blocks = [];
    for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) blocks.push({ x, y: 0, z });
    for (let x = 2; x <= 5; x++) blocks.push({ x, y: -2, z: 3 });
    for (let x = 4; x <= 7; x++) for (const y of [1, 2]) blocks.push({ x, y, z: 6 });
    return {
      ...m,
      size: 8,
      tiles: [],
      walls: [],
      blocks,
      bridges: [],
      plates: [],
      lifts: [],
      spikes: [],
      portals: [],
      conveyors: [],
      archers: [],
      pickups: [],
      drones: [],
      crates: [],
      torches: [],
      camera: undefined,
      spawns: [{ x: 3, y: -2, z: 3 }, { x: 6, y: 0, z: 5 }, { x: 1, y: 0, z: 1 }, null, null],
      goals: [{ x: 1, y: 0, z: 6 }, { x: 0, y: 0, z: 7 }, { x: 7, y: 0, z: 0 }, null, null],
    };
  });
  await page.waitForTimeout(2000);
  const shots = {};
  for (const mode of ['halo', 'silhouette', 'off']) {
    await page.evaluate((mode) => (sceneRenderer.seeThrough = mode), mode);
    await page.waitForTimeout(1200);
    const amounts = await page.evaluate(() => sceneRenderer.revealAmounts);
    if (mode === 'halo') {
      assert.ok(amounts[0] > 0.9 && amounts[1] > 0.9, 'hidden jellies open a halo ' + amounts);
      assert.ok(amounts[2] < 0.01, 'a jelly in the open keeps the stone ' + amounts);
    } else
      assert.ok(
        amounts.every((v) => v < 0.01),
        mode + ' never opens the stone',
      );
    shots[mode] = await page.screenshot();
  }
  assert.ok(!shots.halo.equals(shots.off) && !shots.silhouette.equals(shots.off));
  assert.deepEqual(await page.evaluate(() => sceneRenderer.errors), []);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: halo opens masonry only in front of fully hidden jellies (under the floor and behind a wall), silhouette draws through stone, off hides them; no GPU errors.',
  );
} finally {
  await browser.close();
}
