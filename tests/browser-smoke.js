import { chromium } from './browser-harness.js';
import fs from 'node:fs';
(async () => {
  fs.mkdirSync('artifacts', { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--enable-unsafe-webgpu', '--use-angle=d3d11'],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('http://localhost:3000');
  await page
    .waitForFunction(
      () =>
        typeof sceneRenderer !== 'undefined' &&
        (sceneRenderer.ready ||
          document.querySelector('#gpu-status').textContent !== 'Подготавливаем свет и желе…'),
      { timeout: 30000 },
    )
    .catch(() => {});
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    globalThis.profile = { physics: 0, render: 0, steps: 0, frames: 0 };
    const step = world.step.bind(world),
      render = sceneRenderer.render.bind(sceneRenderer);
    world.step = (...a) => {
      const t = performance.now(),
        r = step(...a);
      profile.physics += performance.now() - t;
      profile.steps++;
      return r;
    };
    sceneRenderer.render = (...a) => {
      const t = performance.now(),
        r = render(...a);
      profile.render += performance.now() - t;
      profile.frames++;
      return r;
    };
  });
  await page.waitForTimeout(6000);
  console.log(
    JSON.stringify(
      await page.evaluate(() => ({
        ready: sceneRenderer.ready,
        message: document.querySelector('#gpu-status').textContent,
        errors: [...new Set(sceneRenderer.errors)].slice(0, 5),
        frames: sceneRenderer.frames,
        adapter: sceneRenderer.adapterInfo,
        players: players.map((p) => ({ x: p.x, y: p.y, z: p.z, state: p.state })),
        profile,
        sleep: players.map((p) => soft.get(p).sleeping),
        fps: document.querySelector('#fps').textContent,
      })),
      null,
      2,
    ),
  );
  await page.screenshot({ path: 'artifacts/webgpu-initial.png' });
  console.log('Browser errors:', [...new Set(errors)].slice(0, 5));
  await browser.close();
  if (errors.length) process.exitCode = 1;
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
