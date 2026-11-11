// Development aid: wraps a transport so its messages take an artificial round trip of
// `ping` milliseconds (half when sending, half when receiving). The value may be changed
// while playing, to feel what a slower connection would be like.
export function delayed(inner, ping = 0) {
  const transport = { onmessage: null, onopen: null, ping };
  // Delayed messages wait in one queue per direction, so they keep their order whatever the
  // timers do and however the delay changes mid-flight.
  const lane = () => {
    const queue = [];
    let timer = null;
    const pump = () => {
      timer = null;
      while (queue.length && queue[0].at <= performance.now()) queue.shift().action();
      if (queue.length) timer = setTimeout(pump, Math.max(0, queue[0].at - performance.now()));
    };
    return (action) => {
      const delay = Math.max(0, transport.ping / 2);
      if (!delay && !queue.length) return action();
      queue.push({ at: Math.max(queue.at(-1)?.at ?? 0, performance.now() + delay), action });
      timer ??= setTimeout(pump, Math.max(0, queue[0].at - performance.now()));
    };
  };
  const outgoing = lane(),
    incoming = lane();
  transport.send = (message, to) => outgoing(() => inner.send(message, to));
  inner.onmessage = (message, from) => incoming(() => transport.onmessage?.(message, from));
  inner.onopen = () => transport.onopen?.();
  transport.close = () => inner.close();
  Object.defineProperty(transport, 'connected', { get: () => inner.connected });
  return transport;
}
