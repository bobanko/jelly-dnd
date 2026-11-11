import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import L from '../src/world/levels.js';
import * as Physics from '../src/world/physics.js';
import * as Soft from '../src/world/soft-body.js';
import { Session, CHECK_EVERY, pace } from '../src/net/lockstep.js';
import { MemoryNetwork } from '../src/net/memory-transport.js';
import { hashState, hashBodies } from '../src/net/state-hash.js';
import { scriptedInputs } from '../src/net/input-script.js';

const FRAME = 1000 / 60,
  FOUR_PLAYERS = 10; // Collateral Damage
// One computer: a session and its own copy of the world, driven the way game.js drives it.
function machine(network, id, { host = false, latency = 0, level = 1, seed = 1 } = {}) {
  const runtime = L.instantiate(L.read(L.standardLevel(level)), Physics, Soft),
    link = network.join(id, { host, latency }),
    session = new Session({
      host,
      id,
      transport: link.transport,
      playerCount: runtime.players.length,
      level: String(level),
      now: network.now,
    });
  const keys = scriptedInputs(seed, runtime.players.length),
    m = { id, link, session, runtime, frames: 0, hashes: new Map(), commands: [], simulated: 0 };
  m.frame = () => {
    session.poll();
    session.setIntent(keys(++m.frames));
    for (const item of session.advance(host ? 2 : pace(2, session.queued))) {
      if (item.command) {
        m.commands.push(item.command.type);
        if (item.command.type === 'restart')
          m.runtime = L.instantiate(L.read(L.standardLevel(level)), Physics, Soft);
        continue;
      }
      m.runtime.world.step(m.runtime.bodies, item.inputs);
      m.simulated++;
      if (item.tick % CHECK_EVERY === 0) {
        session.checkpoint(item.tick, hashBodies(m.runtime.bodies));
        m.hashes.set(session.epoch + ':' + item.tick, hashState(m.runtime.world, m.runtime.bodies));
      }
    }
  };
  return m;
}
function run(network, machines, frames) {
  for (let i = 0; i < frames; i++) {
    for (const m of machines) if (m.link.online) m.frame();
    network.advance(FRAME);
  }
}
// Every checkpoint two machines both reached must hold the same full-state hash.
function assertInSync(a, b, atLeast) {
  const shared = [...a.hashes.keys()].filter((key) => b.hashes.has(key));
  assert.ok(shared.length >= atLeast, `only ${shared.length} shared checkpoints`);
  for (const key of shared) assert.equal(b.hashes.get(key), a.hashes.get(key), 'state at ' + key);
  assert.equal(a.session.desync, null);
  assert.equal(b.session.desync, null);
}

test('three machines with different pings stay in sync and each drives its own jelly', () => {
  const network = new MemoryNetwork(),
    host = machine(network, 'h', { host: true, level: FOUR_PLAYERS, seed: 1 }),
    near = machine(network, 'a', { latency: 15, level: FOUR_PLAYERS, seed: 2 }),
    far = machine(network, 'b', { latency: 90, level: FOUR_PLAYERS, seed: 3 });
  run(network, [host, near, far], 600);
  assert.deepEqual(host.session.owners, [0, 1, 2, 0]);
  assert.deepEqual(far.session.owners, [0, 1, 2, 0]);
  assert.equal(far.session.me, 2);
  assertInSync(host, near, 8);
  assertInSync(host, far, 8);
  // The far machine trails by about its one-way delay, not more.
  const behind = host.session.tick - far.session.tick;
  assert.ok(behind >= 8 && behind <= 30, `far machine is ${behind} ticks behind`);
  assert.ok(Math.abs(far.session.ping - 180) < 20, `ping ${far.session.ping}`);
  // Everybody's keys reached the simulation: the jellies have left their spawns.
  for (const p of host.runtime.players)
    assert.ok(Math.hypot(p.x - p.spawn.x, p.z - p.spawn.z) > 0.2 || p.deaths > 0);
});

test('a machine joining mid-level replays the log and catches up', () => {
  const network = new MemoryNetwork(),
    host = machine(network, 'h', { host: true, seed: 1 });
  run(network, [host], 400);
  assert.deepEqual(host.session.owners, [0, 0], 'alone, the host drives both jellies');
  const late = machine(network, 'a', { latency: 40, seed: 2 });
  run(network, [host, late], 300);
  assert.deepEqual(late.session.owners, [0, 1]);
  assert.ok(host.session.tick - late.session.tick <= 20, 'caught up');
  assert.ok(host.session.log.length < 700, 'equal inputs merge in the log');
  assertInSync(host, late, 10);
});

test('restart is applied on the same tick everywhere, and a later joiner starts from it', () => {
  const network = new MemoryNetwork(),
    host = machine(network, 'h', { host: true, seed: 1 }),
    client = machine(network, 'a', { latency: 30, seed: 2 });
  run(network, [host, client], 200);
  host.session.command({ type: 'restart' });
  client.session.command({ type: 'restart' }); // only the host may
  run(network, [host, client], 200);
  assert.equal(host.session.epoch, 1);
  assert.equal(client.session.epoch, 1);
  assert.equal(client.commands.filter((type) => type === 'restart').length, 1);
  const late = machine(network, 'b', { latency: 10, seed: 3 });
  run(network, [host, client, late], 200);
  assert.equal(late.session.epoch, 1);
  assert.ok(!late.commands.includes('restart'), 'a fresh level needs no reset');
  assertInSync(host, client, 5);
  assertInSync(host, late, 5);
  assert.ok([...host.hashes.keys()].some((key) => key.startsWith('1:')));
});

test('a silent machine is flagged, its jelly stops, and it rejoins with the same jelly', () => {
  const network = new MemoryNetwork(),
    host = machine(network, 'h', { host: true, seed: 1 }),
    client = machine(network, 'a', { latency: 20, seed: 2 });
  run(network, [host, client], 120);
  client.link.online = false;
  run(network, [host, client], 30);
  assert.equal(host.session.lagging.size, 0, 'a short hiccup is not shown');
  run(network, [host, client], 60);
  assert.ok(host.session.playerLagging(1));
  assert.ok(!host.session.playerLagging(0));
  const tick = host.session.tick;
  run(network, [host, client], 120);
  assert.equal(host.session.tick, tick + 240, 'the host plays on');
  assert.deepEqual(host.session.log.at(-1).i.slice(2), [0, 0], 'the silent jelly stands still');
  // The player reloads the page: same id, fresh world.
  const back = machine(network, 'a', { latency: 20, seed: 4 });
  run(network, [host, back], 300);
  assert.equal(back.session.me, 1);
  assert.equal(host.session.lagging.size, 0);
  assert.equal(back.session.lagging.size, 0);
  assertInSync(host, back, 10);
});

test('a client on another level is told which level to load', () => {
  const network = new MemoryNetwork(),
    host = machine(network, 'h', { host: true, level: 2 }),
    client = machine(network, 'a', { level: 1 });
  run(network, [host, client], 60);
  assert.equal(client.session.goto, '2');
  assert.equal(client.session.ready, false);
  assert.equal(client.simulated, 0);
});

test('a client whose world differs reports the desync', () => {
  const network = new MemoryNetwork(),
    host = machine(network, 'h', { host: true, seed: 1 }),
    client = machine(network, 'a', { latency: 20, seed: 2 });
  run(network, [host, client], 100);
  client.runtime.soft.translate(client.runtime.bodies[0], 0.05, 0, 0);
  run(network, [host, client], 200);
  assert.ok(client.session.desync);
});

test('a client paces itself: waits when dry, trims a thick cushion, replays a backlog', () => {
  assert.equal(pace(2, 0), 0);
  assert.equal(pace(2, 1), 1);
  assert.equal(pace(2, 4), 2);
  assert.equal(pace(2, 9), 3);
  assert.equal(pace(2, 500), 500);
});
