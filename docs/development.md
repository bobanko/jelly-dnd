# Разработка и сборка

Дополнение к [README](../README.md): структура проекта, запуск, звук, форматирование, сборка и проверки.

## Структура проекта

- `index.html`, `editor.html` — страницы игры и редактора (остаются в корне: itch.io ищет `index.html` там).
- `src/` — весь браузерный код. В корне папки точки входа: `bootstrap.js` (загрузка уровней и перевода), `game.js`, `editor.js`, а также `level-loader.js` и `runtime-context.js`.
  - `src/world/` — формат карт и игровой мир: `levels.js`, `level-features.js`, `physics.js`, `soft-body.js`, `combat.js`.
  - `src/game/` — звук, эффекты, сцена меню и прогресс кампании.
  - `src/camera/` — общая камера игры и редактора, стартовые настройки камеры уровня.
  - `src/editor/` — модель редактора, 3D picking и перевод редактора.
  - `src/renderer/` — WebGPU-рендерер; `index.js` — его публичный вход, `geometry/` и `shaders/` — меши и WGSL.
  - `src/i18n/` — система перевода и `locales/` со словарями.
- `styles/` — CSS игры, редактора и общих подсказок клавиш (`controls.css`).
- `levels/` — карты кампании в JSON и `catalog.js` с их порядком.
- `assets/` — текстуры и звуки. `scripts/` — сервер разработки, сборка для itch.io, генерация звуков, проверка синтаксиса.
- `tests/` — юнит- и браузерные тесты. `docs/` — эта документация и рабочие заметки.


## Run

All unit tests, browser checks, and profiling scripts live in [`tests/`](../tests/README.md). Run npm commands and individual test scripts from the project root; generated output stays in `artifacts/`.

The development environment uses Node.js 26.7.0 (the current minimum is 22.13). Browser code, tests, server code, and release tooling use native ES modules with `import`/`export`; `package.json` declares `type: module`. Browser runtime files are served directly without bundling.

Run npm start (or node scripts/server.js), then open http://localhost:3000 in Chrome or Edge with WebGPU enabled. No runtime packages, CDNs or external fonts are needed. Stone and oak textures are bundled in assets/materials/; their generation prompts and mapping details are documented there. Serve over localhost or HTTPS; opening a local HTML file is not the supported launch path.

If the browser has no WebGPU adapter, an explanation appears instead of a blank scene. A lost GPU device also shows the fallback card. There is no silent return to the old 2D renderer.

Each level opens with a 3.2-second assembly: stone and coloured blocks arrive in sequence from the screen edges, above and below, with low arrivals emerging through the void fog. Scattered stones, bones, webs and torch bodies travel with their supporting masonry. Once every block locks into place, pressure buttons, characters, crates, pickups, skeleton archers and hovering drones fall from above in a short staggered cascade. Grounded props are lowered with a slow, smooth ease and settle without bouncing, archers sway slightly before standing still, and drone crystals ripple around their hovering height as if meeting water. The animation moves only rendered geometry, leaving physics state unchanged; other mechanisms and hazards appear after the landing phase, while the run timer remains paused throughout. A movement key skips assembly, and reduced-motion settings show the completed level immediately. Restart replays assembly when its Developer settings flag is enabled. `npm run test:assembly:browser` checks construction frames, prop landings, pause, skip and reduced-motion paths on WebGPU.

## Генерация звуков через ElevenLabs

Локальная утилита использует официальный [Sound Effects API](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert). Ключ не используется браузером: в игру входят только готовые аудиофайлы.

1. Создайте API-ключ в [ElevenLabs](https://elevenlabs.io/app/developers/api-keys) с доступом к Sound Effects. Для проверки подключения через `/v1/user` также нужен доступ User Read.
2. Скопируйте `.env.elevenlabs.example` в `.env.elevenlabs` и заполните `ELEVENLABS_API_KEY`. Если локальный файл уже создан, просто вставьте ключ после `=`. Не отправляйте ключ в чат. Файлы `.env*` исключены из Git и недоступны через сервер разработки; сборка использует отдельный список игровых файлов.
3. Выполните `npm run audio -- --check`. Проверка делает только запрос данных пользователя, не генерирует звук и не выводит данные аккаунта. Доступ именно к Sound Effects проверяется при первой генерации.

```sh
npm run audio -- --list
npm run audio -- jelly-land --dry-run
npm run audio -- jelly-land
```

Пресеты `jelly-death`, `jelly-land`, `spikes` (выдвижение), `spikes-retract` (втягивание), `portal` и `dungeon-wind` находятся в `scripts/sound-effects.json`: там можно менять описания, длительность (0.5–30 секунд), `prompt_influence` (0–1) и зацикливание `loop`. `--dry-run` показывает запрос без ключа и обращения к API. Обычный запуск генерирует один эффект и расходует кредиты аккаунта; автоматических повторов запроса нет. Используются модель `eleven_text_to_sound_v2` и MP3 44.1 kHz / 128 kbps.

Результаты сохраняются с уникальными датированными именами в `assets/audio/`, без перезаписи предыдущих вариантов. Утилита не подключает эффекты к игровым событиям автоматически. В игре уже подключён пробный набор: гибель (разбивающееся яйцо), приземление, портал, выдвижение/втягивание шипов и тихая петля ветра. Включите звук кнопкой динамика; в меню и при скрытой вкладке эти дорожки останавливаются. Файлы и громкость задаются в `game-audio.js`. Новые генерации нужно выбирать там вручную. Переменная окружения `ELEVENLABS_API_KEY`, если задана, имеет приоритет над локальным файлом.

Проверка утилиты без сети и кредитов: `node --test tests/elevenlabs.test.js`.

## Форматирование кода

Prettier настроен для JavaScript, JSON, HTML и CSS: отступы в 2 пробела, одинарные кавычки в JavaScript, точки с запятой и окончания строк LF.

- `npm.cmd run format` — отформатировать файлы проекта.
- `npm.cmd run format:check` — проверить форматирование без изменения файлов.

На macOS/Linux используйте `npm` вместо `npm.cmd`. Перед первым запуском установите зависимости командой `npm.cmd install`. Расширения редакторов для Prettier используют общий конфиг `.prettierrc.json`; сборки и отчёты исключены через `.prettierignore`.

## Сборка для itch.io

Запустите `npm.cmd run build` (на macOS/Linux — `npm run build`). Команда проверяет синтаксис и карты, затем создаёт `dist/jelly-and-bones-itch-YYYY-MM-DD_HH-MM-SS.zip`. Дата и время — по Киеву. Каждая сборка сохраняется отдельным архивом; при совпадении секунды добавляется числовой суффикс.

Загрузите ZIP в проект itch.io с типом HTML и отметьте **This file will be played in the browser**. `index.html` уже находится в корне архива. После изменений кода или JSON-карт повторите команду и замените загруженный ZIP.

Основной размер встраиваемого окна — **960 × 640**. Укажите эти размеры на itch.io; игра также подстраивается под изменение окна и полноэкранный режим. Для проверки английского и русского интерфейса в этом размере есть `npm run test:layout:browser`.

В архив входят игра, редактор, каталог и карты из `levels/`, используемые ресурсы из `assets/`. Сервер, Node-зависимости, тесты, Git и локальные служебные файлы исключены. Сборка использует только встроенные возможности Node.js.

Для локальной проверки распакованного билда можно запустить `tests/browser-static-host.js` с переменной `STATIC_GAME_ROOT`, указывающей на папку распаковки (для этого теста нужны установленные dev-зависимости и Chrome). Игра требует браузер с WebGPU и рабочим аппаратным ускорением.

## Verify

npm run check
npm test

For real GPU/browser checks, install development dependencies with npm install, keep the local server running, then run npm run test:browser. The script uses the installed Windows Chrome executable; CHROME_PATH can select another compatible Chromium executable. It launches an isolated headless browser with WebGPU enabled, never a personal browser profile.

npm run test:combat:browser additionally checks item pickup, inventory undo/reset, camera-relative equipment facing, frontal blocks, three-hit shield cracks/destruction, wood impact audio and the firing tone, physical shield bashes, sword strikes, and skeleton collapse/reassembly on the real GPU. Combat unit tests cover all four firing directions, swept collisions, walls, crates, floor heights, nearest-hit ordering, bounded projectile lifetime, throwing across a hole, blocked flight, durability and the five-second recovery clock.

npm run test:voxels:browser (also available through test:editor:browser and test:editor:3d) checks migrated stone cubes, XYZ fields, top/side placement, single-cube erase, sparse layers, live strokes, rectangle history, orbit/perspective picking, export/import/draft persistence, an actual tunnel and height-changing portal, undo/reset, narrow screens, no-WebGPU editing and a dense 1280-cube scene. tests/voxel.test.js covers serialization/migration, multiple surfaces, solid walls, tunnel traversal, falling jelly/crate landings, ceiling collisions and layer-aware mechanisms. tests/levels.test.js retains shared schema, linking, limits and reversible operation coverage. tests/editor-space.test.js verifies inverse projection and picking. A drag locks its construction plane so newly painted geometry cannot redirect the stroke.

npm run test:parties:browser paints and plays solo-purple, blue/purple duo and four-character maps, checking validation, empty editor previews, active-only physics/HUD, roster-based controls/camera, four refraction layers, rune particles, victory/reset and editor return. Node tests cover every control set for each solo colour, every two-colour pair and its shared bindings, three/four-player ordering, marker pairing, old map compatibility, layout-independent input and the fourth character's respawn.

npm run test:conveyor:browser checks belt painting, direction/speed properties, draft persistence, connected GPU geometry, jelly/crate transport, countersteering, undo and reset. tests/conveyor.test.js also covers smooth entry and seams, all four directions, floor heights, walls, sleeping crates, stacked passengers, falls and older map compatibility.

npm run test:color-blocks:browser checks all four coloured stone tools, XYZ/face/rectangle placement, inspector recolouring, history, persistence/export, keyboard traversal by every matching hero and collision with another colour on the real GPU. tests/color-blocks.test.js covers all sixteen hero/block combinations (including sparse parties), support/ceiling filtering, crates, actual swept arrows, spawn validation and respawn.

npm run test:glass-blocks:browser compares actual rendered pixels with a jelly behind glass, behind opaque stone and inside its matching glass block. It also checks rebuilding transparent geometry and all four camera rotations in both projections without GPU errors.

npm run test:dice renders the production pip shader onto all six faces, counts the separate dots from a GPU readback and checks the 1–6 values and opposite-face sums. It also captures the three actual jelly creatures at four camera rotations. Audit images are saved in artifacts/.

Node tests exercise gameplay, all three physical keyboard layouts, three-rune puzzle completion, pushing, terrain, gravity and respawn, plus real lattice deformation, volume preservation, inversion recovery, strain bounds, heavy landing, sleeping, wall contacts, rigid-motion preservation and full-state undo. Stacking tests cover high-speed landings, jelly/crate support in either order, a three-body moving stack, independent passenger movement, crate drops and lift passengers.

The browser suite compiles WGSL on an actual WebGPU device, checks GPU validation errors, exercises all camera angles, movement, pushing, poking, lattice display, layered refraction, fall/respawn, stacked jelly carrying, lift boarding/upper exit/empty return, crate pushing/drop/undo, spike death and scraps, height-changing portal traversal and effects, the collider toggle, separate finish tiles, matching tile illumination/fade, rising rune streams and victory beams. It also checks the speaker icon toggle, compact HUD, narrow-screen layout and the no-WebGPU card. Screenshots are saved to artifacts/. npm run profile:browser records a separate CPU/frame profile. FPS depends on the adapter, viewport, browser and number of awake solids; 60 FPS was observed at rest in an earlier development headless run.

npm run profile:compare compares three creatures with two visible creatures, disables prop generation and simulation separately, and samples one awake jelly. It records per-frame CPU physics, prop preparation and total render submission time, plus a Chrome CPU sample profile, in artifacts/performance-current.json. PERF_LABEL changes the output suffix. The prop-cache change reduced measured idle prop preparation from about 34 ms to about 5 ms per frame at 1440 by 1000 in the development headless browser. Headless frame pacing and GPU/driver limits mean its FPS is not directly interchangeable with an interactive browser's FPS.
