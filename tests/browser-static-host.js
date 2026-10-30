import { chromium, instrumentModule } from './browser-harness.js';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import * as catalog from '../levels/catalog.js';
// Exercise a static HTTPS deployment in a cross-origin iframe, without server.js.

const staticRoot = path.resolve(
  process.env.STATIC_GAME_ROOT || path.join(import.meta.dirname, '..'),
);
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--use-angle=d3d11'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1040, height: 720 } }),
      errors = [],
      missing = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://portal.test/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<iframe name="game" src="https://static-game.test/html/123/index.html" sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-downloads" allow="autoplay; fullscreen" style="width:960px;height:640px;border:0"></iframe>',
      }),
    );
    const scripts = new Set([
      'index.html',
      'editor.html',
      'styles/style.css',
      'styles/editor.css',
      'styles/controls.css',
    ]);
    for (const html of ['index.html', 'editor.html'])
      for (const match of fs
        .readFileSync(path.join(staticRoot, html), 'utf8')
        .matchAll(/src="([^"]+\.js)"(?:\s+data-entry="([^"]+)")?/g)) {
        scripts.add(match[1]);
        // bootstrap.js loads its data-entry module relative to its own URL.
        if (match[2]) scripts.add(path.posix.join(path.posix.dirname(match[1]), match[2]));
      }
    for (const script of scripts)
      if (script.endsWith('.js')) {
        for (const match of fs
          .readFileSync(path.join(staticRoot, script), 'utf8')
          .matchAll(/^import\s+(?:[^'"\n]+\s+from\s+)?['"](\.[^'"]+)['"]/gm))
          scripts.add(path.posix.normalize(path.posix.join(path.posix.dirname(script), match[1])));
      }
    await page.route('https://static-game.test/**', async (route) => {
      const url = new URL(route.request().url()),
        relative = decodeURIComponent(url.pathname).replace(/^\/html\/123\//, '');
      const allowed =
        scripts.has(relative) ||
        relative === 'build-version.json' ||
        /^levels\/[a-z0-9-]+\.json$/i.test(relative) ||
        /^assets\/materials\/[a-z0-9-]+\.png$/i.test(relative);
      const file = path.resolve(staticRoot, relative);
      if (!allowed || !file.startsWith(staticRoot + path.sep) || !fs.existsSync(file)) {
        missing.push(relative);
        return route.fulfill({ status: 404, body: 'Not found' });
      }
      return route.fulfill({
        body: relative.endsWith('.js')
          ? instrumentModule(fs.readFileSync(file, 'utf8'), path.basename(relative))
          : fs.readFileSync(file),
        contentType: {
          '.html': 'text/html',
          '.css': 'text/css',
          '.js': 'text/javascript',
          '.json': 'application/json',
          '.png': 'image/png',
        }[path.extname(file)],
      });
    });
    await page.goto('https://portal.test/');
    const frame = page.frame({ name: 'game' });
    await frame.waitForFunction(
      () => typeof sceneRenderer !== 'undefined' && (sceneRenderer.ready || loadingFailed),
    );
    assert.equal(
      await frame.evaluate(() => loadingFailed),
      false,
      await frame.locator('#loading-status').textContent(),
    );
    await frame.waitForFunction(() => !loadingActive);
    await frame.locator('#play').click();
    await frame.locator('[data-level="1"]').click();
    await frame.waitForFunction(
      () => typeof sceneRenderer !== 'undefined' && sceneRenderer.ready && !loadingActive,
    );
    assert.equal(await frame.evaluate(() => definition.name), 'First Steps');
    const before = await frame.evaluate(() => players[0].z);
    await frame.locator('#menu-button').focus();
    await page.keyboard.down('w');
    await page.waitForTimeout(200);
    await page.keyboard.up('w');
    assert.ok((await frame.evaluate(() => players[0].z)) < before);
    await page.keyboard.press('Escape');
    await frame.locator('#open-editor').click();
    await frame.waitForFunction(
      () =>
        typeof model !== 'undefined' &&
        typeof previewRenderer !== 'undefined' &&
        previewRenderer.ready,
    );
    // The editor opens the first campaign map on first use.
    assert.equal(
      await frame.evaluate(() => model.map.name),
      JSON.parse(fs.readFileSync(path.join(staticRoot, 'levels', catalog.standard[0]), 'utf8'))
        .name,
    );
    assert.deepEqual(errors, []);
    // A source checkout has no generated map index; the editor then lists campaign maps only.
    const optional = fs.existsSync(path.join(staticRoot, 'levels', 'index.json'))
      ? []
      : ['levels/index.json'];
    assert.deepEqual(
      missing.filter((file) => !optional.includes(file)),
      [],
    );
    console.log(
      'PASS static HTTPS subdirectory + cross-origin sandbox iframe, WebGPU without unsafe flag, JSON, textures, menu, level launch, input and editor. No Node server or API used.',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
