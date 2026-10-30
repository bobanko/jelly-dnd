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
    const page = await browser.newPage({
        viewport: { width: 1600, height: 1000 },
        reducedMotion: 'reduce',
      }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto('http://localhost:3000/editor.html');
    await page.waitForFunction(() => view3d && previewRenderer?.ready && previewRuntime);
    async function fixture(kind, alive = true, inside = false) {
      await page.evaluate(
        ({ kind, inside }) => {
          const m = L.blank();
          m.size = 8;
          for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) m.blocks.push({ x, y: 0, z });
          m.spawns[0] = { x: inside ? 4 : 3, y: 0, z: inside ? 4 : 3 };
          m.goals[0] = { x: 7, y: 0, z: 7 };
          if (kind !== 'none')
            m.blocks.push({
              x: 4,
              y: inside ? 1 : 2,
              z: 4,
              ...(kind === 'glass' ? { color: inside ? 0 : 1 } : {}),
            });
          replaceMap(m);
          previewDirty = true;
          previewZoom = 1.45;
          previewAngle = previewTargetAngle = 0;
          previewTargetPitch = 38;
          Object.assign(previewCamera, { x: 3.5, z: 3.5, targetY: 0.5, pitch: 38, mode: 'ortho' });
          spatialGrid.checked = false;
          // This check is about glass versus stone, not the see-through halo.
          previewRenderer.seeThrough = 'off';
          $('connections').checked = false;
          hover = null;
          lastPointer = null;
        },
        { kind, inside },
      );
      await page.waitForFunction(() => !previewDirty && previewRuntime.players.length === 1);
      await page.evaluate((alive) => {
        previewRuntime.players[0].state = alive ? 'alive' : 'dead';
      }, alive);
      await page.waitForFunction(
        (f) => previewRenderer.frames > f + 2,
        await page.evaluate(() => previewRenderer.frames),
      );
    }
    async function sample(path) {
      const point = await page.evaluate(() => {
        const r = $('viewport').getBoundingClientRect(),
          p = previewRuntime.players[0],
          q = JellyGPU.projectPoint(screenFrame(), p.x, 0.42, p.z, r.width, r.height);
        return { x: Math.round(r.left + q.x), y: Math.round(r.top + q.y) };
      });
      const screenshot = await page.screenshot(path ? { path } : {});
      return page.evaluate(
        async ({ data, point }) => {
          const bitmap = await createImageBitmap(
            new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], { type: 'image/png' }),
          );
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height),
            ctx = canvas.getContext('2d');
          ctx.drawImage(bitmap, 0, 0);
          bitmap.close();
          return [...ctx.getImageData(point.x - 10, point.y - 10, 20, 20).data];
        },
        { data: screenshot.toString('base64'), point },
      );
    }
    const difference = (a, b) =>
      a.reduce((sum, v, i) => sum + (i % 4 === 3 ? 0 : Math.abs(v - b[i])), 0) /
      ((a.length / 4) * 3);
    const changes = {};
    for (const kind of ['none', 'stone', 'glass']) {
      await fixture(kind);
      const visible = await sample(
        kind === 'glass' ? 'artifacts/glass-block-jelly-behind.png' : undefined,
      );
      if (kind === 'glass')
        assert.equal(await page.evaluate(() => previewRenderer.phaseFaces.length), 6);
      else assert.equal(await page.evaluate(() => previewRenderer.phaseFaces.length), 0);
      await fixture(kind, false);
      changes[kind] = difference(visible, await sample());
    }
    assert.ok(changes.none > 15, JSON.stringify(changes));
    assert.ok(
      changes.stone < 1,
      'ordinary stone must occlude the jelly: ' + JSON.stringify(changes),
    );
    assert.ok(
      changes.glass > changes.none * 0.2,
      'jelly must remain visible through glass: ' + JSON.stringify(changes),
    );
    await fixture('glass', true, true);
    const inside = await sample('artifacts/glass-block-jelly-inside.png');
    await fixture('glass', false, true);
    assert.ok(
      difference(inside, await sample()) > 10,
      'jelly remains visible inside its own colour block',
    );
    await fixture('glass', true, true);
    for (const mode of ['ortho', 'perspective'])
      for (let q = 0; q < 4; q++) {
        await page.evaluate(
          ({ mode, q }) => {
            previewCamera.mode = mode;
            previewAngle = previewTargetAngle = (q * Math.PI) / 2;
          },
          { mode, q },
        );
        await page.waitForFunction(
          (f) => previewRenderer.frames > f + 1,
          await page.evaluate(() => previewRenderer.frames),
        );
      }
    assert.deepEqual(await page.evaluate(() => previewRenderer.errors), []);
    assert.deepEqual(errors, []);
    console.log(
      'PASS: actual rendered pixels reveal a jelly behind and inside coloured glass, opaque stone still occludes it, cached faces reset with scene edits, all four camera angles/projections render without GPU errors. Visibility differences: ' +
        JSON.stringify(changes),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
