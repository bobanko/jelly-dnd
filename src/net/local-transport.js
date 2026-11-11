// Network play between tabs or windows of one browser, with no server: for development.
export function localTransport(room, id, host) {
  const channel = new BroadcastChannel('jelly-dnd.room.' + room),
    transport = { onmessage: null, onopen: null, connected: true };
  let closed = false;
  // Guests talk to the host only; the host talks to one guest or to all of them.
  transport.send = (message, to) => closed || channel.postMessage({ from: id, host, to, message });
  channel.onmessage = ({ data }) => {
    if (data.from === id || data.host === host) return;
    if (data.to !== undefined && data.to !== id) return;
    transport.onmessage?.(data.message, data.from);
  };
  transport.close = () => {
    closed = true;
    channel.close();
  };
  return transport;
}
