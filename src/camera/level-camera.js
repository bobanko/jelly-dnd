export const DEFAULT_CAMERA = Object.freeze({ yaw: 0, pitch: 55 });
export const INTRO_SECONDS = 1.2;
export const settings = (map) => map.camera ?? DEFAULT_CAMERA;
export const angle = (map) => ((settings(map).yaw - 45) * Math.PI) / 180;
export function intro(map, elapsed, reducedMotion = false) {
  const t = reducedMotion ? 1 : Math.max(0, Math.min(1, elapsed / INTRO_SECONDS)),
    ease = t * t * (3 - 2 * t);
  return {
    angle: angle(map) + (Math.PI / 4) * (1 - ease),
    pitch: settings(map).pitch,
    overview: 1 - ease,
    done: t === 1,
  };
}
