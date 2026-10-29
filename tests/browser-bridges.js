import { chromium } from './browser-harness.js';
import Levels from '../levels.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';

fs.mkdirSync('artifacts', { recursive: true });
const map = Levels.blank();
map.size = 8;
map.name = 'Spectral bridge test';
for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) map.blocks.push({ x, y: 0, z });
map.spawns = [{ x: 1, y: 0, z: 1 }, { x: 2, y: 0, z: 1 }, null, null, null];
map.goals = [{ x: 6, y: 0, z: 6 }, { x: 5, y: 0, z: 6 }, null, null, null];
map.plates = [{ id: 'bridge-test', color: 'blue', x: 1, y: 0, z: 1 }];
map.bridges = [
  { x: 4, y: 0, z: 3, plate: 'bridge-test', color: 1 },
  { x: 3, y: 0, z: 3, plate: 'bridge-test' },
];
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    (process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : 'C:/Program Files/Google/Chrome/Application/chrome.exe'),
  args: ['--enable-unsafe-webgpu', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }),
    errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.addInitScript(
    (value) => localStorage.setItem('jelly-dnd.play.v1', value),
    JSON.stringify(map),
  );
  await page.goto('http://localhost:3000/?level=editor');
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1500)));
  if (errors.length) throw new Error(errors.join('\n'));
  await page.waitForFunction(() => sceneRenderer.ready || sceneRenderer.error);
  assert.equal(await page.evaluate(() => sceneRenderer.error?.message || null), null);
  await page.waitForFunction(() => !loadingActive);
  await page.evaluate(() => {
    level.assembly = null;
    world.bridges.forEach((bridge) => (bridge.progress = 1));
    sceneRenderer.grain = false;
    sceneRenderer.dust = false;
  });
  await page.waitForFunction(() => sceneRenderer.runeCount >= 3);
  const draw = await page.evaluate(() => sceneRenderer.bridges(level));
  assert.ok(draw.opaqueCount > 0, 'wood deck has opaque geometry');
  assert.ok(draw.spectralCount > 0, 'spectral deck has translucent geometry');
  assert.equal(await page.evaluate(() => world.heightAt(4, 3, 0.2, players[1])), null);
  assert.equal(await page.evaluate(() => world.heightAt(4, 3, 0.2, players[0])), 0);
  const first = await page.screenshot({ path: 'artifacts/spectral-bridge.png' });
  await page.evaluate(() => (world.featureTime += 1.2));
  await page.waitForFunction(
    (frame) => sceneRenderer.frames > frame + 2,
    await page.evaluate(() => sceneRenderer.frames),
  );
  const drifted = await page.screenshot({ path: 'artifacts/spectral-bridge-runes.png' });
  assert.notDeepEqual(drifted, first, 'runes visibly drift above the bridge');
  assert.deepEqual(await page.evaluate(() => sceneRenderer.errors), []);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: wooden and spectral bridge draws, colour-filtered support, rising runes and WebGPU rendering.',
  );
} finally {
  await browser.close();
}
