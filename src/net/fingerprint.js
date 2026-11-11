import { hashState } from './state-hash.js';
import { scriptedInputs } from './input-script.js';

// Plays a level with scripted input and folds every checkpoint hash into one number. Equal
// numbers on two machines or browser engines mean lockstep play between them stays in sync.
export function fingerprint(
  map,
  Levels,
  Physics,
  Soft,
  { seed = 1, ticks = 960, every = 30 } = {},
) {
  const r = Levels.instantiate(Levels.read(map), Physics, Soft),
    inputs = scriptedInputs(seed, r.players.length);
  let h = 0;
  for (let tick = 1; tick <= ticks; tick++) {
    r.world.step(r.bodies, inputs(tick));
    if (tick % every === 0) h = Math.imul(h ^ hashState(r.world, r.bodies), 16777619) >>> 0;
  }
  return h;
}
