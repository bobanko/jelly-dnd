// `loop` is true to loop the whole file, or [start, end] in seconds to loop only that part
// (a recording whose ends fade in or out).
const sample = (id, file, volume, category, title, description, loop = false) => ({
  id,
  file,
  volume,
  category,
  title,
  description,
  loop: !!loop,
  ...(Array.isArray(loop) ? { loopRegion: loop } : {}),
  type: 'sample',
});

export const soundCatalog = [
  sample(
    'uiMove',
    'ui-move-2026-10-31T12-49-27-313Z.mp3',
    0.1,
    'interface',
    'Навигация по меню',
    'Короткий нейтральный микроклик без тона при смене выбранной кнопки.',
  ),
  sample(
    'uiConfirm',
    'ui-confirm-2026-10-31T04-08-21-298Z.mp3',
    0.28,
    'interface',
    'Подтверждение',
    'Низкий приглушённый звук нажатия кнопки.',
  ),
  sample(
    'skullCrack',
    'skull-crack-2026-10-31T04-08-13-562Z.mp3',
    0.42,
    'interface',
    'Разлом черепка',
    'Играет при разрушении потерянного черепка на экране победы.',
  ),
  sample(
    'land',
    'jelly-land-2026-10-29T00-18-45-533Z.mp3',
    0.5,
    'jelly',
    'Приземление',
    'Основной компактный удар желейки о поверхность.',
  ),
  sample(
    'jellySlap',
    'jelly-slap-2026-10-31T04-10-52-826Z.mp3',
    0.24,
    'jelly',
    'Желейный шлепок',
    'Мягкий слой, который дополняет основной звук приземления.',
  ),
  sample(
    'jellyWobble',
    'jelly-wobble-2026-10-31T04-10-50-817Z.mp3',
    0.3,
    'jelly',
    'Столкновение желеек',
    'Короткий воббл при начале контакта двух желеек.',
  ),
  sample(
    'death',
    'jelly-death-2026-10-28T23-58-40-459Z.mp3',
    0.35,
    'jelly',
    'Гибель желейки',
    'Сопровождает разрушение персонажа ловушкой или атакой.',
  ),
  sample(
    'crateSlide',
    'crate-slide-muted.wav',
    0.36,
    'mechanisms',
    'Ящик по камню',
    'Ровное приглушённое низкое трение без скрипов, пока желейка толкает ящик или бочку.',
    true,
  ),
  sample(
    'barrelRoll',
    'barrel-roll-heavy.wav',
    0.42,
    'mechanisms',
    'Катящаяся бочка',
    'Выраженный низкий деревянный рокот тяжёлой катящейся бочки; громче с её скоростью.',
    [0.3, 2.4],
  ),
  sample(
    'crateLand',
    'crate-land-heavy.wav',
    0.56,
    'mechanisms',
    'Ящик упал',
    'Выраженный гулкий глухой удар с низким деревянным резонансом при падении ящика или бочки; громче с высотой.',
  ),
  sample(
    'crateBreak',
    'crate-break-muffled.wav',
    0.36,
    'mechanisms',
    'Ящик разбился',
    'Мягкий приглушённый хруст дерева без резкого треска и выраженного гула, когда ящик или бочка разбивается за пределами уровня.',
  ),
  sample(
    'buttonPress',
    'button-press-stone-dry.wav',
    0.44,
    'mechanisms',
    'Нажатие напольной кнопки',
    'Одиночный сухой глухой удар каменной плиты со слегка протяжным телом, без реверберации.',
  ),
  sample(
    'buttonRelease',
    'button-release-stone-dry.wav',
    0.34,
    'mechanisms',
    'Освобождение кнопки',
    'Тот же сухой каменный тембр и высота, что у нажатия, с более мягким началом и коротким затуханием; тише нажатия.',
  ),
  sample(
    'bridge',
    'bridge-hinge-open-soft-deep.wav',
    0.2,
    'mechanisms',
    'Раскрытие моста',
    'Один короткий глубокий мягкий скрип петли при раскрытии моста, с округлым началом и приглушёнными обертонами.',
  ),
  sample(
    'bridgeRetract',
    'bridge-hinge-close-soft-deep.wav',
    0.18,
    'mechanisms',
    'Складывание моста',
    'Обратный вариант мягкого глубокого скрипа раскрытия с тем же тембром при складывании моста.',
  ),
  sample(
    'liftUp',
    'bridge-slide-2026-10-29T00-06-35-555Z.mp3',
    0.2,
    'mechanisms',
    'Лифт поднимается',
    'Ровное приглушённое движение тяжёлого каменного механизма при подъёме лифта.',
  ),
  sample(
    'liftDown',
    'bridge-retract-2026-10-29T00-06-39-624Z.mp3',
    0.18,
    'mechanisms',
    'Лифт опускается',
    'Обратное приглушённое движение каменного механизма при спуске лифта.',
  ),
  sample(
    'rise',
    'spikes-2026-10-28T23-57-14-327Z.mp3',
    0.18,
    'mechanisms',
    'Шипы поднимаются',
    'Металлическое движение ловушки в опасное положение.',
  ),
  sample(
    'retract',
    'spikes-retract-2026-10-28T23-57-21-491Z.mp3',
    0.18,
    'mechanisms',
    'Шипы прячутся',
    'Обратное металлическое движение безопасной фазы ловушки.',
  ),
  sample(
    'portal',
    'portal-woom-2026-11-02T00-52-50-493Z.mp3',
    0.5,
    'magic',
    'Телепортация',
    'Низкий приглушённый магический «вум» при переходе через портал.',
  ),
  sample(
    'rune',
    'finish-rune-2026-10-29T00-11-31-512Z.mp3',
    0.68,
    'magic',
    'Финишная руна',
    'Зацикленный гул, который появляется при заполнении финишного тайла.',
    true,
  ),
  sample(
    'crystalEnergy',
    'crystal-energy-2026-10-31T04-16-13-233Z.mp3',
    0.11,
    'magic',
    'Энергия кристалла',
    'Фоновая энергетическая петля, пока кристалл излучает луч.',
    true,
  ),
  sample(
    'torchLight',
    'torch-swoosh-2026-10-31T04-16-08-164Z.mp3',
    0.26,
    'magic',
    'Зажигание факела',
    'Короткий взмах огня, когда погасший факел загорается снова.',
  ),
  sample(
    'torchOut',
    'torch-out-2026-10-31T03-00-53-239Z.mp3',
    1,
    'magic',
    'Факел гаснет',
    'Тихое шипение при касании желейкой пламени.',
  ),
  sample(
    'arrow',
    'skeleton-arrow-2026-10-29T00-02-23-396Z.mp3',
    0.26,
    'combat',
    'Выстрел скелета',
    'Полёт стрелы сразу после выстрела лучника.',
  ),
  sample(
    'stoneWhoosh',
    'stone-whoosh-deep.wav',
    0.3,
    'ambience',
    'Полёт камня',
    'Плавный протяжный низкий вжух массивного камня, рассекающего воздух; при сборке уровня звучит со стороны прилёта.',
  ),
  sample(
    'levelBuild',
    'level-build-2026-10-31T04-13-57-829Z.mp3',
    0.36,
    'ambience',
    'Сборка уровня',
    'Летящие камни и спокойный стартовый аккорд во время формирования сцены.',
  ),
  sample(
    'wind',
    'dungeon-wind-2026-10-28T23-31-02-885Z.mp3',
    0.08,
    'ambience',
    'Ветер подземелья',
    'Постоянный очень тихий фон активного уровня.',
    true,
  ),
];

export const soundClips = Object.fromEntries(
  soundCatalog.map(({ id, file, volume, loopRegion }) => [
    id,
    loopRegion ? [file, volume, loopRegion] : [file, volume],
  ]),
);

const tone = (id, frequency, category, title, description) => ({
  id,
  frequency,
  category,
  title,
  description,
  duration: 0.2,
  type: 'tone',
});

export const proceduralSoundCatalog = [
  tone('fallTone', 95, 'signals', 'Падение в пропасть', 'Низкий сигнал при срыве желейки.'),
  tone(
    'respawnFirst',
    300,
    'signals',
    'Возрождение первой желейки',
    'Сигнал возвращения первого персонажа.',
  ),
  tone(
    'respawnOther',
    400,
    'signals',
    'Возрождение остальных',
    'Более высокий сигнал возвращения других персонажей.',
  ),
  tone('pickupTone', 720, 'signals', 'Подбор предмета', 'Высокий сигнал получения экипировки.'),
  tone(
    'archerDeathTone',
    180,
    'combat',
    'Победа над скелетом',
    'Низкий сигнал разрушения лучника.',
  ),
  tone('victoryTone', 640, 'signals', 'Победа', 'Короткий сигнал завершения уровня.'),
  tone('soundOnTone', 400, 'interface', 'Звук включён', 'Проверочный сигнал аудиокнопки.'),
  {
    id: 'woodHit',
    category: 'combat',
    title: 'Удар по щиту',
    description: 'Приглушённый деревянный удар при успешной защите или толчке щитом.',
    duration: 0.2,
    type: 'wood',
    broken: false,
  },
  {
    id: 'woodBreak',
    category: 'combat',
    title: 'Щит сломан',
    description: 'Более длинный деревянный треск при потере последней прочности щита.',
    duration: 0.32,
    type: 'wood',
    broken: true,
  },
  {
    id: 'torchGong',
    category: 'magic',
    title: 'Все факелы погашены',
    description:
      'Глубокий драматичный удар в гонг с тяжёлыми биениями и долгим металлическим хвостом, когда на уровне гаснет последний факел.',
    duration: 7.5,
    type: 'gong',
  },
];

export function playProceduralSound(context, sound) {
  const now = context.currentTime;
  if (sound.type === 'tone') {
    const oscillator = context.createOscillator(),
      gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(sound.frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(sound.frequency * 0.6, now + 0.14);
    gain.gain.setValueAtTime(0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(now + 0.2);
    return { stop: () => stopNode(oscillator) };
  }
  if (sound.type === 'gong') {
    const duration = 7.5,
      master = context.createGain(),
      oscillators = [],
      partials = [
        [62, 0.085, 0.78],
        [86, 0.12, 1],
        [87.15, 0.052, 0.96],
        [121.7, 0.082, 0.9],
        [171.3, 0.06, 0.8],
        [239.4, 0.043, 0.68],
        [318.5, 0.03, 0.56],
        [427, 0.02, 0.42],
      ];
    master.gain.setValueAtTime(0.001, now);
    master.gain.exponentialRampToValueAtTime(1.62, now + 0.009);
    master.gain.exponentialRampToValueAtTime(0.28, now + duration * 0.72);
    master.gain.exponentialRampToValueAtTime(0.001, now + duration);
    master.connect(context.destination);
    partials.forEach(([frequency, volume, life], index) => {
      const oscillator = context.createOscillator(),
        gain = context.createGain(),
        end = now + duration * life;
      oscillator.type = index < 2 ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.975, end);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(gain).connect(master);
      oscillator.start(now);
      oscillator.stop(end);
      oscillators.push(oscillator);
    });
    return { stop: () => oscillators.forEach(stopNode) };
  }
  if (sound.type !== 'wood') return null;
  const duration = sound.broken ? 0.3 : 0.18,
    buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate),
    samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) {
    const t = i / context.sampleRate,
      crack =
        Math.exp(-t * 95) +
        0.5 * Math.exp(-Math.abs(t - 0.018) * 420) +
        0.3 * Math.exp(-Math.abs(t - 0.045) * 380) +
        (sound.broken ? 0.6 * Math.exp(-Math.abs(t - 0.095) * 180) : 0);
    samples[i] = (Math.random() * 2 - 1) * crack;
  }
  const source = context.createBufferSource(),
    filter = context.createBiquadFilter(),
    gain = context.createGain(),
    thud = context.createOscillator(),
    body = context.createGain();
  source.buffer = buffer;
  filter.type = 'bandpass';
  filter.frequency.value = sound.broken ? 780 : 1050;
  filter.Q.value = 0.7;
  gain.gain.value = sound.broken ? 0.36 : 0.26;
  source.connect(filter).connect(gain).connect(context.destination);
  thud.type = 'triangle';
  thud.frequency.setValueAtTime(130, now);
  thud.frequency.exponentialRampToValueAtTime(60, now + 0.075);
  body.gain.setValueAtTime(0.055, now);
  body.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  thud.connect(body).connect(context.destination);
  source.start(now);
  thud.start(now);
  thud.stop(now + 0.11);
  return { stop: () => (stopNode(source), stopNode(thud)) };
}

function stopNode(node) {
  try {
    node.stop();
  } catch {}
}
