// HTTP hides navigator.gpu even on supported devices, including phones opening
// the development server over LAN. Diagnose the page context before the browser.
export async function requestAdapter(environment = globalThis) {
  if (environment.isSecureContext === false)
    throw Error(
      'WebGPU требует защищённого соединения. Откройте игру по HTTPS; страница, в которую она встроена, тоже должна использовать HTTPS. Обычный HTTP-адрес компьютера в локальной сети не подходит.',
    );

  const browser = environment.navigator;
  const appleMobile =
    /iPhone|iPad|iPod/.test(browser.userAgent || '') ||
    (browser.platform === 'MacIntel' && browser.maxTouchPoints > 1);
  const hint = appleMobile
    ? 'На iPhone и iPad нужен iOS/iPadOS 26 или новее. Обновите систему и откройте игру в Safari по HTTPS. Смена браузера на той же версии iOS может не помочь.'
    : 'Обновите браузер до версии с поддержкой WebGPU (Chrome, Edge или Safari 26+) и проверьте аппаратное ускорение.';

  if (!browser.gpu) throw Error('В этом браузере нет WebGPU. ' + hint);
  const adapter = await browser.gpu.requestAdapter();
  if (!adapter) throw Error('Браузер не предоставил WebGPU-адаптер. ' + hint);
  return adapter;
}
