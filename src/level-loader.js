/* Load authored JSON maps before starting either the game or the editor. */
import * as catalog from '../levels/catalog.js';
import Levels, { configureMaps } from './world/levels.js';
import { configureRuntime } from './runtime-context.js';
import { create as createProgress } from './game/progression.js';

export async function loadLevels({
  entryScript,
  document,
  location,
  history,
  i18n,
  storage,
  startEntry,
  fetch = globalThis.fetch,
}) {
  const t = (key) => i18n?.t(key) || key;
  const $overlay = document.querySelector('#level-intro');
  const $title = document.querySelector('#level-intro-title');
  const $loading = document.querySelector('#level-loading');
  const $status = document.querySelector('#loading-status');
  const $progress = document.querySelector('#loading-progress');
  const $retry = document.querySelector('#loading-retry');
  const $spinner = document.querySelector('#loading-spinner');
  const menuOnly =
    entryScript === 'game.js' &&
    !location.search.includes('level=editor') &&
    !/(?:^|[?&])play=1(?:&|$)/.test(location.search);

  const progress = entryScript === 'game.js' ? createProgress(storage) : null;
  configureRuntime({ menuOnly, progress });

  async function readJSON(url) {
    const response = await fetch(url);
    if (!response.ok) throw Error('Could not load ' + url + ' (' + response.status + ')');
    return response.json();
  }

  function showLoading() {
    if (!$overlay || menuOnly) return;
    $overlay.hidden = false;
    $overlay.classList.add('loading');
    $title.textContent = t('loadingLevel');
    $loading.hidden = false;
    $status.textContent = t('loadingLevel');
    $progress.value = 0.02;
  }

  function renderLevelList(maps) {
    const $list = document.querySelector('#menu-levels .level-list');
    if (!$list) return;
    $list.querySelectorAll('[data-level]').forEach(($button) => $button.remove());
    catalog.standard.forEach((file, index) => {
      const $button = document.createElement('button');
      $button.dataset.level = String(index + 1);
      const $label = document.createElement('span');
      $label.className = 'level-label';
      $label.append(String(index + 1).padStart(2, '0'));
      const $name = document.createElement('span');
      $name.dataset.levelName = String(index + 1);
      $name.textContent = Levels.displayName(maps[index + 1], i18n?.language);
      $label.append($name);
      $button.append($label);
      $list.append($button);
    });
  }

  function showError(error) {
    if ($spinner) $spinner.hidden = true;
    if ($overlay) {
      $overlay.hidden = false;
      $overlay.classList.add('loading');
      $loading.hidden = false;
      $status.textContent = error.message;
      $progress.hidden = true;
      $retry.hidden = false;
      return;
    }
    const $message = document.createElement('p');
    $message.setAttribute('role', 'alert');
    $message.textContent = error.message;
    document.body.prepend($message);
  }

  async function start() {
    showLoading();
    try {
      if (
        catalog.version !== 1 ||
        !Array.isArray(catalog.standard) ||
        !catalog.standard.length ||
        new Set(catalog.standard).size !== catalog.standard.length ||
        !Array.isArray(catalog.extra)
      )
        throw Error('Invalid level catalog');
      progress?.configure(catalog.standard);
      const params = new URLSearchParams(location.search);
      let selected = Number(params.get('level')) || 1;
      if (
        params.get('level') !== 'editor' &&
        params.has('level') &&
        progress &&
        !progress.canPlay(selected)
      ) {
        selected = 1;
        history.replaceState(null, '', '?level=1');
      }
      if (!catalog.standard[selected - 1]) throw Error('Unknown level: ' + selected);
      const maps = {};
      await Promise.all(
        catalog.standard.map(async (file, index) => {
          if (!/^[a-z0-9-]+\.json$/i.test(file)) throw Error('Invalid level file');
          const map = Levels.read(await readJSON('levels/' + file));
          const errors = Levels.issues(map);
          if (errors.length) throw Error(file + ': ' + errors.join('\n'));
          maps[index + 1] = map;
        }),
      );
      configureMaps(maps);
      if ($overlay && !menuOnly)
        $title.textContent = selected + '. ' + Levels.displayName(maps[selected], i18n?.language);
      renderLevelList(maps);
      await startEntry(entryScript);
      return { maps, progress, menuOnly };
    } catch (error) {
      showError(error);
      return { error };
    }
  }

  return start();
}
