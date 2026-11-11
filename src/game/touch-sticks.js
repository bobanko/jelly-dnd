// Two minimal virtual joysticks for touch screens, in the bottom corners. A stick does not
// move a jelly itself: it holds the movement keys of one key set (up, left, down, right), so
// moves, undo, network play and camera-relative controls work exactly as on a keyboard.
// A touch anywhere in a stick's half of the lower screen grabs it there.
const DEAD_ZONE = 0.28, // of the radius
  RADIUS = 54; // px the knob may travel

export class TouchSticks {
  // sets(): one entry per stick, { codes: [up, left, down, right], color } or null to hide it.
  // press(code) and release(code) act like keydown and keyup.
  constructor(parent, { sets, press, release }) {
    this.sets = sets;
    this.press = press;
    this.release = release;
    this.root = document.createElement('div');
    this.root.className = 'touch-sticks';
    this.root.setAttribute('aria-hidden', 'true');
    this.sticks = ['left', 'right'].map((side, index) => {
      const zone = document.createElement('div'),
        base = document.createElement('div'),
        knob = document.createElement('div');
      zone.className = 'touch-stick-zone ' + side;
      base.className = 'touch-stick';
      knob.className = 'touch-stick-knob';
      base.append(knob);
      zone.append(base);
      this.root.append(zone);
      const stick = { index, zone, base, knob, pointer: null, held: [] };
      zone.addEventListener('pointerdown', (e) => this.grab(stick, e));
      zone.addEventListener('pointermove', (e) => this.drag(stick, e));
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
        zone.addEventListener(type, (e) => {
          if (e.pointerId === stick.pointer?.id) this.letGo(stick);
        });
      return stick;
    });
    parent.append(this.root);
    this.refresh();
  }
  // Key sets or colours changed (a network roster change, for example).
  refresh() {
    const sets = this.sets();
    this.sticks.forEach((stick, i) => {
      this.letGo(stick);
      stick.set = sets[i];
      stick.zone.hidden = !stick.set;
      if (stick.set) stick.base.style.setProperty('--jelly-color', stick.set.color);
    });
  }
  // Every finger let go, keys released: blur, menu, restart.
  reset() {
    for (const stick of this.sticks) this.letGo(stick);
  }
  grab(stick, e) {
    if (!stick.set || stick.pointer) return;
    e.preventDefault();
    const zone = stick.zone.getBoundingClientRect();
    stick.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
    stick.zone.setPointerCapture?.(e.pointerId);
    stick.base.classList.add('active');
    // The stick comes to the thumb.
    stick.base.style.left = e.clientX - zone.left + 'px';
    stick.base.style.top = e.clientY - zone.top + 'px';
    this.drag(stick, e);
  }
  drag(stick, e) {
    if (e.pointerId !== stick.pointer?.id) return;
    e.preventDefault();
    let dx = e.clientX - stick.pointer.x,
      dy = e.clientY - stick.pointer.y;
    const distance = Math.hypot(dx, dy);
    if (distance > RADIUS) {
      dx *= RADIUS / distance;
      dy *= RADIUS / distance;
    }
    stick.knob.style.translate = dx + 'px ' + dy + 'px';
    // Eight directions, like two keys at once on a keyboard.
    let wanted = [];
    if (distance > RADIUS * DEAD_ZONE) {
      const sector = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)),
        sx = Math.round(Math.cos((sector * Math.PI) / 4)),
        sy = Math.round(Math.sin((sector * Math.PI) / 4));
      const [up, left, down, right] = stick.set.codes;
      if (sy < 0) wanted.push(up);
      if (sy > 0) wanted.push(down);
      if (sx < 0) wanted.push(left);
      if (sx > 0) wanted.push(right);
    }
    this.hold(stick, wanted);
  }
  letGo(stick) {
    if (stick.pointer && stick.zone.hasPointerCapture?.(stick.pointer.id))
      stick.zone.releasePointerCapture(stick.pointer.id);
    stick.pointer = null;
    stick.base.classList.remove('active');
    stick.base.style.left = stick.base.style.top = '';
    stick.knob.style.translate = '';
    this.hold(stick, []);
  }
  hold(stick, wanted) {
    for (const code of stick.held) if (!wanted.includes(code)) this.release(code);
    for (const code of wanted) if (!stick.held.includes(code)) this.press(code);
    stick.held = wanted;
  }
}
