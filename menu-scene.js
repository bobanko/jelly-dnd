import JellyLevels from './levels.js';
import * as JellyPhysics from './physics.js';
import * as JellySoftBody from './soft-body.js';
import * as JellyEffects from './game-effects.js';

/* A display diorama, independent of the playable level and its physics. */
export function createMenuScene(reducedMotion = false) {
  const map = JellyLevels.blank();
  map.size = 8;
  map.name = 'Menu diorama';
  for (let x = 2; x <= 6; x++) for (let z = 2; z <= 5; z++) map.blocks.push({ x, y: 0, z });
  map.blocks.push({ x: 5, y: 1, z: 2 }, { x: 6, y: 1, z: 2 }, { x: 6, y: 2, z: 2 });
  map.torches = [{ x: 6, y: 2, z: 2, face: 'south' }];
  map.spawns = [null, { x: 5, y: 0, z: 4 }, { x: 3, y: 0, z: 4 }, null];
  map.archers = [{ x: 4, y: 0, z: 2, dx: 0, dz: 1, interval: 3, firstShot: 1.2 }];
  map.spikes = [{ x: 5, y: 0, z: 5, offset: 0 }];
  const runtime = JellyLevels.instantiate(JellyLevels.read(map), JellyPhysics, JellySoftBody);
  runtime.world.spikeState = () => ({ extension: 1, dangerous: false });
  const scene = {
    ...runtime,
    effects: new JellyEffects.System({ reducedMotion }),
    won: false,
    finishProgress: 0,
    reducedMotion,
  };
  const rest = runtime.players.map((p) => runtime.soft.get(p).positions.map((q) => [...q]));
  let clock = 0;
  const smooth = (t) => {
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
  };
  scene.animate = (dt) => {
    if (reducedMotion) return;
    clock += dt;
    const turn = Math.floor(clock / 3) % 2,
      phase = clock % 3;
    scene.players.forEach((p, i) => {
      const home = i === 0 ? 5 : 3,
        travel = i === turn ? smooth(phase / 0.85) * (1 - smooth((phase - 2) / 0.85)) : 0;
      const x = home + (4 - home) * travel,
        impact = Math.max(0, (p.menuImpact || 0) - dt);
      p.menuImpact = impact;
      const wobble = Math.sin(clock * 6 + i * 2) * 0.018 + Math.sin(impact * 35) * impact * 0.18;
      p.x = p.rx = x;
      p.z = p.rz = 4;
      p.bounce = Math.abs(wobble);
      const body = scene.soft.get(p);
      body.core = [x, 0.42, 4];
      body.positions.forEach((q, j) => {
        const base = rest[i][j];
        q[0] = x + (base[0] - home) * (1 + wobble);
        q[1] = base[1] * (1 - wobble);
        q[2] = base[2] + Math.sin(impact * 24) * impact * 0.12;
      });
    });
    scene.world.beforeCombat([], [], dt);
    scene.world.afterCombat([], scene.soft, dt);
    scene.world.arrows = scene.world.arrows.filter((arrow) => {
      const p = scene.players.find(
        (p) => Math.abs(p.x - arrow.x) < 0.4 && Math.abs(p.z - arrow.z) < 0.4,
      );
      if (p) {
        p.menuImpact = 0.65;
        return false;
      }
      return true;
    });
  };
  return scene;
}

// A source checkout supplies dev; packaged builds supply their generated version.
export function loadBuildVersion() {
  return fetch('build-version.json', { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) throw Error('Build metadata unavailable');
      return response.json();
    })
    .then((metadata) => {
      const label = document.getElementById('build-version');
      if (label && typeof metadata.version === 'string' && metadata.version.trim())
        label.textContent = metadata.version;
    })
    .catch(() => {}); // Keep the dev fallback if metadata cannot be loaded.
}
