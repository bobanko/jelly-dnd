import { chromium, playMap } from './browser-harness.js';
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
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    // The original chamber's archer, shield and sword; its drone would add unrelated deaths.
    await playMap(page, '05-sunken-sanctum.json', (map) => ({ ...map, drones: [] }));
    await page.evaluate(() => {
      window.combatEvents = [];
      const burst = effects.burst.bind(effects);
      effects.burst = (event, ...rest) => {
        combatEvents.push(event);
        burst(event, ...rest);
      };
      focusPlayer(1);
      camera.x = 9;
      camera.z = 7;
      zoom = 1.25;
      resize();
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'artifacts/archer-and-shield-pickup.png' });
    await page.keyboard.down('ArrowLeft');
    await page.waitForFunction(() => players[1].shield === 'oak-shield');
    await page.keyboard.up('ArrowLeft');
    await page.waitForTimeout(150);
    assert.ok(
      await page.evaluate(
        () =>
          world.pickups[0].holder === 1 && players[1].facingX === -1 && players[1].facingZ === 0,
      ),
    );
    await page.screenshot({ path: 'artifacts/shield-equipped.png' });
    // Undo restores the actual pickup as well as the character inventory and facing.
    await page.keyboard.press('KeyZ');
    assert.ok(
      await page.evaluate(() => players[1].shield === null && world.pickups[0].holder === null),
    );
    await page.keyboard.down('ArrowLeft');
    await page.waitForFunction(() => players[1].shield);
    await page.keyboard.up('ArrowLeft');
    // Input is camera-relative; the shield must use the resulting world direction.
    await page.evaluate(() => {
      angle = targetAngle = Math.PI / 2;
    });
    await page.keyboard.down('ArrowRight');
    await page.waitForFunction(() => players[1].facingZ === -1);
    await page.keyboard.up('ArrowRight');
    assert.equal(await page.evaluate(() => players[1].facingX), 0);
    await page.evaluate(() => {
      angle = targetAngle = 0;
      stopInput();
      Object.assign(players[1], { x: 10, z: 7, y: 0, rx: 10, rz: 7, facingX: 0, facingZ: -1 });
      soft.reset();
      world.arrows = [];
      world.archers[0].cooldown = 0.7;
      combatEvents.length = 0;
      camera.x = 10;
      camera.z = 6.8;
      zoom = 1.5;
      resize();
    });
    await page.waitForFunction(() => combatEvents.some((e) => e.type === 'arrowBlock'), null, {
      timeout: 7000,
    });
    assert.equal(await page.evaluate(() => players[1].state), 'alive');
    assert.ok(await page.evaluate(() => effects.particles.some((p) => p.kind === 'magic')));
    await page.screenshot({ path: 'artifacts/shield-blocking-arrow.png' });
    // The same shot is lethal when the carrier exposes its back.
    await page.evaluate(() => {
      players[1].facingZ = 1;
      world.arrows = [];
      world.archers[0].cooldown = 0.2;
      combatEvents.length = 0;
    });
    await page.waitForFunction(
      () => players[1].state === 'dead' && players[1].deathReason === 'arrow',
      null,
      { timeout: 7000 },
    );
    assert.ok(
      await page.evaluate(
        () =>
          effects.particles.some((p) => p.kind === 'jelly') &&
          world.pickups[0].holder === null &&
          players[1].shield === null,
      ),
    );
    await page.screenshot({ path: 'artifacts/arrow-death.png' });
    await page.waitForFunction(() => players[1].state === 'alive', null, { timeout: 7000 });
    assert.equal(await page.evaluate(() => players[1].deaths), 1);
    await page.keyboard.press('KeyR');
    await page.waitForFunction(() => restartTransition === null); // restart fades first
    assert.ok(
      await page.evaluate(
        () =>
          world.arrows.length === 0 &&
          world.pickups[0].holder === null &&
          players.every((p) => p.shield === null && p.facingX === 0 && p.facingZ === 1),
      ),
    );
    // The old shield tone now belongs to firing; impacts use a noise-based wood sound.
    await page.locator('#sound').click();
    await page.evaluate(() => {
      window.soundCalls = [];
      const oldTone = tone,
        oldWood = woodHit;
      tone = (f) => {
        soundCalls.push(['tone', f]);
        oldTone(f);
      };
      woodHit = (broken) => {
        soundCalls.push(['wood', !!broken]);
        oldWood(broken);
      };
      // Shots play the recorded bow sample through the audio mixer.
      const play = gameAudio.play.bind(gameAudio);
      gameAudio.play = (name, ...rest) => {
        soundCalls.push(['play', name]);
        return play(name, ...rest);
      };
      Object.assign(players[1], { x: 8, z: 8, rx: 8, rz: 8 });
      soft.reset();
    });
    await page.waitForFunction(() => players[1].shieldHP === 3);
    await page.evaluate(() => {
      stopInput();
      Object.assign(players[1], { x: 10, z: 7, rx: 10, rz: 7, facingX: 0, facingZ: -1 });
      soft.reset();
      world.arrows = [];
      world.archers[0].cooldown = 0.1;
      combatEvents.length = 0;
      soundCalls.length = 0;
      focusPlayer(1);
      camera.x = 10;
      camera.z = 7;
      zoom = 1.5;
      resize();
    });
    await page.waitForFunction(() => players[1].shieldHP === 1, null, { timeout: 7000 });
    await page.screenshot({ path: 'artifacts/shield-two-cracks.png' });
    await page.waitForFunction(() => combatEvents.some((e) => e.type === 'shieldBreak'), null, {
      timeout: 7000,
    });
    await page.evaluate(() => (world.archers[0].cooldown = 10));
    assert.ok(
      await page.evaluate(
        () =>
          players[1].state === 'alive' &&
          players[1].shield === null &&
          world.pickups[0].destroyed &&
          effects.particles.some((p) => p.kind === 'wood'),
      ),
    );
    assert.deepEqual(
      await page.evaluate(() => soundCalls.filter((c) => c[0] === 'wood').map((c) => c[1])),
      [false, false, true],
    );
    assert.equal(
      await page.evaluate(
        () => soundCalls.filter((c) => c[0] === 'play' && c[1] === 'arrow').length,
      ),
      3,
    );
    await page.screenshot({ path: 'artifacts/shield-breaking.png' });
    await page.keyboard.press('KeyR');
    await page.waitForFunction(() => restartTransition === null); // restart fades first
    assert.ok(
      await page.evaluate(() => !world.pickups[0].destroyed && world.pickups[0].durability === 3),
    );
    // A real forward push launches another jelly through a physical arc.
    await page.evaluate(() => {
      Object.assign(players[1], { x: 8, z: 8, rx: 8, rz: 8 });
      soft.reset();
      world.archers[0].cooldown = 100;
    });
    await page.waitForFunction(() => players[1].shield);
    await page.evaluate(() => {
      Object.assign(players[1], { x: 6.9, z: 7, rx: 6.9, rz: 7, facingX: 1, facingZ: 0 });
      Object.assign(players[2], { x: 8, z: 7, rx: 8, rz: 7 });
      soft.reset();
      combatEvents.length = 0;
      focusPlayer(2);
      camera.x = 8.5;
      camera.z = 7;
      zoom = 1.2;
      resize();
    });
    await page.keyboard.down('ArrowRight');
    await page.waitForFunction(() => combatEvents.some((e) => e.type === 'shieldBash'));
    await page.keyboard.up('ArrowRight');
    await page.waitForFunction(() => players[2].y > 1);
    await page.screenshot({ path: 'artifacts/shield-bash-flight.png' });
    await page.waitForFunction(() => players[2].launchTimer === 0 && players[2].state === 'alive');
    assert.ok(
      await page.evaluate(
        () =>
          players[2].x > 9.7 &&
          players[2].x < 10.4 &&
          combatEvents.filter((e) => e.type === 'shieldBash').length === 1,
      ),
    );
    await page.keyboard.press('KeyR');
    await page.waitForFunction(() => restartTransition === null); // restart fades first
    // The red jelly collects a sword with its own movement keys, then strikes forward.
    await page.keyboard.down('KeyJ');
    await page.waitForFunction(() => players[2].sword === 'iron-sword');
    await page.keyboard.up('KeyJ');
    await page.keyboard.press('KeyK');
    await page.waitForTimeout(150);
    await page.screenshot({ path: 'artifacts/sword-equipped.png' });
    await page.evaluate(() => {
      stopInput();
      Object.assign(players[2], { x: 10, z: 6.4, y: 0, rx: 10, rz: 6.4, facingX: 0, facingZ: -1 });
      soft.reset();
      world.archers[0].cooldown = 10;
      world.arrows = [];
      combatEvents.length = 0;
      camera.x = 10;
      camera.z = 6;
      zoom = 1.6;
      resize();
    });
    await page.keyboard.down('KeyI');
    await page.waitForFunction(() => world.archers[0].state === 'dead');
    await page.keyboard.up('KeyI');
    assert.ok(
      await page.evaluate(
        () => effects.bones.length > 0 && !world.collisionBoxes().some((b) => b.kind === 'archer'),
      ),
    );
    await page.screenshot({ path: 'artifacts/sword-strike-skeleton.png' });
    await page.evaluate(() => {
      stopInput();
      Object.assign(players[2], { x: 9, z: 7, rx: 9, rz: 7 });
      soft.reset();
      angle = targetAngle = -Math.PI / 2;
    });
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'artifacts/skeleton-bone-pile.png' });
    assert.ok(
      await page.evaluate(
        () =>
          world.archers[0].state === 'dead' && !combatEvents.some((e) => e.type === 'archerShot'),
      ),
    );
    await page.waitForFunction(
      () => world.archers[0].respawnTimer > 0 && world.archers[0].respawnTimer < 0.25,
      null,
      { timeout: 7000 },
    );
    await page.screenshot({ path: 'artifacts/skeleton-reassembling.png' });
    await page.waitForFunction(() => world.archers[0].state === 'alive', null, { timeout: 3000 });
    assert.ok(
      await page.evaluate(
        () =>
          world.archers[0].respawnTimer === 0 &&
          effects.bones.length === 0 &&
          world.collisionBoxes().some((b) => b.kind === 'archer'),
      ),
    );
    await page.waitForFunction(() => combatEvents.some((e) => e.type === 'archerShot'), null, {
      timeout: 4000,
    });
    await page.keyboard.press('KeyZ');
    assert.ok(
      await page.evaluate(
        () =>
          players[2].sword === 'iron-sword' &&
          world.archers[0].state !== 'dead' &&
          effects.bones.length === 0,
      ),
    );
    await page.keyboard.press('KeyR');
    await page.waitForFunction(() => restartTransition === null); // restart fades first
    assert.ok(
      await page.evaluate(
        () =>
          players.every((p) => !p.shield && !p.sword && p.shieldHP === 0 && !p.launchTimer) &&
          world.archers[0].state === 'alive',
      ),
    );
    assert.deepEqual(await page.evaluate(() => sceneRenderer.errors), []);
    assert.deepEqual(errors, []);
    console.log(
      'PASS: archery, pickup and inventory, equipment facing, directional blocks, three-hit shield durability/cracks/splinters, wood impact audio and firing tone, physical shield bash, sword attack and skeleton collapse/reassembly after five seconds, death/respawn and undo/reset. No browser or GPU validation errors.',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
