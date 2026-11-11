// Network play between tabs or windows of one browser, with no server: for development.
// `ping` adds an artificial round-trip delay in milliseconds (half when sending, half when
// receiving); it may be changed while playing to feel what a real connection would be like.
export function localTransport(room, id, host, ping = 0) {
  const channel = new BroadcastChannel('jelly-dnd.room.' + room);
  const transport = { onmessage: null, ping };
  let closed = false;
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
  // Clients talk to the host only; the host talks to one client or to all of them.
  transport.send = (message, to) =>
    outgoing(() => closed || channel.postMessage({ from: id, host, to, message }));
  channel.onmessage = ({ data }) => {
    if (data.from === id || data.host === host) return;
    if (data.to !== undefined && data.to !== id) return;
    incoming(() => transport.onmessage?.(data.message, data.from));
  };
  transport.close = () => {
    closed = true;
    channel.close();
  };
  return transport;
}
