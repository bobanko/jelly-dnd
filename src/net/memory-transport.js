// An in-process network for tests: machines exchange copies of messages with a set latency
// per machine, on a clock the test advances by hand.
export class MemoryNetwork {
  constructor() {
    this.time = 0;
    this.pending = [];
    this.machines = new Map();
    this.order = 0;
    this.seed = 7;
  }
  random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  now = () => this.time;
  // latency: one-way milliseconds between this machine and the network.
  join(id, { host = false, latency = 0 } = {}) {
    // jitter: extra random delay per message, which reorders them; lose(message) drops one.
    const machine = { id, host, latency, jitter: 0, lose: null, online: true };
    machine.transport = { onmessage: null };
    machine.transport.send = (message, to) => {
      if (!machine.online) return;
      for (const other of this.machines.values()) {
        if (other === machine || (host ? to !== undefined && other.id !== to : !other.host))
          continue;
        if (other.lose?.(message)) continue;
        this.pending.push({
          at: this.time + machine.latency + other.latency + this.random() * other.jitter,
          order: this.order++,
          to: other,
          from: id,
          message: structuredClone(message),
        });
      }
    };
    this.machines.set(id, machine);
    return machine;
  }
  advance(ms) {
    this.time += ms;
    this.pending.sort((a, b) => a.at - b.at || a.order - b.order);
    while (this.pending.length && this.pending[0].at <= this.time) {
      const { to, from, message } = this.pending.shift();
      if (to.online) to.transport.onmessage?.(message, from);
    }
  }
}
