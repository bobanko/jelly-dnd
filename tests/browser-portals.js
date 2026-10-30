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
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.addInitScript(() => {
      // The checks look up Russian editor labels; the editor now defaults to English.
      localStorage.setItem('jelly-dnd.language', 'ru');
      if (!localStorage.getItem('jelly-dnd.editor.v1')) {
        const blocks = [];
        for (let x = 1; x <= 6; x++) for (let z = 1; z <= 6; z++) blocks.push({ x, y: 0, z });
        localStorage.setItem(
          'jelly-dnd.editor.v1',
          JSON.stringify({
            version: 1,
            size: 8,
            name: 'Portal chains',
            blocks,
            spawns: [
              { x: 2, y: 0, z: 6 },
              { x: 4, y: 0, z: 6 },
            ],
            goals: [
              { x: 2, y: 0, z: 5 },
              { x: 4, y: 0, z: 5 },
            ],
          }),
        );
      }
    });
    await page.goto('http://localhost:3000/editor.html');
    try {
      await page.waitForFunction(
        () => view3d && previewRenderer?.ready && previewRenderer.frames > 3,
        undefined,
        { timeout: 45000 },
      );
    } catch (error) {
      console.error(await page.locator('#gpu-message').textContent(), errors);
      throw error;
    }
    const click = async (x, y, z) => {
      const p = await page.evaluate(
        (p) => {
          const r = $('viewport').getBoundingClientRect(),
            s = JellyGPU.projectPoint(screenFrame(), ...p, r.width, r.height);
          return { x: r.left + s.x, y: r.top + s.y };
        },
        [x, y, z],
      );
      await page.mouse.click(p.x, p.y);
    };
    await page.locator('[data-tool=portal-violet]').click();
    for (const [x, z] of [
      [1, 3],
      [3, 3],
      [5, 3],
      [5, 5],
      [1, 5],
    ])
      await click(x, 0, z);
    assert.equal(await page.evaluate(() => model.map.portals.length), 5);
    const original = await page.evaluate(() => model.map.portals);
    const order = page.locator('#properties').getByLabel('Порядок в цепочке', { exact: true });
    await order.fill('1');
    await order.press('Tab');
    assert.ok(
      await page.evaluate(() => model.map.portals[0].x === 1 && model.map.portals[0].z === 5),
    );
    await order.focus();
    await order.press('ArrowUp');
    assert.equal(await order.inputValue(), '2');
    await order.press('ArrowDown');
    assert.equal(await order.inputValue(), '1');
    // Put the last portal back at the end, then repaint it without changing its order.
    await order.fill('5');
    await order.press('Tab');
    await click(1, 0, 5);
    assert.deepEqual(await page.evaluate(() => model.map.portals), original);
    await page.locator('[data-tool=portal-amber]').click();
    for (const x of [2, 4, 6]) await click(x, 0, 1);
    assert.equal(await page.evaluate(() => model.map.portals.length), 8);
    assert.deepEqual(await page.evaluate(() => L.issues(model.map)), []);
    await page.locator('[data-tool=select]').click();
    await page.waitForFunction(() => !previewDirty && previewRuntime.world.portals.length === 8);
    await page.screenshot({ path: 'artifacts/portal-chain-editor.png' });
    const draft = await page.evaluate(() => JSON.stringify(model.map));
    await page.reload();
    await page.waitForFunction(() => previewRenderer?.ready && previewRenderer.frames > 3);
    assert.deepEqual(await page.evaluate(() => model.map), JSON.parse(draft));
    await page.locator('#play').click();
    await page.waitForURL('**/?level=editor');
    await page.waitForFunction(() => sceneRenderer.ready && sceneRenderer.frames > 6);
    await page.screenshot({ path: 'artifacts/portal-chain-active.png' });
    const teleportTo = async (index) => {
      await page.evaluate((i) => {
        const p = players[0],
          q = world.portals.filter((q) => q.color === 'violet')[i];
        Object.assign(p, {
          x: q.x,
          y: q.y,
          z: q.z,
          rx: q.x,
          rz: q.z,
          vx: 0,
          vz: 0,
          portalLock: null,
          portalCooldown: 0,
        });
        soft.reset();
      }, index);
      await page.waitForFunction((i) => {
        const q = world.portals.filter((q) => q.color === 'violet')[(i + 1) % 5];
        return (
          players[0].portalLock === 'violet' &&
          Math.hypot(players[0].x - q.x, players[0].z - q.z) < 0.1
        );
      }, index);
    };
    await teleportTo(0);
    assert.deepEqual(
      await page.evaluate(() =>
        world.portals.slice(0, 5).map((p) => world.portalInactive(p, bodies)),
      ),
      [true, true, false, false, false],
    );
    assert.ok(
      await page.evaluate(
        () => sceneRenderer.portalStates[0].active > 0 && sceneRenderer.portalStates[0].active < 1,
      ),
      'visuals ease while transport is already blocked',
    );
    const phase = await page.evaluate(() => sceneRenderer.portalStates[0].phase);
    await page.waitForFunction(() => sceneRenderer.portalStates[0].active < 0.03);
    assert.ok(
      await page.evaluate(
        (p) => (sceneRenderer.portalStates[0].phase - p + Math.PI * 2) % (Math.PI * 2) < 2,
        phase,
      ),
      'vortex phase remains continuous during dimming',
    );
    assert.ok(
      await page.evaluate(() =>
        world.portals.slice(5).every((p) => !world.portalInactive(p, bodies)),
      ),
    );
    await page.screenshot({ path: 'artifacts/portal-chain-muted.png' });
    await page.evaluate(() => soft.translate(players[0], 0.7, 0, 0, true));
    await page.waitForFunction(() => players[0].portalCooldown === 0);
    assert.ok(await page.evaluate(() => world.portalInactive(world.portals[1], bodies)));
    await page.evaluate(() => soft.translate(players[0], 0.2, 0, 0, true));
    await page.waitForFunction(() => players[0].portalLock === null);
    assert.ok(
      await page.evaluate(() =>
        world.portals.slice(0, 5).every((p) => !world.portalInactive(p, bodies)),
      ),
    );
    assert.ok(
      await page.evaluate(
        () => sceneRenderer.portalStates[0].active > 0 && sceneRenderer.portalStates[0].active < 1,
      ),
      'reactivation also eases',
    );
    await page.waitForFunction(() => sceneRenderer.portalStates[0].active > 0.98);
    for (const index of [1, 2, 3, 4]) await teleportTo(index);
    // A physical arrival lock blocks the predecessor; it never redirects to a later exit.
    await page.evaluate(() => {
      reset();
      const q = world.portals[1],
        a = world.portals[0];
      Object.assign(players[1], q, { portalLock: 'violet', portalCooldown: 0 });
      Object.assign(players[0], a, { portalLock: null, portalCooldown: 0 });
      soft.reset();
    });
    await page.waitForFunction(() => players[0].portalBlocked);
    assert.ok(await page.evaluate(() => Math.abs(players[0].x - world.portals[0].x) < 0.05));
    await page.evaluate(() => soft.translate(players[1], 0, 0, 1, true));
    await page.waitForFunction(
      () => Math.hypot(players[0].x - world.portals[1].x, players[0].z - world.portals[1].z) < 0.1,
    );
    // A pair dims on both ends; clearing the exit restores both.
    await page.evaluate(() => {
      world.portals = world.portals.filter((p) => p.color === 'amber').slice(0, 2);
      sceneRenderer.decorationKey = undefined;
      players[0].portalLock = 'amber';
      Object.assign(players[0], world.portals[1]);
      soft.reset();
    });
    await page.waitForFunction(() => world.portals.every((p) => world.portalInactive(p, bodies)));
    await page.screenshot({ path: 'artifacts/portal-pair-muted.png' });
    await page.evaluate(() => soft.translate(players[0], 0, 0, 1, true));
    await page.waitForFunction(() => world.portals.every((p) => !world.portalInactive(p, bodies)));
    // Exercise every GPU portal slot, with no active heroes covering the stress scene.
    await page.evaluate(() => {
      reset();
      world.portals = Array.from({ length: 64 }, (_, i) => ({
        x: i % 8,
        y: 0,
        z: Math.floor(i / 8),
        color: i % 2 ? 'amber' : 'violet',
      }));
      sceneRenderer.decorationKey = undefined;
    });
    const frame = await page.evaluate(() => sceneRenderer.frames);
    await page.waitForFunction((f) => sceneRenderer.frames > f + 3, frame);
    assert.equal(await page.evaluate(() => world.portals.length), 64);
    await page.screenshot({ path: 'artifacts/portal-64-stress.png' });
    assert.deepEqual(await page.evaluate(() => sceneRenderer.errors), []);
    assert.deepEqual(errors, []);
    console.log(
      'PASS: five-plus-three portal placement, directed chain order/focused edits/repaint/persistence, eight GPU portals, full cyclic traversal, partial/full departure, blocked next exit without skipping, dimmed pair and 64 portal GPU slots without browser/GPU errors.',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
