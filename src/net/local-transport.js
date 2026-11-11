// Network play between tabs or windows of one browser, with no server: for development.
// `ping` adds an artificial round-trip delay in milliseconds (half when sending, half when
// receiving); it may be changed while playing to feel what a real connection would be like.
export function localTransport(room, id, host, ping = 0) {
  const channel = new BroadcastChannel('jelly-dnd.room.' + room);
  const transport = { onmessage: null, ping };
  let closed = false;
  // Delayed messages keep their order even when the delay is lowered mid-flight.
  const lane = () => {
    let last = 0;
    return (action) => {
      const delay = Math.max(0, transport.ping / 2);
      if (!delay && last <= performance.now()) return action();
      last = Math.max(last, performance.now() + delay);
      setTimeout(action, last - performance.now());
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
