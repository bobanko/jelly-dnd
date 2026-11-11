// Seeded pseudo-random player input, for determinism tests and network soak runs. Each player
// holds one of the nine key directions for a random stretch, like a person at a keyboard.
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Returns inputs(tick); ticks must be asked for in increasing order.
export function scriptedInputs(seed, playerCount) {
  const random = mulberry32(seed),
    current = Array.from({ length: playerCount }, () => ({ x: 0, z: 0, until: 0 }));
  return (tick) =>
    current.map((held) => {
      if (tick >= held.until) {
        held.x = Math.floor(random() * 3) - 1;
        held.z = Math.floor(random() * 3) - 1;
        held.until = tick + 10 + Math.floor(random() * 110);
      }
      return { x: held.x, z: held.z };
    });
}
