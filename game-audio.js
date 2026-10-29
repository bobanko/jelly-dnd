const clips = {
  arrow: ['skeleton-arrow-2026-10-29T00-02-23-396Z.mp3', 0.26],
  bridge: ['bridge-slide-2026-10-29T00-06-35-555Z.mp3', 0.2],
  bridgeRetract: ['bridge-retract-2026-10-29T00-06-39-624Z.mp3', 0.18],
  buttonPress: ['button-press-2026-10-29T00-09-56-757Z.mp3', 0.65],
  buttonRelease: ['button-release-2026-10-29T00-10-01-533Z.mp3', 0.36],
  death: ['jelly-death-2026-10-28T23-58-40-459Z.mp3', 0.35],
  land: ['jelly-land-2026-10-29T00-18-45-533Z.mp3', 0.5],
  portal: ['portal-2026-10-29T00-12-36-751Z.mp3', 0.38],
  rune: ['finish-rune-2026-10-29T00-11-31-512Z.mp3', 0.48],
  rise: ['spikes-2026-10-28T23-57-14-327Z.mp3', 0.18],
  retract: ['spikes-retract-2026-10-28T23-57-21-491Z.mp3', 0.18],
  wind: ['dungeon-wind-2026-10-28T23-31-02-885Z.mp3', 0.08],
};

// Presentation state only: reset/undo seed the current stages without playing them.
export class SpikeSounds {
  reset(world) {
    this.stages = world.spikes.map((spike) => world.spikeState(spike).stage);
  }
  update(world) {
    if (!this.stages) this.reset(world);
    const events = [];
    world.spikes.forEach((spike, i) => {
      const stage = world.spikeState(spike).stage;
      const previous = this.stages[i];
      if (stage !== previous && previous !== undefined) {
        if (stage === 'rising' || (stage === 'raised' && previous === 'hidden'))
          events.push({ name: 'rise', spike });
        if (stage === 'retracting' || (stage === 'hidden' && previous === 'raised'))
          events.push({ name: 'retract', spike });
      }
      this.stages[i] = stage;
    });
    return events;
  }
}

export class MechanismSounds {
  reset(world, bodies) {
    this.plates = world.plates.map((plate) => this.platePressed(world, bodies, plate));
    this.bridges = world.bridges.map((_, i) => world.held.has(i));
  }
  platePressed(world, bodies, plate) {
    const height = plate.y ?? world.heightAt(plate.x, plate.z) ?? 0;
    return bodies.some(
      (body) =>
        (!body.state || body.state === 'alive') &&
        Math.abs((body.y || 0) - height) < 0.15 &&
        Math.abs(body.x - plate.x) < 0.42 &&
        Math.abs(body.z - plate.z) < 0.42,
    );
  }
  update(world, bodies) {
    if (!this.plates || !this.bridges) this.reset(world, bodies);
    const events = [];
    world.plates.forEach((plate, i) => {
      const pressed = this.platePressed(world, bodies, plate);
      if (pressed !== this.plates[i])
        events.push({ name: pressed ? 'buttonPress' : 'buttonRelease', object: plate });
      this.plates[i] = pressed;
    });
    world.bridges.forEach((bridge, i) => {
      const extended = world.held.has(i);
      if (extended && !this.bridges[i]) events.push({ name: 'bridge', object: bridge });
      if (!extended && this.bridges[i]) events.push({ name: 'bridgeRetract', object: bridge });
      this.bridges[i] = extended;
    });
    return events;
  }
}

export class GameAudio {
  constructor(context) {
    this.context = context;
    this.enabled = false;
    this.active = false;
    this.buffers = new Map();
    this.sources = new Set();
    this.lastPlayed = new Map();
    this.runeLevel = 0;
  }
  setEnabled(enabled) {
    this.enabled = enabled;
    if (enabled) {
      const context = this.context();
      context.resume?.().catch(() => {});
      this.loading ??= Promise.all(
        Object.entries(clips).map(async ([name, [file]]) => {
          try {
            const response = await fetch('./assets/audio/' + file);
            if (!response.ok) throw Error('Audio unavailable');
            const buffer = await context.decodeAudioData(await response.arrayBuffer());
            this.buffers.set(name, buffer);
            if (name === 'wind') this.updateWind();
            if (name === 'rune') this.updateRune();
          } catch {
            console.warn('Could not load game sound: ' + file);
          }
        }),
      );
    }
    if (!enabled) this.stop();
    this.updateWind();
    this.updateRune();
  }
  setActive(active) {
    if (this.active === active) return;
    this.active = active;
    if (!active) this.stop();
    this.updateWind();
    this.updateRune();
  }
  stop() {
    for (const source of this.sources) source.stop();
    this.sources.clear();
    this.wind = null;
    this.runeSource = null;
    this.runeGain = null;
    this.runeTarget = undefined;
    this.runeLevel = 0;
    this.lastPlayed.clear();
  }
  updateWind() {
    if (this.enabled && this.active && !this.wind) this.wind = this.play('wind');
  }
  setRuneLevel(level) {
    this.runeLevel = Math.max(0, Math.min(1, Number(level) || 0));
    this.updateRune();
  }
  updateRune() {
    if (!this.enabled || !this.active || !this.buffers.has('rune')) return;
    const context = this.context();
    if (context.state === 'suspended') return;
    if (!this.runeSource) {
      if (this.runeLevel <= 0) return;
      const source = context.createBufferSource(),
        gain = context.createGain();
      source.buffer = this.buffers.get('rune');
      source.loop = true;
      gain.gain.value = 0;
      source.connect(gain).connect(context.destination);
      this.sources.add(source);
      this.runeSource = source;
      this.runeGain = gain;
      source.onended = () => {
        this.sources.delete(source);
        if (this.runeSource === source) {
          this.runeSource = null;
          this.runeGain = null;
        }
        source.disconnect();
        gain.disconnect();
      };
      source.start(context.currentTime);
    }
    const parameter = this.runeGain.gain,
      target = this.runeLevel > 0.05 ? clips.rune[1] : 0;
    if (target === this.runeTarget) return;
    this.runeTarget = target;
    if (parameter.cancelAndHoldAtTime) parameter.cancelAndHoldAtTime(context.currentTime);
    else parameter.cancelScheduledValues?.(context.currentTime);
    if (parameter.setTargetAtTime)
      parameter.setTargetAtTime(
        target,
        context.currentTime,
        target > parameter.value ? 0.18 : 0.32,
      );
    else parameter.value = target;
  }
  play(name, volume = 1, delay = 0) {
    // Never queue stale events while decoding, muted, paused or in menus.
    if (!this.enabled || !this.active || !this.buffers.has(name)) return null;
    const context = this.context();
    if (context.state === 'suspended') return null;
    if (context.currentTime - (this.lastPlayed.get(name) ?? -Infinity) < 0.08) return null;
    if (this.sources.size >= 12) return null;
    this.lastPlayed.set(name, context.currentTime);
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = this.buffers.get(name);
    source.loop = name === 'wind';
    gain.gain.value = clips[name][1] * volume;
    source.connect(gain).connect(context.destination);
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    source.start(context.currentTime + Math.max(0, delay));
    return source;
  }
}
