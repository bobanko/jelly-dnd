// Network relay for Jelly & Bones: one Durable Object per room passes messages between the
// room's host and its guests. It keeps no game state and understands none of the messages.
//
// A machine connects to wss://<relay>/room/<CODE>?id=<machine id>[&host=1].
// A frame is "<to>\n<payload>" on the way in and "<from>\n<payload>" on the way out. A guest's
// frames always go to the host; the host names one guest in <to>, or leaves it empty for all.
import { DurableObject } from 'cloudflare:workers';

const NAME = /^[\w-]{1,32}$/,
  MAX_MACHINES = 8,
  MAX_FRAME = 1 << 20;

export default {
  fetch(request, env) {
    const room = /^\/room\/([^/]+)$/.exec(new URL(request.url).pathname)?.[1];
    if (!room) return new Response('Jelly & Bones relay');
    if (!NAME.test(room)) return new Response('Bad room code', { status: 400 });
    if (request.headers.get('Upgrade') !== 'websocket')
      return new Response('Expected a WebSocket', { status: 426 });
    return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(request);
  },
};

export class Room extends DurableObject {
  fetch(request) {
    const query = new URL(request.url).searchParams,
      id = query.get('id') || '',
      host = query.get('host') === '1';
    if (!NAME.test(id)) return new Response('Bad machine id', { status: 400 });
    // A machine that reconnects replaces its old connection.
    for (const old of this.ctx.getWebSockets('id:' + id)) old.close(4000, 'replaced');
    if (this.ctx.getWebSockets().length >= MAX_MACHINES)
      return new Response('The room is full', { status: 503 });
    const [client, server] = Object.values(new WebSocketPair());
    // Hibernating sockets: the room sleeps between frames and keeps its connections.
    this.ctx.acceptWebSocket(server, ['id:' + id, host ? 'host' : 'guest']);
    server.serializeAttachment({ id, host });
    return new Response(null, { status: 101, webSocket: client });
  }
  webSocketMessage(socket, frame) {
    if (typeof frame !== 'string' || frame.length > MAX_FRAME) return;
    const { id, host } = socket.deserializeAttachment(),
      split = frame.indexOf('\n');
    if (split < 0) return;
    const to = frame.slice(0, split),
      out = id + frame.slice(split);
    const targets = !host
      ? this.ctx.getWebSockets('host')
      : to
        ? this.ctx.getWebSockets('id:' + to)
        : this.ctx.getWebSockets('guest');
    for (const target of targets) {
      try {
        target.send(out);
      } catch {}
    }
  }
  webSocketClose(socket, code, reason) {
    try {
      socket.close(code === 1005 || code === 1006 ? 1000 : code, reason);
    } catch {}
  }
}
