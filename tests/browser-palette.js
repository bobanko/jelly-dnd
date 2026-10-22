import { chromium } from './browser-harness.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
(async () => {
  fs.mkdirSync('artifacts', { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    timeout: 15000,
    executablePath:
      process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--enable-unsafe-webgpu', '--use-angle=d3d11'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.addInitScript(() => {
      if (!localStorage.getItem('jelly-dnd.editor.v1')) {
        const blocks = [];
        for (let x = 1; x <= 6; x++) for (let z = 1; z <= 6; z++) blocks.push({ x, y: 0, z });
        localStorage.setItem(
          'jelly-dnd.editor.v1',
          JSON.stringify({
            version: 1,
            size: 8,
            name: 'Portal colours',
            blocks,
            spawns: [{ x: 2, y: 0, z: 6 }],
            goals: [{ x: 4, y: 0, z: 6 }],
          }),
        );
      }
    });
    await page.goto('http://localhost:3000/editor.html');
    await page.waitForFunction(() => previewRenderer?.ready && previewRenderer.frames > 3);
    const palette = await page.evaluate(() => ({
      colors: L.portalColors,
      buttons: [...document.querySelectorAll('#palette .tool')].map((b) => ({
        label: b.getAttribute('aria-label'),
        title: b.title,
        children: b.children.length,
        hidden: b.firstElementChild.getAttribute('aria-hidden'),
        svg: !!b.querySelector('svg'),
      })),
    }));
    assert.equal(palette.colors.length, 5);
    assert.ok(
      palette.buttons.every(
        (b) => b.label && b.title === b.label && b.children === 1 && b.hidden === 'true',
      ),
    );
    assert.ok(palette.buttons.filter((b) => b.svg).length >= 18);
    const click = async (x, z) => {
      const p = await page.evaluate(
        (p) => {
          const r = $('viewport').getBoundingClientRect(),
            q = JellyGPU.projectPoint(screenFrame(), p[0], 0, p[1], r.width, r.height);
          return { x: r.left + q.x, y: r.top + q.y };
        },
        [x, z],
      );
      await page.mouse.click(p.x, p.y);
    };
    for (let i = 0; i < palette.colors.length; i++) {
      await page.locator('[data-tool=portal-' + palette.colors[i].id + ']').click();
      await click(1, i + 1);
      await click(5, i + 1);
    }
    assert.equal(
      await page.locator('#properties [data-object^=portals-] select').locator('option').count(),
      5,
    );
    assert.equal(await page.evaluate(() => model.map.portals.length), 10);
    assert.deepEqual(await page.evaluate(() => L.issues(model.map)), []);
    await page.waitForFunction(() => !previewDirty && previewRuntime.world.portals.length === 10);
    await page.screenshot({ path: 'artifacts/palette-portal-colours.png' });
    const draft = await page.evaluate(() => JSON.stringify(model.map));
    await page.reload();
    await page.waitForFunction(() => previewRenderer?.ready && previewRenderer.frames > 3);
    assert.deepEqual(await page.evaluate(() => model.map), JSON.parse(draft));
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok(await page.locator('#palette [data-tool=portal-red]').isVisible());
    await page.screenshot({ path: 'artifacts/palette-mobile.png', fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator('#play').click();
    await page.waitForURL('**/?level=editor');
    await page.waitForFunction(() => sceneRenderer.ready && sceneRenderer.frames > 5);
    for (const c of palette.colors) {
      await page.evaluate((color) => {
        const a = world.portals.find((p) => p.color === color);
        Object.assign(players[0], a, { vx: 0, vz: 0, vy: 0, portalLock: null, portalCooldown: 0 });
        soft.reset();
      }, c.id);
      await page.waitForFunction(
        (color) => players[0].portalLock === color && Math.abs(players[0].x - 5) < 0.1,
        c.id,
      );
    }
    await page.screenshot({ path: 'artifacts/portal-five-colours-game.png' });
    assert.deepEqual(await page.evaluate(() => sceneRenderer.errors), []);
    assert.deepEqual(errors, []);
    console.log(
      'PASS: icon-only accessible palette, five portal colours placed in 3D, inspector options, persistence, mobile width, independent live teleports and WebGPU rendering.',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
