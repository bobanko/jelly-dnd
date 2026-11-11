import { Session } from './lockstep.js';
import { localTransport } from './local-transport.js';
import { wsTransport } from './ws-transport.js';
import { delayed } from './delay.js';
import { relayUrl } from './config.js';

// Network play is switched on by the page address:
//   ?room=CODE          join the room
//   ?room=CODE&host=1   host it (the host's machine is the clock and picks the levels)
//   &ping=120           development: add this much round-trip delay, ms
//   &relay=dev          use the relay started by `npm run relay:dev` on this address, port 8787
//   &relay=local        connect tabs of this browser only, even when a relay is configured
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

// Room codes: five characters, without look-alikes (0/O, 1/I/L), easy to read out loud.
const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789',
  CODE_LENGTH = 5;
export function newRoomCode() {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => CODE_LETTERS[b % CODE_LETTERS.length]).join('');
}
// A code typed or pasted by a player, or a whole invite link: the room code, or null.
export function parseRoomCode(text) {
  const raw = /[?&]room=([\w-]+)/.exec(text)?.[1] ?? text,
    code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return code.length >= 4 && code.length <= 12 ? code : null;
}
// The address a friend opens to join `room`.
export function inviteLink(room, search = globalThis.location?.search || '') {
  const relay = param(search, 'relay'),
    page = new URL('./', globalThis.location?.href);
  return page.href + '?room=' + room + '&play=1' + (relay ? '&relay=' + relay : '');
}

// Returns null when the address asks for no room.
export function createNet(search, playerCount, level) {
  const room = param(search, 'room');
  if (!room || typeof BroadcastChannel !== 'function' || !globalThis.location) return null;
  const host = param(search, 'host') === '1',
    ping = Number(param(search, 'ping')) || 0,
    // Kept for the tab's lifetime, so a reloaded page returns as the same machine.
    id = stored('jelly-dnd.net.id', () => Math.random().toString(36).slice(2, 10)),
    peersKey = 'jelly-dnd.net.peers.' + room;
  let peers = [];
  try {
    if (host) peers = JSON.parse(sessionStorage.getItem(peersKey) || '[]');
  } catch {}
  const choice = param(search, 'relay'),
    relay =
      choice === 'dev'
        ? (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.hostname + ':8787'
        : choice === 'local'
          ? ''
          : relayUrl;
  const transport = delayed(
      relay ? wsTransport(relay, room, id, host) : localTransport(room, id, host),
      ping,
    ),
    session = new Session({ host, id, transport, playerCount, level, peers });
  return {
    session,
    transport,
    room,
    host,
    // Appended to level addresses so the next level opens in the same room.
    get suffix() {
      const delay = Math.round(transport.ping);
      return (
        '&room=' +
        room +
        (host ? '&host=1' : '') +
        (delay ? '&ping=' + delay : '') +
        (choice ? '&relay=' + choice : '')
      );
    },
    invite: inviteLink(room, search),
    // The host keeps the joining order across level loads: everybody keeps their jelly.
    remember() {
      try {
        if (host) sessionStorage.setItem(peersKey, JSON.stringify(session.peerIds));
      } catch {}
    },
  };
}
