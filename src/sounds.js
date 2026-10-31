import { playProceduralSound, proceduralSoundCatalog, soundCatalog } from './game/sound-catalog.js';

const categories = [
  ['interface', 'Интерфейс'],
  ['jelly', 'Желейки'],
  ['mechanisms', 'Механизмы'],
  ['magic', 'Магия'],
  ['combat', 'Бой и экипировка'],
  ['ambience', 'Сцена и атмосфера'],
  ['signals', 'Процедурные сигналы'],
];
const sounds = [...soundCatalog, ...proceduralSoundCatalog];
const catalog = document.querySelector('#sound-catalog');
const status = document.querySelector('#sound-status');
document.querySelector('#sample-count').textContent = String(soundCatalog.length);
document.querySelector('#procedural-count').textContent = String(proceduralSoundCatalog.length);

let current = null,
  audioContext = null;

for (const [category, label] of categories) {
  const items = sounds.filter((sound) => sound.category === category);
  if (!items.length) continue;
  const section = document.createElement('section');
  section.className = 'sound-group';
  section.setAttribute('aria-labelledby', 'sound-group-' + category);
  const heading = document.createElement('h2');
  heading.id = 'sound-group-' + category;
  heading.textContent = label;
  const grid = document.createElement('div');
  grid.className = 'sound-grid';
  items.forEach((sound) => grid.append(createCard(sound)));
  section.append(heading, grid);
  catalog.append(section);
}

function createCard(sound) {
  const article = document.createElement('article');
  article.className = 'sound-card';
  article.dataset.sound = sound.id;
  const button = document.createElement('button');
  button.className = 'sound-play';
  button.type = 'button';
  button.setAttribute('aria-label', 'Воспроизвести: ' + sound.title);
  button.innerHTML = '<span aria-hidden="true">▶</span>';
  button.addEventListener('click', () => toggle(sound, button));
  const content = document.createElement('div');
  content.className = 'sound-card-content';
  const heading = document.createElement('h3');
  heading.textContent = sound.title;
  const description = document.createElement('p');
  description.textContent = sound.description;
  const meta = document.createElement('div');
  meta.className = 'sound-meta';
  if (sound.type === 'sample') {
    meta.append(tag(sound.id), tag('gain ' + sound.volume.toFixed(2)));
    if (sound.loop) meta.append(tag('петля'));
    const file = document.createElement('code');
    file.textContent = sound.file;
    content.append(heading, description, meta, file);
  } else {
    meta.append(tag(sound.id), tag('процедурный'));
    if (sound.frequency) meta.append(tag(sound.frequency + ' Hz'));
    content.append(heading, description, meta);
  }
  article.append(button, content);
  return article;
}

function tag(text) {
  const node = document.createElement('span');
  node.textContent = text;
  return node;
}

async function toggle(sound, button) {
  if (current?.sound === sound) {
    stopCurrent();
    return;
  }
  stopCurrent();
  const state = { sound, button, stop: () => {} };
  current = state;
  setPlaying(state, true);
  try {
    if (sound.type === 'sample') {
      const audio = new Audio('./assets/audio/' + sound.file);
      audio.volume = sound.volume;
      audio.loop = sound.loop;
      state.stop = () => {
        audio.pause();
        audio.currentTime = 0;
      };
      audio.addEventListener('ended', () => finish(state), { once: true });
      await audio.play();
    } else {
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextClass) throw Error('Web Audio API unavailable');
      audioContext ??= new AudioContextClass();
      await audioContext.resume?.();
      if (current !== state) return;
      const playback = playProceduralSound(audioContext, sound);
      state.stop = () => playback?.stop();
      state.timer = setTimeout(() => finish(state), sound.duration * 1000 + 80);
    }
  } catch {
    if (current === state) {
      setPlaying(state, false);
      current = null;
      status.textContent = 'Не удалось воспроизвести «' + sound.title + '»';
    }
  }
}

function finish(state) {
  if (current !== state) return;
  setPlaying(state, false);
  current = null;
  status.textContent = 'Прослушивание завершено';
}

function stopCurrent() {
  if (!current) return;
  const state = current;
  current = null;
  clearTimeout(state.timer);
  state.stop();
  setPlaying(state, false);
  status.textContent = 'Воспроизведение остановлено';
}

function setPlaying(state, playing) {
  state.button.classList.toggle('playing', playing);
  state.button.innerHTML = `<span aria-hidden="true">${playing ? '■' : '▶'}</span>`;
  state.button.setAttribute(
    'aria-label',
    (playing ? 'Остановить: ' : 'Воспроизвести: ') + state.sound.title,
  );
  state.button.closest('.sound-card').classList.toggle('playing', playing);
  if (playing) status.textContent = 'Играет: ' + state.sound.title;
}

addEventListener('pagehide', stopCurrent);
