import { Session } from './lockstep.js';
import { localTransport } from './local-transport.js';

// Network play is switched on by the page address:
//   ?room=CODE          join the room
//   ?room=CODE&host=1   host it (the host's machine is the clock and picks the levels)
//   &ping=120           development: pretend the connection has this round-trip delay, ms
const param = (search, name) =>
  new RegExp('(?:^|[?&])' + name + '=([\\w-]{1,32})(?:&|$)').exec(search)?.[1];

function stored(key, create) {
  try {
    const value = sessionStorage.getItem(key);
    if (value) return value;
    sessionStorage.setItem(key, create());
    return sessionStorage.getItem(key);
  } catch {
    return create();
  }
}

// Returns null when the address asks for no room.
export function createNet(search, playerCount, level) {
  const room = param(search, 'room');
  if (!room || typeof BroadcastChannel !== 'function') return null;
  const host = param(search, 'host') === '1',
    ping = Number(param(search, 'ping')) || 0,
    // Kept for the tab's lifetime, so a reloaded page returns as the same machine.
    id = stored('jelly-dnd.net.id', () => Math.random().toString(36).slice(2, 10)),
    peersKey = 'jelly-dnd.net.peers.' + room;
  let peers = [];
  try {
    if (host) peers = JSON.parse(sessionStorage.getItem(peersKey) || '[]');
  } catch {}
  const transport = localTransport(room, id, host, ping),
    session = new Session({ host, id, transport, playerCount, level, peers });
  return {
    session,
    transport,
    room,
    host,
    // Appended to level addresses so the next level opens in the same room.
    get suffix() {
      const delay = Math.round(transport.ping);
      return '&room=' + room + (host ? '&host=1' : '') + (delay ? '&ping=' + delay : '');
    },
    // The host keeps the joining order across level loads: everybody keeps their jelly.
    remember() {
      try {
        if (host) sessionStorage.setItem(peersKey, JSON.stringify(session.peerIds));
      } catch {}
    },
  };
}
