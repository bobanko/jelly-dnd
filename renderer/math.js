export const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0),
  cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
export const normalize = (a) => {
  const l = Math.hypot(...a) || 1;
  return a.map((v) => v / l);
};
export function viewMatrix(center, view, width, height, offset = 0, depthRange = 40) {
  const right = normalize(cross([0, 1, 0], view)),
    up = normalize(cross(view, right)),
    m = new Float32Array(16);
  for (let k = 0; k < 3; k++) {
    m[k * 4] = (right[k] * 2) / width;
    m[k * 4 + 1] = (up[k] * 2) / height;
    m[k * 4 + 2] = -view[k] / depthRange;
  }
  m[12] = (-dot(right, center) * 2) / width;
  m[13] = (-dot(up, center) * 2) / height + offset;
  m[14] = 0.5 + dot(view, center) / depthRange;
  m[15] = 1;
  return m;
}
export function cameraFrame(camera, angle, width, height, scale) {
  const perspective = camera.mode === 'perspective',
    pitch = ((camera.pitch ?? 30) * Math.PI) / 180,
    azimuth = angle + Math.PI / 4;
  const view = [
      Math.sin(azimuth) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(azimuth) * Math.cos(pitch),
    ],
    target = [camera.x, camera.targetY ?? 0, camera.z],
    offset = 1 - 2 * (camera.frameY ?? 0.56);
  const referenceDistance = Math.max(5, height / scale / (2 * Math.tan(Math.PI / 8))),
    focusDepth = view[1] * ((camera.focusHeight ?? 0.42) - (camera.targetY ?? 0));
  // Compensate focal length at the followed jelly's centre: FOV changes
  // perspective strength while keeping that character's apparent size stable.
  const distance = perspective
    ? focusDepth +
      ((referenceDistance - focusDepth) * Math.tan(Math.PI / 8)) /
        Math.tan(((camera.fov ?? 45) * Math.PI) / 360)
    : 20;
  const eye = target.map((v, k) => v + view[k] * distance);
  if (!perspective)
    return {
      vp: viewMatrix(
        target,
        view,
        width / scale,
        height / scale,
        offset,
        Math.max(40, (width / scale) * 2, (height / scale) * 2),
      ),
      view,
      eye,
      perspective,
      distance,
    };
  const right = normalize(cross([0, 1, 0], view)),
    up = normalize(cross(view, right)),
    f = 1 / Math.tan(((camera.fov ?? 45) * Math.PI) / 360);
  const near = 0.1,
    far = Math.max(120, distance + 60),
    a = far / (far - near),
    b = near * a,
    vp = new Float32Array(16),
    eyeDepth = distance + dot(view, target);
  // WebGPU uses a zero-to-one depth range. The offset keeps the followed cube
  // at the same screen anchor in both projection modes.
  for (let k = 0; k < 3; k++) {
    vp[k * 4] = (right[k] * f * height) / width;
    vp[k * 4 + 1] = up[k] * f - offset * view[k];
    vp[k * 4 + 2] = -a * view[k];
    vp[k * 4 + 3] = -view[k];
  }
  vp[12] = (-dot(right, target) * f * height) / width;
  vp[13] = -dot(up, target) * f + offset * eyeDepth;
  vp[14] = a * eyeDepth - b;
  vp[15] = eyeDepth;
  return { vp, view, eye, perspective, distance };
}
export function projectPoint(frame, x, y, z, width, height) {
  const m = frame.vp,
    w = m[3] * x + m[7] * y + m[11] * z + m[15],
    depth = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
  return {
    x: (((m[0] * x + m[4] * y + m[8] * z + m[12]) / w) * 0.5 + 0.5) * width,
    y: (0.5 - ((m[1] * x + m[5] * y + m[9] * z + m[13]) / w) * 0.5) * height,
    depth,
    visible: w > 0 && depth >= 0 && depth <= 1,
    scale: (Math.hypot(m[0], m[4], m[8]) * width * 0.5) / w,
  };
}
