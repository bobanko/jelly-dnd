import Levels from '../world/levels.js';
export const PORTAL_LIMIT = Levels.limits.portals,
  PORTAL_FLOATS = 12,
  GOALS_OFFSET = 56 + PORTAL_LIMIT * PORTAL_FLOATS,
  TORCHES_OFFSET = GOALS_OFFSET + 40,
  BODY3_OFFSET = TORCHES_OFFSET + 32,
  BODY4_OFFSET = BODY3_OFFSET + 4,
  BODY_SLOTS_OFFSET = BODY4_OFFSET + 4,
  FINISH_OFFSET = BODY_SLOTS_OFFSET + 8,
  GOAL_SLOTS_OFFSET = FINISH_OFFSET + 4,
  // Light from the depths: rgb colour and strength.
  DEPTH_GLOW_OFFSET = GOAL_SLOTS_OFFSET + 8,
  SCENE_FLOATS = DEPTH_GLOW_OFFSET + 4;
// Floating dust motes at 100% density; the developer slider goes up to 300%.
export const DUST_MOTES = 128;
