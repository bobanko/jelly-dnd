const clips = {
  death: ['jelly-death-2026-10-28T23-52-26-447Z.mp3', 0.35],
  land: ['jelly-land-2026-10-28T23-36-16-777Z.mp3', 0.35],
  portal: ['portal-2026-10-28T23-36-09-597Z.mp3', 0.4],
  rise: ['spikes-2026-10-28T23-51-49-777Z.mp3', 0.18],
  retract: ['spikes-retract-2026-10-28T23-51-56-006Z.mp3', 0.18],
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

export class GameAudio {
  constructor(context) {
    this.context = context;
    this.enabled = false;
    this.active = false;
    this.buffers = new Map();
    this.sources = new Set();
    this.lastPlayed = new Map();
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
          } catch {
            console.warn('Could not load game sound: ' + file);
          }
        }),
      );
    }
    if (!enabled) this.stop();
    this.updateWind();
  }
  setActive(active) {
    if (this.active === active) return;
    this.active = active;
    if (!active) this.stop();
    this.updateWind();
  }
  stop() {
    for (const source of this.sources) source.stop();
    this.sources.clear();
    this.wind = null;
    this.lastPlayed.clear();
  }
  updateWind() {
    if (this.enabled && this.active && !this.wind) this.wind = this.play('wind');
  }
  play(name, volume = 1) {
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
    source.start();
    return source;
  }
}
