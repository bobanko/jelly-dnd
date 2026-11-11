// Lockstep network play. Every machine runs the same deterministic simulation; only inputs
// travel. The host is the clock: it stamps everybody's latest input onto each simulation tick
// and broadcasts it, so one slow player never stalls the others. A machine that joins late or
// returns after a drop replays the host's input log from the start of the level.
//
// The session knows nothing about the game or the wire. The game calls poll() every frame,
// setIntent() with what its own players are holding, and advance(steps) to learn what to
// simulate. A transport delivers plain objects: send(message, to) and onmessage(message, from).
export const SILENT_AFTER = 700, // ms without a word before a machine is shown as lagging
  CHECK_EVERY = 120; // ticks between state hash comparisons
const HELLO_EVERY = 500,
  ACK_EVERY = 200,
  KEEPALIVE_EVERY = 250;
const idle = () => ({ x: 0, z: 0 });
const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

export class Session {
  // peers: machine ids in joining order, remembered by the host across level loads.
  constructor({ host, id, transport, playerCount, level = '', peers = [], now }) {
    this.host = host;
    this.id = id;
    this.transport = transport;
    this.playerCount = playerCount;
    this.level = level;
    this.now = now ?? (() => performance.now());
    this.tick = 0; // ticks handed to the game since the level (re)started
    this.epoch = 0; // restarts so far
    this.owners = []; // machine index for every player
    this.me = host ? 0 : -1;
    this.lagging = new Set(); // machine indexes the host has not heard from
    this.desync = null; // "epoch:tick" of the first hash mismatch
    this.ping = null; // ms round trip to the host
    this.goto = null; // level this machine must (re)load to rejoin the host
    this.onroster = null; // called when owners or the lagging set change
    transport.onmessage = (message, from) => this.receive(message, from);
    if (host) {
      const start = this.now();
      this.peers = [...new Set([id, ...peers])].map((peer) => ({ id: peer, lastSeen: start }));
      this.current = Array.from({ length: playerCount }, idle);
      this.pending = [];
      this.log = [];
      this.sequence = 0;
      this.run = Math.floor(this.now() * 1000) % 2147483647; // tells this level load from the last
      this.pendingHash = null;
      this.lastSent = 0;
      this.assign();
    } else {
      this.queue = [];
      this.next = null; // sequence number of the next bundle; null until welcomed
      this.run = null;
      this.stale = false;
      this.sent = '';
      this.lastHello = -Infinity;
      this.lastAck = -Infinity;
      this.lastHeard = this.now();
      this.mine = new Map();
      this.theirs = new Map();
    }
  }
  get ready() {
    return this.host || this.next !== null;
  }
  // Ticks received but not yet simulated (client).
  get queued() {
    return this.host ? 0 : this.queue.reduce((sum, bundle) => sum + bundle.n, 0);
  }
  // The host has gone quiet (client).
  get stalled() {
    return !this.host && this.ready && this.now() - this.lastHeard > SILENT_AFTER;
  }
  get peerIds() {
    return this.host ? this.peers.map((peer) => peer.id) : [];
  }
  owns(player) {
    return this.me >= 0 && this.owners[player] === this.me;
  }
  playerLagging(player) {
    return this.lagging.has(this.owners[player]);
  }

  // Players are dealt round-robin to machines in joining order.
  assign() {
    this.owners = Array.from({ length: this.playerCount }, (_, i) => i % this.peers.length);
    this.pending.push({ type: 'owners', owners: this.owners });
    this.onroster?.();
  }
  // What this machine's players hold now: one { x, z } per player; other machines' are ignored.
  setIntent(inputs) {
    if (this.host) {
      for (let i = 0; i < this.playerCount; i++)
        if (this.owns(i)) this.current[i] = { x: sign(inputs[i].x), z: sign(inputs[i].z) };
      return;
    }
    if (!this.ready) return;
    const held = [];
    for (let i = 0; i < this.playerCount; i++)
      if (this.owns(i)) held.push([i, sign(inputs[i].x), sign(inputs[i].z)]);
    const text = JSON.stringify(held);
    if (text === this.sent) return;
    this.sent = text;
    this.transport.send({ type: 'input', i: held });
  }
  // Host only: something every machine must do on the same tick, e.g. { type: 'restart' }.
  command(command) {
    if (this.host) this.pending.push(command);
  }
  // Timers: greetings, liveness and lag detection. Call once per frame.
  poll() {
    const now = this.now();
    if (!this.host) {
      if (!this.ready && now - this.lastHello >= HELLO_EVERY) {
        this.lastHello = now;
        this.transport.send({ type: 'hello', id: this.id });
      }
      if (this.ready && now - this.lastAck >= ACK_EVERY) {
        this.lastAck = now;
        this.transport.send({ type: 'ack', sent: now });
      }
      return;
    }
    const lagging = this.peers.flatMap((peer, index) =>
      index && now - peer.lastSeen > SILENT_AFTER ? [index] : [],
    );
    if (lagging.join() !== (this.pendingLag() ?? [...this.lagging]).join())
      this.pending.push({ type: 'lag', peers: lagging });
    // Lets clients tell a paused host from a lost one. Commands wait for advance().
    if (!this.pending.length && now - this.lastSent >= KEEPALIVE_EVERY) this.broadcast(0);
  }
  // What to do next, in order: { command } entries and { tick, inputs } entries to simulate.
  // The host creates `steps` ticks; a client hands out at most `steps` received ones.
  advance(steps) {
    if (this.host) return steps > 0 || this.pending.length ? this.broadcast(steps) : [];
    const items = [];
    while (this.queue.length) {
      const bundle = this.queue[0];
      if (bundle.c) {
        for (const command of bundle.c) this.apply(command, items);
        bundle.c = null;
      }
      steps = this.expand(bundle, steps, items);
      if (bundle.n > 0) break;
      this.queue.shift();
    }
    return items;
  }
  // After simulating a tick that is a multiple of CHECK_EVERY, report the state hash.
  checkpoint(tick, hash) {
    const key = this.epoch + ':' + tick;
    if (this.host) this.pendingHash = [key, hash];
    else this.compare(key, hash, this.mine, this.theirs);
  }

  broadcast(steps) {
    // A machine that has gone quiet stops pushing: its players stand still, not run on.
    const lagging = this.pendingLag() ?? [...this.lagging],
      owners = this.pending.findLast((command) => command.type === 'owners')?.owners ?? this.owners;
    const bundle = { type: 'ticks', r: this.run, s: this.sequence++, n: steps };
    if (steps)
      bundle.i = this.current.flatMap((held, i) =>
        lagging.includes(owners[i]) ? [0, 0] : [held.x, held.z],
      );
    if (this.pending.length) bundle.c = this.pending.splice(0);
    if (this.pendingHash) bundle.h = this.pendingHash;
    this.pendingHash = null;
    this.lastSent = this.now();
    this.transport.send(bundle);
    const items = [];
    for (const command of bundle.c || []) this.apply(command, items);
    this.record(bundle);
    this.expand({ ...bundle }, steps, items);
    return items;
  }
  pendingLag() {
    return this.pending.findLast((command) => command.type === 'lag')?.peers;
  }
  // The replay log holds everything since the last restart, with runs of equal input merged.
  record(bundle) {
    // A machine joining after a restart starts from a fresh level: it needs nothing older.
    let commands = bundle.c;
    const restart = commands?.findLastIndex((command) => command.type === 'restart') ?? -1;
    if (restart >= 0) {
      this.log = [];
      commands = commands.slice(restart + 1);
    }
    if (!commands?.length) commands = undefined;
    if (!bundle.n && !commands) return;
    const last = this.log.at(-1),
      entry = { n: bundle.n, i: bundle.i, c: commands };
    if (last && !entry.c && (!last.n || String(last.i) === String(entry.i))) {
      last.n += entry.n;
      last.i ??= entry.i;
    } else this.log.push(entry);
  }
  apply(command, items) {
    if (command.type === 'owners') {
      // The host dealt them itself (assign) and may have dealt again since this order.
      if (this.host) return items.push({ command });
      this.owners = command.owners;
      this.sent = ''; // tell the host afresh what this machine's players hold
    } else if (command.type === 'lag') this.lagging = new Set(command.peers);
    else if (command.type === 'restart') {
      this.tick = 0;
      this.epoch++;
    }
    if (command.type === 'owners' || command.type === 'lag') this.onroster?.();
    items.push({ command });
  }
  expand(bundle, steps, items) {
    for (; bundle.n > 0 && steps > 0; bundle.n--, steps--) {
      const inputs = [];
      for (let i = 0; i < this.playerCount; i++)
        inputs.push({ x: bundle.i[i * 2], z: bundle.i[i * 2 + 1] });
      items.push({ tick: ++this.tick, inputs });
    }
    return steps;
  }
  compare(key, hash, own, other) {
    if (other.has(key)) {
      if (other.get(key) !== hash) this.desync ??= key;
      other.delete(key);
    } else {
      own.set(key, hash);
      if (own.size > 64) own.delete(own.keys().next().value);
    }
  }

  receive(message, from) {
    if (this.host) return this.receiveAsHost(message, from);
    if (message.type === 'welcome') {
      if (this.ready) return;
      // Another level, or a world left over from the host's previous load: start afresh.
      if (message.level !== this.level || this.stale) {
        this.goto = message.level;
        return;
      }
      this.run = message.run;
      this.me = message.me;
      this.owners = message.owners;
      this.lagging = new Set(message.lagging);
      this.epoch = message.epoch;
      this.next = message.next;
      this.queue = message.log.map((entry) => ({ ...entry }));
      this.lastHeard = this.now();
      this.onroster?.();
    } else if (message.type === 'ticks') {
      if (!this.ready) return;
      // The host has loaded a level anew without this machine noticing: ask which one.
      if (message.r !== this.run) {
        this.stale = true;
        this.next = null;
        return;
      }
      // Bundles sent before the welcome are already in its log.
      if (message.s < this.next) return;
      if (message.s > this.next) {
        this.desync ??= 'lost'; // a gap: the transport dropped a bundle
        return;
      }
      this.next++;
      this.lastHeard = this.now();
      if (message.h) this.compare(message.h[0], message.h[1], this.theirs, this.mine);
      if (message.n || message.c) this.queue.push({ n: message.n, i: message.i, c: message.c });
    } else if (message.type === 'pong') this.ping = this.now() - message.sent;
  }
  receiveAsHost(message, from) {
    let index = this.peers.findIndex((peer) => peer.id === from);
    if (message.type === 'hello') {
      if (index < 0) {
        index = this.peers.push({ id: from, lastSeen: this.now() }) - 1;
        this.assign();
      }
      this.peers[index].lastSeen = this.now();
      // Whatever it held before it dropped is forgotten.
      this.owners.forEach((owner, player) => {
        if (owner === index) this.current[player] = idle();
      });
      this.transport.send(
        {
          type: 'welcome',
          level: this.level,
          run: this.run,
          me: index,
          owners: this.owners,
          lagging: [...this.lagging],
          epoch: this.epoch,
          log: this.log.map((entry) => ({ ...entry })),
          next: this.sequence,
        },
        from,
      );
      return;
    }
    if (index < 0) return;
    this.peers[index].lastSeen = this.now();
    if (message.type === 'input') {
      for (const [player, x, z] of message.i)
        if (this.owners[player] === index) this.current[player] = { x: sign(x), z: sign(z) };
    } else if (message.type === 'ack')
      this.transport.send({ type: 'pong', sent: message.sent }, from);
  }
}

// How many ticks a client simulates this frame: `due` by its own clock, `queued` received.
// Running dry simply waits (the lost time is not made up, so a small cushion builds itself);
// a cushion grown too thick is trimmed one tick per frame; a long backlog (joining late, a tab
// that was hidden) is replayed as fast as the caller's time budget allows.
export function pace(due, queued) {
  if (queued > 30) return queued;
  if (queued > due + 4) return due + 1;
  return Math.min(due, queued);
}
