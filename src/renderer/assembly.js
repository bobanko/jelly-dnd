export const ASSEMBLY_BLOCK_END = 0.7,
  ASSEMBLY_DROP_STAGGER = 0.05,
  ASSEMBLY_DROP_DURATION = 0.25,
  ASSEMBLY_DROP_HEIGHT = 5;
// Zero velocity at both ends: props are lowered into place rather than dropped.
const smootherstep = (t) => t * t * t * (t * (t * 6 - 15) + 10);
export function assemblyDropRemaining(t) {
  if (t < 0.8) return 1 - smootherstep(t / 0.8);
  // A barely visible, slow rebound that never dips below the floor.
  const settle = (t - 0.8) / 0.2;
  return 0.01 * Math.sin(settle * Math.PI) * (1 - settle);
}
export function assemblyLandingProgress(assembly, index, count) {
  if (!assembly) return 1;
  const position = count > 1 ? index / (count - 1) : 0.5,
    start = ASSEMBLY_BLOCK_END + position * ASSEMBLY_DROP_STAGGER,
    t = (assembly.progress - start) / ASSEMBLY_DROP_DURATION;
  if (t < 0) return null;
  return Math.min(1, t);
}
export function assemblyDropOffset(assembly, index, count) {
  const t = assemblyLandingProgress(assembly, index, count);
  return t === null ? null : ASSEMBLY_DROP_HEIGHT * assemblyDropRemaining(t);
}
export function assemblyFloatOffset(assembly, index, count) {
  const t = assemblyLandingProgress(assembly, index, count);
  if (t === null) return null;
  if (t < 0.7) return ASSEMBLY_DROP_HEIGHT * (1 - smootherstep(t / 0.7));
  const ripple = (t - 0.7) / 0.3;
  return Math.sin(ripple * Math.PI * 2) * 0.12 * (1 - ripple) ** 2;
}
export function assemblyRock(assembly, index, count) {
  const t = assemblyLandingProgress(assembly, index, count);
  if (t === null || t < 0.8 || t >= 1) return 0;
  const settle = (t - 0.8) / 0.2;
  return Math.sin(settle * Math.PI * 2) * 0.07 * (1 - settle) ** 2;
}
// Jellies are summoned rather than dropped: each grows from a point at its landing time.
export function assemblyAppearScale(assembly, index, count) {
  const t = assemblyLandingProgress(assembly, index, count);
  if (t === null) return 0;
  if (t >= 1) return 1;
  const u = t - 1;
  return 1 + 2.4 * u * u * u + 1.4 * u * u;
}
// Visual size of a jelly: summoned during the level assembly, then portal or respawn warps.
export function jellyScale(level, index, landingIndex, landingCount) {
  return level.assembly
    ? assemblyAppearScale(level.assembly, landingIndex, landingCount)
    : (level.effects?.warpScale?.(index) ?? 1);
}
// The landing wave after the blocks gives every object a slot, in this order: buttons,
// lifts, bridges, spikes, jellies, crates, pickups, archers, drones. Returns the first slot of
// each kind and the total count.
export function landingLayout(level, playerCount) {
  const layout = {};
  let slot = 0;
  for (const [kind, count] of [
    ['plates', level.plates.length],
    ['lifts', level.world.lifts.length],
    ['bridges', (level.bridges || []).length],
    ['spikes', level.world.spikes.length],
    ['jellies', playerCount],
    ['crates', (level.crates || []).length],
    ['pickups', level.world.pickups.length],
    ['archers', level.world.archers.length],
    ['drones', (level.world.drones || []).length],
  ]) {
    layout[kind] = slot;
    slot += count;
  }
  layout.count = slot;
  return layout;
}
// Landing progress of jelly `index` in the level assembly (null before it appears).
export function jellySummonProgress(level, players, index) {
  const layout = landingLayout(level, players.length);
  return assemblyLandingProgress(level.assembly, layout.jellies + index, layout.count);
}
// Spikes rise out of their sockets during their landing slot (0..1, null before).
export function assemblySpikeRise(assembly, index, count) {
  const t = assemblyLandingProgress(assembly, index, count);
  return t === null ? null : smootherstep(t);
}
// Crate arrival during the level assembly: teleported in above its cell with a white flash
// (game.js), it hangs for a moment, falls under gravity and bounces once. Returns the height
// above its cell, or null before it appears.
export const CRATE_DROP_HEIGHT = 0.9;
// Landing progress of crate `index`, in the renderer's landing order (after the jellies).
export function crateArrivalProgress(level, players, index) {
  const layout = landingLayout(level, players.length);
  return assemblyLandingProgress(level.assembly, layout.crates + index, layout.count);
}
export function assemblyCrateArrival(assembly, index, count) {
  const t = assemblyLandingProgress(assembly, index, count);
  if (t === null) return null;
  if (t < 0.15) return CRATE_DROP_HEIGHT;
  if (t < 0.6) {
    const s = (t - 0.15) / 0.45;
    return CRATE_DROP_HEIGHT * (1 - s * s);
  }
  const u = (t - 0.6) / 0.4;
  return 0.36 * u * (1 - u);
}
