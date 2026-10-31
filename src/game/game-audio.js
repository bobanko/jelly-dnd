const clips = {
  arrow: ['skeleton-arrow-2026-10-29T00-02-23-396Z.mp3', 0.26],
  bridge: ['bridge-slide-2026-10-29T00-06-35-555Z.mp3', 0.2],
  bridgeRetract: ['bridge-retract-2026-10-29T00-06-39-624Z.mp3', 0.18],
  buttonPress: ['button-press-2026-10-29T00-09-56-757Z.mp3', 0.65],
  buttonRelease: ['button-release-2026-10-29T00-10-01-533Z.mp3', 0.36],
  crateSlide: ['crate-slide-2026-10-31T04-10-47-644Z.mp3', 0.16],
  death: ['jelly-death-2026-10-28T23-58-40-459Z.mp3', 0.35],
  jellySlap: ['jelly-slap-2026-10-31T04-10-52-826Z.mp3', 0.24],
  jellyWobble: ['jelly-wobble-2026-10-31T04-10-50-817Z.mp3', 0.3],
  land: ['jelly-land-2026-10-29T00-18-45-533Z.mp3', 0.5],
  levelBuild: ['level-build-2026-10-31T04-13-57-829Z.mp3', 0.36],
  liftDown: ['lift-down-2026-10-31T04-14-02-593Z.mp3', 0.2],
  liftUp: ['lift-up-2026-10-31T04-14-00-314Z.mp3', 0.2],
  portal: ['portal-2026-10-29T00-12-36-751Z.mp3', 0.38],
  rune: ['finish-rune-2026-10-29T00-11-31-512Z.mp3', 0.68],
  skullCrack: ['skull-crack-2026-10-31T04-08-13-562Z.mp3', 0.42],
  rise: ['spikes-2026-10-28T23-57-14-327Z.mp3', 0.18],
  retract: ['spikes-retract-2026-10-28T23-57-21-491Z.mp3', 0.18],
  // Easter egg: a jelly snuffing a wall torch, and the torch catching again like a match.
  torchLight: ['torch-light-2026-10-31T03-00-50-733Z.mp3', 0.25],
  torchOut: ['torch-out-2026-10-31T03-00-53-239Z.mp3', 1],
  uiConfirm: ['ui-confirm-2026-10-31T04-08-21-298Z.mp3', 0.28],
  uiMove: ['ui-move-2026-10-31T04-08-17-613Z.mp3', 0.22],
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
    this.liftHeights = (world.lifts || []).map((lift) => lift.height);
    this.liftDirections = (world.lifts || []).map(() => 0);
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
    if (!this.plates || !this.bridges || !this.liftHeights) this.reset(world, bodies);
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
    (world.lifts || []).forEach((lift, i) => {
      const delta = lift.height - this.liftHeights[i],
        direction = Math.abs(delta) < 1e-6 ? 0 : Math.sign(delta);
      if (direction && direction !== this.liftDirections[i])
        events.push({ name: direction > 0 ? 'liftUp' : 'liftDown', object: lift });
      this.liftHeights[i] = lift.height;
      this.liftDirections[i] = direction;
    });
    return events;
  }
}

export class JellyCollisionSounds {
  touching(players) {
    const contacts = new Set();
    for (let i = 0; i < players.length; i++)
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i],
          b = players[j];
        if (
          a.state !== 'dead' &&
          b.state !== 'dead' &&
          Math.abs((a.y || 0) - (b.y || 0)) < 0.5 &&
          Math.hypot(a.x - b.x, a.z - b.z) < 0.82
        )
          contacts.add(i + ':' + j);
      }
    return contacts;
  }
  reset(players) {
    this.contacts = this.touching(players);
  }
  update(players) {
    const contacts = this.touching(players),
      events = [];
    if (!this.contacts) this.contacts = contacts;
    for (const pair of contacts)
      if (!this.contacts.has(pair)) events.push({ name: 'jellyWobble', pair });
    this.contacts = contacts;
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
    this.presentationSources = new Set();
    this.lastPlayed = new Map();
    this.loopLevels = new Map();
    this.loopStates = new Map();
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
            if (this.loopLevels.has(name)) this.updateLoop(name);
          } catch {
            console.warn('Could not load game sound: ' + file);
          }
        }),
      );
    }
    if (!enabled) this.stop();
    this.updateWind();
    this.updateRune();
    this.updateLoops();
  }
  setActive(active) {
    if (this.active === active) return;
    this.active = active;
    if (!active) this.stop(false);
    this.updateWind();
    this.updateRune();
    this.updateLoops();
  }
  stop(includePresentation = true) {
    for (const source of [...this.sources]) {
      if (!includePresentation && this.presentationSources.has(source)) continue;
      source.stop();
      this.sources.delete(source);
      this.presentationSources.delete(source);
    }
    this.wind = null;
    this.runeSource = null;
    this.runeGain = null;
    this.runeTarget = undefined;
    this.runeLevel = 0;
    this.loopLevels.clear();
    this.loopStates.clear();
    this.lastPlayed.clear();
  }
  stopSource(source) {
    if (!source || !this.sources.has(source)) return;
    source.stop();
    this.sources.delete(source);
    this.presentationSources.delete(source);
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
  setLoopLevel(name, level) {
    if (!clips[name]) return;
    this.loopLevels.set(name, Math.max(0, Math.min(1, Number(level) || 0)));
    this.updateLoop(name);
  }
  updateLoops() {
    for (const name of this.loopLevels.keys()) this.updateLoop(name);
  }
  updateLoop(name) {
    if (!this.enabled || !this.active || !this.buffers.has(name)) return;
    const context = this.context();
    if (context.state === 'suspended') return;
    const level = this.loopLevels.get(name) || 0;
    let state = this.loopStates.get(name);
    if (!state) {
      if (level <= 0.02) return;
      const source = context.createBufferSource(),
        gain = context.createGain();
      source.buffer = this.buffers.get(name);
      source.loop = true;
      gain.gain.value = 0;
      source.connect(gain).connect(context.destination);
      this.sources.add(source);
      state = { source, gain, target: undefined };
      this.loopStates.set(name, state);
      source.onended = () => {
        this.sources.delete(source);
        if (this.loopStates.get(name)?.source === source) this.loopStates.delete(name);
        source.disconnect();
        gain.disconnect();
      };
      source.start(context.currentTime);
    }
    const parameter = state.gain.gain,
      target = level > 0.02 ? clips[name][1] * level : 0;
    if (target === state.target) return;
    state.target = target;
    if (parameter.cancelAndHoldAtTime) parameter.cancelAndHoldAtTime(context.currentTime);
    else parameter.cancelScheduledValues?.(context.currentTime);
    if (parameter.setTargetAtTime)
      parameter.setTargetAtTime(target, context.currentTime, target > parameter.value ? 0.12 : 0.2);
    else parameter.value = target;
  }
  play(name, volume = 1, delay = 0) {
    return this.start(name, volume, delay, true);
  }
  playUI(name, volume = 1, delay = 0) {
    return this.start(name, volume, delay, false);
  }
  start(name, volume, delay, activeOnly) {
    // Never queue stale events while decoding, muted, paused or in menus.
    if (!this.enabled || (activeOnly && !this.active) || !this.buffers.has(name)) return null;
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
    if (!activeOnly) this.presentationSources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      this.presentationSources.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    source.start(context.currentTime + Math.max(0, delay));
    return source;
  }
}
