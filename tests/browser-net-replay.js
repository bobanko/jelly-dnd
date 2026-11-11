// How fast a machine that joins late replays the host's input log.
// Usage: npm run profile:net-replay [-- secondsOfPlayBeforeJoining]   (needs npm start)
import { chromium } from './browser-harness.js';
const SECONDS = Number(process.argv[2] || 20);
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--enable-unsafe-webgpu', '--use-angle=d3d11'],
});
const context = await browser.newContext({ viewport: { width: 1100, height: 700 } });
const host = await context.newPage();
await host.goto('http://localhost:3000/?level=1&play=1&room=rp&host=1');
await host.waitForFunction(() => sceneRenderer.ready && !loadingActive && net?.session.ready);
const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
for (let t = 0, i = 0; t < SECONDS * 1000; t += 400, i++) {
  await host.keyboard.down(keys[i % 4]);
  await host.waitForTimeout(300);
  await host.keyboard.up(keys[i % 4]);
  await host.waitForTimeout(100);
}
const ticks = await host.evaluate(() => net.session.tick);
const guest = await context.newPage();
await guest.goto('http://localhost:3000/?level=1&play=1&room=rp');
await guest.waitForFunction(() => sceneRenderer.ready && !loadingActive && net?.session.ready);
const start = Date.now();
await guest.waitForFunction(() => net.session.queued < 30 && net.session.tick > 100, null, {
  polling: 50,
  timeout: 120000,
});
const ms = Date.now() - start;
console.log(
  `backlog ${ticks} ticks (${(ticks / 120).toFixed(1)} s of play) replayed in ${ms} ms: ${(ticks / 120 / (ms / 1000)).toFixed(1)}x real time; desync ${await guest.evaluate(() => net.session.desync)}`,
);
await browser.close();
