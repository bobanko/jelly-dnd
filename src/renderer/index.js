// Public WebGPU renderer entry point; the implementation lives in renderer/.
// Plain imports keep the itch.io build's static dependency scan working.
import { Renderer } from './renderer.js';
import { viewMatrix, cameraFrame, projectPoint } from './math.js';
import { surfaceBindings } from './geometry/surfaces.js';
export { Renderer, viewMatrix, cameraFrame, projectPoint, surfaceBindings };
