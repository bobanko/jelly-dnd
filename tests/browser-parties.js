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
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto('http://localhost:3000/editor.html');
    await page.waitForFunction(() => view3d && previewRenderer?.ready && previewRuntime);
    const spawns = [
        [1, 4],
        [3, 4],
        [5, 4],
        [5, 6],
      ],
      finishes = [
        [1, 1],
        [3, 1],
        [5, 1],
        [5, 2],
      ];
    const clickCell = async ([x, z]) => {
      const p = await page.evaluate(
        ([x, z]) => {
          const r = document.getElementById('viewport').getBoundingClientRect(),
            p = JellyGPU.projectPoint(screenFrame(), x, 0.02, z, r.width, r.height);
          return { x: r.left + p.x, y: r.top + p.y };
        },
        [x, z],
      );
      await page.mouse.click(p.x, p.y);
    };
    for (const slots of [[3], [1, 3], [0, 1, 2, 3]]) {
      await page.evaluate(() => {
        const map = L.blank();
        map.size = 8;
        map.name = 'Party test';
        for (let x = 1; x <= 6; x++)
          for (let z = 1; z <= 6; z++) map.tiles.push({ x, z, height: 0 });
        replaceMap(map);
      });
      await page.waitForFunction(() => previewRuntime.players.length === 0);
      for (const slot of slots) {
        await page.locator(`[data-tool="spawn-${slot}"]`).click();
        await clickCell(spawns[slot]);
        assert.ok(await page.evaluate(() => L.issues(model.map).length > 0));
        await page.locator(`[data-tool="goal-${slot}"]`).click();
        await clickCell(finishes[slot]);
      }
      assert.deepEqual(await page.evaluate(() => L.issues(model.map)), []);
      await page.waitForFunction(
        (n) => previewRuntime.players.length === n && previewRuntime.goals.length === n,
        slots.length,
      );
      assert.deepEqual(await page.evaluate(() => previewRuntime.players.map((p) => p.slot)), slots);
      assert.deepEqual(await page.evaluate(() => previewRenderer.errors), []);
      await page.locator('#play').click();
      await page.waitForURL('**/?level=editor');
      await page.waitForFunction(() => sceneRenderer.ready);
      assert.equal(await page.locator('.member:visible').count(), slots.length);
      assert.deepEqual(await page.evaluate(() => players.map((p) => p.slot)), slots);
      const labels =
        slots.length === 1
          ? ['WASD / ↑←↓→ / IJKL / TFGH']
          : slots.length === 2
            ? ['WASD / TFGH', '↑←↓→ / IJKL']
            : ['WASD', '↑←↓→', 'IJKL', 'TFGH'];
      assert.deepEqual(await page.locator('.member:visible kbd').allTextContents(), labels);
      assert.deepEqual(
        await page.evaluate(() =>
          ['KeyW', 'ArrowUp', 'KeyI', 'KeyT'].map((k) => movementKeys[k]?.[0] ?? -1),
        ),
        slots.length === 1 ? [0, 0, 0, 0] : slots.length === 2 ? [0, 1, 1, 0] : [0, 1, 2, 3],
      );
      await page.setViewportSize({ width: 390, height: 844 });
      assert.ok(
        await page.evaluate(() => {
          const panel = document.querySelector('aside').getBoundingClientRect();
          return [...document.querySelectorAll('.member:not([hidden]) kbd')].every((k) => {
            const r = k.getBoundingClientRect();
            return r.left >= panel.left && r.right <= panel.right;
          });
        }),
        'all assigned controls fit the mobile HUD',
      );
      await page.setViewportSize({ width: 1600, height: 1000 });
      assert.equal(await page.evaluate(() => bodies.length), slots.length);
      assert.equal(await page.evaluate(() => mapError), null);
      await page.keyboard.press('Digit4');
      assert.equal(await page.evaluate(() => players[followedPlayer].slot), 3);
      const before = await page.evaluate(() => players.find((p) => p.slot === 3).x),
        moveKey = slots.length === 1 ? 'KeyD' : slots.length === 2 ? 'KeyL' : 'KeyH';
      await page.keyboard.down(moveKey);
      await page.waitForFunction((x) => players.find((p) => p.slot === 3).x > x + 0.06, before);
      await page.keyboard.up(moveKey);
      await page.keyboard.press('KeyZ');
      assert.ok(
        await page.evaluate(
          (x) => Math.abs(players.find((p) => p.slot === 3).x - x) < 0.04,
          before,
        ),
      );
      await page.locator('.jelly-settings summary').click();
      await page.locator('#mesh').check();
      await page.waitForTimeout(70);
      await page.locator('#mesh').uncheck();
      await page.locator('.jelly-settings summary').click();
      if (slots.length === 4) {
        await page.evaluate(() => {
          camera.x = 3.5;
          camera.z = 4;
          zoom = 1.5;
          resize();
        });
        await page.screenshot({ path: 'artifacts/four-jellies.png' });
      }
      // Every active jelly, including purple, is required to finish.
      if (slots.length > 1) {
        await page.evaluate(() => {
          players.slice(0, -1).forEach((p) =>
            Object.assign(
              p,
              goals.find((g) => g.slot === p.slot),
              { vx: 0, vz: 0 },
            ),
          );
          soft.reset();
        });
        await page.waitForTimeout(150);
        assert.equal(await page.evaluate(() => won), false);
      }
      await page.evaluate(() => {
        players.forEach((p) =>
          Object.assign(
            p,
            goals.find((g) => g.slot === p.slot),
            { vx: 0, vz: 0 },
          ),
        );
        soft.reset();
      });
      await page.waitForFunction(() => finishHold > 0.1 && !won);
      assert.ok(await page.locator('#win').isHidden());
      assert.match(await page.locator('#status').textContent(), /Рунические печати/);
      assert.equal(await page.evaluate(() => sceneRenderer.goalWinGlow), 0);
      await page.waitForFunction(() => level.finishProgress > 0.3 && level.finishProgress < 0.8);
      await page.screenshot({ path: `artifacts/party-${slots.length}-charging.png` });
      if (slots.length === 2) {
        await page.waitForFunction(() => finishHold > 1.2 && !won);
        await page.keyboard.down('KeyS');
        await page.waitForFunction(
          () =>
            !world.goalActive(
              goals.find((g) => g.slot === players[0].slot),
              players[0],
            ),
        );
        await page.keyboard.up('KeyS');
        assert.equal(await page.evaluate(() => finishHold), 0);
        assert.equal(await page.evaluate(() => level.finishProgress), 0);
        assert.equal(await page.evaluate(() => won), false);
        assert.ok(
          await page.evaluate(() =>
            world.goalActive(
              goals.find((g) => g.slot === players[1].slot),
              players[1],
            ),
          ),
        );
        await page.screenshot({ path: 'artifacts/party-charge-cancelled.png' });
        await page.evaluate(() => {
          Object.assign(
            players[0],
            goals.find((g) => g.slot === players[0].slot),
            { vx: 0, vz: 0 },
          );
          soft.reset();
        });
        await page.waitForFunction(() => finishHold > 0.1 && !won);
      }
      await page.waitForFunction(() => won && sceneRenderer.goalWinGlow > 0.5);
      assert.equal(await page.evaluate(() => finishHold), 3);
      assert.ok(
        await page.evaluate(() => effects.runes.some((p) => p.glyph === 3 && p.color[2] === 1)),
      );
      assert.equal(await page.evaluate(() => sceneRenderer.goalGlowStrength.length), slots.length);
      await page.screenshot({ path: `artifacts/party-${slots.length}-victory.png` });
      await page.keyboard.press('KeyR');
      assert.ok(
        await page.evaluate(
          (n) =>
            players.length === n &&
            players.every((p) => p.state === 'alive') &&
            !won &&
            finishHold === 0,
          slots.length,
        ),
      );
      if (slots.length === 4) {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({ path: 'artifacts/four-jellies-mobile.png' });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.setViewportSize({ width: 1600, height: 1000 });
      }
      assert.deepEqual(await page.evaluate(() => sceneRenderer.errors), []);
      await page.locator('#editor-link').click();
      await page.waitForURL('**/editor.html');
      await page.waitForFunction(() => previewRenderer?.ready && previewRuntime);
      assert.deepEqual(
        await page.evaluate(() => model.map.spawns.flatMap((p, i) => (p ? [i] : []))),
        slots,
      );
    }
    // Reducing an existing chamber only requires removing unwanted spawns.
    await page.evaluate(() => {
      const map = L.standardLevel(JellyLevelCatalog.standard.indexOf('05-sunken-sanctum.json') + 1);
      map.spawns[1] = map.spawns[2] = null;
      replaceMap(map);
    });
    assert.deepEqual(await page.evaluate(() => L.issues(model.map)), []);
    await page.locator('#play').click();
    await page.waitForURL('**/?level=editor');
    await page.waitForFunction(() => sceneRenderer.ready);
    assert.equal(await page.locator('.member:visible').count(), 1);
    assert.equal(await page.evaluate(() => players.length), 1);
    await page.evaluate(() => {
      Object.assign(
        players[0],
        goals.find((g) => g.slot === 0),
      );
      soft.reset();
    });
    await page.waitForFunction(() => won && sceneRenderer.goalWinGlow > 0.5);
    assert.ok(
      await page.evaluate(
        () =>
          sceneRenderer.goalGlowStrength[0] > 0 &&
          sceneRenderer.goalGlowStrength.slice(1).every((s) => s === 0) &&
          effects.runes.every((p) => p.glyph === 0),
      ),
    );
    assert.deepEqual(await page.evaluate(() => sceneRenderer.errors), []);
    assert.deepEqual(errors, []);
    console.log(
      'PASS: 1/2/4-colour parties painted in 3D, validation, empty previews, active-only physics/HUD, fourth controls/camera/undo, four refraction layers, lattice, matching runes/particles/victory, reset, mobile HUD, editor return and reducing the original chamber while retaining unused finishes. No browser or GPU errors.',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
