export const ASSEMBLY_BLOCK_END = 0.7,
  ASSEMBLY_DROP_STAGGER = 0.1,
  ASSEMBLY_DROP_DURATION = 0.2,
  ASSEMBLY_DROP_HEIGHT = 5;
export function assemblyDropRemaining(t) {
  if (t < 0.68) {
    const fall = t / 0.68;
    return 1 - fall * fall;
  }
  if (t < 0.88) {
    const bounce = (t - 0.68) / 0.2;
    return 0.035 * 4 * bounce * (1 - bounce);
  }
  const settle = (t - 0.88) / 0.12;
  return 0.008 * 4 * settle * (1 - settle);
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
  if (t < 0.62) {
    const fall = t / 0.62;
    return ASSEMBLY_DROP_HEIGHT * (1 - fall * fall);
  }
  const ripple = (t - 0.62) / 0.38;
  return Math.sin(ripple * Math.PI * 3) * 0.22 * (1 - ripple) ** 2;
}
export function assemblyRock(assembly, index, count) {
  const t = assemblyLandingProgress(assembly, index, count);
  if (t === null || t < 0.68 || t >= 1) return 0;
  const settle = (t - 0.68) / 0.32;
  return Math.sin(settle * Math.PI * 5) * 0.24 * (1 - settle) ** 1.5;
}
