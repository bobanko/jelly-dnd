// Cross-engine determinism: the same scripted run of every catalog level must give the same
// state fingerprint in Node (V8), Chromium, Firefox (SpiderMonkey) and WebKit (JavaScriptCore).
// Usage: node tests/browser-determinism.js   (serves the project itself; no WebGPU needed)
import { chromium, firefox, webkit } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import L from '../src/world/levels.js';
import * as Physics from '../src/world/physics.js';
import * as Soft from '../src/world/soft-body.js';
import * as catalog from '../levels/catalog.js';
import { fingerprint } from '../src/net/fingerprint.js';

const root = path.resolve(import.meta.dirname, '..');
const files = [
  ...catalog.standard,
  ...catalog.extra.flatMap((entry) => entry.levels ?? [entry.file ?? entry]),
];
const types = { '.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html' };
const server = http
  .createServer((request, response) => {
    const file = path.join(root, decodeURIComponent(new URL(request.url, 'http://x').pathname));
    if (request.url === '/blank') return response.end('<!doctype html>');
    if (!file.startsWith(root) || !fs.existsSync(file)) return response.writeHead(404).end();
    response.writeHead(200, { 'content-type': types[path.extname(file)] || 'text/plain' });
    response.end(fs.readFileSync(file));
  })
  .listen(0);
const origin = `http://localhost:${server.address().port}`;

const results = {
  node: files.map((file, i) =>
    fingerprint(
      JSON.parse(fs.readFileSync(path.join(root, 'levels', file), 'utf8')),
      L,
      Physics,
      Soft,
      {
        seed: 1000 + i,
      },
    ),
  ),
};
for (const [name, type] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await type.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(origin + '/blank');
    results[name] = await page.evaluate(async (files) => {
      const [{ default: L }, Physics, Soft, { fingerprint }] = await Promise.all(
        ['world/levels.js', 'world/physics.js', 'world/soft-body.js', 'net/fingerprint.js'].map(
          (file) => import('/src/' + file),
        ),
      );
      const out = [];
      for (const [i, file] of files.entries()) {
        const map = await (await fetch('/levels/' + file)).json();
        out.push(fingerprint(map, L, Physics, Soft, { seed: 1000 + i }));
      }
      return out;
    }, files);
  } finally {
    await browser.close();
  }
}
server.close();

let failed = 0;
const engines = Object.keys(results);
console.log(['level'.padEnd(32), ...engines.map((e) => e.padEnd(11))].join(''));
for (const [i, file] of files.entries()) {
  const row = engines.map((e) => results[e][i]),
    same = row.every((v) => v === row[0]);
  if (!same) failed++;
  console.log(
    [file.padEnd(32), ...row.map((v) => String(v).padEnd(11)), same ? '' : '  << differs'].join(''),
  );
}
console.log(
  failed ? `${failed} of ${files.length} levels differ between engines` : 'all engines agree',
);
process.exit(failed ? 1 : 0);
