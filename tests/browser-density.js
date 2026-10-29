import { chromium } from './browser-harness.js';
import assert from 'node:assert/strict';

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
  const samples = [];
  for (const density of [1, 1.5, 2]) {
    const page = await browser.newPage({
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: density,
      }),
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://localhost:3000/?level=1&play=1');
    await page.waitForFunction(() => sceneRenderer.ready && !loadingActive);
    const scale = Number(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--ui-density-scale'),
      ),
    );
    assert.equal(scale, density);
    await page.keyboard.press('Backquote');
    const sample = await page.evaluate(() => {
      const rect = (selector) => {
          const box = document.querySelector(selector).getBoundingClientRect();
          return { x: box.x, y: box.y, width: box.width, height: box.height };
        },
        settings = document.querySelector('.jelly-settings');
      return {
        button: rect('#menu-button'),
        canvas: rect('#scene'),
        footer: rect('footer'),
        settings: rect('.jelly-settings'),
        settingsScrollable:
          settings.scrollHeight > settings.clientHeight &&
          getComputedStyle(settings).overflowY === 'auto',
      };
    });
    assert.deepEqual(sample.canvas, { x: 0, y: 0, width: 1280, height: 800 });
    for (const box of [sample.button, sample.footer, sample.settings]) {
      assert.ok(box.x >= 0 && box.y >= 0);
      assert.ok(
        box.x + box.width <= 1280.5 && box.y + box.height <= 800.5,
        JSON.stringify({ density, box, sample }),
      );
    }
    if (density === 2) assert.equal(sample.settingsScrollable, true);
    assert.deepEqual(await page.evaluate(() => sceneRenderer.errors), []);
    assert.deepEqual(errors, []);
    samples.push(sample);
    await page.goto('http://localhost:3000/');
    await page.waitForFunction(() => sceneRenderer.ready && !loadingActive);
    for (const selector of ['#menu-title', '#menu-root', '.menu-key-hints']) {
      const box = await page.locator(selector).boundingBox();
      assert.ok(box && box.x >= 0 && box.y >= 0, selector);
      assert.ok(box.x + box.width <= 1280.5 && box.y + box.height <= 800.5, selector);
    }
    await page.close();
  }
  assert.equal(samples[1].button.width, samples[0].button.width * 1.5);
  assert.equal(samples[2].button.width, samples[0].button.width * 2);
  assert.equal(samples[2].footer.height, samples[0].footer.height * 2);
  assert.equal(samples[2].canvas.width, samples[0].canvas.width);
  console.log(
    'PASS: 1×, 1.5× and Retina 2× HUD sizing, unchanged canvas and viewport-safe controls.',
  );
} finally {
  await browser.close();
}
