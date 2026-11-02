import { chromium } from './browser-harness.js';
import assert from 'node:assert/strict';

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }),
      errors = [],
      failed = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('requestfailed', (request) => failed.push(request.url()));
    await page.goto('http://localhost:3000/sounds.html');
    assert.equal(await page.locator('.sound-card').count(), 39);
    assert.equal(await page.locator('.sound-group').count(), 7);
    assert.equal(await page.locator('#sample-count').textContent(), '28');
    assert.equal(await page.locator('#procedural-count').textContent(), '11');

    const loopButton = page.locator('[data-sound="wind"] .sound-play');
    // The progress bar along the card fills while a sound plays and empties when it stops.
    const progress = (id) =>
      page.evaluate((id) => {
        const bar = document.querySelector(`[data-sound="${id}"] .sound-progress span`);
        return new DOMMatrix(getComputedStyle(bar).transform).a;
      }, id);
    // The harness's waitForFunction only reaches the game and editor pages, so poll here.
    const untilProgress = async (id) => {
      for (let i = 0; i < 100 && !((await progress(id)) > 0); i++) await page.waitForTimeout(50);
      assert.ok((await progress(id)) > 0, id + ' progress bar starts filling');
    };
    await loopButton.click();
    await page.locator('[data-sound="wind"].playing').waitFor();
    assert.match(await page.locator('#sound-status').textContent(), /Ветер подземелья/);
    await untilProgress('wind');
    const early = await progress('wind');
    await page.waitForTimeout(400);
    assert.ok((await progress('wind')) > early, 'the bar advances while playing');
    await loopButton.click();
    assert.equal(await page.locator('[data-sound="wind"].playing').count(), 0);
    assert.equal(await progress('wind'), 0, 'stopping empties the bar');

    await page.locator('[data-sound="uiMove"] .sound-play').click();
    await page.locator('[data-sound="uiMove"].playing').waitFor();

    const toneButton = page.locator('[data-sound="victoryTone"] .sound-play');
    await toneButton.click();
    await page.locator('[data-sound="victoryTone"].playing').waitFor();
    await untilProgress('victoryTone');
    await page.screenshot({ path: 'artifacts/sounds-wide.png', fullPage: true });
    await page.locator('[data-sound="woodHit"] .sound-play').click();
    await page.locator('[data-sound="woodHit"].playing').waitFor();
    await page.locator('[data-sound="torchGong"] .sound-play').click();
    await page.locator('[data-sound="torchGong"].playing').waitFor();
    await untilProgress('torchGong');

    await page.setViewportSize({ width: 390, height: 844 });
    const cards = page.locator('.sound-card');
    for (let index = 0; index < (await cards.count()); index++) {
      const box = await cards.nth(index).boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= 391, 'sound card outside mobile view');
    }
    await page.screenshot({ path: 'artifacts/sounds-mobile.png', fullPage: true });
    assert.deepEqual(errors, []);
    assert.deepEqual(failed, []);
    console.log(
      'PASS sound gallery catalog, playback controls, progress bars and responsive layout',
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
