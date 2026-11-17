import { chromium } from './browser-harness.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import demo from '../levels/beholder-guardians.json' with { type: 'json' };

fs.mkdirSync('artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-webgpu'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }),
    errors = [];
  page.setDefaultTimeout(30000);
  page.on('pageerror', (e) => {
    errors.push(e.message);
    console.error('PAGE', e.message);
  });
  page.on('console', (m) => {
    if (m.type() === 'error') {
      errors.push(m.text());
      console.error('CONSOLE', m.text());
    }
  });
  await page.addInitScript((map) => {
    localStorage.setItem('jelly-dnd.language', 'en');
    localStorage.setItem('jelly-dnd.editor.v1', JSON.stringify(map));
    localStorage.setItem('jelly-dnd.play.v1', JSON.stringify(map));
  }, demo);
  await page.goto('http://localhost:3000/editor.html');
  await page
    .waitForFunction(() => previewRenderer?.ready && previewRenderer.frames > 3)
    .catch(async (e) => {
      console.log(
        await page.evaluate(() => ({
          ready: previewRenderer?.ready,
          frames: previewRenderer?.frames,
          message: $('gpu-message').textContent,
        })),
      );
      await page.screenshot({ path: 'artifacts/beholder-failure.png' });
      throw e;
    });
  assert.equal(
    await page.locator('[data-tool=beholder]').getAttribute('aria-label'),
    'Objects · Beholder',
  );
  await page.locator('[data-tool=beholder]').click();
  const blockCount = await page.evaluate(() => model.map.blocks.length);
  await page.evaluate(() => edit(() => paintCell({ x: 0, y: 2, z: 2 }, 'beholder')));
  await page.waitForFunction(() => !previewDirty && previewRuntime.world.beholders.length === 3);
  assert.equal(await page.evaluate(() => model.map.blocks.length), blockCount);
  assert.deepEqual(await page.evaluate(() => L.issues(model.map)), []);
  await page.evaluate(() => {
    model.move('beholders', 2, 0, 3, 3);
    selected = { x: 0, y: 3, z: 3 };
    changed();
  });
  await page.waitForFunction(() => !previewDirty && previewRuntime.world.beholders[2].y === 3);
  assert.equal(await page.evaluate(() => model.map.blocks.length), blockCount);
  const inspector = page.locator('#properties');
  await inspector.locator('input[name="gaze-beholders-2"][value="-1,0"]').check();
  await inspector.locator('input[name="color-beholders-2"][value="blue"]').check();
  assert.deepEqual(
    await page.evaluate(() => {
      const b = model.map.beholders[2];
      return [b.dx, b.dz, b.color];
    }),
    [-1, 0, 'blue'],
  );
  assert.equal(
    await inspector.locator('input[name="gaze-beholders-2"]:checked').inputValue(),
    '-1,0',
  );
  await page.evaluate(() => {
    model.remove('beholders', 2);
    changed();
  });
  await page.waitForFunction(() => !previewDirty && previewRenderer.beamCount === 2);
  const idle = await page.evaluate(() => {
    const i = previewRenderer.propPieces.findIndex((p) => p.kind === 'beholder' && p.index === 0);
    return { y: previewRenderer.propInstances[i * 20 + 1], time: previewRuntime.world.featureTime };
  });
  await page.waitForFunction((idle) => {
    const i = previewRenderer.propPieces.findIndex((p) => p.kind === 'beholder' && p.index === 0);
    return (
      previewRuntime.world.featureTime > idle.time + 0.5 &&
      Math.abs(previewRenderer.propInstances[i * 20 + 1] - idle.y) > 0.005
    );
  }, idle);
  assert.ok(
    await page.evaluate(() => {
      const i = previewRenderer.propPieces.findIndex((p) => p.kind === 'beholder' && p.index === 0),
        y = previewRenderer.propInstances[i * 20 + 1];
      return (
        Math.abs(y - previewRuntime.world.beholderBeams[0].from[1]) < 1e-6 &&
        previewRenderer.propInstances[i * 20 + 19] === 2
      );
    }),
    'editor hover, model and sight line stay aligned',
  );
  await page.screenshot({ path: 'artifacts/beholder-editor.png' });
  await page.evaluate(() => {
    const p = previewRuntime.players[0];
    previewRuntime.soft.translate(p, 4 - p.x, -p.y, 3 - p.z);
    previewAngle = previewTargetAngle = Math.PI / 4;
  });
  await page.waitForFunction(() =>
    previewRuntime.effects.particles.some((p) => p.kind === 'alert'),
  );
  await page.screenshot({ path: 'artifacts/beholder-preview-alert.png' });

  await page.goto('http://localhost:3000/?level=editor');
  await page.waitForFunction(() => sceneRenderer?.ready && sceneRenderer.frames > 3);
  await page.waitForFunction(() => !level.assembly, null, { timeout: 30000 });
  assert.equal(await page.evaluate(() => world.beholders.length), 2);
  assert.equal(await page.evaluate(() => sceneRenderer.beamCount), 2);
  // Place a jelly on the ray using the same translation as a portal exit,
  // then let the normal simulation update detection, particles and bridges.
  await page.evaluate(() => {
    const p = players[0];
    soft.translate(p, 4 - p.x, -p.y, 3 - p.z);
  });
  await page.waitForFunction(() => world.beholderBeams[0]?.detected && world.held.size === 2);
  await page.waitForFunction(() => effects.particles.some((p) => p.kind === 'alert'));
  await page.waitForFunction(() => sceneRenderer.beholderAnimation.states[0].awake > 0.8);
  assert.ok(
    await page.evaluate(() => {
      const i = sceneRenderer.propPieces.findIndex((p) => p.kind === 'beholder' && p.index === 0);
      return (
        Math.abs(sceneRenderer.propInstances[i * 20 + 1] - world.beholderBeams[0].from[1]) < 1e-6 &&
        sceneRenderer.propInstances[i * 20 + 17] > 0.8
      );
    }),
    'wake animation ramps up while the visible eye stays attached to the ray',
  );
  assert.equal(await page.evaluate(() => players[0].state), 'alive');
  await page.screenshot({ path: 'artifacts/beholder-alert.png' });
  await page.evaluate(() => {
    const p = players[0];
    soft.translate(p, 0, 0, -1.2);
  });
  await page.waitForFunction(() => !world.beholderBeams[0]?.detected && world.held.size === 0);
  assert.ok(await page.evaluate(() => sceneRenderer.beholderAnimation.states[0].awake > 0));
  await page.waitForFunction(() => sceneRenderer.beholderAnimation.states[0].awake < 0.05);
  assert.deepEqual(errors, []);
  console.log(
    'Beholder idle hover, wake/settle animation, eye/beam alignment, editor and linked bridges: OK',
  );
} finally {
  await browser.close();
}
