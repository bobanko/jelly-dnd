// Network play between two pages of one browser (BroadcastChannel transport): joining, the
// host sending a guest to its level, shared simulation, restart, a dropped guest and its
// return, and moving on to another level together.
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
    const context = await browser.newContext({ viewport: { width: 1100, height: 700 } }),
      errors = [];
    const open = async (url) => {
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await page.goto('http://localhost:3000/' + url);
      return page;
    };
    // Once playing, keep the whole physical state (bodies and jelly lattices) at every
    // checkpoint tick, to compare the two machines tick for tick.
    const playing = async (page) => {
      await page.waitForFunction(() => sceneRenderer.ready && !loadingActive && net?.session.ready);
      await page.evaluate(() => {
        if (globalThis.__marks) return;
        globalThis.__marks = new Map();
        const checkpoint = net.session.checkpoint.bind(net.session);
        net.session.checkpoint = (tick, hash) => {
          __marks.set(
            net.session.epoch + ':' + tick,
            JSON.stringify(
              // The world, then what players watch together: jelly debris and goal runes.
              [
                bodies.map((p) => [
                  [p.x, p.y, p.z, p.vx, p.vy, p.vz, p.state],
                  soft.get(p).positions.map((v) => [...v]),
                ]),
                effects.chunks.map((c) => [c.position, c.velocity, c.rotation, c.half]),
                effects.runes.map((r) => [r.position, r.size]),
              ],
            ),
          );
          checkpoint(tick, hash);
        };
      });
    };
    const state = (page) =>
      page.evaluate(() => ({
        tick: net.session.tick,
        epoch: net.session.epoch,
        me: net.session.me,
        owners: net.session.owners,
        desync: net.session.desync,
        ping: net.session.ping,
        marks: [...__marks].slice(-12),
        // A jelly that walked off an edge is back at its spawn, with a death to show for it.
        moved: players.map((p) => Math.hypot(p.x - p.spawn.x, p.z - p.spawn.z) + p.deaths),
      }));
    // On every recent checkpoint tick both machines must hold the very same numbers.
    const settled = async (host, guest) => {
      await host.waitForTimeout(2500);
      const [a, b] = [await state(host), await state(guest)],
        theirs = new Map(b.marks),
        shared = a.marks.filter(([key]) => theirs.has(key));
      assert.equal(a.desync, null);
      assert.equal(b.desync, null);
      assert.ok(shared.length >= 2, 'checkpoints to compare: ' + shared.length);
      for (const [key, world] of shared) {
        assert.equal(theirs.get(key) === world, true, 'the machines differ at ' + key);
        if (JSON.parse(world)[1].length) debrisCompared++;
      }
      return [a, b];
    };
    let debrisCompared = 0;
    const hold = async (page, key, ms) => {
      await page.bringToFront();
      await page.keyboard.down(key);
      await page.waitForTimeout(ms);
      await page.keyboard.up(key);
    };

    const host = await open('?level=1&play=1&room=t1&host=1');
    await playing(host);
    // The guest asks for another level and is sent to the host's.
    const guest = await open('?level=extra-1&play=1&room=t1&ping=60');
    await guest.waitForURL(/level=1&play=1&room=t1&ping=60/);
    await playing(guest);
    await guest.waitForFunction(() => net.session.owners.join() === '0,1' && net.session.me === 1);
    assert.deepEqual((await state(host)).owners, [0, 1]);

    // Each machine drives its own jelly, with any of its key sets.
    await hold(host, 'KeyD', 500);
    await hold(guest, 'ArrowLeft', 500);
    let [a, b] = await settled(host, guest);
    assert.ok(a.moved[0] > 0.3, 'the host moved its jelly');
    assert.ok(a.moved[1] > 0.3, 'the guest moved its jelly on the host too');
    assert.ok(b.tick > 300 && a.tick - b.tick < 40, 'the guest keeps up');
    assert.ok(b.ping > 40 && b.ping < 140, 'simulated ping is measured: ' + b.ping);
    assert.equal(await guest.locator('#net-status').isVisible(), true);
    await guest.screenshot({ path: 'artifacts/net-guest.png' });

    // The host undoes the last move for everybody; both keep the same history of moves.
    const movesBefore = await host.evaluate(() => [moves, history.length]);
    assert.ok(movesBefore[1] > 0, 'moves were remembered');
    assert.deepEqual(await guest.evaluate(() => [moves, history.length]), movesBefore);
    await host.bringToFront();
    await host.keyboard.press('KeyZ');
    await guest.waitForFunction((n) => history.length === n - 1, movesBefore[1]);
    [a, b] = await settled(host, guest);
    assert.deepEqual(await host.evaluate(() => [moves, history.length]), [
      movesBefore[0] - 1,
      movesBefore[1] - 1,
    ]);
    // A guest's Z only asks.
    await guest.bringToFront();
    await guest.keyboard.press('KeyZ');
    await host.bringToFront();
    await host.waitForFunction(() => !netAskMarks[1].hidden);
    assert.match(await host.locator('.player-net-ask:not([hidden])').innerText(), /Z\s*Undo!/);
    assert.equal(await host.evaluate(() => history.length), movesBefore[1] - 1);
    await host.waitForFunction(() => netAskMarks[1].hidden, null, { timeout: 6000 });

    // Changing the simulated delay while playing must not reorder or stall the stream.
    for (const ping of [200, 0, 120, 30, 60]) {
      await guest.evaluate((ping) => (net.transport.ping = ping), ping);
      await guest.waitForTimeout(250);
    }
    await guest.waitForTimeout(600);
    assert.equal(await guest.evaluate(() => net.session.stalled), false);
    assert.ok((await state(host)).tick - (await state(guest)).tick < 40, 'still keeping up');

    // Only the host restarts, and it restarts everybody.
    await guest.bringToFront();
    await guest.keyboard.press('KeyR');
    await guest.waitForTimeout(400);
    assert.equal((await state(host)).epoch, 0, 'a guest cannot restart');
    // Its R is a request everybody sees over the guest's jelly.
    await host.bringToFront();
    await host.waitForFunction(() => !netAskMarks[1].hidden && netAskMarks[0].hidden);
    assert.match(await host.locator('.player-net-ask:not([hidden])').innerText(), /R\s*Restart!/);
    await host.screenshot({ path: 'artifacts/net-ask.png' });
    assert.equal(await guest.locator('#restart-hint').isVisible(), true);
    await host.bringToFront();
    await host.keyboard.press('KeyR');
    await guest.waitForFunction(() => net.session.epoch === 1);
    await hold(guest, 'KeyW', 300);
    [a, b] = await settled(host, guest);
    assert.equal(a.epoch, 1);

    // The guest goes silent: the host plays on and marks its jelly.
    await guest.evaluate(() => net.transport.close());
    await host.waitForFunction(() => net.session.playerLagging(1));
    await host.bringToFront();
    await host.waitForFunction(() => !netLagMarks[1].hidden);
    assert.equal(await host.evaluate(() => netLagMarks[0].hidden), true);
    await host.screenshot({ path: 'artifacts/net-lagging.png' });
    const before = (await state(host)).tick;
    await host.waitForTimeout(500);
    assert.ok((await state(host)).tick > before + 30, 'the host does not wait');
    // It reloads the page and gets its jelly back, replaying what it missed.
    await guest.reload();
    await playing(guest);
    await host.waitForFunction(() => !net.session.playerLagging(1));
    await hold(guest, 'KeyD', 300);
    [a, b] = await settled(host, guest);
    assert.equal(b.me, 1);
    assert.equal(b.epoch, 1);

    // The host picks the next level; the guest follows and keeps its jelly.
    await host.evaluate(() => navigate('?level=extra-1&play=1', ''));
    await host.waitForURL(/level=extra-1&play=1&room=t1&host=1/);
    await guest.waitForURL(/level=extra-1&play=1&room=t1&ping=60/);
    await playing(host);
    await playing(guest);
    await guest.waitForFunction(() => net.session.me === 1);
    await hold(host, 'KeyA', 300);
    [a, b] = await settled(host, guest);
    assert.ok(a.tick > 100);
    assert.ok(debrisCompared > 0, 'jelly debris was compared between the machines');
    assert.deepEqual(errors, []);
    console.log('network play: ok');
  } finally {
    await browser.close();
  }
})();
