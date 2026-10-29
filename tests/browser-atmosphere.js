import { chromium } from './browser-harness.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';

fs.mkdirSync('artifacts', { recursive: true });
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
  const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
      reducedMotion: 'reduce',
    }),
    errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://localhost:3000/');
  await page.waitForFunction(
    () => sceneRenderer.ready && !loadingActive && sceneRenderer.frames > 4,
  );
  assert.equal(await page.evaluate(() => sceneRenderer.cameraState.perspective), true);
  await page.screenshot({ path: 'artifacts/atmosphere-menu.png' });
  await page.goto('http://localhost:3000/?level=1&play=1');
  await page.waitForFunction(
    () => sceneRenderer.ready && !loadingActive && sceneRenderer.frames > 4,
  );
  await page.evaluate(() => {
    simulate = () => {};
    effects.step = () => {};
    effects.clear();
    updateGameCamera(0, true);
  });
  const nextFrames = async () =>
    page.waitForFunction(
      (frame) => sceneRenderer.frames > frame + 2,
      await page.evaluate(() => sceneRenderer.frames),
    );
  await page.keyboard.press('Backquote');
  assert.equal(await page.locator('.jelly-settings').isVisible(), true);
  assert.equal(await page.locator('#film-grain').isChecked(), true);
  await nextFrames();
  const sample = () => page.screenshot({ clip: { x: 1050, y: 360, width: 160, height: 160 } });
  const grain = await sample();
  assert.ok(await page.evaluate(() => sceneRenderer.filmData[1] > 0));
  await page.locator('#film-grain').uncheck();
  await nextFrames();
  assert.equal(await page.evaluate(() => sceneRenderer.filmData[1]), 0);
  const clean = await sample();
  assert.notDeepEqual(grain, clean, 'grain changes the actual rendered image');
  await nextFrames();
  assert.deepEqual(await sample(), clean, 'reduced motion leaves a stable image without grain');
  await page.screenshot({ path: 'artifacts/atmosphere-grain-off.png' });
  await page.locator('#film-grain').check();
  await nextFrames();
  assert.deepEqual(await sample(), grain, 'the checkbox restores the same reduced-motion grain');
  await page.screenshot({ path: 'artifacts/atmosphere-grain-on.png' });
  assert.deepEqual(await page.evaluate(() => sceneRenderer.errors), []);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: perspective menu, developer film-grain toggle, rendered pixel changes, reduced-motion stability and no WebGPU errors.',
  );
} finally {
  await browser.close();
}
