import { chromium } from './browser-harness.js';
import assert from 'node:assert/strict';
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--enable-unsafe-webgpu', '--use-angle=d3d11'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://localhost:3000/');
    await page.waitForFunction(
      () => typeof sceneRenderer !== 'undefined' && sceneRenderer.ready && !loadingActive,
    );
    await page.waitForTimeout(300);
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.equal(await page.locator('#play').textContent(), 'Play');
    assert.deepEqual(await page.evaluate(() => menuScene.players.map((p) => p.slot)), [1, 2]);
    const animation = await page.evaluate(() => {
      const positions = [new Set(), new Set()];
      let arrows = false,
        impact = false;
      for (let step = 0; step < 400; step++) {
        menuScene.animate(1 / 60);
        menuScene.players.forEach((p, i) => positions[i].add(p.x.toFixed(2)));
        arrows ||= menuScene.world.arrows.length > 0;
        impact ||= menuScene.players.some((p) => p.menuImpact > 0);
      }
      return { moving: positions.every((p) => p.size > 10), arrows, impact };
    });
    assert.deepEqual(animation, { moving: true, arrows: true, impact: true });
    // The menu scene animates its jellies itself; movement keys must not drive them.
    await page.keyboard.press('w');
    await page.waitForTimeout(150);
    assert.deepEqual(await page.evaluate(() => [moves, heldKeys.size]), [0, 0]);
    await page.locator('#play').focus();
    await page.screenshot({ path: 'artifacts/menu-en.png' });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    assert.equal(
      await page.locator('#show-controls').evaluate((n) => n.classList.contains('selected')),
      true,
    );
    await page.keyboard.press('e');
    assert.equal(await page.locator('#menu-help').isVisible(), true);
    await page.keyboard.press('q');
    assert.equal(await page.locator('#menu-help').isVisible(), false);
    await page.keyboard.press('s');
    await page.keyboard.press('s');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#menu-help').isVisible(), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#menu-root').isVisible(), true);
    await page.locator('[data-language=ru]').click();
    assert.equal(await page.locator('#play').textContent(), 'Играть');
    assert.equal(
      await page.locator('#menu-title').getAttribute('aria-label'),
      'Желейки и косточки',
    );
    await page.screenshot({ path: 'artifacts/menu-ru.png' });
    await page.reload();
    // Keys are ignored until loading finishes.
    await page.waitForFunction(
      () => typeof sceneRenderer !== 'undefined' && sceneRenderer.ready && !loadingActive,
    );
    assert.equal(await page.locator('html').getAttribute('lang'), 'ru');
    await page.locator('[data-language=en]').click();
    await page.locator('#play').click();
    // Park the pointer so hovering an item cannot take over the keyboard selection.
    await page.mouse.move(1, 1);
    assert.equal(await page.locator('#menu-levels').isVisible(), true);
    assert.equal(await page.locator('[data-level="1"]').isEnabled(), true);
    assert.equal(await page.locator('[data-level="2"]').isDisabled(), true);
    await page.keyboard.press('ArrowDown');
    assert.equal(
      await page.locator('#levels-back').evaluate((n) => n.classList.contains('selected')),
      true,
    );
    await page.keyboard.press('ArrowUp');
    await page.waitForFunction(
      () => typeof sceneRenderer !== 'undefined' && sceneRenderer.ready && !loadingActive,
    );
    await page.locator('#level-loading').waitFor({ state: 'hidden' });
    await page.screenshot({ path: 'artifacts/level-select.png' });
    await page.locator('[data-level="1"]').click();
    await page.waitForURL('**/?level=1&play=1');
    await page.waitForFunction(
      () => typeof sceneRenderer !== 'undefined' && sceneRenderer.ready && !loadingActive,
    );
    assert.equal(await page.locator('#main-menu').isVisible(), false);
    assert.equal(await page.locator('#level-intro').isVisible(), false);
    assert.equal(await page.locator('#level-intro-title').textContent(), '1. First Steps');
    assert.notEqual(await page.evaluate(() => document.activeElement?.id), 'menu-button');
    await page.keyboard.press('w');
    assert.ok((await page.evaluate(() => moves)) > 0);
    await page.screenshot({ path: 'artifacts/level-ready.png' });
    assert.equal(await page.locator('#level-intro').isVisible(), false);
    await page.keyboard.down('w');
    await page.waitForTimeout(200);
    await page.keyboard.up('w');
    assert.ok(await page.evaluate(() => moves > 0));
    await page.keyboard.press('r');
    assert.equal(await page.locator('#restart-fade').isVisible(), true);
    await page.waitForFunction(() => restartTransition === null);
    assert.equal(await page.evaluate(() => moves), 0);
    const complete = async () => {
      await page.evaluate(() => {
        // This checks campaign progression, not each level: switch off its hazards.
        for (const key of ['drones', 'archers', 'arrows', 'spikes']) world[key]?.splice(0);
        players.forEach((p) => {
          const goal = goals.find((g) => g.slot === p.slot);
          Object.assign(p, goal, { rx: goal.x, rz: goal.z, vx: 0, vz: 0 });
        });
        soft.reset();
        finishHold = WIN_HOLD_SECONDS - 0.01;
        simulate(0.05);
      });
      assert.equal(await page.evaluate(() => won), true);
    };
    await complete();
    assert.equal(await page.evaluate(() => JellyProgress.unlocked), 2);
    assert.equal(await page.locator('#win-title').textContent(), 'Level complete');
    assert.equal(await page.locator('#win-next').textContent(), 'Next level');
    await page.screenshot({ path: 'artifacts/level-complete.png' });
    await page.keyboard.press('s');
    await page.keyboard.press('e');
    await page.waitForFunction(() => restartTransition === null);
    assert.equal(await page.evaluate(() => won), false);
    assert.equal(await page.locator('#level-intro').isVisible(), false);
    await complete();
    await page.keyboard.press('Enter');
    await page.waitForURL('**/?level=2&play=1');
    await page.waitForFunction(
      () => typeof sceneRenderer !== 'undefined' && sceneRenderer.ready && !loadingActive,
    );
    assert.equal(await page.locator('#level-intro-title').textContent(), '2. Helping Hands');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#play').textContent(), 'Resume');
    await page.keyboard.press('q');
    assert.equal(await page.locator('#main-menu').isVisible(), false);
    assert.notEqual(await page.evaluate(() => document.activeElement?.id), 'menu-button');
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'artifacts/menu-mobile.png' });
    assert.equal(await page.locator('#play').isVisible(), true);
    await page.locator('#show-levels').click();
    await page.keyboard.press('q');
    assert.equal(await page.locator('#menu-root').isVisible(), true);
    // Every campaign level in order; the simulation waits for the level assembly to finish.
    const levelCount = await page.evaluate(() => JellyLevels.standardNames.length);
    for (let id = 2; id <= levelCount; id++) {
      await page.goto('http://localhost:3000/?level=' + id + '&play=1');
      await page.waitForFunction(
        () =>
          typeof sceneRenderer !== 'undefined' &&
          sceneRenderer.ready &&
          !loadingActive &&
          !level.assembly,
      );
      assert.equal(await page.evaluate(() => mapError), null);
      assert.equal(
        await page.evaluate(() => definition.name),
        await page.evaluate((id) => JellyLevels.standardNames[id - 1], id),
      );
      await complete();
      assert.equal(await page.evaluate(() => JellyProgress.unlocked), Math.min(levelCount, id + 1));
    }
    assert.equal(await page.locator('#win-title').textContent(), 'Demo complete');
    assert.equal(await page.locator('#win-next').textContent(), 'Levels');
    await page.locator('#win-next').click();
    assert.equal(await page.locator('#menu-levels').isVisible(), true);
    await page.keyboard.press('q');
    await page.locator('#open-editor').click();
    await page.waitForURL('**/editor.html');
    await page.waitForFunction(
      () =>
        typeof model !== 'undefined' &&
        typeof previewRenderer !== 'undefined' &&
        previewRenderer.ready,
    );
    // Opening the editor from a paused campaign run carries over that campaign map.
    assert.equal(
      await page.evaluate(() => model.map.name),
      await page.evaluate((id) => L.standardLevel(id).name, levelCount),
    );
    await page.goto('http://localhost:3000/?level=editor');
    await page.waitForFunction(() => typeof sceneRenderer !== 'undefined' && sceneRenderer.ready);
    assert.equal(await page.locator('#main-menu').isVisible(), false);
    assert.deepEqual(errors, []);
    console.log(
      'PASS menu, paused input, languages, persistence, resume, mobile and editor launch',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
