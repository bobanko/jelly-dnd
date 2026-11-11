// Network play through the relay (relay/src/index.js): a WebSocket per machine. A frame is
// "<to>\n<json>" on the way out and "<from>\n<json>" on the way in. The socket reconnects by
// itself; what was said meanwhile is lost, and the session asks for it again.
const RETRY_AFTER = 1000;

export function wsTransport(relay, room, id, host) {
  const transport = { onmessage: null, onopen: null, connected: false },
    url = relay.replace(/\/+$/, '') + '/room/' + room + '?id=' + id + (host ? '&host=1' : '');
  let socket,
    closed = false;
  const connect = () => {
    socket = new WebSocket(url);
    socket.onopen = () => {
      transport.connected = true;
      transport.onopen?.();
    };
    socket.onmessage = ({ data }) => {
      const split = data.indexOf('\n');
      if (split >= 0)
        transport.onmessage?.(JSON.parse(data.slice(split + 1)), data.slice(0, split));
    };
    socket.onclose = () => {
      transport.connected = false;
      if (!closed) setTimeout(connect, RETRY_AFTER);
    };
  };
  transport.send = (message, to) => {
    if (socket.readyState === WebSocket.OPEN)
      socket.send((to ?? '') + '\n' + JSON.stringify(message));
  };
  transport.close = () => {
    closed = true;
    socket.close();
  };
  connect();
  return transport;
}
