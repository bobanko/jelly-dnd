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
    await page.evaluate(() => {
      const m = L.blank();
      m.size = 8;
      m.name = 'Runic gates';
      for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) m.blocks.push({ x, y: 0, z });
      for (let slot = 0; slot < 4; slot++) {
        m.spawns[slot] = { x: 1, y: 0, z: slot * 2 + 1 };
        m.goals[slot] = { x: 6, y: 0, z: slot * 2 + 1 };
      }
      replaceMap(m);
    });
    const tool = async (name) => page.locator(`[data-tool="${name}"]`).click();
    const screen = async (x, y, z) =>
      page.evaluate(
        (p) => {
          const r = document.getElementById('viewport').getBoundingClientRect(),
            v = JellyGPU.projectPoint(screenFrame(), ...p, r.width, r.height);
          return { x: r.left + v.x, y: r.top + v.y };
        },
        [x, y, z],
      );
    const click = async (x, y, z) => {
      const p = await screen(x, y, z);
      await page.mouse.click(p.x, p.y);
    };
    for (let color = 0; color < 4; color++) {
      await tool('color-' + color);
      await page.evaluate((c) => edit(() => paintCell({ x: 3, y: 1, z: c * 2 + 1 }, tool)), color);
      assert.equal(
        await page.evaluate((c) => model.at('blocks', 3, c * 2 + 1, 1).color, color),
        color,
      );
    }
    await page
      .getByLabel('\u0426\u0432\u0435\u0442 \u0431\u043b\u043e\u043a\u0430', { exact: true })
      .selectOption('1');
    assert.equal(await page.evaluate(() => model.at('blocks', 3, 7, 1).color), 1);
    await page.locator('#undo').click();
    assert.equal(await page.evaluate(() => model.at('blocks', 3, 7, 1).color), 3);
    // Colour brushes attach to cube faces, just like ordinary terrain.
    await tool('color-2');
    await click(3, 1, 5);
    assert.equal(await page.evaluate(() => model.at('blocks', 3, 5, 2).color), 2);
    await page.locator('#undo').click();
    await page.selectOption('#placement-mode', 'layer');
    await page.selectOption('#brush-height', '1');
    await page.selectOption('#brush-shape', 'rectangle');
    await tool('color-0');
    const a = await screen(4, 1, 2),
      b = await screen(5, 1, 3);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 5 });
    await page.mouse.up();
    assert.equal(
      await page.evaluate(() => model.map.blocks.filter((b) => b.color === 0).length),
      5,
    );
    await page.locator('#undo').click();
    assert.equal(
      await page.evaluate(() => model.map.blocks.filter((b) => b.color === 0).length),
      1,
    );
    await page.selectOption('#brush-shape', 'brush');
    await page.waitForFunction(
      () => previewRuntime.world.blocks.filter((b) => b.color !== undefined).length === 4,
    );
    await tool('select');
    await page.screenshot({ path: 'artifacts/colour-blocks-editor.png' });
    const draft = await page.evaluate(() => JSON.stringify(model.map)),
      download = page.waitForEvent('download');
    await page.locator('#export').click();
    await (await download).saveAs('artifacts/colour-blocks.json');
    assert.equal(
      JSON.stringify(JSON.parse(fs.readFileSync('artifacts/colour-blocks.json', 'utf8'))),
      draft,
    );
    await page.reload();
    await page.waitForFunction(() => previewRenderer?.ready && previewRuntime);
    assert.equal(await page.evaluate(() => JSON.stringify(model.map)), draft);
    assert.deepEqual(await page.evaluate(() => L.issues(model.map)), []);
    await page.locator('#play').click();
    await page.waitForURL('**/?level=editor');
    await page.waitForFunction(() => sceneRenderer.ready);
    for (const key of ['KeyD', 'ArrowRight', 'KeyL', 'KeyH']) await page.keyboard.down(key);
    await page.waitForFunction(() => players.every((p) => p.x > 4.1), {}, { timeout: 20000 });
    for (const key of ['KeyD', 'ArrowRight', 'KeyL', 'KeyH']) await page.keyboard.up(key);
    assert.ok(
      await page.evaluate(() => players.every((p) => p.state === 'alive' && Math.abs(p.y) < 0.12)),
    );
    await page.screenshot({ path: 'artifacts/colour-blocks-passed.png' });
    await page.keyboard.press('KeyR');
    // Move blue into the green lane and green aside: blue must hit green stone.
    await page.evaluate(() => {
      Object.assign(players[0], { x: 6, z: 3 });
      Object.assign(players[1], { x: 1, z: 1 });
      soft.reset();
    });
    await page.keyboard.down('ArrowRight');
    await page.waitForFunction(() => players[1].x > 2);
    await page.waitForTimeout(900);
    await page.keyboard.up('ArrowRight');
    assert.ok(await page.evaluate(() => players[1].x < 2.3));
    await page.keyboard.press('KeyR');
    assert.ok(await page.evaluate(() => players.every((p) => Math.abs(p.x - 1) < 0.02)));
    assert.deepEqual(await page.evaluate(() => sceneRenderer.errors), []);
    assert.deepEqual(errors, []);
    console.log(
      'PASS: four coloured 3D cube tools, XYZ placement, face placement, recolouring/undo, rectangle history, export/draft persistence, all four keyboard-controlled heroes pass matching blocks, blue blocked by green, reset, no GPU/browser errors.',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
