// State shared by the loader and browser entry points.
export let menuOnly = false;
export let progress = null;

export function configureRuntime(options) {
  menuOnly = options.menuOnly;
  progress = options.progress;
}
