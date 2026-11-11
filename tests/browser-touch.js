// Touch controls: the two joysticks drive the jellies through their key sets, a finger on the
// scene orbits the camera, key hints give way to the sticks. Also the HUD scale on a desktop
// high-density screen, which must not depend on the window width, and the full-width footer.
// Needs the dev server (npm start) and Chrome with WebGPU.
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
    const errors = [];
    const watch = (page) => {
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
    };
    const ready = (page) =>
      page.waitForFunction(() => sceneRenderer.ready && !loadingActive && !menuOpen);

    // HUD on a 2x desktop screen: the same zoom in a full and a half-width window, and the
    // footer line reaches both edges.
    const desktop = await browser.newContext({
      viewport: { width: 1512, height: 900 },
      deviceScaleFactor: 2,
    });
    const hud = await desktop.newPage();
    watch(hud);
    await hud.goto('http://localhost:3000/?level=1&play=1');
    await ready(hud);
    const measure = () =>
      hud.evaluate(() => {
        const footer = document.querySelector('footer.screen-controls'),
          box = footer.getBoundingClientRect(),
          menu = document.querySelector('#menu-button').getBoundingClientRect();
        return { left: box.left, right: box.right, width: innerWidth, menu: menu.width };
      });
    const wide = await measure();
    await hud.setViewportSize({ width: 756, height: 900 });
    await hud.waitForTimeout(200);
    const narrow = await measure();
    await hud.waitForFunction(() => !level.assembly);
    await hud.waitForTimeout(600);
    await hud.screenshot({ path: 'artifacts/hud-half-width.png' });
    // The menu's hint bar is full width too.
    await hud.keyboard.press('Escape');
    await hud.waitForTimeout(400);
    await hud.screenshot({ path: 'artifacts/hud-half-width-menu.png' });
    await hud.keyboard.press('Escape');
    assert.equal(narrow.menu, wide.menu, 'the menu button keeps its size in a half-width window');
    assert.ok(wide.menu >= 80, 'the HUD is enlarged on a 2x screen: ' + wide.menu);
    for (const m of [wide, narrow]) {
      assert.ok(Math.abs(m.left) < 1, 'footer starts at the left edge: ' + m.left);
      assert.ok(Math.abs(m.right - m.width) < 1, 'footer ends at the right edge: ' + m.right);
    }
    await desktop.close();

    // A touch tablet.
    const context = await browser.newContext({
      viewport: { width: 1000, height: 700 },
      hasTouch: true,
    });
    const page = await context.newPage();
    watch(page);
    await page.goto('http://localhost:3000/?level=1&play=1');
    await ready(page);
    const cdp = await context.newCDPSession(page);
    // Pointer moves reach the page once a frame: give each one a frame to land.
    const touch = async (type, points) => {
      await cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: points.map(([x, y], id) => ({ x, y, id })),
      });
      await page.waitForTimeout(40);
    };
    const state = () =>
      page.evaluate(() => ({
        touch: document.body.classList.contains('touch-controls'),
        held: [...heldKeys],
        players: players.map((p) => [p.x, p.z, p.deaths]),
        angle: targetAngle,
        footer: getComputedStyle(document.querySelector('footer.screen-controls')).display,
        hints: [...document.querySelectorAll('.player-key-hint')].every((n) => n.hidden),
      }));
    const travelled = (a, b, i) =>
      Math.hypot(b.players[i][0] - a.players[i][0], b.players[i][1] - a.players[i][1]) +
      (b.players[i][2] - a.players[i][2]);

    // The left stick drives the first jelly: grab it anywhere in its corner, push right.
    let before = await state();
    await touch('touchStart', [[150, 560]]);
    {
      await touch('touchMove', [[165, 560]]);
      assert.deepEqual((await state()).held, [], 'a small push stays in the dead zone');
      await touch('touchMove', [[150 + 48, 560 - 40]]);
      assert.deepEqual((await state()).held.sort(), ['KeyD', 'KeyW'], 'up-right: two keys');
      await touch('touchMove', [[150 + 70, 560]]);
      assert.deepEqual((await state()).held, ['KeyD']);
      await page.waitForTimeout(450);
      await page.screenshot({ path: 'artifacts/touch-sticks.png' });
    }
    await touch('touchEnd', []);
    let now = await state();
    assert.equal(now.touch, true, 'a touch turns the sticks on');
    assert.equal(now.footer, 'none', 'keyboard hints give way to the sticks');
    assert.equal(now.hints, true);
    assert.deepEqual(now.held, [], 'letting go releases the keys');
    assert.ok(travelled(before, now, 0) > 0.3, 'the first jelly moved');
    assert.ok(travelled(before, now, 1) < 0.05, 'the second jelly did not');

    // The right stick drives the second jelly, at the same time as the left one.
    // (A jelly that walked off an edge must be back first: a dead one takes no keys.)
    await page.waitForFunction(() => players.every((p) => p.state === 'alive'));
    await page.waitForTimeout(300);
    before = await state();
    await touch('touchStart', [
      [150, 560],
      [850, 560],
    ]);
    await touch('touchMove', [
      [150, 560 - 70],
      [850 - 70, 560],
    ]);
    assert.deepEqual((await state()).held.sort(), ['ArrowLeft', 'KeyW']);
    await page.waitForTimeout(450);
    await touch('touchEnd', []);
    now = await state();
    assert.ok(travelled(before, now, 0) > 0.3 && travelled(before, now, 1) > 0.3, 'both moved');

    // A finger on the scene, away from the sticks, turns the camera.
    before = now;
    await touch('touchStart', [[500, 200]]);
    for (let x = 500; x >= 380; x -= 20) await touch('touchMove', [[x, 200]]);
    await touch('touchEnd', []);
    now = await state();
    assert.ok(Math.abs(now.angle - before.angle) > 0.5, 'the camera turned');
    assert.deepEqual(now.held, []);

    // A movement key brings the keyboard hints back.
    await page.keyboard.press('KeyD');
    assert.equal((await state()).touch, false);
    assert.deepEqual(errors, []);
    console.log('touch controls: ok');
  } finally {
    await browser.close();
  }
})();
