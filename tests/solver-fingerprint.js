// Bit-exact fingerprint and timing of the soft-body solver.
// Usage: npm run profile:solver [-- stepsForBenchmark]
// Optimisations of the solver must keep the printed fingerprint unchanged.
const root = new URL('../src/world/', import.meta.url).href;
const { World } = await import(root + 'physics.js');
const Soft = await import(root + 'soft-body.js');

function scene() {
  const floor = new Set();
  for (let x = 0; x < 20; x++) for (let z = 0; z < 20; z++) floor.add(`${x},${z}`);
  const world = new World(floor, [], []),
    soft = (world.soft = new Soft.System());
  const bodies = [
    { x: 4, z: 4 },
    { x: 5.2, z: 4.3 },
    { x: 4.4, z: 5.4, y: 1.6, state: 'falling' },
    { x: 6.4, z: 4, kind: 'crate' },
  ].map((p) => ({ y: 0, vx: 0, vy: 0, vz: 0, state: 'alive', deaths: 0, ...p }));
  return { world, soft, bodies };
}

const view = new DataView(new ArrayBuffer(8));
function hashBodies(g, h) {
  for (const p of g.bodies) {
    const b = g.soft.get(p);
    for (const list of [b.positions, b.velocities, [b.r], [b.center]])
      for (const n of list)
        for (const v of n) {
          view.setFloat64(0, v);
          h = Math.imul(h ^ view.getUint32(0), 16777619) >>> 0;
          h = Math.imul(h ^ view.getUint32(4), 16777619) >>> 0;
        }
    for (const v of [p.x, p.y, p.z, p.vx, p.vy, p.vz]) {
      view.setFloat64(0, v ?? 0);
      h = Math.imul(h ^ view.getUint32(0), 16777619) >>> 0;
      h = Math.imul(h ^ view.getUint32(4), 16777619) >>> 0;
    }
  }
  return h;
}

// Varied input: walk, collide, push the crate, turn, stop.
const inputAt = (i) => {
  const phase = Math.floor(i / 120) % 6,
    dirs = [
      [
        { x: 1, z: 0 },
        { x: 1, z: 0 },
        { x: 1, z: 0 },
      ],
      [
        { x: 0, z: 1 },
        { x: -1, z: 0 },
        { x: 1, z: 1 },
      ],
      [
        { x: -1, z: 0 },
        { x: 0, z: -1 },
        { x: 0, z: 0 },
      ],
      [
        { x: 0, z: 0 },
        { x: 0, z: 0 },
        { x: 0, z: 0 },
      ],
      [
        { x: 1, z: -1 },
        { x: 1, z: 0 },
        { x: -1, z: 1 },
      ],
      [
        { x: 0, z: -1 },
        { x: 0, z: 1 },
        { x: 1, z: 0 },
      ],
    ];
  return dirs[phase];
};

const g = scene();
let h = 2166136261;
const checkpoints = [];
for (let i = 0; i < 1440; i++) {
  g.world.step(g.bodies, inputAt(i));
  if (i % 60 === 0) g.soft.poke(g.bodies[i % 3]);
  h = hashBodies(g, h);
  if ((i + 1) % 360 === 0) checkpoints.push(h.toString(16));
}
// Recorded before the allocation-free rewrite of the solver hot paths (October 2026).
// Change it only together with an intentional change of physics behaviour.
// Math.sin/cos/exp round differently on x64 and arm64, so each architecture has its own value
// (arm64 recorded on Apple silicon from the same commit).
const EXPECTED = {
    x64: '6f22df90 6ca53197 ef7d916c 7d4855bd',
    arm64: '6f22df90 8b1879ca 999225a5 6f16fcae',
  }[process.arch],
  fingerprint = checkpoints.join(' ');
console.log('fingerprint', fingerprint, fingerprint === EXPECTED ? '(matches)' : '(CHANGED)');
if (fingerprint !== EXPECTED) {
  console.error('Expected fingerprint', EXPECTED);
  process.exitCode = 1;
}
console.log('states', g.bodies.map((p) => p.state + '/' + p.deaths).join(' '));

// Benchmark: keep everyone awake and moving.
const bench = scene(),
  steps = Number(process.argv[2] || 3000);
for (let i = 0; i < 300; i++) bench.world.step(bench.bodies, inputAt(i));
const start = performance.now();
for (let i = 0; i < steps; i++) {
  bench.world.step(bench.bodies, inputAt(i));
  if (i % 30 === 0) bench.bodies.slice(0, 3).forEach((p) => bench.soft.poke(p));
}
const ms = (performance.now() - start) / steps;
console.log('ms/step', ms.toFixed(3));
