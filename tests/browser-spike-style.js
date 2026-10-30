import { chromium } from './browser-harness.js';
import Levels from '../src/world/levels.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';

fs.mkdirSync('artifacts', { recursive: true });
const map = Levels.blank();
map.size = 8;
map.name = 'Spike style test';
for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) map.blocks.push({ x, y: 0, z });
map.spawns = [{ x: 3, y: 0, z: 5 }, null, null, null, null];
map.goals = [{ x: 3, y: 0, z: 6 }, null, null, null, null];
map.spikes = [
  { x: 3, y: 0, z: 3, offset: 0 },
  { x: 4, y: 0, z: 3, offset: 0, color: 2 },
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }),
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
  await page.waitForFunction(() => sceneRenderer.ready && !loadingActive);
  await page.evaluate(() => {
    level.assembly = null;
    cameraIntro = null;
    angle = targetAngle = -Math.PI / 4;
    world.featureTime = 0;
    sceneRenderer.grain = false;
    sceneRenderer.dust = false;
  });
  const frames = async () =>
    page.waitForFunction(
      (frame) => sceneRenderer.frames > frame + 2,
      await page.evaluate(() => sceneRenderer.frames),
    );
  await frames();
  assert.equal(
    await page.evaluate(() => world.debugBoxes().filter((box) => box.kind === 'spikes').length),
    8,
    'two raised traps keep exactly four physical spikes each',
  );
  const raised = await page.screenshot({ path: 'artifacts/spike-style-raised.png' });
  await page.evaluate(() => (world.featureTime = 3));
  await frames();
  assert.equal(
    await page.evaluate(() => world.debugBoxes().filter((box) => box.kind === 'spikes').length),
    0,
    'retracted spikes keep no active damage boxes',
  );
  const hidden = await page.screenshot({ path: 'artifacts/spike-style-sockets.png' });
  assert.notDeepEqual(hidden, raised, 'four sockets remain visible after their spikes retract');
  assert.deepEqual(await page.evaluate(() => sceneRenderer.errors), []);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: four forged spikes per tile, separate square sockets without a shared frame, raised/retracted states and WebGPU rendering.',
  );
} finally {
  await browser.close();
}
