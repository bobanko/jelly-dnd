// The online menu: creating a room and picking its first level, the invite link, joining by a
// typed code, the guest's wait for its host, and the pause menu of a network game.
// Needs the dev server (npm start) and Chrome with WebGPU. Runs between two pages of one
// browser (&relay=local), without the relay.
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
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } }),
      errors = [];
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: 'http://localhost:3000',
    });
    let pages = 0;
    const open = async () => {
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await page.addInitScript(() => localStorage.setItem('jelly-dnd.language', 'en'));
      // The host has finished level 1, so level 2 is open to it; the guest has played nothing.
      if (!pages++)
        await page.addInitScript(() =>
          localStorage.setItem(
            'jelly-dnd.progress.v2',
            JSON.stringify({
              version: 2,
              completed: ['01-first-steps.json'],
              unlocked: ['01-first-steps.json', '02-helping-hands.json'],
            }),
          ),
        );
      await page.goto('http://localhost:3000/?relay=local');
      await page.waitForFunction(() => sceneRenderer.ready && !loadingActive);
      return page;
    };
    const visible = (page, selector) => page.locator(selector).isVisible();

    // The host creates a room: a five-character code, then the usual level list.
    const host = await open();
    await host.locator('#show-online').click();
    assert.equal(await visible(host, '#menu-online'), true);
    assert.equal(await visible(host, '#room-card'), false, 'no room before creating one');
    await host.screenshot({ path: 'artifacts/net-menu-online.png' });
    await host.locator('#net-create').click();
    assert.equal(await visible(host, '#menu-levels'), true);
    const code = await host.locator('#room-code').innerText();
    assert.match(code, /^[A-HJ-NP-Z2-9]{5}$/);
    assert.equal(await visible(host, '#room-note'), true);
    // Back and forth keeps the code, so a link already sent stays good.
    await host.keyboard.press('Escape');
    assert.equal(await visible(host, '#menu-online'), true);
    await host.locator('#net-create').click();
    assert.equal(await host.locator('#room-code').innerText(), code);
    await host.locator('#copy-invite').click();
    await host.waitForFunction(
      () => document.querySelector('#copy-invite').textContent === 'Link copied',
    );
    const link = await host.evaluate(() => navigator.clipboard.readText());
    assert.equal(link, `http://localhost:3000/?room=${code}&play=1&relay=local`);
    await host.screenshot({ path: 'artifacts/net-menu-create.png' });

    // The guest types the code (any case, with a stray space); a wrong one is refused.
    const guest = await open();
    await guest.locator('#show-online').click();
    await guest.locator('#net-code').fill('ab');
    await guest.keyboard.press('Enter');
    assert.equal(await visible(guest, '#net-join-error'), true);
    await guest.locator('#net-code').fill(' ' + code.toLowerCase());
    await guest.keyboard.press('Enter');
    await guest.waitForURL(link);
    await guest.waitForFunction(() => sceneRenderer.ready && !loadingActive);
    // The host has not opened the room yet: the guest waits, with a way out.
    await guest.waitForFunction(() => !document.querySelector('#net-wait').hidden);
    assert.equal(await guest.locator('#net-wait-code').innerText(), code);
    await guest.screenshot({ path: 'artifacts/net-menu-waiting.png' });

    // The host picks a level; both end up on it, a jelly each.
    await host.bringToFront();
    await host.locator('[data-level="1"]').click();
    await host.waitForURL(new RegExp(`\\?level=1&play=1&room=${code}&host=1&relay=local$`));
    await host.waitForFunction(() => sceneRenderer.ready && !loadingActive && net?.session.ready);
    // A page in the background draws no frames: poll it by the clock.
    const poll = { polling: 100 };
    await guest.waitForFunction(
      () => net.session.ready && net.session.owners.join() === '0,1',
      null,
      poll,
    );
    await guest.waitForFunction(() => document.querySelector('#net-wait').hidden, null, poll);

    // A guest's pause menu: no level choice, no new game, a way to leave, the room's code.
    await guest.bringToFront();
    await guest.keyboard.press('Escape');
    assert.equal(await visible(guest, '#show-levels'), false);
    assert.equal(await visible(guest, '#show-online'), false);
    assert.equal(await guest.locator('#exit-to-menu').innerText(), 'LEAVE GAME');
    assert.equal(await guest.locator('#room-code').innerText(), code);
    await guest.screenshot({ path: 'artifacts/net-menu-guest-pause.png' });
    // The host's pause menu still offers the levels: picking one moves everybody.
    await host.bringToFront();
    await host.keyboard.press('Escape');
    assert.equal(await visible(host, '#show-levels'), true);
    assert.equal(await visible(host, '#room-card'), true);
    const guestPage = await guest.evaluate(() => performance.timeOrigin);
    await host.locator('#show-levels').click();
    await host.locator('[data-level="2"]').click();
    // The guest loads the host's new level, whatever its own progress.
    await guest.waitForURL(new RegExp(`\\?level=2&play=1&room=${code}&relay=local$`));
    await guest.waitForFunction(
      (before) => performance.timeOrigin !== before && net?.session.ready,
      guestPage,
      { polling: 100 },
    );
    assert.deepEqual(errors, []);
    console.log('online menu: ok');
  } finally {
    await browser.close();
  }
})();
