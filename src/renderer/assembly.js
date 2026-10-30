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
// Landing progress of jelly `index` in the level assembly (null before it appears), in the
// same landing order the renderer uses: plates, jellies, crates, pickups, archers, drones.
export function jellySummonProgress(level, players, index) {
  const count =
    level.plates.length +
    players.length +
    (level.crates || []).length +
    level.world.pickups.length +
    level.world.archers.length +
    (level.world.drones || []).length;
  return assemblyLandingProgress(level.assembly, level.plates.length + index, count);
}
