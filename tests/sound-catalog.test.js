import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { proceduralSoundCatalog, soundCatalog, soundClips } from '../src/game/sound-catalog.js';

test('sound gallery lists every active sample once with its game volume and existing file', () => {
  assert.equal(soundCatalog.length, 24);
  assert.equal(new Set(soundCatalog.map((sound) => sound.id)).size, soundCatalog.length);
  assert.equal(new Set(soundCatalog.map((sound) => sound.file)).size, soundCatalog.length);
  for (const sound of soundCatalog) {
    assert.equal(sound.type, 'sample');
    assert.ok(sound.title);
    assert.ok(sound.description);
    assert.ok(sound.category);
    assert.ok(sound.volume > 0 && sound.volume <= 1);
    assert.ok(fs.existsSync('assets/audio/' + sound.file), sound.file);
    assert.deepEqual(soundClips[sound.id], [sound.file, sound.volume]);
  }
  assert.deepEqual(Object.keys(soundClips).sort(), soundCatalog.map((sound) => sound.id).sort());
});

test('procedural gallery entries are uniquely identified and playable', () => {
  assert.equal(proceduralSoundCatalog.length, 10);
  const all = [...soundCatalog, ...proceduralSoundCatalog];
  assert.equal(new Set(all.map((sound) => sound.id)).size, all.length);
  for (const sound of proceduralSoundCatalog) {
    assert.ok(['tone', 'wood'].includes(sound.type));
    assert.ok(sound.title);
    assert.ok(sound.description);
    assert.ok(sound.duration > 0);
    if (sound.type === 'tone') assert.ok(sound.frequency > 0);
  }
});

test('standalone sound page and packaged build include the shared catalog', () => {
  const page = fs.readFileSync('sounds.html', 'utf8'),
    script = fs.readFileSync('src/sounds.js', 'utf8'),
    build = fs.readFileSync('scripts/build-itch.js', 'utf8'),
    game = fs.readFileSync('index.html', 'utf8');
  assert.match(page, /src="src\/sounds\.js"/);
  assert.match(page, /id="sound-catalog"/);
  assert.match(script, /sound-catalog\.js/);
  assert.match(build, /'sounds\.html'/);
  assert.match(game, /href="sounds\.html"/);
});
