import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import L from '../src/world/levels.js';
import * as Physics from '../src/world/physics.js';
import * as Soft from '../src/world/soft-body.js';
import * as catalog from '../levels/catalog.js';
import { hashState, hashBodies } from '../src/net/state-hash.js';
import { scriptedInputs } from '../src/net/input-script.js';

// Network play sends only inputs, so every machine must compute the same world from them.
const TICKS = 960,
  CHECK_EVERY = 30;
const levels = [
  ...catalog.standard.map((file, i) => [file, () => L.standardLevel(i + 1)]),
  ...catalog.extra
    .flatMap((entry) => entry.levels ?? [entry.file ?? entry])
    .map((file, i) => [file, () => L.extraLevel(i + 1)]),
];
function run(map, seed, ticks = TICKS) {
  const r = L.instantiate(L.read(map()), Physics, Soft),
    inputs = scriptedInputs(seed, r.players.length),
    trace = [];
  for (let tick = 1; tick <= ticks; tick++) {
    const events = r.world.step(r.bodies, inputs(tick));
    if (events.length) trace.push([tick, events.map((e) => e.type + ':' + e.player).join()]);
    if (tick % CHECK_EVERY === 0) trace.push([tick, hashState(r.world, r.bodies)]);
  }
  return { trace, bodies: hashBodies(r.bodies) };
}

for (const [index, [file, map]] of levels.entries())
  test(`same inputs replay bit-exactly: ${file}`, () => {
    const seed = 1000 + index,
      first = run(map, seed);
    // A different level in between: state leaking through module globals would show up.
    run(levels[(index + 1) % levels.length][1], seed + 1, 120);
    const second = run(map, seed);
    const diverged = first.trace.findIndex((entry, i) => String(entry) !== String(second.trace[i]));
    assert.equal(
      diverged < 0 ? null : `tick ${first.trace[diverged][0]}`,
      null,
      'the two runs diverged',
    );
    assert.equal(first.bodies, second.bodies);
    assert.notEqual(run(map, seed + 7, 240).bodies, run(map, seed, 240).bodies, 'inputs matter');
  });

test('the state hash sees a single changed bit', () => {
  const r = L.instantiate(L.read(L.standardLevel(1)), Physics, Soft),
    before = hashState(r.world, r.bodies);
  r.bodies[0].x *= 1 + Number.EPSILON;
  assert.notEqual(hashState(r.world, r.bodies), before);
  assert.notEqual(hashBodies(r.bodies), hashBodies([{ ...r.bodies[0], x: 0 }]));
});

test('the simulation uses only bit-reproducible maths', async () => {
  // Engines disagree in the last digit of these; src/world/det-math.js has exact stand-ins.
  const banned =
    /(?<![A-Za-z])Math\.(hypot|exp|expm1|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|pow|log|log2|log10|log1p|cbrt|random)\b|Date\.now|performance\.now/;
  const fs = await import('node:fs'),
    folder = new URL('../src/world/', import.meta.url);
  for (const file of fs.readdirSync(folder)) {
    const lines = fs.readFileSync(new URL(file, folder), 'utf8').split('\n'),
      found = lines.findIndex((line) => banned.test(line.replace(/\/\/.*$/, '')));
    assert.equal(found < 0 ? null : `${file}:${found + 1}: ${lines[found].trim()}`, null);
  }
});
