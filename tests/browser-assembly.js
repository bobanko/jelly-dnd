import { chromium } from './browser-harness.js';
import Levels from '../levels.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';

fs.mkdirSync('artifacts', { recursive: true });
const map = Levels.blank();
map.size = 8;
map.name = 'Assembly test';
for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) map.blocks.push({ x, y: 0, z });
map.blocks.push(
  { x: 3, y: 1, z: 3 },
  { x: 3, y: 2, z: 3 },
  { x: 4, y: 1, z: 3, color: 0 },
  { x: 5, y: 1, z: 3, color: 1 },
);
map.spawns = [{ x: 1, y: 0, z: 1 }, null, null, null];
map.goals = [{ x: 6, y: 0, z: 6 }, null, null, null];
map.plates = [{ x: 2, y: 0, z: 4, id: 'assembly-button', color: 'green' }];
map.crates = [{ x: 5, y: 0, z: 4 }];
map.spikes = [{ x: 2, y: 0, z: 2 }];
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    (process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : 'C:/Program Files/Google/Chrome/Application/chrome.exe'),
  args: ['--enable-unsafe-webgpu', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])],
});
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } }),
    errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript((map) => {
    localStorage.setItem('jelly-dnd.play.v1', JSON.stringify(map));
    localStorage.setItem('jelly-dnd.editor.v1', JSON.stringify(map));
  }, map);
  const ready = () => page.waitForFunction(() => sceneRenderer.ready && !loadingActive);
  const frames = async () =>
    page.waitForFunction(
      (frame) => sceneRenderer.frames > frame + 2,
      await page.evaluate(() => sceneRenderer.frames),
    );
  await page.goto('http://localhost:3000/?level=editor');
  await ready();
  assert.ok(await page.evaluate(() => level.assembly && level.assembly.progress < 1));
  await page.evaluate(() => {
    updateLevelAssembly = () => {};
    updateCameraIntro = () => {};
    sceneRenderer.grain = false;
    sceneRenderer.dust = false;
    const render = sceneRenderer.render.bind(sceneRenderer);
    sceneRenderer.render = (...args) => {
      args[4] = 0;
      return render(...args);
    };
  });
  const before = await page.evaluate(() =>
    JSON.stringify({ players, features: world.featureSnapshot(), runSeconds }),
  );
  const captures = [];
  for (const progress of [0, 0.3, 0.6, 0.69, 0.82, 0.92]) {
    await page.evaluate((progress) => (level.assembly.progress = progress), progress);
    await frames();
    captures.push(await page.screenshot({ path: `artifacts/assembly-${progress}.png` }));
    assert.equal(
      await page.evaluate(() =>
        JSON.stringify({ players, features: world.featureSnapshot(), runSeconds }),
      ),
      before,
    );
    const propCount = await page.evaluate(() => sceneRenderer.props(level, players, angle, 0, 0));
    if (progress < 0.7) assert.equal(propCount, 0, 'props wait until every block has arrived');
    if (progress === 0.82)
      assert.ok(propCount > 0, 'buttons, characters and crates render during the landing phase');
    assert.deepEqual(await page.evaluate(() => sceneRenderer.errors), []);
  }
  for (let i = 1; i < captures.length; i++) assert.notDeepEqual(captures[i - 1], captures[i]);
  assert.ok(await page.evaluate(() => sceneRenderer.assemblyBlockCount >= 64));
  assert.ok(await page.evaluate(() => sceneRenderer.phaseAssemblyBuffer.size > 16));
  await page.evaluate(() => (level.assembly = null));
  await frames();
  assert.ok(await page.evaluate(() => runSeconds > 0));
  await page.screenshot({ path: 'artifacts/assembly-complete.png' });
  await page.evaluate(() => (document.querySelector('#restart-assembly').checked = true));
  await page.keyboard.press('KeyR');
  await page.waitForFunction(() => restartTransition === null);
  assert.equal(await page.evaluate(() => level.assembly?.progress), 0);
  await page.evaluate(() => (level.assembly = null));
  await page.reload();
  await ready();
  await page.keyboard.press('KeyD');
  assert.equal(await page.evaluate(() => level.assembly), null);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await ready();
  assert.equal(await page.evaluate(() => level.assembly), null);
  await page.goto('http://localhost:3000/');
  await ready();
  assert.equal(await page.evaluate(() => level.assembly), null);
  assert.equal(await page.evaluate(() => sceneRenderer.cameraState.perspective), true);
  assert.deepEqual(await page.evaluate(() => sceneRenderer.errors), []);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: staggered assembly of stone and glass blocks, falling buttons, characters and crates, frozen physics and timer, movement skip, reduced motion, unaffected menu and no WebGPU errors.',
  );
} finally {
  await browser.close();
}
