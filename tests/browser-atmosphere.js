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
  await page.locator('#grain-strength').fill('50');
  await page.locator('#grain-size').fill('175');
  await page.evaluate(() => document.activeElement.blur());
  await nextFrames();
  const sample = () => page.screenshot({ clip: { x: 1050, y: 360, width: 160, height: 160 } });
  const grain = await sample();
  assert.ok(
    await page.evaluate(
      () =>
        Math.abs(sceneRenderer.filmData[1] - 0.0225) < 1e-6 &&
        Math.abs(sceneRenderer.filmData[2] - 2.3625) < 1e-6,
    ),
  );
  assert.equal(await page.locator('#grain-strength-value').textContent(), '50%');
  await page.locator('#film-grain').uncheck();
  await nextFrames();
  assert.equal(await page.evaluate(() => sceneRenderer.filmData[1]), 0);
  const clean = await sample();
  assert.notDeepEqual(grain, clean, 'grain changes the actual rendered image');
  await nextFrames();
  assert.deepEqual(await sample(), clean, 'reduced motion leaves a stable image without grain');
  await page.screenshot({ path: 'artifacts/atmosphere-grain-off.png' });
  await page.locator('#film-grain').check();
  await page.evaluate(() => document.activeElement.blur());
  await nextFrames();
  assert.deepEqual(await sample(), grain, 'the checkbox restores the same reduced-motion grain');
  await page.screenshot({ path: 'artifacts/atmosphere-grain-on.png' });
  await page.locator('#film-grain').uncheck();
  assert.equal(await page.locator('#ambient-dust').isChecked(), true);
  assert.equal(await page.evaluate(() => sceneRenderer.dustCount), 64);
  assert.ok(await page.evaluate(() => [...sceneRenderer.dustData].every(Number.isFinite)));
  await page.locator('#dust-density').fill('40');
  await page.locator('#dust-speed').fill('150');
  assert.deepEqual(
    await page.evaluate(() => [sceneRenderer.dustDensity, sceneRenderer.dustSpeed]),
    [0.4, 1.5],
  );
  await page.locator('#grain-strength').fill('300');
  await page.locator('#grain-size').fill('400');
  await page.locator('#dust-density').fill('300');
  await page.locator('#dust-speed').fill('400');
  assert.deepEqual(
    await page.evaluate(() => [
      sceneRenderer.grainStrength,
      sceneRenderer.grainSize,
      sceneRenderer.dustDensity,
      sceneRenderer.dustSpeed,
      sceneRenderer.dustData.length / 4,
    ]),
    [3, 4, 3, 4, 192],
  );
  const features = await page.evaluate(() => JSON.stringify(world.featureSnapshot())),
    dustSample = () => page.screenshot({ clip: { x: 150, y: 160, width: 650, height: 450 } });
  await nextFrames();
  const dusty = await dustSample();
  await page.locator('#ambient-dust').uncheck();
  await nextFrames();
  assert.equal(await page.evaluate(() => sceneRenderer.dust), false);
  assert.notDeepEqual(await dustSample(), dusty, 'dust contributes visible pixels to the scene');
  await page.locator('#ambient-dust').check();
  await nextFrames();
  assert.deepEqual(await dustSample(), dusty, 'reduced motion freezes the dust at a stable pose');
  assert.equal(await page.evaluate(() => JSON.stringify(world.featureSnapshot())), features);
  await page.evaluate(() => {
    const render = sceneRenderer.render.bind(sceneRenderer);
    sceneRenderer.render = (...args) => {
      args[4] = 8;
      return render(...args);
    };
  });
  await nextFrames();
  assert.notDeepEqual(
    await dustSample(),
    dusty,
    'the particles drift as presentation time advances',
  );
  assert.equal(await page.evaluate(() => JSON.stringify(world.featureSnapshot())), features);
  await page.screenshot({ path: 'artifacts/atmosphere-dust.png' });
  assert.deepEqual(await page.evaluate(() => sceneRenderer.errors), []);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: perspective menu, grain and dust developer toggles, visible particles, smooth presentation-time drift, reduced-motion stability, unchanged gameplay state and no WebGPU errors.',
  );
} finally {
  await browser.close();
}
