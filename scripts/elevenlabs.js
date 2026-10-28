import { loadEnvFile } from 'node:process';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const api = 'https://api.elevenlabs.io/v1';

export async function request(endpoint, key, options = {}) {
  const response = await fetch(api + endpoint, {
    ...options,
    headers: { 'xi-api-key': key, ...options.headers },
    redirect: 'error',
    signal: AbortSignal.timeout(180_000),
  });
  // Do not print response bodies: they may contain account details or echoed secrets.
  if (!response.ok) {
    const hint = {
      401: 'Invalid API key.',
      403: 'Check API key permissions (Sound Effects / User Read) and account access.',
      402: 'Check the available account credits.',
      422: 'Check the sound effect parameters.',
      429: 'Rate or quota limit reached. Check your account before retrying.',
    }[response.status];
    throw Error(`ElevenLabs HTTP ${response.status}. ${hint || 'Try again later.'}`);
  }
  return response;
}

export async function main(args = process.argv.slice(2)) {
  const presets = JSON.parse(await readFile(new URL('./sound-effects.json', import.meta.url)));
  const [command, ...flags] = args;
  if (!command || command === '--help' || command === '--list') {
    console.log(
      'npm run audio -- --check              Check authentication without generation\n' +
        'npm run audio -- <preset> --dry-run   Preview a request without using credits\n' +
        'npm run audio -- <preset>             Generate one MP3 (uses credits)\n\n' +
        'Presets: ' +
        Object.keys(presets).join(', '),
    );
    return;
  }
  if (flags.some((flag) => flag !== '--dry-run') || new Set(flags).size !== flags.length)
    throw Error('Unknown or duplicate option. Use --help.');
  if (command === '--check' && flags.length) throw Error('--check takes no options.');
  const preset = Object.hasOwn(presets, command) ? presets[command] : null;
  if (command !== '--check' && !preset) throw Error('Unknown preset. Use --list.');
  const body = preset ? { ...preset, model_id: 'eleven_text_to_sound_v2' } : null;
  if (flags.includes('--dry-run')) {
    console.log(JSON.stringify(body, null, 2));
    return;
  }

  // An explicitly supplied environment variable takes precedence over the local file.
  if (!process.env.ELEVENLABS_API_KEY) {
    try {
      loadEnvFile(path.join(root, '.env.elevenlabs'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw Error('Cannot load .env.elevenlabs.');
    }
  }
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw Error('Add ELEVENLABS_API_KEY to .env.elevenlabs, then run --check.');

  if (command === '--check') {
    await request('/user', key);
    console.log(
      'Authentication successful. No sound generated. Sound Effects permission is checked on generation.',
    );
    return;
  }

  const folder = path.join(root, 'assets', 'audio');
  await mkdir(folder, { recursive: true });
  const filename = `${command}-${new Date().toISOString().replaceAll(/[:.]/g, '-')}.mp3`;
  const destination = path.join(folder, filename);
  // Reserve the destination before spending credits; existing audio is never overwritten.
  const file = await open(destination, 'wx');
  let saved = false;
  try {
    console.log(`Generating ${command} (${preset.duration_seconds}s, uses account credits)…`);
    const response = await request('/sound-generation?output_format=mp3_44100_128', key, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.headers.get('content-type')?.startsWith('audio/'))
      throw Error('ElevenLabs returned an unexpected response type.');
    const audio = Buffer.from(await response.arrayBuffer());
    if (!audio.length) throw Error('ElevenLabs returned empty audio.');
    await file.writeFile(audio);
    saved = true;
    console.log('Saved: ' + path.relative(root, destination));
  } finally {
    await file.close();
    if (!saved) await unlink(destination);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    // Network exceptions can carry request internals; keep output limited to our messages.
    console.error(
      error.name === 'TypeError' || error.name === 'TimeoutError'
        ? 'Network request failed or timed out. Check your connection; generation is not retried automatically.'
        : error.message,
    );
    process.exitCode = 1;
  });
}
